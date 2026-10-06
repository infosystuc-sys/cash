-- =====================================================================
-- Vistas de lectura (security_invoker => respetan RLS) y funciones RPC
-- =====================================================================

-- Última cotización MEP (venta) cargada.
create or replace function public.tc_actual()
returns numeric
language sql stable
set search_path = ''
as $$
  select venta from public.cotizaciones where tipo = 'MEP' order by fecha desc limit 1
$$;

create view public.v_cotizacion_actual with (security_invoker = true) as
select * from public.cotizaciones where tipo = 'MEP' order by fecha desc limit 1;

-- ---------- Libro de movimientos por cuenta (importe en moneda de la cuenta) ----------
create view public.v_movimientos with (security_invoker = true) as
select c.cuenta_id, c.fecha, 'cobro'::text as tipo,
       coalesce(c.concepto, 'Cobro ' || cl.razon_social) as concepto,
       public.convertir(c.importe, c.moneda, cu.moneda, c.tc) as importe,
       'cobros'::text as origen, c.id as origen_id, c.created_at
  from public.cobros c
  join public.cuentas cu on cu.id = c.cuenta_id
  join public.clientes cl on cl.id = c.cliente_id
 where not c.anulado
union all
select e.cuenta_id, e.fecha, 'egreso', e.concepto,
       -public.convertir(e.importe, e.moneda, cu.moneda, e.tc),
       'egresos', e.id, e.created_at
  from public.egresos e
  join public.cuentas cu on cu.id = e.cuenta_id
union all
select t.cuenta_origen_id, t.fecha, 'transferencia_salida',
       coalesce(t.concepto, 'Transferencia a ' || d.nombre),
       -t.importe_origen, 'transferencias', t.id, t.created_at
  from public.transferencias t
  join public.cuentas d on d.id = t.cuenta_destino_id
union all
select t.cuenta_destino_id, t.fecha, 'transferencia_entrada',
       coalesce(t.concepto, 'Transferencia desde ' || o.nombre),
       t.importe_destino, 'transferencias', t.id, t.created_at
  from public.transferencias t
  join public.cuentas o on o.id = t.cuenta_origen_id
union all
select ch.cuenta_deposito_id, ch.fecha_deposito, 'deposito_cheque',
       'Depósito cheque #' || ch.numero || ' ' || ch.banco_emisor,
       ch.importe, 'cheques', ch.id, ch.created_at
  from public.cheques ch
 where ch.fecha_deposito is not null
union all
select ch.cuenta_deposito_id, ch.fecha_rechazo, 'rechazo_cheque',
       'Rechazo cheque #' || ch.numero || ' ' || ch.banco_emisor,
       -ch.importe, 'cheques', ch.id, ch.created_at
  from public.cheques ch
 where ch.estado = 'rechazado' and ch.fecha_deposito is not null;

-- ---------- Cuentas con saldo calculado ----------
create view public.v_cuentas_saldo with (security_invoker = true) as
select cu.*,
       cu.saldo_inicial + coalesce(m.total, 0) as saldo,
       case when cu.moneda = 'USD'
            then round((cu.saldo_inicial + coalesce(m.total, 0)) * public.tc_actual(), 2)
            else cu.saldo_inicial + coalesce(m.total, 0)
       end as saldo_ars,
       um.fecha as ultimo_mov_fecha,
       um.concepto as ultimo_mov_concepto,
       um.importe as ultimo_mov_importe
  from public.cuentas cu
  left join lateral (
    select sum(mv.importe) as total
      from public.v_movimientos mv
     where mv.cuenta_id = cu.id and mv.fecha >= cu.fecha_saldo_inicial
  ) m on true
  left join lateral (
    select mv.fecha, mv.concepto, mv.importe
      from public.v_movimientos mv
     where mv.cuenta_id = cu.id
     order by mv.fecha desc, mv.created_at desc
     limit 1
  ) um on true;

-- ---------- Ingresos ----------
create view public.v_ingreso_vencimientos with (security_invoker = true) as
select v.*,
       i.cliente_id,
       i.moneda,
       coalesce(c.cobrado, 0) as cobrado,
       v.importe - coalesce(c.cobrado, 0) as saldo,
       c.ultima_fecha_cobro,
       case
         when v.importe - coalesce(c.cobrado, 0) <= 0 then 'cobrado'
         when v.fecha_vencimiento < public.hoy() then 'vencido'
         when coalesce(c.cobrado, 0) > 0 then 'parcial'
         else 'pendiente'
       end as estado
  from public.ingreso_vencimientos v
  join public.ingresos i on i.id = v.ingreso_id
  left join lateral (
    select sum(co.importe) as cobrado, max(co.fecha) as ultima_fecha_cobro
      from public.cobros co
     where co.ingreso_vencimiento_id = v.id and not co.anulado
  ) c on true;

create view public.v_ingresos with (security_invoker = true) as
select i.*,
       cl.razon_social as cliente,
       cl.cuit as cliente_cuit,
       ti.nombre as tipo_ingreso,
       agg.cuotas,
       agg.cobrado,
       i.importe_total - agg.cobrado as saldo,
       prox.numero as proxima_cuota,
       prox.fecha_vencimiento as proximo_vencimiento,
       prox.saldo as proximo_saldo,
       case
         when agg.cobrado >= i.importe_total then 'cobrado'
         when agg.vencidas > 0 then 'vencido'
         when agg.cobrado > 0 then 'cobrado_parcial'
         else 'pendiente'
       end as estado
  from public.ingresos i
  join public.clientes cl on cl.id = i.cliente_id
  join public.tipos_ingreso ti on ti.id = i.tipo_ingreso_id
  left join lateral (
    select count(*) as cuotas,
           coalesce(sum(v.cobrado), 0) as cobrado,
           count(*) filter (where v.estado = 'vencido') as vencidas
      from public.v_ingreso_vencimientos v
     where v.ingreso_id = i.id
  ) agg on true
  left join lateral (
    select v.numero, v.fecha_vencimiento, v.saldo
      from public.v_ingreso_vencimientos v
     where v.ingreso_id = i.id and v.saldo > 0
     order by v.fecha_vencimiento
     limit 1
  ) prox on true;

-- ---------- Cheques ----------
create view public.v_cheques with (security_invoker = true) as
select ch.*,
       cl.razon_social as cliente,
       cl.cuit as cliente_cuit,
       pr.razon_social as proveedor_endoso,
       cu.nombre as cuenta_deposito,
       ch.fecha_pago - public.hoy() as dias_para_pago,
       co.id as cobro_id,
       co.ingreso_vencimiento_id,
       e.id as egreso_id
  from public.cheques ch
  left join public.clientes cl on cl.id = ch.cliente_id
  left join public.proveedores pr on pr.id = ch.proveedor_endoso_id
  left join public.cuentas cu on cu.id = ch.cuenta_deposito_id
  left join public.cobros co on co.cheque_id = ch.id
  left join public.egresos e on e.cheque_id = ch.id;

-- ---------- Deudas ----------
create view public.v_deuda_cuotas with (security_invoker = true) as
select q.*,
       d.moneda,
       d.proveedor_id,
       coalesce(p.pagado, 0) as pagado,
       q.importe - coalesce(p.pagado, 0) as saldo,
       p.fecha_pago,
       p.cuenta,
       case
         when q.importe - coalesce(p.pagado, 0) <= 0 then 'pagada'
         when q.fecha_vencimiento < public.hoy() then 'vencida'
         when coalesce(p.pagado, 0) > 0 then 'parcial'
         else 'pendiente'
       end as estado
  from public.deuda_cuotas q
  join public.deudas d on d.id = q.deuda_id
  left join lateral (
    select sum(e.importe) as pagado,
           max(e.fecha) as fecha_pago,
           (array_agg(coalesce(cu.nombre, 'Cheque endosado') order by e.fecha desc))[1] as cuenta
      from public.egresos e
      left join public.cuentas cu on cu.id = e.cuenta_id
     where e.deuda_cuota_id = q.id
  ) p on true;

create view public.v_deudas with (security_invoker = true) as
select d.*,
       pr.razon_social as proveedor,
       pr.cuit as proveedor_cuit,
       ca.nombre as categoria,
       ca.color as categoria_color,
       agg.cuotas_total,
       agg.cuotas_pagadas,
       agg.pagado,
       d.importe_total - agg.pagado as saldo,
       prox.numero as proxima_cuota,
       prox.fecha_vencimiento as proximo_vencimiento,
       prox.saldo as proxima_cuota_saldo,
       case
         when agg.pagado >= d.importe_total then 'cancelada'
         when agg.vencidas > 0 then 'vencida'
         when agg.pagado > 0 then 'parcial'
         else 'pendiente'
       end as estado
  from public.deudas d
  join public.proveedores pr on pr.id = d.proveedor_id
  left join public.categorias_egreso ca on ca.id = d.categoria_egreso_id
  left join lateral (
    select count(*) as cuotas_total,
           count(*) filter (where q.estado = 'pagada') as cuotas_pagadas,
           count(*) filter (where q.estado = 'vencida') as vencidas,
           coalesce(sum(q.pagado), 0) as pagado
      from public.v_deuda_cuotas q
     where q.deuda_id = d.id
  ) agg on true
  left join lateral (
    select q.numero, q.fecha_vencimiento, q.saldo
      from public.v_deuda_cuotas q
     where q.deuda_id = d.id and q.saldo > 0
     order by q.fecha_vencimiento
     limit 1
  ) prox on true;

-- ---------- Egresos ----------
create view public.v_egresos with (security_invoker = true) as
select e.*,
       ca.nombre as categoria,
       ca.color as categoria_color,
       pr.razon_social as proveedor,
       cu.nombre as cuenta,
       public.convertir(e.importe, e.moneda, 'ARS', e.tc) as importe_ars,
       q.deuda_id,
       q.numero as cuota_numero,
       d.concepto as deuda_concepto,
       ch.numero as cheque_numero,
       ch.banco_emisor as cheque_banco
  from public.egresos e
  join public.categorias_egreso ca on ca.id = e.categoria_egreso_id
  left join public.proveedores pr on pr.id = e.proveedor_id
  left join public.cuentas cu on cu.id = e.cuenta_id
  left join public.deuda_cuotas q on q.id = e.deuda_cuota_id
  left join public.deudas d on d.id = q.deuda_id
  left join public.cheques ch on ch.id = e.cheque_id;

create view public.v_categorias_egreso with (security_invoker = true) as
select ca.*,
       coalesce(s.ops_anio, 0) as ops_anio,
       coalesce(s.total_anio, 0) as total_anio,
       coalesce(s.ops_mes, 0) as ops_mes,
       coalesce(s.total_mes, 0) as total_mes,
       s.ultimo_egreso
  from public.categorias_egreso ca
  left join lateral (
    select count(*) filter (where date_trunc('year', e.fecha) = date_trunc('year', public.hoy())) as ops_anio,
           sum(public.convertir(e.importe, e.moneda, 'ARS', e.tc))
             filter (where date_trunc('year', e.fecha) = date_trunc('year', public.hoy())) as total_anio,
           count(*) filter (where date_trunc('month', e.fecha) = date_trunc('month', public.hoy())) as ops_mes,
           sum(public.convertir(e.importe, e.moneda, 'ARS', e.tc))
             filter (where date_trunc('month', e.fecha) = date_trunc('month', public.hoy())) as total_mes,
           max(e.fecha) as ultimo_egreso
      from public.egresos e
     where e.categoria_egreso_id = ca.id
  ) s on true;

-- ---------- Transferencias ----------
create view public.v_transferencias with (security_invoker = true) as
select t.*,
       o.nombre as cuenta_origen,
       o.moneda as moneda_origen,
       d.nombre as cuenta_destino,
       d.moneda as moneda_destino
  from public.transferencias t
  join public.cuentas o on o.id = t.cuenta_origen_id
  join public.cuentas d on d.id = t.cuenta_destino_id;

-- =====================================================================
-- RPCs transaccionales
-- =====================================================================

-- Alta de ingreso + plan de vencimientos (1 a 12). La suma debe cuadrar.
-- p_vencimientos: [{"fecha_vencimiento":"2026-11-05","importe":1800000,"medio_previsto":"...","cuenta_prevista_id":1}]
create or replace function public.crear_ingreso(
  p_cliente_id bigint,
  p_tipo_ingreso_id bigint,
  p_fecha_factura date,
  p_descripcion text,
  p_moneda public.moneda,
  p_importe_total numeric,
  p_vencimientos jsonb,
  p_comprobante text default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
  v_suma numeric;
  v_n int;
begin
  v_n := jsonb_array_length(p_vencimientos);
  if v_n < 1 or v_n > 12 then
    raise exception 'Debe haber entre 1 y 12 vencimientos';
  end if;

  select sum((x ->> 'importe')::numeric) into v_suma from jsonb_array_elements(p_vencimientos) x;
  if v_suma <> p_importe_total then
    raise exception 'La suma de vencimientos (%) no coincide con el importe total (%)', v_suma, p_importe_total;
  end if;

  insert into public.ingresos (cliente_id, tipo_ingreso_id, fecha_factura, comprobante, descripcion, moneda, importe_total)
  values (p_cliente_id, p_tipo_ingreso_id, p_fecha_factura, p_comprobante, p_descripcion, p_moneda, p_importe_total)
  returning id into v_id;

  insert into public.ingreso_vencimientos (ingreso_id, numero, fecha_vencimiento, importe, medio_previsto, cuenta_prevista_id)
  select v_id, x.ord, (x.val ->> 'fecha_vencimiento')::date, (x.val ->> 'importe')::numeric,
         x.val ->> 'medio_previsto', nullif(x.val ->> 'cuenta_prevista_id', '')::bigint
    from jsonb_array_elements(p_vencimientos) with ordinality as x(val, ord);

  return v_id;
end;
$$;

-- Registra el cobro (total o parcial) de un vencimiento.
-- medio = 'cheque' crea el cheque en cartera con los datos de p_cheque:
-- {"banco_emisor":"...","numero":"...","tipo":"echeq|fisico","fecha_pago":"...","fecha_emision":"...","librador":"...","librador_cuit":"..."}
create or replace function public.registrar_cobro(
  p_vencimiento_id bigint,
  p_fecha date,
  p_importe numeric,
  p_medio public.medio_cobro,
  p_cuenta_id bigint default null,
  p_tc numeric default null,
  p_cheque jsonb default null,
  p_concepto text default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_cliente bigint;
  v_moneda public.moneda;
  v_cheque_id bigint;
  v_id bigint;
begin
  select i.cliente_id, i.moneda into v_cliente, v_moneda
    from public.ingreso_vencimientos v
    join public.ingresos i on i.id = v.ingreso_id
   where v.id = p_vencimiento_id;
  if not found then
    raise exception 'Vencimiento inexistente';
  end if;

  if p_medio = 'cheque' then
    if p_cheque is null then
      raise exception 'Faltan los datos del cheque';
    end if;
    if v_moneda = 'USD' and p_tc is null then
      raise exception 'Ingreso en USD cobrado con cheque: indicar tipo de cambio';
    end if;
    insert into public.cheques (cliente_id, librador, librador_cuit, banco_emisor, numero, tipo, importe,
                                fecha_recepcion, fecha_emision, fecha_pago)
    values (v_cliente, p_cheque ->> 'librador', p_cheque ->> 'librador_cuit', p_cheque ->> 'banco_emisor',
            p_cheque ->> 'numero', coalesce((p_cheque ->> 'tipo')::public.tipo_cheque, 'echeq'),
            public.convertir(p_importe, v_moneda, 'ARS', p_tc), p_fecha,
            (p_cheque ->> 'fecha_emision')::date, (p_cheque ->> 'fecha_pago')::date)
    returning id into v_cheque_id;
  elsif p_cuenta_id is null then
    raise exception 'Indicar la cuenta donde ingresa el cobro';
  end if;

  insert into public.cobros (cliente_id, ingreso_vencimiento_id, fecha, moneda, importe, tc, medio,
                             cuenta_id, cheque_id, concepto)
  values (v_cliente, p_vencimiento_id, p_fecha, v_moneda, p_importe, p_tc, p_medio,
          case when p_medio = 'cheque' then null else p_cuenta_id end, v_cheque_id, p_concepto)
  returning id into v_id;

  return v_id;
end;
$$;

-- Alta de deuda + plan de cuotas. La suma debe cuadrar.
-- p_cuotas: [{"fecha_vencimiento":"2026-11-04","importe":680000}]
create or replace function public.crear_deuda(
  p_proveedor_id bigint,
  p_concepto text,
  p_moneda public.moneda,
  p_importe_total numeric,
  p_cuotas jsonb,
  p_categoria_egreso_id bigint default null,
  p_tc_referencia numeric default null,
  p_referencia text default null,
  p_notas text default null,
  p_fecha_alta date default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
  v_suma numeric;
  v_n int;
begin
  v_n := jsonb_array_length(p_cuotas);
  if v_n < 1 then
    raise exception 'Debe haber al menos una cuota';
  end if;

  select sum((x ->> 'importe')::numeric) into v_suma from jsonb_array_elements(p_cuotas) x;
  if v_suma <> p_importe_total then
    raise exception 'La suma de cuotas (%) no coincide con el importe total (%)', v_suma, p_importe_total;
  end if;

  insert into public.deudas (proveedor_id, concepto, categoria_egreso_id, moneda, importe_total, tc_referencia,
                             forma_pago, fecha_alta, referencia, notas)
  values (p_proveedor_id, p_concepto, p_categoria_egreso_id, p_moneda, p_importe_total, p_tc_referencia,
          case when v_n = 1 then 'unico' else 'cuotas' end::public.forma_pago_deuda,
          coalesce(p_fecha_alta, public.hoy()), p_referencia, p_notas)
  returning id into v_id;

  insert into public.deuda_cuotas (deuda_id, numero, fecha_vencimiento, importe)
  select v_id, x.ord, (x.val ->> 'fecha_vencimiento')::date, (x.val ->> 'importe')::numeric
    from jsonb_array_elements(p_cuotas) with ordinality as x(val, ord);

  return v_id;
end;
$$;

-- Endosa un cheque en cartera a un proveedor: registra el egreso (medio cheque_endosado)
-- y opcionalmente lo imputa a una cuota de deuda. Devuelve el id del egreso.
create or replace function public.endosar_cheque(
  p_cheque_id bigint,
  p_fecha date,
  p_proveedor_id bigint,
  p_categoria_egreso_id bigint,
  p_tipo_endoso public.tipo_endoso default 'nominativo',
  p_motivo text default null,
  p_deuda_cuota_id bigint default null,
  p_tc numeric default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_ch public.cheques;
  v_moneda public.moneda := 'ARS';
  v_id bigint;
begin
  select * into v_ch from public.cheques where id = p_cheque_id for update;
  if not found then
    raise exception 'Cheque inexistente';
  end if;
  if v_ch.estado <> 'en_cartera' then
    raise exception 'Solo se pueden endosar cheques en cartera (estado actual: %)', v_ch.estado;
  end if;

  if p_deuda_cuota_id is not null then
    select d.moneda into v_moneda
      from public.deuda_cuotas q join public.deudas d on d.id = q.deuda_id
     where q.id = p_deuda_cuota_id;
    if v_moneda = 'USD' and p_tc is null then
      raise exception 'La deuda es en USD: indicar tipo de cambio';
    end if;
  end if;

  update public.cheques
     set estado = 'endosado',
         fecha_endoso = p_fecha,
         proveedor_endoso_id = p_proveedor_id,
         tipo_endoso = p_tipo_endoso,
         motivo_endoso = p_motivo
   where id = p_cheque_id;

  insert into public.egresos (fecha, categoria_egreso_id, proveedor_id, concepto, moneda, importe, tc,
                              medio, cheque_id, deuda_cuota_id)
  values (p_fecha, p_categoria_egreso_id, p_proveedor_id,
          coalesce(p_motivo, 'Endoso cheque #' || v_ch.numero || ' ' || v_ch.banco_emisor),
          v_moneda, public.convertir(v_ch.importe, 'ARS', v_moneda, p_tc),
          case when v_moneda = 'USD' then p_tc end,
          'cheque_endosado', p_cheque_id, p_deuda_cuota_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- Deposita un cheque en cartera en una cuenta en pesos.
create or replace function public.depositar_cheque(p_cheque_id bigint, p_cuenta_id bigint, p_fecha date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_estado public.estado_cheque;
  v_moneda public.moneda;
begin
  select estado into v_estado from public.cheques where id = p_cheque_id for update;
  if not found then
    raise exception 'Cheque inexistente';
  end if;
  if v_estado <> 'en_cartera' then
    raise exception 'Solo se pueden depositar cheques en cartera (estado actual: %)', v_estado;
  end if;
  select moneda into v_moneda from public.cuentas where id = p_cuenta_id;
  if v_moneda is distinct from 'ARS' then
    raise exception 'El cheque debe depositarse en una cuenta en pesos';
  end if;

  update public.cheques
     set estado = 'depositado', fecha_deposito = p_fecha, cuenta_deposito_id = p_cuenta_id
   where id = p_cheque_id;
end;
$$;

-- Marca un cheque como rechazado y anula el cobro asociado (el vencimiento vuelve a quedar pendiente).
create or replace function public.rechazar_cheque(p_cheque_id bigint, p_fecha date, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_estado public.estado_cheque;
begin
  select estado into v_estado from public.cheques where id = p_cheque_id for update;
  if not found then
    raise exception 'Cheque inexistente';
  end if;
  if v_estado not in ('en_cartera', 'depositado') then
    raise exception 'Solo se pueden rechazar cheques en cartera o depositados (estado actual: %)', v_estado;
  end if;

  update public.cheques
     set estado = 'rechazado', fecha_rechazo = p_fecha, motivo_rechazo = p_motivo
   where id = p_cheque_id;

  update public.cobros set anulado = true where cheque_id = p_cheque_id;
end;
$$;

-- =====================================================================
-- Cash flow consolidado en ARS por período (day | week | month).
-- Períodos pasados: movimientos reales. Desde hoy: además proyecta
-- vencimientos a cobrar, cheques en cartera y cuotas de deuda pendientes
-- (los vencidos impagos se proyectan a hoy). Las transferencias internas
-- no cuentan como ingreso/egreso. USD se valúa al TC MEP actual.
-- =====================================================================
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
    select gs::date as ini, (gs + p.paso)::date - 1 as fin
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
  flujos as (
    select mov.fecha, mov.ars from mov where mov.tipo not in ('transferencia_salida', 'transferencia_entrada')
    union all
    select proy.fecha, proy.ars from proy
  ),
  base as (
    select (select coalesce(sum(case when cu.moneda = 'USD' then round(cu.saldo_inicial * p.tc, 2) else cu.saldo_inicial end), 0)
              from public.cuentas cu cross join p)
         + (select coalesce(sum(mov.ars), 0) from mov where mov.fecha < (select min(periodos.ini) from periodos))
         + (select coalesce(sum(proy.ars), 0) from proy where proy.fecha < (select min(periodos.ini) from periodos)) as saldo
  ),
  por_periodo as (
    select pe.ini, pe.fin,
           coalesce(sum(f.ars) filter (where f.ars > 0), 0) as ing,
           coalesce(-sum(f.ars) filter (where f.ars < 0), 0) as egr
      from periodos pe
      left join flujos f on f.fecha between pe.ini and pe.fin
     group by pe.ini, pe.fin
  )
  select pp.ini,
         pp.fin,
         b.saldo + coalesce(sum(pp.ing - pp.egr) over (order by pp.ini rows between unbounded preceding and 1 preceding), 0),
         pp.ing,
         pp.egr,
         pp.ing - pp.egr,
         b.saldo + sum(pp.ing - pp.egr) over (order by pp.ini),
         pp.fin >= (select p.hoy from p)
    from por_periodo pp cross join base b
   order by pp.ini
$$;

-- =====================================================================
-- Permisos: nada para anon; todo para authenticated (RLS manda).
-- =====================================================================
revoke all on public.v_cotizacion_actual, public.v_movimientos, public.v_cuentas_saldo,
              public.v_ingreso_vencimientos, public.v_ingresos, public.v_cheques,
              public.v_deuda_cuotas, public.v_deudas, public.v_egresos,
              public.v_categorias_egreso, public.v_transferencias
  from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
