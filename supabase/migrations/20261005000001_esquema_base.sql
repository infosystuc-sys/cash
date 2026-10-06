-- =====================================================================
-- Cashflow Infosys - Esquema base
-- Una sola tesorería; todos los usuarios autenticados comparten datos.
-- Los saldos de cuentas NO se guardan: se calculan desde movimientos.
-- =====================================================================

-- ---------- Tipos ----------
create type public.moneda as enum ('ARS', 'USD');
create type public.tipo_cuenta as enum ('cuenta_corriente', 'caja_ahorro', 'efectivo', 'billetera_digital', 'custodia');
create type public.tipo_cheque as enum ('echeq', 'fisico');
create type public.estado_cheque as enum ('en_cartera', 'endosado', 'depositado', 'rechazado');
create type public.tipo_endoso as enum ('nominativo', 'garantia');
create type public.medio_cobro as enum ('transferencia', 'efectivo', 'deposito', 'cheque');
create type public.medio_pago as enum ('transferencia', 'debito_automatico', 'efectivo', 'tarjeta', 'cheque_endosado');
create type public.forma_pago_deuda as enum ('unico', 'cuotas');

-- ---------- Helpers ----------
-- Fecha "de hoy" en Argentina (la DB corre en UTC).
create or replace function public.hoy()
returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- Convierte un importe entre monedas usando el TC informado (ARS por USD).
create or replace function public.convertir(p_importe numeric, p_de public.moneda, p_a public.moneda, p_tc numeric)
returns numeric
language sql immutable
set search_path = ''
as $$
  select case
    when p_de = p_a then p_importe
    when p_de = 'USD' and p_a = 'ARS' then round(p_importe * p_tc, 2)
    when p_de = 'ARS' and p_a = 'USD' then round(p_importe / p_tc, 2)
  end
$$;

-- ---------- Catálogos ----------
create table public.tipos_ingreso (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.clientes (
  id bigint generated always as identity primary key,
  razon_social text not null,
  cuit text unique,
  tipo_ingreso_id bigint references public.tipos_ingreso (id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.proveedores (
  id bigint generated always as identity primary key,
  razon_social text not null,
  cuit text unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.categorias_egreso (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  subtitulo text,
  descripcion text,
  color text not null default '#0051D5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icono text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cuentas (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  entidad text,
  etiqueta text,
  tipo public.tipo_cuenta not null,
  moneda public.moneda not null default 'ARS',
  numero text,
  cbu text,
  alias text,
  saldo_inicial numeric(18, 2) not null default 0,
  fecha_saldo_inicial date not null default public.hoy(),
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cotizaciones de referencia (las carga la Edge Function desde dolarapi.com)
create table public.cotizaciones (
  fecha date not null,
  tipo text not null default 'MEP',
  compra numeric(12, 2),
  venta numeric(12, 2) not null check (venta > 0),
  fuente text,
  actualizado_at timestamptz not null default now(),
  primary key (fecha, tipo)
);

-- ---------- Ingresos ----------
create table public.ingresos (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes (id),
  tipo_ingreso_id bigint not null references public.tipos_ingreso (id),
  fecha_factura date not null,
  comprobante text,
  descripcion text not null,
  moneda public.moneda not null default 'ARS',
  importe_total numeric(18, 2) not null check (importe_total > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.ingreso_vencimientos (
  id bigint generated always as identity primary key,
  ingreso_id bigint not null references public.ingresos (id) on delete cascade,
  numero smallint not null check (numero between 1 and 12),
  fecha_vencimiento date not null,
  importe numeric(18, 2) not null check (importe > 0),
  medio_previsto text,
  cuenta_prevista_id bigint references public.cuentas (id),
  unique (ingreso_id, numero)
);

-- ---------- Cheques (solo recibidos de terceros) ----------
create table public.cheques (
  id bigint generated always as identity primary key,
  cliente_id bigint references public.clientes (id),
  librador text,
  librador_cuit text,
  banco_emisor text not null,
  numero text not null,
  tipo public.tipo_cheque not null default 'echeq',
  importe numeric(18, 2) not null check (importe > 0),
  fecha_recepcion date not null default public.hoy(),
  fecha_emision date,
  fecha_pago date not null,
  estado public.estado_cheque not null default 'en_cartera',
  -- endoso
  fecha_endoso date,
  proveedor_endoso_id bigint references public.proveedores (id),
  tipo_endoso public.tipo_endoso,
  motivo_endoso text,
  -- depósito
  fecha_deposito date,
  cuenta_deposito_id bigint references public.cuentas (id),
  -- rechazo
  fecha_rechazo date,
  motivo_rechazo text,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (banco_emisor, numero),
  check (estado <> 'endosado' or (fecha_endoso is not null and proveedor_endoso_id is not null)),
  check (estado <> 'depositado' or (fecha_deposito is not null and cuenta_deposito_id is not null)),
  check (estado <> 'rechazado' or fecha_rechazo is not null)
);

create table public.cobros (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes (id),
  ingreso_vencimiento_id bigint references public.ingreso_vencimientos (id),
  fecha date not null,
  moneda public.moneda not null default 'ARS',
  importe numeric(18, 2) not null check (importe > 0),
  tc numeric(12, 4) check (tc > 0),
  medio public.medio_cobro not null,
  cuenta_id bigint references public.cuentas (id),
  cheque_id bigint unique references public.cheques (id),
  concepto text,
  anulado boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  check ((medio = 'cheque') = (cheque_id is not null)),
  check ((medio = 'cheque') = (cuenta_id is null)),
  check (moneda = 'ARS' or tc is not null)
);

-- ---------- Deudas ----------
create table public.deudas (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references public.proveedores (id),
  concepto text not null,
  categoria_egreso_id bigint references public.categorias_egreso (id),
  moneda public.moneda not null default 'ARS',
  importe_total numeric(18, 2) not null check (importe_total > 0),
  tc_referencia numeric(12, 4) check (tc_referencia > 0),
  forma_pago public.forma_pago_deuda not null default 'unico',
  fecha_alta date not null default public.hoy(),
  referencia text,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.deuda_cuotas (
  id bigint generated always as identity primary key,
  deuda_id bigint not null references public.deudas (id) on delete cascade,
  numero smallint not null check (numero between 1 and 120),
  fecha_vencimiento date not null,
  importe numeric(18, 2) not null check (importe > 0),
  unique (deuda_id, numero)
);

-- ---------- Egresos ----------
create table public.egresos (
  id bigint generated always as identity primary key,
  fecha date not null,
  categoria_egreso_id bigint not null references public.categorias_egreso (id),
  proveedor_id bigint references public.proveedores (id),
  concepto text not null,
  moneda public.moneda not null default 'ARS',
  importe numeric(18, 2) not null check (importe > 0),
  tc numeric(12, 4) check (tc > 0),
  medio public.medio_pago not null,
  cuenta_id bigint references public.cuentas (id),
  cheque_id bigint unique references public.cheques (id),
  deuda_cuota_id bigint references public.deuda_cuotas (id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  check ((medio = 'cheque_endosado') = (cheque_id is not null)),
  check ((medio = 'cheque_endosado') = (cuenta_id is null)),
  check (moneda = 'ARS' or tc is not null)
);

-- ---------- Transferencias internas ----------
create table public.transferencias (
  id bigint generated always as identity primary key,
  fecha date not null,
  cuenta_origen_id bigint not null references public.cuentas (id),
  cuenta_destino_id bigint not null references public.cuentas (id),
  importe_origen numeric(18, 2) not null check (importe_origen > 0),
  importe_destino numeric(18, 2) not null check (importe_destino > 0),
  concepto text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  check (cuenta_origen_id <> cuenta_destino_id)
);

-- ---------- Índices de FKs / búsquedas ----------
create index on public.clientes (tipo_ingreso_id);
create index on public.ingresos (cliente_id);
create index on public.ingresos (tipo_ingreso_id);
create index on public.ingresos (fecha_factura);
create index on public.ingreso_vencimientos (fecha_vencimiento);
create index on public.ingreso_vencimientos (cuenta_prevista_id);
create index on public.cheques (cliente_id);
create index on public.cheques (proveedor_endoso_id);
create index on public.cheques (cuenta_deposito_id);
create index on public.cheques (estado, fecha_pago);
create index on public.cobros (cliente_id);
create index on public.cobros (ingreso_vencimiento_id);
create index on public.cobros (cuenta_id, fecha);
create index on public.deudas (proveedor_id);
create index on public.deudas (categoria_egreso_id);
create index on public.deuda_cuotas (fecha_vencimiento);
create index on public.egresos (categoria_egreso_id);
create index on public.egresos (proveedor_id);
create index on public.egresos (cuenta_id, fecha);
create index on public.egresos (deuda_cuota_id);
create index on public.egresos (fecha);
create index on public.transferencias (cuenta_origen_id, fecha);
create index on public.transferencias (cuenta_destino_id, fecha);
create index on public.clientes (created_by);
create index on public.proveedores (created_by);
create index on public.ingresos (created_by);
create index on public.cheques (created_by);
create index on public.cobros (created_by);
create index on public.deudas (created_by);
create index on public.egresos (created_by);
create index on public.transferencias (created_by);

-- ---------- Triggers de validación ----------
create or replace function public.tg_cobros_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ing_moneda public.moneda;
  v_ing_cliente bigint;
  v_venc_importe numeric;
  v_cobrado numeric;
  v_cta_moneda public.moneda;
begin
  if new.ingreso_vencimiento_id is not null then
    select i.moneda, i.cliente_id, v.importe
      into v_ing_moneda, v_ing_cliente, v_venc_importe
      from public.ingreso_vencimientos v
      join public.ingresos i on i.id = v.ingreso_id
     where v.id = new.ingreso_vencimiento_id;

    if v_ing_moneda <> new.moneda then
      raise exception 'La moneda del cobro (%) no coincide con la del ingreso (%)', new.moneda, v_ing_moneda;
    end if;
    if v_ing_cliente <> new.cliente_id then
      raise exception 'El cliente del cobro no coincide con el del ingreso';
    end if;

    if not new.anulado then
      select coalesce(sum(c.importe), 0) into v_cobrado
        from public.cobros c
       where c.ingreso_vencimiento_id = new.ingreso_vencimiento_id
         and not c.anulado
         and c.id is distinct from new.id;
      if v_cobrado + new.importe > v_venc_importe then
        raise exception 'El cobro supera el saldo pendiente del vencimiento (saldo: %)', v_venc_importe - v_cobrado;
      end if;
    end if;
  end if;

  if new.cuenta_id is not null then
    select moneda into v_cta_moneda from public.cuentas where id = new.cuenta_id;
    if v_cta_moneda <> new.moneda and new.tc is null then
      raise exception 'Se requiere tipo de cambio: la cuenta es % y el cobro es %', v_cta_moneda, new.moneda;
    end if;
  end if;
  return new;
end;
$$;

create trigger cobros_validar before insert or update on public.cobros
for each row execute function public.tg_cobros_validar();

create or replace function public.tg_egresos_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_deuda_moneda public.moneda;
  v_cuota_importe numeric;
  v_pagado numeric;
  v_cta_moneda public.moneda;
begin
  if new.deuda_cuota_id is not null then
    select d.moneda, q.importe into v_deuda_moneda, v_cuota_importe
      from public.deuda_cuotas q
      join public.deudas d on d.id = q.deuda_id
     where q.id = new.deuda_cuota_id;

    if v_deuda_moneda <> new.moneda then
      raise exception 'La moneda del egreso (%) no coincide con la de la deuda (%)', new.moneda, v_deuda_moneda;
    end if;

    select coalesce(sum(e.importe), 0) into v_pagado
      from public.egresos e
     where e.deuda_cuota_id = new.deuda_cuota_id
       and e.id is distinct from new.id;
    if v_pagado + new.importe > v_cuota_importe then
      raise exception 'El pago supera el saldo pendiente de la cuota (saldo: %)', v_cuota_importe - v_pagado;
    end if;
  end if;

  if new.cuenta_id is not null then
    select moneda into v_cta_moneda from public.cuentas where id = new.cuenta_id;
    if v_cta_moneda <> new.moneda and new.tc is null then
      raise exception 'Se requiere tipo de cambio: la cuenta es % y el egreso es %', v_cta_moneda, new.moneda;
    end if;
  end if;
  return new;
end;
$$;

create trigger egresos_validar before insert or update on public.egresos
for each row execute function public.tg_egresos_validar();

create or replace function public.tg_transferencias_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mon_origen public.moneda;
  v_mon_destino public.moneda;
begin
  select moneda into v_mon_origen from public.cuentas where id = new.cuenta_origen_id;
  select moneda into v_mon_destino from public.cuentas where id = new.cuenta_destino_id;
  if v_mon_origen = v_mon_destino then
    new.importe_destino := new.importe_origen;
  elsif new.importe_destino is null then
    raise exception 'Transferencia entre monedas distintas: indicar importe_destino';
  end if;
  return new;
end;
$$;

create trigger transferencias_validar before insert or update on public.transferencias
for each row execute function public.tg_transferencias_validar();

-- ---------- RLS: una empresa, todos los usuarios autenticados ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'tipos_ingreso', 'clientes', 'proveedores', 'categorias_egreso', 'cuentas', 'cotizaciones',
    'ingresos', 'ingreso_vencimientos', 'cheques', 'cobros', 'deudas', 'deuda_cuotas',
    'egresos', 'transferencias'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "Usuarios autenticados: acceso total" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end;
$$;
