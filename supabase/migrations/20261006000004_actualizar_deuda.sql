-- =====================================================================
-- Edición de deudas (cabecera + plan de cuotas) en una sola operación.
-- =====================================================================

alter table public.deuda_cuotas drop constraint deuda_cuotas_deuda_id_numero_key;
alter table public.deuda_cuotas
  add constraint deuda_cuotas_deuda_id_numero_key unique (deuda_id, numero) deferrable initially deferred;

-- p_cuotas: [{"id": 5 | null, "fecha_vencimiento": "...", "importe": 680000}]
-- Las cuotas existentes que no vengan en la lista se eliminan (si no tienen pagos).
create or replace function public.actualizar_deuda(
  p_id bigint,
  p_proveedor_id bigint,
  p_concepto text,
  p_moneda public.moneda,
  p_importe_total numeric,
  p_cuotas jsonb,
  p_categoria_egreso_id bigint default null,
  p_tc_referencia numeric default null,
  p_referencia text default null,
  p_notas text default null,
  p_fecha_alta date default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deu public.deudas;
  v_tiene_pagos boolean;
  v_suma numeric;
  v_n int;
  v_ids bigint[];
  x record;
  v_pagado numeric;
begin
  select * into v_deu from public.deudas where id = p_id for update;
  if not found then
    raise exception 'Deuda inexistente';
  end if;

  v_n := jsonb_array_length(p_cuotas);
  if v_n < 1 or v_n > 120 then
    raise exception 'Debe haber entre 1 y 120 cuotas';
  end if;

  select sum((e ->> 'importe')::numeric) into v_suma from jsonb_array_elements(p_cuotas) e;
  if v_suma <> p_importe_total then
    raise exception 'La suma de cuotas (%) no coincide con el importe total (%)', v_suma, p_importe_total;
  end if;

  select exists (
    select 1 from public.egresos e
      join public.deuda_cuotas q on q.id = e.deuda_cuota_id
     where q.deuda_id = p_id
  ) into v_tiene_pagos;

  if v_tiene_pagos and p_proveedor_id <> v_deu.proveedor_id then
    raise exception 'No se puede cambiar el acreedor: la deuda tiene pagos registrados';
  end if;
  if v_tiene_pagos and p_moneda <> v_deu.moneda then
    raise exception 'No se puede cambiar la moneda: la deuda tiene pagos registrados';
  end if;

  select array_agg((e ->> 'id')::bigint) into v_ids
    from jsonb_array_elements(p_cuotas) e
   where nullif(e ->> 'id', '') is not null;

  if exists (
    select 1 from unnest(coalesce(v_ids, '{}')) i
     where not exists (select 1 from public.deuda_cuotas q where q.id = i and q.deuda_id = p_id)
  ) then
    raise exception 'Cuota inválida para esta deuda';
  end if;

  if exists (
    select 1 from public.deuda_cuotas q
     where q.deuda_id = p_id
       and q.id <> all (coalesce(v_ids, '{}'))
       and exists (select 1 from public.egresos e where e.deuda_cuota_id = q.id)
  ) then
    raise exception 'No se puede eliminar una cuota que tiene pagos registrados';
  end if;

  delete from public.deuda_cuotas q
   where q.deuda_id = p_id and q.id <> all (coalesce(v_ids, '{}'));

  update public.deudas
     set proveedor_id = p_proveedor_id,
         concepto = p_concepto,
         categoria_egreso_id = p_categoria_egreso_id,
         moneda = p_moneda,
         importe_total = p_importe_total,
         tc_referencia = p_tc_referencia,
         forma_pago = case when v_n = 1 then 'unico' else 'cuotas' end::public.forma_pago_deuda,
         fecha_alta = coalesce(p_fecha_alta, fecha_alta),
         referencia = p_referencia,
         notas = p_notas
   where id = p_id;

  for x in
    select e.val, e.ord
      from jsonb_array_elements(p_cuotas) with ordinality as e(val, ord)
  loop
    if nullif(x.val ->> 'id', '') is not null then
      select coalesce(sum(e.importe), 0) into v_pagado
        from public.egresos e
       where e.deuda_cuota_id = (x.val ->> 'id')::bigint;
      if (x.val ->> 'importe')::numeric < v_pagado then
        raise exception 'La cuota #% no puede ser menor a lo ya pagado (%)', x.ord, v_pagado;
      end if;

      update public.deuda_cuotas
         set numero = x.ord,
             fecha_vencimiento = (x.val ->> 'fecha_vencimiento')::date,
             importe = (x.val ->> 'importe')::numeric
       where id = (x.val ->> 'id')::bigint;
    else
      insert into public.deuda_cuotas (deuda_id, numero, fecha_vencimiento, importe)
      values (p_id, x.ord, (x.val ->> 'fecha_vencimiento')::date, (x.val ->> 'importe')::numeric);
    end if;
  end loop;
end;
$$;

revoke execute on function public.actualizar_deuda(bigint, bigint, text, public.moneda, numeric, jsonb, bigint, numeric, text, text, date) from public;
-- anon incluido mientras rija el acceso libre temporal (ver migración acceso_libre_temporal)
grant execute on function public.actualizar_deuda(bigint, bigint, text, public.moneda, numeric, jsonb, bigint, numeric, text, text, date) to authenticated, anon;
