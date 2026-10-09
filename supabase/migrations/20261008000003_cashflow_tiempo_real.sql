-- =====================================================================
-- Cash flow en tiempo real.
-- Períodos pasados (terminan antes de hoy): movimientos reales, como antes.
-- Desde el período que contiene hoy: el saldo arranca de las disponibilidades
-- al día (saldo real de todas las cuentas, USD al TC actual, igual que en la
-- pantalla Cuentas) y los ingresos/egresos son solo lo pendiente: vencimientos
-- a cobrar, cheques en cartera y cuotas de deuda (los vencidos se proyectan a
-- hoy). Los cobros y pagos reales de hoy ya están dentro de las disponibilidades.
-- =====================================================================

create or replace function public.fn_cashflow_disponible()
returns numeric
language sql stable
set search_path = ''
as $$
  select coalesce(sum(coalesce(saldo_ars, 0)), 0) from public.v_cuentas_saldo
$$;

create or replace function public.fn_cashflow(p_desde date, p_hasta date, p_periodo text default 'week')
returns table (
  periodo_inicio date,
  periodo_fin date,
  saldo_inicial numeric,
  ingresos numeric,
  egresos numeric,
  neto numeric,
  saldo_final numeric,
  proyectado boolean
)
language sql stable
set search_path = ''
as $$
  with p as (
    select public.hoy() as hoy,
           coalesce(public.tc_actual(), 0) as tc,
           case p_periodo when 'day' then interval '1 day' when 'month' then interval '1 month' else interval '1 week' end as paso,
           case p_periodo
             when 'day' then p_desde
             when 'month' then date_trunc('month', p_desde)::date
             else date_trunc('week', p_desde)::date
           end as inicio
  ),
  periodos as (
    select gs::date as ini, (gs + p.paso)::date - 1 as fin, (gs + p.paso)::date - 1 >= p.hoy as proyectado
      from p, generate_series(p.inicio, p_hasta, p.paso) gs
  ),
  mov as (
    select m.fecha, m.tipo,
           case when cu.moneda = 'USD' then round(m.importe * p.tc, 2) else m.importe end as ars
      from public.v_movimientos m
      join public.cuentas cu on cu.id = m.cuenta_id
     cross join p
     where m.fecha >= cu.fecha_saldo_inicial
  ),
  proy as (
    select greatest(v.fecha_vencimiento, p.hoy) as fecha,
           public.convertir(v.saldo, v.moneda, 'ARS', p.tc) as ars
      from public.v_ingreso_vencimientos v cross join p
     where v.saldo > 0
    union all
    select greatest(ch.fecha_pago, p.hoy), ch.importe
      from public.cheques ch cross join p
     where ch.estado = 'en_cartera'
    union all
    select greatest(q.fecha_vencimiento, p.hoy), -public.convertir(q.saldo, q.moneda, 'ARS', p.tc)
      from public.v_deuda_cuotas q cross join p
     where q.saldo > 0
  ),
  -- Saldo con el que arranca el primer período pasado
  base as (
    select (select coalesce(sum(case when cu.moneda = 'USD' then round(cu.saldo_inicial * p.tc, 2) else cu.saldo_inicial end), 0)
              from public.cuentas cu cross join p)
         + (select coalesce(sum(mov.ars), 0) from mov where mov.fecha < (select min(periodos.ini) from periodos)) as saldo,
           public.fn_cashflow_disponible() as disponible
  ),
  por_periodo as (
    select pe.ini, pe.fin, pe.proyectado,
           case when pe.proyectado
                then (select coalesce(sum(x.ars), 0) from proy x where x.fecha between pe.ini and pe.fin and x.ars > 0)
                else (select coalesce(sum(x.ars), 0) from mov x
                       where x.fecha between pe.ini and pe.fin and x.ars > 0
                         and x.tipo not in ('transferencia_salida', 'transferencia_entrada'))
           end as ing,
           case when pe.proyectado
                then (select coalesce(-sum(x.ars), 0) from proy x where x.fecha between pe.ini and pe.fin and x.ars < 0)
                else (select coalesce(-sum(x.ars), 0) from mov x
                       where x.fecha between pe.ini and pe.fin and x.ars < 0
                         and x.tipo not in ('transferencia_salida', 'transferencia_entrada'))
           end as egr
      from periodos pe
  )
  select pp.ini,
         pp.fin,
         case when pp.proyectado then b.disponible else b.saldo end
           + coalesce(sum(pp.ing - pp.egr) over (partition by pp.proyectado order by pp.ini rows between unbounded preceding and 1 preceding), 0),
         pp.ing,
         pp.egr,
         pp.ing - pp.egr,
         case when pp.proyectado then b.disponible else b.saldo end
           + sum(pp.ing - pp.egr) over (partition by pp.proyectado order by pp.ini),
         pp.proyectado
    from por_periodo pp cross join base b
   order by pp.ini
$$;

-- Detalle: los movimientos reales solo componen períodos pasados (p_hasta < hoy);
-- desde el período de hoy solo cuenta lo pendiente.
create or replace function public.fn_cashflow_detalle(p_desde date, p_hasta date)
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
     and p_hasta < p.hoy
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

revoke execute on function public.fn_cashflow_disponible() from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.fn_cashflow_disponible() to authenticated, anon;

notify pgrst, 'reload schema';
