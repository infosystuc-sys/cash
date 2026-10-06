-- =====================================================================
-- Lista de emails autorizados: además de estar logueado, el email del
-- usuario tiene que figurar en esta tabla para ver o modificar datos.
-- =====================================================================

create table public.usuarios_autorizados (
  email text primary key check (email = lower(email) and email like '%@%'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index on public.usuarios_autorizados (created_by);

-- security definer: se usa dentro de las políticas RLS de la propia tabla
create or replace function public.es_autorizado()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.usuarios_autorizados
     where email = lower(auth.jwt() ->> 'email')
  )
$$;

revoke execute on function public.es_autorizado() from public, anon;
grant execute on function public.es_autorizado() to authenticated;

-- Evita quedarse sin ningún usuario autorizado
create or replace function public.tg_usuarios_autorizados_no_vaciar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.usuarios_autorizados) then
    raise exception 'Debe quedar al menos un usuario autorizado';
  end if;
  return null;
end;
$$;

create trigger usuarios_autorizados_no_vaciar
after delete on public.usuarios_autorizados
for each statement execute function public.tg_usuarios_autorizados_no_vaciar();

-- Normaliza el email a minúsculas
create or replace function public.tg_usuarios_autorizados_lower()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create trigger usuarios_autorizados_lower
before insert or update on public.usuarios_autorizados
for each row execute function public.tg_usuarios_autorizados_lower();

insert into public.usuarios_autorizados (email) values ('infosystuc@gmail.com');

-- ---------- Reemplazo de políticas ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'tipos_ingreso', 'clientes', 'proveedores', 'categorias_egreso', 'cuentas', 'cotizaciones',
    'ingresos', 'ingreso_vencimientos', 'cheques', 'cobros', 'deudas', 'deuda_cuotas',
    'egresos', 'transferencias'
  ] loop
    execute format('drop policy if exists "Usuarios autenticados: acceso total" on public.%I', t);
  end loop;

  foreach t in array array[
    'tipos_ingreso', 'clientes', 'proveedores', 'categorias_egreso', 'cuentas', 'cotizaciones',
    'ingresos', 'ingreso_vencimientos', 'cheques', 'cobros', 'deudas', 'deuda_cuotas',
    'egresos', 'transferencias', 'usuarios_autorizados'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "Usuarios autorizados: acceso total" on public.%I for all to authenticated '
      'using ((select public.es_autorizado())) with check ((select public.es_autorizado()))',
      t
    );
  end loop;
end;
$$;
