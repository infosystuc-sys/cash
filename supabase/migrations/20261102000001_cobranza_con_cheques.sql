-- =====================================================================
-- Cobranza de clientes con cheques.
-- Un cliente puede entregar uno o varios cheques que cancelan uno o varios
-- vencimientos (de una o varias facturas). Cada cheque entra a cartera y se
-- imputa a los vencimientos elegidos generando un cobro por cada tramo
-- (cheque × vencimiento). Por eso un cheque ya no queda atado a un único cobro.
--
-- Efecto en el cash flow: el vencimiento deja de figurar como cobro previsto
-- y el cheque en cartera aparece como ingreso en su fecha de pago (ya lo
-- contemplan fn_cashflow / fn_cashflow_detalle). Al depositarlo pasa a ser
-- movimiento real de la cuenta; si se rechaza, se anulan todos sus cobros y
-- los vencimientos vuelven a quedar pendientes.
-- =====================================================================

alter table public.cobros drop constraint if exists cobros_cheque_id_key;
create index if not exists cobros_cheque_id_idx on public.cobros (cheque_id);

-- v_cheques: un renglón por cheque aunque tenga varios cobros asociados
create or replace view public.v_cheques with (security_invoker = true) as
 select ch.id,
        ch.cliente_id,
        ch.librador,
        ch.librador_cuit,
        ch.banco_emisor,
        ch.numero,
        ch.tipo,
        ch.importe,
        ch.fecha_recepcion,
        ch.fecha_emision,
        ch.fecha_pago,
        ch.estado,
        ch.fecha_endoso,
        ch.proveedor_endoso_id,
        ch.tipo_endoso,
        ch.motivo_endoso,
        ch.fecha_deposito,
        ch.cuenta_deposito_id,
        ch.fecha_rechazo,
        ch.motivo_rechazo,
        ch.notas,
        ch.created_at,
        ch.created_by,
        cl.razon_social as cliente,
        cl.cuit as cliente_cuit,
        pr.razon_social as proveedor_endoso,
        cu.nombre as cuenta_deposito,
        ch.fecha_pago - public.hoy() as dias_para_pago,
        co.cobro_id,
        co.ingreso_vencimiento_id,
        e.id as egreso_id,
        coalesce(co.cobros, 0) as cobros_count
   from public.cheques ch
   left join public.clientes cl on cl.id = ch.cliente_id
   left join public.proveedores pr on pr.id = ch.proveedor_endoso_id
   left join public.cuentas cu on cu.id = ch.cuenta_deposito_id
   left join lateral (
     select min(c.id) as cobro_id, min(c.ingreso_vencimiento_id) as ingreso_vencimiento_id, count(*)::int as cobros
       from public.cobros c
      where c.cheque_id = ch.id
   ) co on co.cobro_id is not null
   left join public.egresos e on e.cheque_id = ch.id;

-- p_cheques: [{"banco_emisor":"...","numero":"...","tipo":"echeq|fisico","importe":123.45,
--              "fecha_pago":"2026-12-01","fecha_emision":null,"librador":"...","librador_cuit":"..."}]
--   (importes en pesos)
-- p_vencimientos: ids de los vencimientos a cancelar, en el orden de imputación.
-- p_tc: obligatorio si algún vencimiento es en USD.
-- Devuelve la cantidad de cobros generados.
create or replace function public.registrar_cobranza_cheques(
  p_cliente_id bigint,
  p_fecha date,
  p_cheques jsonb,
  p_vencimientos bigint[],
  p_tc numeric default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ch jsonb;
  v_ch_id bigint;
  v_resto numeric;          -- pesos del cheque aún sin imputar
  v_total_ch numeric := 0;
  v_total_vto numeric := 0;
  v_imputa numeric;         -- en la moneda del vencimiento
  v_consume numeric;        -- en pesos
  v_n int := 0;
  v_saldos jsonb := '{}';   -- saldo restante (moneda del vencimiento) por id
  v_saldo numeric;
  v_saldo_ars numeric;
  v record;
  v_idx int;
begin
  if p_cheques is null or jsonb_typeof(p_cheques) <> 'array' or jsonb_array_length(p_cheques) = 0 then
    raise exception 'Cargá al menos un cheque';
  end if;
  if p_vencimientos is null or cardinality(p_vencimientos) = 0 then
    raise exception 'Elegí los vencimientos que cancelan los cheques';
  end if;

  -- Valida los vencimientos y toma sus saldos
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
  if v_total_ch > v_total_vto + 0.01 then
    raise exception 'Los cheques ($ %) superan el saldo de los vencimientos elegidos ($ %)', v_total_ch, v_total_vto;
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

    -- Imputa el cheque a los vencimientos en el orden indicado
    for v_idx in 1 .. cardinality(p_vencimientos) loop
      exit when v_resto <= 0.009;
      v_saldo := (v_saldos ->> p_vencimientos[v_idx]::text)::numeric;
      continue when v_saldo <= 0;

      select vv.id, vv.moneda into v from public.v_ingreso_vencimientos vv where vv.id = p_vencimientos[v_idx];
      v_saldo_ars := public.convertir(v_saldo, v.moneda, 'ARS', p_tc);

      if v_resto >= v_saldo_ars - 0.01 then
        v_imputa := v_saldo;                      -- cancela el vencimiento
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
  end loop;

  return v_n;
end;
$$;

-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.registrar_cobranza_cheques(bigint, date, jsonb, bigint[], numeric) to authenticated, anon;
grant select on public.v_cheques to anon, authenticated;

notify pgrst, 'reload schema';
