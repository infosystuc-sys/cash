-- =====================================================================
-- ACCESO LIBRE TEMPORAL: el rol anon (sin login) puede leer y escribir todo.
-- Para volver al acceso con login + lista de autorizados, ejecutar el bloque
-- "REVERTIR" del final (y poner ACCESO_LIBRE = false en src/Auth.tsx).
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'tipos_ingreso', 'clientes', 'proveedores', 'categorias_egreso', 'cuentas', 'cotizaciones',
    'ingresos', 'ingreso_vencimientos', 'cheques', 'cobros', 'deudas', 'deuda_cuotas',
    'egresos', 'transferencias'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to anon', t);
    execute format(
      'create policy "Acceso libre temporal" on public.%I for all to anon using (true) with check (true)',
      t
    );
  end loop;
end;
$$;

grant select on public.v_cotizacion_actual, public.v_movimientos, public.v_cuentas_saldo,
                public.v_ingreso_vencimientos, public.v_ingresos, public.v_cheques,
                public.v_deuda_cuotas, public.v_deudas, public.v_egresos,
                public.v_categorias_egreso, public.v_transferencias
  to anon;

grant execute on function
  public.hoy(), public.convertir(numeric, public.moneda, public.moneda, numeric), public.tc_actual(),
  public.crear_ingreso(bigint, bigint, date, text, public.moneda, numeric, jsonb, text),
  public.registrar_cobro(bigint, date, numeric, public.medio_cobro, bigint, numeric, jsonb, text),
  public.crear_deuda(bigint, text, public.moneda, numeric, jsonb, bigint, numeric, text, text, date),
  public.endosar_cheque(bigint, date, bigint, bigint, public.tipo_endoso, text, bigint, numeric),
  public.depositar_cheque(bigint, bigint, date),
  public.rechazar_cheque(bigint, date, text),
  public.fn_cashflow(date, date, text)
  to anon;

-- ---------------------------------------------------------------------
-- REVERTIR (no se ejecuta; copiar y correr cuando se quiera cerrar el acceso):
--
-- do $$ declare t text; begin
--   foreach t in array array['tipos_ingreso','clientes','proveedores','categorias_egreso','cuentas','cotizaciones',
--     'ingresos','ingreso_vencimientos','cheques','cobros','deudas','deuda_cuotas','egresos','transferencias'] loop
--     execute format('drop policy if exists "Acceso libre temporal" on public.%I', t);
--     execute format('revoke all on public.%I from anon', t);
--   end loop; end; $$;
-- revoke all on public.v_cotizacion_actual, public.v_movimientos, public.v_cuentas_saldo, public.v_ingreso_vencimientos,
--   public.v_ingresos, public.v_cheques, public.v_deuda_cuotas, public.v_deudas, public.v_egresos,
--   public.v_categorias_egreso, public.v_transferencias from anon;
-- revoke execute on all functions in schema public from anon;
-- ---------------------------------------------------------------------
