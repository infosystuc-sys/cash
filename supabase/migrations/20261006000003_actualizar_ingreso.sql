-- =====================================================================
-- Edición de ingresos (cabecera + plan de vencimientos) en una sola operación.
-- =====================================================================

-- Permite renumerar vencimientos dentro de una transacción sin choques de unicidad
alter table public.ingreso_vencimientos drop constraint ingreso_vencimientos_ingreso_id_numero_key;
alter table public.ingreso_vencimientos
  add constraint ingreso_vencimientos_ingreso_id_numero_key unique (ingreso_id, numero) deferrable initially deferred;

-- p_vencimientos: [{"id": 12 | null, "fecha_vencimiento": "...", "importe": 100, "medio_previsto": "...", "cuenta_prevista_id": 1}]
-- Los vencimientos existentes que no vengan en la lista se eliminan (si no tienen cobros).
create or replace function public.actualizar_ingreso(
  p_id bigint,
  p_cliente_id bigint,
  p_tipo_ingreso_id bigint,
  p_fecha_factura date,
  p_descripcion text,
  p_moneda public.moneda,
  p_importe_total numeric,
  p_vencimientos jsonb,
  p_comprobante text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ing public.ingresos;
  v_tiene_cobros boolean;
  v_suma numeric;
  v_n int;
  v_ids bigint[];
  x record;
  v_cobrado numeric;
begin
  select * into v_ing from public.ingresos where id = p_id for update;
  if not found then
    raise exception 'Ingreso inexistente';
  end if;

  v_n := jsonb_array_length(p_vencimientos);
  if v_n < 1 or v_n > 12 then
    raise exception 'Debe haber entre 1 y 12 vencimientos';
  end if;

  select sum((e ->> 'importe')::numeric) into v_suma from jsonb_array_elements(p_vencimientos) e;
  if v_suma <> p_importe_total then
    raise exception 'La suma de vencimientos (%) no coincide con el importe total (%)', v_suma, p_importe_total;
  end if;

  select exists (
    select 1 from public.cobros c
      join public.ingreso_vencimientos v on v.id = c.ingreso_vencimiento_id
     where v.ingreso_id = p_id
  ) into v_tiene_cobros;

  if v_tiene_cobros and p_cliente_id <> v_ing.cliente_id then
    raise exception 'No se puede cambiar el cliente: el ingreso tiene cobros registrados';
  end if;
  if v_tiene_cobros and p_moneda <> v_ing.moneda then
    raise exception 'No se puede cambiar la moneda: el ingreso tiene cobros registrados';
  end if;

  -- Vencimientos que vienen con id deben pertenecer a este ingreso
  select array_agg((e ->> 'id')::bigint) into v_ids
    from jsonb_array_elements(p_vencimientos) e
   where nullif(e ->> 'id', '') is not null;

  if exists (
    select 1 from unnest(coalesce(v_ids, '{}')) i
     where not exists (select 1 from public.ingreso_vencimientos v where v.id = i and v.ingreso_id = p_id)
  ) then
    raise exception 'Vencimiento inválido para este ingreso';
  end if;

  -- Eliminar los que se quitaron (solo si no tienen cobros, ni siquiera anulados)
  if exists (
    select 1 from public.ingreso_vencimientos v
     where v.ingreso_id = p_id
       and v.id <> all (coalesce(v_ids, '{}'))
       and exists (select 1 from public.cobros c where c.ingreso_vencimiento_id = v.id)
  ) then
    raise exception 'No se puede eliminar un vencimiento que tiene cobros registrados';
  end if;

  delete from public.ingreso_vencimientos v
   where v.ingreso_id = p_id and v.id <> all (coalesce(v_ids, '{}'));

  update public.ingresos
     set cliente_id = p_cliente_id,
         tipo_ingreso_id = p_tipo_ingreso_id,
         fecha_factura = p_fecha_factura,
         descripcion = p_descripcion,
         moneda = p_moneda,
         importe_total = p_importe_total,
         comprobante = p_comprobante
   where id = p_id;

  for x in
    select e.val, e.ord
      from jsonb_array_elements(p_vencimientos) with ordinality as e(val, ord)
  loop
    if nullif(x.val ->> 'id', '') is not null then
      select coalesce(sum(c.importe), 0) into v_cobrado
        from public.cobros c
       where c.ingreso_vencimiento_id = (x.val ->> 'id')::bigint and not c.anulado;
      if (x.val ->> 'importe')::numeric < v_cobrado then
        raise exception 'El vencimiento #% no puede ser menor a lo ya cobrado (%)', x.ord, v_cobrado;
      end if;

      update public.ingreso_vencimientos
         set numero = x.ord,
             fecha_vencimiento = (x.val ->> 'fecha_vencimiento')::date,
             importe = (x.val ->> 'importe')::numeric,
             medio_previsto = x.val ->> 'medio_previsto',
             cuenta_prevista_id = nullif(x.val ->> 'cuenta_prevista_id', '')::bigint
       where id = (x.val ->> 'id')::bigint;
    else
      insert into public.ingreso_vencimientos (ingreso_id, numero, fecha_vencimiento, importe, medio_previsto, cuenta_prevista_id)
      values (p_id, x.ord, (x.val ->> 'fecha_vencimiento')::date, (x.val ->> 'importe')::numeric,
              x.val ->> 'medio_previsto', nullif(x.val ->> 'cuenta_prevista_id', '')::bigint);
    end if;
  end loop;
end;
$$;

revoke execute on function public.actualizar_ingreso(bigint, bigint, bigint, date, text, public.moneda, numeric, jsonb, text) from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.actualizar_ingreso(bigint, bigint, bigint, date, text, public.moneda, numeric, jsonb, text) to authenticated, anon;
