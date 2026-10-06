-- =====================================================================
-- Detalle del cash flow: los registros que componen cada valor de
-- fn_cashflow. Replica exactamente su lógica (mismos filtros, misma
-- conversión de USD al TC actual y misma proyección desde hoy).
-- =====================================================================

-- Flujos (sin transferencias internas) con fecha entre p_desde y p_hasta.
-- ars > 0 = ingreso, ars < 0 = egreso.
create or replace function public.fn_cashflow_detalle(p_desde date, p_hasta date)
returns table (fecha date, proyectado boolean, origen text, concepto text, detalle text, ars numeric)
language sql stable
set search_path = ''
as $$
  with p as (
    select public.hoy() as hoy, coalesce(public.tc_actual(), 0) as tc
  )
  select m.fecha, false, m.tipo, m.concepto, cu.nombre,
         case when cu.moneda = 'USD' then round(m.importe * p.tc, 2) else m.importe end
    from public.v_movimientos m
    join public.cuentas cu on cu.id = m.cuenta_id
   cross join p
   where m.fecha >= cu.fecha_saldo_inicial
     and m.tipo not in ('transferencia_salida', 'transferencia_entrada')
     and m.fecha between p_desde and p_hasta
  union all
  select greatest(v.fecha_vencimiento, p.hoy), true, 'cobro_previsto',
         i.descripcion || ' • cuota ' || v.numero, cl.razon_social,
         public.convertir(v.saldo, v.moneda, 'ARS', p.tc)
    from public.v_ingreso_vencimientos v
    join public.ingresos i on i.id = v.ingreso_id
    join public.clientes cl on cl.id = i.cliente_id
   cross join p
   where v.saldo > 0
     and greatest(v.fecha_vencimiento, p.hoy) between p_desde and p_hasta
  union all
  select greatest(ch.fecha_pago, p.hoy), true, 'cheque_cartera',
         'Cheque #' || ch.numero || ' ' || ch.banco_emisor, coalesce(cl.razon_social, ch.librador),
         ch.importe
    from public.cheques ch
    left join public.clientes cl on cl.id = ch.cliente_id
   cross join p
   where ch.estado = 'en_cartera'
     and greatest(ch.fecha_pago, p.hoy) between p_desde and p_hasta
  union all
  select greatest(q.fecha_vencimiento, p.hoy), true, 'pago_previsto',
         d.concepto || ' • cuota ' || q.numero, pr.razon_social,
         -public.convertir(q.saldo, q.moneda, 'ARS', p.tc)
    from public.v_deuda_cuotas q
    join public.deudas d on d.id = q.deuda_id
    join public.proveedores pr on pr.id = d.proveedor_id
   cross join p
   where q.saldo > 0
     and greatest(q.fecha_vencimiento, p.hoy) between p_desde and p_hasta
  order by 1, 3
$$;

-- Componentes del saldo con el que arranca el primer período del rango (p_inicio).
-- Su suma es la "base" de fn_cashflow.
create or replace function public.fn_cashflow_saldo_base(p_inicio date)
returns table (orden int, concepto text, ars numeric)
language sql stable
set search_path = ''
as $$
  with p as (
    select public.hoy() as hoy, coalesce(public.tc_actual(), 0) as tc
  )
  select 1, 'Saldos iniciales de las cuentas',
         coalesce(sum(case when cu.moneda = 'USD' then round(cu.saldo_inicial * p.tc, 2) else cu.saldo_inicial end), 0)
    from public.cuentas cu cross join p
  union all
  select 2, 'Movimientos reales anteriores al ' || to_char(p_inicio, 'DD/MM/YYYY'),
         coalesce(sum(case when cu.moneda = 'USD' then round(m.importe * p.tc, 2) else m.importe end), 0)
    from public.v_movimientos m
    join public.cuentas cu on cu.id = m.cuenta_id
   cross join p
   where m.fecha >= cu.fecha_saldo_inicial and m.fecha < p_inicio
  union all
  select 3, 'Cobros y pagos previstos anteriores al ' || to_char(p_inicio, 'DD/MM/YYYY'),
         coalesce(sum(d.ars), 0)
    from public.fn_cashflow_detalle('0001-01-01', p_inicio - 1) d
   where d.proyectado
  order by 1
$$;

revoke execute on function public.fn_cashflow_detalle(date, date), public.fn_cashflow_saldo_base(date) from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.fn_cashflow_detalle(date, date), public.fn_cashflow_saldo_base(date) to authenticated, anon;
