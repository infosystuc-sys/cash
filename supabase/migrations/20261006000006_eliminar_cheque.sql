-- =====================================================================
-- Eliminar un cheque en cartera. Si entró como cobro de una factura, el
-- cobro se elimina también y el vencimiento vuelve a quedar pendiente.
-- Endosados / depositados / rechazados no se eliminan (ya generaron un
-- egreso o un movimiento de cuenta).
-- =====================================================================

create or replace function public.eliminar_cheque(p_cheque_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_estado public.estado_cheque;
begin
  select estado into v_estado from public.cheques where id = p_cheque_id for update;
  if not found then
    raise exception 'Cheque inexistente';
  end if;
  if v_estado <> 'en_cartera' then
    raise exception 'Solo se pueden eliminar cheques en cartera (estado actual: %)', replace(v_estado::text, '_', ' ');
  end if;

  delete from public.cobros where cheque_id = p_cheque_id;
  delete from public.cheques where id = p_cheque_id;
end;
$$;

revoke execute on function public.eliminar_cheque(bigint) from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.eliminar_cheque(bigint) to authenticated, anon;
