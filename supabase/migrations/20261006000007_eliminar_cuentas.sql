-- =====================================================================
-- Eliminar cuentas sin movimientos: la "cuenta prevista" de un vencimiento
-- es solo una referencia, así que al borrar la cuenta se limpia en vez de
-- bloquear. Cobros, egresos, transferencias y depósitos siguen bloqueando.
-- =====================================================================

alter table public.ingreso_vencimientos drop constraint ingreso_vencimientos_cuenta_prevista_id_fkey;
alter table public.ingreso_vencimientos
  add constraint ingreso_vencimientos_cuenta_prevista_id_fkey
  foreign key (cuenta_prevista_id) references public.cuentas (id) on delete set null;
