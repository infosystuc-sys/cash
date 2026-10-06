-- =====================================================================
-- Edición de cheques: los datos del instrumento se pueden corregir siempre,
-- pero importe y cliente solo si el cheque está en cartera y no está atado
-- a un cobro (si vino de un cobro, su importe es el del cobro; si se endosó
-- o depositó, ya generó un egreso o un movimiento de cuenta).
-- =====================================================================

create or replace function public.tg_cheques_validar_edicion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tiene_cobro boolean;
begin
  if new.importe is distinct from old.importe or new.cliente_id is distinct from old.cliente_id then
    select exists (select 1 from public.cobros c where c.cheque_id = old.id) into v_tiene_cobro;
    if v_tiene_cobro then
      raise exception 'No se puede cambiar importe ni cliente: el cheque está asociado a un cobro de factura';
    end if;
    if old.estado <> 'en_cartera' then
      raise exception 'No se puede cambiar importe ni cliente de un cheque %', replace(old.estado::text, '_', ' ');
    end if;
  end if;
  return new;
end;
$$;

create trigger cheques_validar_edicion before update on public.cheques
for each row execute function public.tg_cheques_validar_edicion();
