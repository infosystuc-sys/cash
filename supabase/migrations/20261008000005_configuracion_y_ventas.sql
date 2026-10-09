-- =====================================================================
-- Configuración: saldos iniciales de todas las cuentas a una fecha de
-- corte común, ventas históricas (meses previos al uso del sistema) y
-- la vista mensual de ventas para el reporte del Dashboard.
-- =====================================================================

-- ---------- Saldos iniciales a una fecha de corte ----------
-- p_saldos: [{"cuenta_id": 1, "saldo": 150000}]. Todas las cuentas pasan a
-- tener p_fecha como fecha de saldo inicial; las que no vienen en la lista
-- conservan su saldo. Los movimientos anteriores a la fecha dejan de contar.
create or replace function public.configurar_saldos_iniciales(p_fecha date, p_saldos jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_fecha is null then
    raise exception 'Indicá la fecha de corte';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_saldos) x
     where not exists (select 1 from public.cuentas c where c.id = (x ->> 'cuenta_id')::bigint)
  ) then
    raise exception 'Cuenta inexistente';
  end if;

  update public.cuentas c
     set fecha_saldo_inicial = p_fecha,
         saldo_inicial = coalesce(
           (select (x ->> 'saldo')::numeric from jsonb_array_elements(p_saldos) x
             where (x ->> 'cuenta_id')::bigint = c.id limit 1),
           c.saldo_inicial)
   where true;
end;
$$;

-- ---------- Ventas históricas ----------
create table public.ventas_historicas (
  id bigint generated always as identity primary key,
  mes date not null check (extract(day from mes) = 1),
  tipo_ingreso_id bigint not null references public.tipos_ingreso (id),
  moneda public.moneda not null default 'ARS',
  importe numeric(18, 2) not null check (importe > 0),
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (mes, tipo_ingreso_id, moneda)
);

create index on public.ventas_historicas (tipo_ingreso_id);
create index on public.ventas_historicas (created_by);

alter table public.ventas_historicas enable row level security;
revoke all on public.ventas_historicas from anon;
create policy "Usuarios autorizados: acceso total" on public.ventas_historicas for all to authenticated
  using ((select public.es_autorizado())) with check ((select public.es_autorizado()));
grant select, insert, update, delete on public.ventas_historicas to authenticated;
-- Acceso libre temporal (ver migración acceso_libre_temporal); revertir junto con las demás tablas
grant select, insert, update, delete on public.ventas_historicas to anon;
create policy "Acceso libre temporal" on public.ventas_historicas for all to anon using (true) with check (true);

-- ---------- Ventas por mes ----------
-- origen 'sistema': facturas cargadas en Ingresos, por mes de fecha de factura
-- (cobrado = lo cobrado a hoy de esas facturas). origen 'historico': ventas
-- históricas cargadas en Configuración (sin datos de cobranza).
create view public.v_ventas_mensuales with (security_invoker = true) as
select date_trunc('month', i.fecha_factura)::date as mes,
       'sistema'::text as origen,
       i.tipo_ingreso_id,
       ti.nombre as tipo_ingreso,
       i.moneda,
       sum(i.importe_total) as importe,
       sum(i.cobrado) as cobrado,
       count(*) as facturas
  from public.v_ingresos i
  join public.tipos_ingreso ti on ti.id = i.tipo_ingreso_id
 group by 1, 3, 4, 5
union all
select vh.mes, 'historico', vh.tipo_ingreso_id, ti.nombre, vh.moneda, vh.importe, null, null
  from public.ventas_historicas vh
  join public.tipos_ingreso ti on ti.id = vh.tipo_ingreso_id;

grant select on public.v_ventas_mensuales to authenticated, anon;

revoke execute on function public.configurar_saldos_iniciales(date, jsonb) from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.configurar_saldos_iniciales(date, jsonb) to authenticated, anon;

notify pgrst, 'reload schema';
