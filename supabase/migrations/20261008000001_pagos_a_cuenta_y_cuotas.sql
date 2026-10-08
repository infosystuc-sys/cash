-- =====================================================================
-- Pagos y cobros "a cuenta" (un importe libre que se reparte entre las
-- cuotas/vencimientos pendientes, del más antiguo al más nuevo) y
-- edición/eliminación individual de cuotas de deuda, recalculando el total.
-- =====================================================================

-- Imputa p_importe a las cuotas con saldo de la deuda, en orden de vencimiento.
-- Crea un egreso por cuota afectada; la última puede quedar con pago parcial.
-- Devuelve la cantidad de cuotas afectadas.
create or replace function public.registrar_pago_deuda(
  p_deuda_id bigint,
  p_fecha date,
  p_importe numeric,
  p_medio public.medio_pago,
  p_cuenta_id bigint,
  p_categoria_egreso_id bigint,
  p_tc numeric default null
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_deu public.deudas;
  v_total int;
  v_resto numeric := p_importe;
  v_imputa numeric;
  v_n int := 0;
  q record;
begin
  select * into v_deu from public.deudas where id = p_deuda_id for update;
  if not found then
    raise exception 'Deuda inexistente';
  end if;
  if p_medio = 'cheque_endosado' then
    raise exception 'Para pagar con cheque usá el endoso desde Cheques';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe debe ser mayor a cero';
  end if;
  if p_importe > (select coalesce(sum(saldo), 0) from public.v_deuda_cuotas where deuda_id = p_deuda_id and saldo > 0) then
    raise exception 'El importe supera el saldo pendiente de la deuda';
  end if;

  select count(*) into v_total from public.deuda_cuotas where deuda_id = p_deuda_id;

  for q in
    select id, numero, saldo
      from public.v_deuda_cuotas
     where deuda_id = p_deuda_id and saldo > 0
     order by fecha_vencimiento, numero
  loop
    exit when v_resto <= 0;
    v_imputa := least(v_resto, q.saldo);
    insert into public.egresos (fecha, categoria_egreso_id, proveedor_id, concepto, moneda, importe, tc,
                                medio, cuenta_id, deuda_cuota_id)
    values (p_fecha, p_categoria_egreso_id, v_deu.proveedor_id,
            v_deu.concepto || ' - Cuota ' || q.numero || '/' || v_total
              || case when v_imputa < q.saldo then ' (parcial)' else '' end,
            v_deu.moneda, v_imputa, p_tc, p_medio, p_cuenta_id, q.id);
    v_resto := v_resto - v_imputa;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- Imputa p_importe a los vencimientos con saldo del ingreso, en orden de vencimiento.
-- Crea un cobro por vencimiento afectado (vía registrar_cobro). No admite cheque:
-- un cheque queda asociado a un único cobro.
create or replace function public.registrar_cobro_a_cuenta(
  p_ingreso_id bigint,
  p_fecha date,
  p_importe numeric,
  p_medio public.medio_cobro,
  p_cuenta_id bigint,
  p_tc numeric default null
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_resto numeric := p_importe;
  v_imputa numeric;
  v_n int := 0;
  v record;
begin
  perform 1 from public.ingresos where id = p_ingreso_id for update;
  if not found then
    raise exception 'Ingreso inexistente';
  end if;
  if p_medio = 'cheque' then
    raise exception 'Un cheque se imputa a un solo vencimiento';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe debe ser mayor a cero';
  end if;
  if p_importe > (select coalesce(sum(saldo), 0) from public.v_ingreso_vencimientos where ingreso_id = p_ingreso_id and saldo > 0) then
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

  return v_n;
end;
$$;

-- Renumera las cuotas por fecha de vencimiento y ajusta total y forma de pago de la deuda.
create or replace function public.recalcular_deuda(p_deuda_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.deuda_cuotas q
     set numero = r.nro
    from (
      select id, row_number() over (order by fecha_vencimiento, numero) as nro
        from public.deuda_cuotas
       where deuda_id = p_deuda_id
    ) r
   where q.id = r.id and q.numero <> r.nro;

  update public.deudas d
     set importe_total = s.total,
         forma_pago = case when s.n = 1 then 'unico' else 'cuotas' end::public.forma_pago_deuda
    from (
      select sum(importe) as total, count(*) as n
        from public.deuda_cuotas
       where deuda_id = p_deuda_id
    ) s
   where d.id = p_deuda_id;
end;
$$;

-- Modifica fecha e importe de una cuota; el total de la deuda pasa a ser la suma de sus cuotas.
create or replace function public.actualizar_deuda_cuota(p_cuota_id bigint, p_fecha_vencimiento date, p_importe numeric)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deuda_id bigint;
  v_pagado numeric;
begin
  select deuda_id into v_deuda_id from public.deuda_cuotas where id = p_cuota_id;
  if not found then
    raise exception 'Cuota inexistente';
  end if;
  perform 1 from public.deudas where id = v_deuda_id for update;

  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe debe ser mayor a cero';
  end if;
  select coalesce(sum(importe), 0) into v_pagado from public.egresos where deuda_cuota_id = p_cuota_id;
  if p_importe < v_pagado then
    raise exception 'El importe no puede ser menor a lo ya pagado (%)', v_pagado;
  end if;

  update public.deuda_cuotas
     set fecha_vencimiento = p_fecha_vencimiento,
         importe = p_importe
   where id = p_cuota_id;

  perform public.recalcular_deuda(v_deuda_id);
end;
$$;

-- Elimina una cuota sin pagos; el total de la deuda baja en su importe.
create or replace function public.eliminar_deuda_cuota(p_cuota_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deuda_id bigint;
begin
  select deuda_id into v_deuda_id from public.deuda_cuotas where id = p_cuota_id;
  if not found then
    raise exception 'Cuota inexistente';
  end if;
  perform 1 from public.deudas where id = v_deuda_id for update;

  if exists (select 1 from public.egresos where deuda_cuota_id = p_cuota_id) then
    raise exception 'No se puede eliminar una cuota que tiene pagos registrados';
  end if;
  if (select count(*) from public.deuda_cuotas where deuda_id = v_deuda_id) = 1 then
    raise exception 'Es la única cuota de la deuda: eliminá la deuda completa';
  end if;

  delete from public.deuda_cuotas where id = p_cuota_id;
  perform public.recalcular_deuda(v_deuda_id);
end;
$$;

revoke execute on function public.registrar_pago_deuda(bigint, date, numeric, public.medio_pago, bigint, bigint, numeric) from public;
revoke execute on function public.registrar_cobro_a_cuenta(bigint, date, numeric, public.medio_cobro, bigint, numeric) from public;
revoke execute on function public.recalcular_deuda(bigint) from public;
revoke execute on function public.actualizar_deuda_cuota(bigint, date, numeric) from public;
revoke execute on function public.eliminar_deuda_cuota(bigint) from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.registrar_pago_deuda(bigint, date, numeric, public.medio_pago, bigint, bigint, numeric) to authenticated, anon;
grant execute on function public.registrar_cobro_a_cuenta(bigint, date, numeric, public.medio_cobro, bigint, numeric) to authenticated, anon;
grant execute on function public.actualizar_deuda_cuota(bigint, date, numeric) to authenticated, anon;
grant execute on function public.eliminar_deuda_cuota(bigint) to authenticated, anon;
