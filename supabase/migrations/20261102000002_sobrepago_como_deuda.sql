-- =====================================================================
-- Sobrepago de ingresos.
-- Si un cliente paga más que el saldo pendiente, el excedente:
--   1) ingresa igual (cobro sin vencimiento: a la cuenta, o el cheque entero
--      a cartera), y
--   2) queda registrado como DEUDA con el cliente (módulo Deudas, con el
--      cliente dado de alta como proveedor si no existía), con una cuota a
--      la fecha de devolución indicada.
-- En el cash flow: el dinero entra al cobrarse (o en la fecha de pago del
-- cheque) y la devolución figura como pago previsto en su fecha.
-- =====================================================================

-- Proveedor que representa al cliente (por CUIT o razón social); lo crea si no existe.
create or replace function public.proveedor_de_cliente(p_cliente_id bigint)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_cl public.clientes;
  v_id bigint;
begin
  select * into v_cl from public.clientes where id = p_cliente_id;
  if not found then
    raise exception 'Cliente inexistente';
  end if;
  select id into v_id from public.proveedores
   where (v_cl.cuit is not null and cuit = v_cl.cuit)
      or lower(trim(razon_social)) = lower(trim(v_cl.razon_social))
   order by (cuit = v_cl.cuit) desc nulls last, id
   limit 1;
  if v_id is null then
    insert into public.proveedores (razon_social, cuit) values (v_cl.razon_social, v_cl.cuit) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Deuda con el cliente por el excedente cobrado
create or replace function public.crear_deuda_saldo_a_favor(
  p_cliente_id bigint,
  p_concepto text,
  p_moneda public.moneda,
  p_importe numeric,
  p_fecha date,
  p_fecha_devolucion date,
  p_tc numeric default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  if p_fecha_devolucion is null then
    raise exception 'Indicá la fecha prevista de devolución del excedente';
  end if;
  return public.crear_deuda(
    public.proveedor_de_cliente(p_cliente_id),
    p_concepto,
    p_moneda,
    round(p_importe, 2),
    jsonb_build_array(jsonb_build_object('fecha_vencimiento', p_fecha_devolucion, 'importe', round(p_importe, 2))),
    null,
    case when p_moneda = 'USD' then p_tc end,
    null,
    'Excedente cobrado al cliente: saldo a su favor',
    p_fecha
  );
end;
$$;

-- ---------- Cobro a cuenta con excedente ----------
drop function if exists public.registrar_cobro_a_cuenta(bigint, date, numeric, public.medio_cobro, bigint, numeric);

create or replace function public.registrar_cobro_a_cuenta(
  p_ingreso_id bigint,
  p_fecha date,
  p_importe numeric,
  p_medio public.medio_cobro,
  p_cuenta_id bigint,
  p_tc numeric default null,
  p_fecha_devolucion date default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ing public.ingresos;
  v_saldo_total numeric;
  v_resto numeric := p_importe;
  v_imputa numeric;
  v_n int := 0;
  v record;
begin
  select * into v_ing from public.ingresos where id = p_ingreso_id for update;
  if not found then
    raise exception 'Ingreso inexistente';
  end if;
  if p_medio = 'cheque' then
    raise exception 'Para cobrar con cheques usá el medio cheque del cobro';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe debe ser mayor a cero';
  end if;
  if p_cuenta_id is null then
    raise exception 'Indicar la cuenta donde ingresa el cobro';
  end if;
  select coalesce(sum(saldo), 0) into v_saldo_total
    from public.v_ingreso_vencimientos where ingreso_id = p_ingreso_id and saldo > 0;
  if p_importe > v_saldo_total and p_fecha_devolucion is null then
    raise exception 'El importe supera el saldo pendiente del ingreso';
  end if;

  for v in
    select id, saldo
      from public.v_ingreso_vencimientos
     where ingreso_id = p_ingreso_id and saldo > 0
     order by fecha_vencimiento, numero
  loop
    exit when v_resto <= 0;
    v_imputa := least(v_resto, v.saldo);
    perform public.registrar_cobro(v.id, p_fecha, v_imputa, p_medio, p_cuenta_id, p_tc);
    v_resto := v_resto - v_imputa;
    v_n := v_n + 1;
  end loop;

  -- Excedente: entra a la cuenta y queda como deuda con el cliente
  if v_resto > 0.009 then
    insert into public.cobros (cliente_id, ingreso_vencimiento_id, fecha, moneda, importe, tc, medio, cuenta_id, concepto)
    values (v_ing.cliente_id, null, p_fecha, v_ing.moneda, v_resto, p_tc, p_medio, p_cuenta_id,
            'Excedente cobro ' || v_ing.descripcion || ' (saldo a favor del cliente)');
    perform public.crear_deuda_saldo_a_favor(v_ing.cliente_id, 'Saldo a favor - excedente ' || v_ing.descripcion,
                                             v_ing.moneda, v_resto, p_fecha, p_fecha_devolucion, p_tc);
    v_n := v_n + 1;
  end if;

  return v_n;
end;
$$;

-- ---------- Cobranza con cheques con excedente ----------
drop function if exists public.registrar_cobranza_cheques(bigint, date, jsonb, bigint[], numeric);

-- p_cheques: [{"banco_emisor","numero","tipo","importe","fecha_pago","fecha_emision","librador","librador_cuit"}] (pesos)
-- p_vencimientos: ids a cancelar, en orden de imputación.
-- p_fecha_devolucion: si los cheques superan el saldo, el excedente queda como deuda con el cliente a esa fecha.
create or replace function public.registrar_cobranza_cheques(
  p_cliente_id bigint,
  p_fecha date,
  p_cheques jsonb,
  p_vencimientos bigint[],
  p_tc numeric default null,
  p_fecha_devolucion date default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ch jsonb;
  v_ch_id bigint;
  v_resto numeric;
  v_total_ch numeric := 0;
  v_total_vto numeric := 0;
  v_imputa numeric;
  v_consume numeric;
  v_n int := 0;
  v_saldos jsonb := '{}';
  v_saldo numeric;
  v_saldo_ars numeric;
  v_exceso numeric := 0;
  v_desc text;
  v record;
  v_idx int;
begin
  if p_cheques is null or jsonb_typeof(p_cheques) <> 'array' or jsonb_array_length(p_cheques) = 0 then
    raise exception 'Cargá al menos un cheque';
  end if;
  if p_vencimientos is null or cardinality(p_vencimientos) = 0 then
    raise exception 'Elegí los vencimientos que cancelan los cheques';
  end if;

  for v in
    select vv.id, vv.saldo, vv.moneda, i.cliente_id
      from public.v_ingreso_vencimientos vv
      join public.ingresos i on i.id = vv.ingreso_id
     where vv.id = any (p_vencimientos)
  loop
    if v.cliente_id <> p_cliente_id then
      raise exception 'Hay vencimientos que no son del cliente elegido';
    end if;
    if coalesce(v.saldo, 0) <= 0 then
      raise exception 'Hay vencimientos sin saldo pendiente';
    end if;
    if v.moneda = 'USD' and (p_tc is null or p_tc <= 0) then
      raise exception 'Hay vencimientos en USD: indicá el tipo de cambio';
    end if;
    v_saldos := v_saldos || jsonb_build_object(v.id::text, v.saldo);
    v_total_vto := v_total_vto + public.convertir(v.saldo, v.moneda, 'ARS', p_tc);
  end loop;
  if (select count(*) from jsonb_object_keys(v_saldos)) <> cardinality(p_vencimientos) then
    raise exception 'Vencimiento inexistente o repetido';
  end if;

  select coalesce(sum((x ->> 'importe')::numeric), 0) into v_total_ch from jsonb_array_elements(p_cheques) x;
  if v_total_ch > v_total_vto + 0.01 and p_fecha_devolucion is null then
    raise exception 'Los cheques ($ %) superan el saldo de los vencimientos elegidos ($ %): indicá la fecha de devolución del excedente', v_total_ch, v_total_vto;
  end if;

  for v_ch in select * from jsonb_array_elements(p_cheques) loop
    if coalesce(trim(v_ch ->> 'banco_emisor'), '') = '' or coalesce(trim(v_ch ->> 'numero'), '') = ''
       or (v_ch ->> 'fecha_pago') is null or coalesce((v_ch ->> 'importe')::numeric, 0) <= 0 then
      raise exception 'Completá banco, número, importe y fecha de pago de cada cheque';
    end if;

    insert into public.cheques (cliente_id, librador, librador_cuit, banco_emisor, numero, tipo, importe,
                                fecha_recepcion, fecha_emision, fecha_pago)
    values (p_cliente_id, nullif(v_ch ->> 'librador', ''), nullif(v_ch ->> 'librador_cuit', ''),
            trim(v_ch ->> 'banco_emisor'), trim(v_ch ->> 'numero'),
            coalesce((nullif(v_ch ->> 'tipo', ''))::public.tipo_cheque, 'echeq'),
            round((v_ch ->> 'importe')::numeric, 2), p_fecha,
            (nullif(v_ch ->> 'fecha_emision', ''))::date, (v_ch ->> 'fecha_pago')::date)
    returning id into v_ch_id;

    v_resto := round((v_ch ->> 'importe')::numeric, 2);

    for v_idx in 1 .. cardinality(p_vencimientos) loop
      exit when v_resto <= 0.009;
      v_saldo := (v_saldos ->> p_vencimientos[v_idx]::text)::numeric;
      continue when v_saldo <= 0;

      select vv.id, vv.moneda into v from public.v_ingreso_vencimientos vv where vv.id = p_vencimientos[v_idx];
      v_saldo_ars := public.convertir(v_saldo, v.moneda, 'ARS', p_tc);

      if v_resto >= v_saldo_ars - 0.01 then
        v_imputa := v_saldo;
        v_consume := least(v_resto, v_saldo_ars);
      else
        v_imputa := case when v.moneda = 'USD' then round(v_resto / p_tc, 2) else v_resto end;
        v_consume := v_resto;
      end if;
      continue when v_imputa <= 0;

      insert into public.cobros (cliente_id, ingreso_vencimiento_id, fecha, moneda, importe, tc, medio,
                                 cuenta_id, cheque_id, concepto)
      values (p_cliente_id, v.id, p_fecha, v.moneda, v_imputa,
              case when v.moneda = 'USD' then p_tc end, 'cheque', null, v_ch_id,
              'Cheque #' || trim(v_ch ->> 'numero') || ' ' || trim(v_ch ->> 'banco_emisor'));

      v_saldos := jsonb_set(v_saldos, array[v.id::text], to_jsonb(v_saldo - v_imputa));
      v_resto := v_resto - v_consume;
      v_n := v_n + 1;
    end loop;

    -- Lo que sobra del cheque es excedente: queda imputado al cliente sin vencimiento
    if v_resto > 0.009 then
      insert into public.cobros (cliente_id, ingreso_vencimiento_id, fecha, moneda, importe, tc, medio,
                                 cuenta_id, cheque_id, concepto)
      values (p_cliente_id, null, p_fecha, 'ARS', round(v_resto, 2), null, 'cheque', null, v_ch_id,
              'Excedente cheque #' || trim(v_ch ->> 'numero') || ' ' || trim(v_ch ->> 'banco_emisor') || ' (saldo a favor del cliente)');
      v_exceso := v_exceso + round(v_resto, 2);
      v_n := v_n + 1;
    end if;
  end loop;

  if v_exceso > 0 then
    select string_agg(distinct i.descripcion, ', ') into v_desc
      from public.ingreso_vencimientos iv join public.ingresos i on i.id = iv.ingreso_id
     where iv.id = any (p_vencimientos);
    perform public.crear_deuda_saldo_a_favor(p_cliente_id, 'Saldo a favor - excedente cheques ' || coalesce(v_desc, ''),
                                             'ARS', v_exceso, p_fecha, p_fecha_devolucion);
  end if;

  return v_n;
end;
$$;

-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.registrar_cobranza_cheques(bigint, date, jsonb, bigint[], numeric, date) to authenticated, anon;
grant execute on function public.registrar_cobro_a_cuenta(bigint, date, numeric, public.medio_cobro, bigint, numeric, date) to authenticated, anon;
grant execute on function public.proveedor_de_cliente(bigint) to authenticated, anon;
grant execute on function public.crear_deuda_saldo_a_favor(bigint, text, public.moneda, numeric, date, date, numeric) to authenticated, anon;

notify pgrst, 'reload schema';
