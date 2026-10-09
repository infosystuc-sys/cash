-- =====================================================================
-- Cash flow: cambiar la fecha de vencimiento de un registro previsto
-- desde el detalle (doble click en el renglón).
-- fn_cashflow_detalle suma ref_id (id del registro de origen) y
-- fecha_real (vencimiento/fecha sin llevar a hoy los atrasados).
-- =====================================================================

drop function public.fn_cashflow_detalle(date, date);

create function public.fn_cashflow_detalle(p_desde date, p_hasta date)
returns table (fecha date, proyectado boolean, origen text, concepto text, detalle text, ars numeric, ref_id bigint, fecha_real date)
language sql stable
set search_path = ''
as $$
  with p as (
    select public.hoy() as hoy, coalesce(public.tc_actual(), 0) as tc
  )
  select m.fecha, false, m.tipo, m.concepto, cu.nombre,
         case when cu.moneda = 'USD' then round(m.importe * p.tc, 2) else m.importe end,
         m.origen_id, m.fecha
    from public.v_movimientos m
    join public.cuentas cu on cu.id = m.cuenta_id
   cross join p
   where m.fecha >= cu.fecha_saldo_inicial
     and m.tipo not in ('transferencia_salida', 'transferencia_entrada')
     and m.fecha between p_desde and p_hasta
  union all
  select greatest(v.fecha_vencimiento, p.hoy), true, 'cobro_previsto',
         i.descripcion || ' • cuota ' || v.numero, cl.razon_social,
         public.convertir(v.saldo, v.moneda, 'ARS', p.tc),
         v.id, v.fecha_vencimiento
    from public.v_ingreso_vencimientos v
    join public.ingresos i on i.id = v.ingreso_id
    join public.clientes cl on cl.id = i.cliente_id
   cross join p
   where v.saldo > 0
     and greatest(v.fecha_vencimiento, p.hoy) between p_desde and p_hasta
  union all
  select greatest(ch.fecha_pago, p.hoy), true, 'cheque_cartera',
         'Cheque #' || ch.numero || ' ' || ch.banco_emisor, coalesce(cl.razon_social, ch.librador),
         ch.importe,
         ch.id, ch.fecha_pago
    from public.cheques ch
    left join public.clientes cl on cl.id = ch.cliente_id
   cross join p
   where ch.estado = 'en_cartera'
     and greatest(ch.fecha_pago, p.hoy) between p_desde and p_hasta
  union all
  select greatest(q.fecha_vencimiento, p.hoy), true, 'pago_previsto',
         d.concepto || ' • cuota ' || q.numero, pr.razon_social,
         -public.convertir(q.saldo, q.moneda, 'ARS', p.tc),
         q.id, q.fecha_vencimiento
    from public.v_deuda_cuotas q
    join public.deudas d on d.id = q.deuda_id
    join public.proveedores pr on pr.id = d.proveedor_id
   cross join p
   where q.saldo > 0
     and greatest(q.fecha_vencimiento, p.hoy) between p_desde and p_hasta
  order by 1, 3
$$;

-- Cambia la fecha de vencimiento del registro previsto indicado:
-- cobro_previsto -> vencimiento del ingreso, pago_previsto -> cuota de deuda
-- (se renumeran por fecha), cheque_cartera -> fecha de pago del cheque.
create or replace function public.cambiar_vencimiento(p_origen text, p_id bigint, p_fecha date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_importe numeric;
begin
  if p_fecha is null then
    raise exception 'Indicá la nueva fecha';
  end if;

  if p_origen = 'cobro_previsto' then
    update public.ingreso_vencimientos set fecha_vencimiento = p_fecha where id = p_id;
    if not found then
      raise exception 'Vencimiento inexistente';
    end if;
  elsif p_origen = 'pago_previsto' then
    select importe into v_importe from public.deuda_cuotas where id = p_id;
    if not found then
      raise exception 'Cuota inexistente';
    end if;
    perform public.actualizar_deuda_cuota(p_id, p_fecha, v_importe);
  elsif p_origen = 'cheque_cartera' then
    update public.cheques set fecha_pago = p_fecha where id = p_id and estado = 'en_cartera';
    if not found then
      raise exception 'El cheque no está en cartera';
    end if;
  else
    raise exception 'Solo se puede cambiar el vencimiento de cobros, pagos previstos y cheques en cartera';
  end if;
end;
$$;

revoke execute on function public.fn_cashflow_detalle(date, date) from public;
revoke execute on function public.cambiar_vencimiento(text, bigint, date) from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.fn_cashflow_detalle(date, date) to authenticated, anon;
grant execute on function public.cambiar_vencimiento(text, bigint, date) to authenticated, anon;
