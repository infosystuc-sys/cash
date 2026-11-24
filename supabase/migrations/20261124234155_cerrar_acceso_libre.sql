-- =====================================================================
-- Cierra el acceso libre temporal (20261006000002_acceso_libre_temporal).
--
-- Vuelve al login por magic link + lista de usuarios_autorizados: sin sesión
-- (rol anon) no se lee ni se escribe nada. Va junto con ACCESO_LIBRE = false
-- en src/Auth.tsx.
--
-- Es el bloque "REVERTIR" de aquella migración con una diferencia
-- importante: trabaja sobre el esquema `cashflow` y NO sobre `public`. El
-- original hacía `revoke execute on all functions in schema public from anon`,
-- que en el proyecto compartido le habría quitado a anon funciones del ERP
-- (por ejemplo, las del link público de cotizaciones).
--
-- Requiere que antes se haya corrido 20261124234118_esquema_cashflow.
-- Antes de correrla, confirmar que en cashflow.usuarios_autorizados están los
-- emails de todos los que usan la app.
-- =====================================================================

-- En todas las tablas donde esté: además de las 14 de la migración original,
-- migraciones posteriores la agregaron en ventas_historicas y cheque_cambios.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_policies
     where schemaname = 'cashflow' and policyname = 'Acceso libre temporal'
  loop
    execute format('drop policy "Acceso libre temporal" on cashflow.%I', r.tablename);
  end loop;
end;
$$;

-- Tablas y vistas del esquema (ALL TABLES incluye las vistas).
revoke all on all tables in schema cashflow from anon;
revoke all on all sequences in schema cashflow from anon;
revoke execute on all functions in schema cashflow from anon;
revoke usage on schema cashflow from anon;

-- Control: no tiene que quedar ninguna política para anon en cashflow.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'cashflow' and 'anon' = any (roles)) then
    raise exception 'Quedaron políticas para anon en el esquema cashflow';
  end if;
end;
$$;

notify pgrst, 'reload schema';
