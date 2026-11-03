-- =====================================================================
-- Cambio de cheques por efectivo y/o transferencia (descuento).
-- Un cheque en cartera se entrega a cambio de dinero (efectivo, transferencia
-- o ambos) cobrando un interés:
--   importe del cheque = efectivo + transferencia + interés
-- - El cheque pasa a estado 'cambiado' y deja de proyectarse en el cash flow.
-- - Cada parte entra como movimiento real ('cambio_cheque') en su cuenta.
-- - El interés se registra como EGRESO (gasto) en la categoría elegida.
--   Para que los saldos cierren, la cuenta que absorbe el interés recibe el
--   bruto (neto + interés) y el egreso se lo descuenta.
-- =====================================================================

alter type public.estado_cheque add value if not exists 'cambiado';

alter table public.cheques
  add column if not exists fecha_cambio date,
  add column if not exists cambio_interes numeric(18, 2),
  add column if not exists cambio_egreso_id bigint references public.egresos (id) on delete set null,
  add column if not exists cambio_proveedor_id bigint references public.proveedores (id);

create table if not exists public.cheque_cambios (
  id bigint generated always as identity primary key,
  cheque_id bigint not null references public.cheques (id) on delete cascade,
  fecha date not null,
  medio text not null check (medio in ('efectivo', 'transferencia')),
  cuenta_id bigint not null references public.cuentas (id),
  importe numeric(18, 2) not null check (importe > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists cheque_cambios_cheque_idx on public.cheque_cambios (cheque_id);
create index if not exists cheque_cambios_cuenta_idx on public.cheque_cambios (cuenta_id);

alter table public.cheque_cambios enable row level security;
drop policy if exists "Usuarios autorizados: acceso total" on public.cheque_cambios;
create policy "Usuarios autorizados: acceso total" on public.cheque_cambios for all to authenticated
  using ((select public.es_autorizado())) with check ((select public.es_autorizado()));
drop policy if exists "Acceso libre temporal" on public.cheque_cambios;
create policy "Acceso libre temporal" on public.cheque_cambios for all to anon using (true) with check (true);
grant select, insert, update, delete on public.cheque_cambios to authenticated, anon;

-- Categoría de egreso para los intereses (si no existe)
insert into public.categorias_egreso (nombre, subtitulo, color)
select 'Intereses y gastos financieros', 'Descuento de cheques, comisiones bancarias', '#B3261E'
 where not exists (select 1 from public.categorias_egreso where lower(nombre) like 'intereses%');

-- Movimientos de cuentas: se suman los cambios de cheques
create or replace view public.v_movimientos with (security_invoker = true) as
 select c.cuenta_id, c.fecha, 'cobro'::text as tipo,
        coalesce(c.concepto, 'Cobro '::text || cl.razon_social) as concepto,
        public.convertir(c.importe, c.moneda, cu.moneda, c.tc) as importe,
        'cobros'::text as origen, c.id as origen_id, c.created_at
   from public.cobros c
   join public.cuentas cu on cu.id = c.cuenta_id
   join public.clientes cl on cl.id = c.cliente_id
  where not c.anulado
 union all
 select e.cuenta_id, e.fecha, 'egreso'::text, e.concepto,
        - public.convertir(e.importe, e.moneda, cu.moneda, e.tc),
        'egresos'::text, e.id, e.created_at
   from public.egresos e
   join public.cuentas cu on cu.id = e.cuenta_id
 union all
 select t.cuenta_origen_id, t.fecha, 'transferencia_salida'::text,
        coalesce(t.concepto, 'Transferencia a '::text || d.nombre),
        - t.importe_origen, 'transferencias'::text, t.id, t.created_at
   from public.transferencias t
   join public.cuentas d on d.id = t.cuenta_destino_id
 union all
 select t.cuenta_destino_id, t.fecha, 'transferencia_entrada'::text,
        coalesce(t.concepto, 'Transferencia desde '::text || o.nombre),
        t.importe_destino, 'transferencias'::text, t.id, t.created_at
   from public.transferencias t
   join public.cuentas o on o.id = t.cuenta_origen_id
 union all
 select ch.cuenta_deposito_id, ch.fecha_deposito, 'deposito_cheque'::text,
        'Depósito cheque #'::text || ch.numero || ' ' || ch.banco_emisor,
        ch.importe, 'cheques'::text, ch.id, ch.created_at
   from public.cheques ch
  where ch.fecha_deposito is not null
 union all
 select ch.cuenta_deposito_id, ch.fecha_rechazo, 'rechazo_cheque'::text,
        'Rechazo cheque #'::text || ch.numero || ' ' || ch.banco_emisor,
        - ch.importe, 'cheques'::text, ch.id, ch.created_at
   from public.cheques ch
  where ch.estado = 'rechazado'::public.estado_cheque and ch.fecha_deposito is not null
 union all
 select cc.cuenta_id, cc.fecha, 'cambio_cheque'::text,
        'Cambio cheque #'::text || ch.numero || ' ' || ch.banco_emisor || ' (' || cc.medio || ')',
        cc.importe, 'cheque_cambios'::text, cc.id, cc.created_at
   from public.cheque_cambios cc
   join public.cheques ch on ch.id = cc.cheque_id;

-- Cambia un cheque en cartera por efectivo y/o transferencia cobrando un interés.
create or replace function public.cambiar_cheque(
  p_cheque_id bigint,
  p_fecha date,
  p_efectivo numeric,
  p_cuenta_efectivo_id bigint,
  p_transferencia numeric,
  p_cuenta_transferencia_id bigint,
  p_interes numeric,
  p_categoria_egreso_id bigint,
  p_proveedor_id bigint default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ch public.cheques;
  v_ef numeric := round(coalesce(p_efectivo, 0), 2);
  v_tr numeric := round(coalesce(p_transferencia, 0), 2);
  v_int numeric := round(coalesce(p_interes, 0), 2);
  v_cuenta_int bigint;
  v_medio_int public.medio_pago;
  v_egreso bigint;
begin
  select * into v_ch from public.cheques where id = p_cheque_id for update;
  if not found then
    raise exception 'Cheque inexistente';
  end if;
  if v_ch.estado <> 'en_cartera' then
    raise exception 'Solo se pueden cambiar cheques en cartera (estado actual: %)', replace(v_ch.estado::text, '_', ' ');
  end if;
  if p_fecha is null then
    raise exception 'Indicá la fecha del cambio';
  end if;
  if v_ef < 0 or v_tr < 0 or v_int < 0 then
    raise exception 'Los importes no pueden ser negativos';
  end if;
  if v_ef + v_tr <= 0 then
    raise exception 'Indicá cuánto se recibe en efectivo y/o transferencia';
  end if;
  if abs(v_ef + v_tr + v_int - v_ch.importe) > 0.01 then
    raise exception 'Efectivo + transferencia + interés (%) debe ser igual al importe del cheque (%)', v_ef + v_tr + v_int, v_ch.importe;
  end if;
  if v_ef > 0 and not exists (select 1 from public.cuentas where id = p_cuenta_efectivo_id and moneda = 'ARS') then
    raise exception 'Elegí una cuenta en pesos para el efectivo';
  end if;
  if v_tr > 0 and not exists (select 1 from public.cuentas where id = p_cuenta_transferencia_id and moneda = 'ARS') then
    raise exception 'Elegí una cuenta en pesos para la transferencia';
  end if;
  if v_int > 0 and p_categoria_egreso_id is null then
    raise exception 'Elegí la categoría de gasto para el interés';
  end if;

  -- La cuenta de la transferencia (o la del efectivo) absorbe el interés
  if v_tr > 0 then
    v_cuenta_int := p_cuenta_transferencia_id;
    v_medio_int := 'transferencia';
  else
    v_cuenta_int := p_cuenta_efectivo_id;
    v_medio_int := 'efectivo';
  end if;

  if v_ef > 0 then
    insert into public.cheque_cambios (cheque_id, fecha, medio, cuenta_id, importe)
    values (p_cheque_id, p_fecha, 'efectivo', p_cuenta_efectivo_id, v_ef + case when v_medio_int = 'efectivo' then v_int else 0 end);
  end if;
  if v_tr > 0 then
    insert into public.cheque_cambios (cheque_id, fecha, medio, cuenta_id, importe)
    values (p_cheque_id, p_fecha, 'transferencia', p_cuenta_transferencia_id, v_tr + v_int);
  end if;

  if v_int > 0 then
    insert into public.egresos (fecha, categoria_egreso_id, proveedor_id, concepto, moneda, importe, medio, cuenta_id)
    values (p_fecha, p_categoria_egreso_id, p_proveedor_id,
            'Interés cambio cheque #' || v_ch.numero || ' ' || v_ch.banco_emisor, 'ARS', v_int, v_medio_int, v_cuenta_int)
    returning id into v_egreso;
  end if;

  update public.cheques
     set estado = 'cambiado', fecha_cambio = p_fecha, cambio_interes = v_int,
         cambio_egreso_id = v_egreso, cambio_proveedor_id = p_proveedor_id
   where id = p_cheque_id;
end;
$$;

-- Deshace un cambio: borra los movimientos y el egreso del interés; el cheque vuelve a cartera.
create or replace function public.anular_cambio_cheque(p_cheque_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ch public.cheques;
begin
  select * into v_ch from public.cheques where id = p_cheque_id for update;
  if not found then
    raise exception 'Cheque inexistente';
  end if;
  if v_ch.estado <> 'cambiado' then
    raise exception 'El cheque no está cambiado';
  end if;
  delete from public.cheque_cambios where cheque_id = p_cheque_id;
  update public.cheques
     set estado = 'en_cartera', fecha_cambio = null, cambio_interes = null,
         cambio_egreso_id = null, cambio_proveedor_id = null
   where id = p_cheque_id;
  if v_ch.cambio_egreso_id is not null then
    delete from public.egresos where id = v_ch.cambio_egreso_id;
  end if;
end;
$$;

-- v_cheques: datos del cambio
create or replace view public.v_cheques with (security_invoker = true) as
 select ch.id, ch.cliente_id, ch.librador, ch.librador_cuit, ch.banco_emisor, ch.numero, ch.tipo, ch.importe,
        ch.fecha_recepcion, ch.fecha_emision, ch.fecha_pago, ch.estado, ch.fecha_endoso, ch.proveedor_endoso_id,
        ch.tipo_endoso, ch.motivo_endoso, ch.fecha_deposito, ch.cuenta_deposito_id, ch.fecha_rechazo, ch.motivo_rechazo,
        ch.notas, ch.created_at, ch.created_by,
        cl.razon_social as cliente, cl.cuit as cliente_cuit, pr.razon_social as proveedor_endoso, cu.nombre as cuenta_deposito,
        ch.fecha_pago - public.hoy() as dias_para_pago,
        co.cobro_id, co.ingreso_vencimiento_id, e.id as egreso_id, coalesce(co.cobros, 0) as cobros_count,
        ch.fecha_cambio, ch.cambio_interes, ch.cambio_egreso_id, ch.cambio_proveedor_id,
        pc.razon_social as cambio_proveedor,
        cc.detalle as cambio_detalle
   from public.cheques ch
   left join public.clientes cl on cl.id = ch.cliente_id
   left join public.proveedores pr on pr.id = ch.proveedor_endoso_id
   left join public.cuentas cu on cu.id = ch.cuenta_deposito_id
   left join public.proveedores pc on pc.id = ch.cambio_proveedor_id
   left join lateral (
     select min(c.id) as cobro_id, min(c.ingreso_vencimiento_id) as ingreso_vencimiento_id, count(*)::int as cobros
       from public.cobros c where c.cheque_id = ch.id
   ) co on co.cobro_id is not null
   left join lateral (
     select string_agg(x.medio || ' → ' || k.nombre, ', ' order by x.medio) as detalle
       from public.cheque_cambios x join public.cuentas k on k.id = x.cuenta_id
      where x.cheque_id = ch.id
   ) cc on true
   left join public.egresos e on e.cheque_id = ch.id;

grant select on public.v_movimientos, public.v_cheques to anon, authenticated;
grant execute on function public.cambiar_cheque(bigint, date, numeric, bigint, numeric, bigint, numeric, bigint, bigint) to authenticated, anon;
grant execute on function public.anular_cambio_cheque(bigint) to authenticated, anon;

notify pgrst, 'reload schema';
