-- =====================================================================
-- actualizar_deuda_cuota, eliminar_deuda_cuota y cambiar_vencimiento llaman
-- a recalcular_deuda; como corren con los permisos de quien las invoca, ese
-- rol también necesita poder ejecutarla.
-- =====================================================================

-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.recalcular_deuda(bigint) to authenticated, anon;
