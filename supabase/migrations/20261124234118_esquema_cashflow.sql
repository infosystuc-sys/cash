-- =====================================================================
-- Cashflow pasa del esquema `public` a su propio esquema `cashflow`.
--
-- El proyecto Supabase pasa a ser compartido: el ERP va en `public` y
-- AGRORIV en `agro`. El esquema hace de prefijo (cashflow.cheques,
-- cashflow.proveedores…) y evita choques: AGRORIV también tiene una tabla
-- `proveedores` y un tipo `moneda`.
--
-- Va JUNTO con el deploy de la app que usa db: { schema: "cashflow" }
-- (src/lib/supabase.ts) y de la Edge Function actualizar-cotizacion. Antes de
-- correrla: agregar `cashflow` en Settings → API → Exposed schemas.
--
-- Qué hace:
--  1. Mueve tipos, tablas (con sus secuencias, índices, triggers y
--     políticas), vistas y funciones. Lo que se referencia por OID (vistas,
--     políticas, triggers, defaults) sigue andando solo.
--  2. Las funciones tienen search_path = '' y nombran todo como `public.x`
--     en el cuerpo: se recrean con `cashflow.x`. CREATE OR REPLACE conserva
--     dueño, permisos y configuración.
--  3. Permisos del esquema y por defecto para lo que se cree después.
--  4. Controla que no quede nada de Cashflow en `public` ni ningún cuerpo de
--     función que siga nombrando `public.`.
--
-- Las listas son explícitas a propósito: cuando el ERP esté en `public`, esta
-- migración no puede tocar nada suyo.
-- =====================================================================

create schema if not exists cashflow;

-- anon se quita en la migración siguiente (cierre del acceso libre temporal).
grant usage on schema cashflow to anon, authenticated, service_role;

do $$
declare
  v_tipos text[] := array['moneda', 'tipo_cuenta', 'tipo_cheque', 'estado_cheque', 'tipo_endoso',
                          'medio_cobro', 'medio_pago', 'forma_pago_deuda'];
  v_tablas text[] := array['categorias_egreso', 'cheque_cambios', 'cheques', 'clientes', 'cobros',
                           'cotizaciones', 'cuentas', 'deuda_cuotas', 'deudas', 'egresos',
                           'ingreso_vencimientos', 'ingresos', 'proveedores', 'tipos_ingreso',
                           'transferencias', 'usuarios_autorizados', 'ventas_historicas'];
  v_vistas text[] := array['v_ventas_mensuales', 'v_cotizacion_actual', 'v_movimientos', 'v_cuentas_saldo',
                           'v_ingreso_vencimientos', 'v_ingresos', 'v_cheques', 'v_deuda_cuotas', 'v_deudas',
                           'v_egresos', 'v_categorias_egreso', 'v_transferencias'];
  v_funciones text[] := array['actualizar_deuda', 'actualizar_deuda_cuota', 'actualizar_ingreso',
                              'anular_cambio_cheque', 'cambiar_cheque', 'cambiar_vencimiento',
                              'configurar_saldos_iniciales', 'convertir', 'crear_deuda',
                              'crear_deuda_saldo_a_favor', 'crear_ingreso', 'depositar_cheque',
                              'eliminar_cheque', 'eliminar_deuda_cuota', 'endosar_cheque', 'es_autorizado',
                              'fn_cashflow', 'fn_cashflow_detalle', 'fn_cashflow_disponible',
                              'fn_cashflow_saldo_base', 'hoy', 'proveedor_de_cliente', 'recalcular_deuda',
                              'rechazar_cheque', 'registrar_cobranza_cheques', 'registrar_cobro',
                              'registrar_cobro_a_cuenta', 'registrar_pago_deuda', 'tc_actual',
                              'tg_cheques_validar_edicion', 'tg_cobros_validar', 'tg_egresos_validar',
                              'tg_transferencias_validar', 'tg_usuarios_autorizados_lower',
                              'tg_usuarios_autorizados_no_vaciar'];
  v_nombre text;
  r record;
  v_def text;
  v_quedan text;
begin
  foreach v_nombre in array v_tipos loop
    execute format('alter type public.%I set schema cashflow', v_nombre);
  end loop;

  foreach v_nombre in array v_tablas loop
    execute format('alter table public.%I set schema cashflow', v_nombre);
  end loop;

  foreach v_nombre in array v_vistas loop
    execute format('alter view public.%I set schema cashflow', v_nombre);
  end loop;

  -- Primero se mueven TODAS las funciones y recién después se reescriben:
  -- las funciones SQL se validan al recrearlas, y una que llama a otra
  -- (fn_cashflow → cashflow.hoy()) falla si la otra todavía está en public.
  for r in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (v_funciones)
  loop
    execute format('alter function public.%I(%s) set schema cashflow',
                   r.proname, pg_get_function_identity_arguments(r.oid));
  end loop;

  -- Ya en cashflow: el encabezado sale como cashflow.x; el cuerpo sigue
  -- nombrando public.x (search_path = '') y se reescribe.
  for r in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'cashflow'::regnamespace
       and p.proname = any (v_funciones)
       and p.prosrc ilike '%public.%'
  loop
    v_def := replace(pg_get_functiondef(r.oid), 'public.', 'cashflow.');
    execute v_def;
  end loop;

  -- Controles: nada de Cashflow en public, ningún cuerpo nombrando public.
  select string_agg(c.relname, ', ') into v_quedan
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname = any (v_tablas || v_vistas);
  if v_quedan is not null then
    raise exception 'Quedaron en public: %', v_quedan;
  end if;

  select string_agg(p.proname, ', ') into v_quedan
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = any (v_funciones);
  if v_quedan is not null then
    raise exception 'Quedaron funciones en public: %', v_quedan;
  end if;

  select string_agg(p.proname, ', ') into v_quedan
    from pg_proc p
   where p.pronamespace = 'cashflow'::regnamespace and p.prosrc ilike '%public.%';
  if v_quedan is not null then
    raise exception 'Funciones de cashflow que siguen nombrando public.: %', v_quedan;
  end if;
end;
$$;

-- Lo que se cree más adelante en `cashflow` (con el rol postgres) nace con los
-- mismos permisos que tenía en public. anon no: Cashflow opera con login.
alter default privileges for role postgres in schema cashflow
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema cashflow
  grant usage, select on sequences to authenticated, service_role;
alter default privileges for role postgres in schema cashflow
  grant execute on functions to authenticated, service_role;

notify pgrst, 'reload schema';
