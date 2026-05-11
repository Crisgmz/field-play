-- ============================================================
-- MIGRATION 014: Habilitar deporte 'padel' en la plataforma
-- ============================================================
-- CONTEXT:
--   Field Play hoy es monodeporte (fútbol con modelo F11/F7/F5).
--   Esta migración habilita pádel como segundo deporte permitiendo
--   que un mismo club ofrezca ambos a la vez.
--
--   Cambios:
--     * 'sport' como columna en `fields` (default 'soccer' para
--       no migrar datos existentes — todos los clubes actuales
--       quedan como clubes de fútbol).
--     * Tipo 'PADEL' aceptado en `field_units.type`,
--       `bookings.field_type` y `pricing_rules.field_type`.
--     * El RPC `rpc_create_booking` reemplazado para validar 'PADEL'.
--
--   Modelo de unidad de pádel: 1 `field` con `sport='padel'` contiene
--   1 `field_unit` de type='PADEL' con slot_ids=[]. Como el array de
--   slots está vacío, el trigger del grafo de conflictos no inserta
--   pares — cada cancha de pádel queda totalmente independiente.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega completo y Run.
--   Idempotente: se puede re-ejecutar sin efectos colaterales.
--
-- ROLLBACK:
--   alter table public.fields drop column if exists sport;
--   (Re-aplicar los checks anteriores manualmente si se requiere.)
-- ============================================================


-- 1) Agregar columna `sport` a `fields` -----------------------

alter table public.fields
  add column if not exists sport text not null default 'soccer';

-- Idempotente: dropea y reaplica check con la nueva forma.
alter table public.fields
  drop constraint if exists fields_sport_check;
alter table public.fields
  add constraint fields_sport_check
  check (sport in ('soccer', 'padel'));

create index if not exists idx_fields_sport on public.fields(sport);


-- 2) Expandir check de `field_units.type` ---------------------

alter table public.field_units
  drop constraint if exists field_units_type_check;
alter table public.field_units
  add constraint field_units_type_check
  check (type in ('F11', 'F7', 'F5', 'PADEL'));


-- 3) Expandir check de `bookings.field_type` ------------------

alter table public.bookings
  drop constraint if exists bookings_field_type_check;
alter table public.bookings
  add constraint bookings_field_type_check
  check (field_type in ('F11', 'F7', 'F5', 'PADEL'));


-- 4) Expandir check de `pricing_rules.field_type` -------------

alter table public.pricing_rules
  drop constraint if exists pricing_rules_field_type_check;
alter table public.pricing_rules
  add constraint pricing_rules_field_type_check
  check (field_type in ('F11', 'F7', 'F5', 'PADEL'));


-- 5) RPC: aceptar 'PADEL' en `rpc_create_booking` -------------
-- Se reemplaza completo (CREATE OR REPLACE) — misma firma que
-- la versión de la migración 012, solo cambia la validación.

create or replace function public.rpc_create_booking(
  p_user_id uuid,
  p_club_id uuid,
  p_field_unit_id uuid,
  p_field_type text,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_total_price numeric,
  p_status text default 'pending',
  p_payment_method text default 'bank_transfer',
  p_payment_proof_path text default null,
  p_notes text default null,
  p_created_by_admin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field_id uuid;
  v_lock_key bigint;
  v_available boolean;
  v_booking_id uuid;
  v_result jsonb;
  v_actual_club_id uuid;
  v_open_time time;
  v_close_time time;
  v_is_closed boolean;
  v_slot_duration integer;
begin
  if p_end_time <= p_start_time then
    raise exception 'end_time must be after start_time';
  end if;

  -- 'PADEL' ahora es un tipo válido junto con los de fútbol.
  if p_field_type not in ('F5', 'F7', 'F11', 'PADEL') then
    raise exception 'Invalid field_type: %', p_field_type;
  end if;

  if p_status not in ('pending', 'confirmed', 'cancelled') then
    raise exception 'Invalid booking status: %', p_status;
  end if;

  if p_payment_method not in ('bank_transfer', 'cash', 'card') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  select fu.field_id, f.club_id
  into v_field_id, v_actual_club_id
  from public.field_units fu
  join public.fields f on f.id = fu.field_id
  where fu.id = p_field_unit_id
    and fu.is_active = true
    and f.is_active = true;

  if v_field_id is null then
    raise exception 'Field unit not found or inactive: %', p_field_unit_id;
  end if;

  if v_actual_club_id <> p_club_id then
    raise exception 'Club mismatch for field unit %', p_field_unit_id;
  end if;

  select open_time, close_time, is_closed, slot_duration_minutes
  into v_open_time, v_close_time, v_is_closed, v_slot_duration
  from public.get_venue_config_for_date(v_actual_club_id, p_date);

  if v_open_time is null or v_close_time is null then
    raise exception 'No operating schedule found for club % on %', v_actual_club_id, p_date;
  end if;

  if coalesce(v_is_closed, false) then
    raise exception 'VENUE_CLOSED: The venue is closed on %', p_date;
  end if;

  if p_start_time < v_open_time or p_end_time > v_close_time then
    raise exception 'OUTSIDE_OPERATING_HOURS: Valid range for % is % to %', p_date, v_open_time, v_close_time;
  end if;

  if not public.is_time_on_slot_boundary(p_start_time, v_open_time, v_slot_duration)
     or not public.is_time_on_slot_boundary(p_end_time, v_open_time, v_slot_duration) then
    raise exception 'INVALID_SLOT_BOUNDARY: Times must align to % minute slots starting at %', v_slot_duration, v_open_time;
  end if;

  v_lock_key := ('x' || left(replace(v_field_id::text, '-', ''), 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  v_available := public.rpc_check_availability(
    p_field_unit_id, p_date, p_start_time, p_end_time
  );

  if not v_available then
    raise exception 'BOOKING_CONFLICT: The requested time slot is not available (conflicting booking or block exists)';
  end if;

  insert into public.bookings (
    user_id,
    club_id,
    field_unit_id,
    field_type,
    date,
    start_time,
    end_time,
    total_price,
    status,
    payment_method,
    payment_proof_path,
    notes,
    admin_seen_at,
    created_by_admin
  ) values (
    p_user_id,
    p_club_id,
    p_field_unit_id,
    p_field_type,
    p_date,
    p_start_time,
    p_end_time,
    p_total_price,
    p_status,
    p_payment_method,
    p_payment_proof_path,
    p_notes,
    case when p_created_by_admin then now() else null end,
    coalesce(p_created_by_admin, false)
  )
  returning id into v_booking_id;

  select jsonb_build_object(
    'id', b.id,
    'user_id', b.user_id,
    'club_id', b.club_id,
    'field_unit_id', b.field_unit_id,
    'field_type', b.field_type,
    'date', b.date,
    'start_time', b.start_time,
    'end_time', b.end_time,
    'total_price', b.total_price,
    'status', b.status,
    'payment_method', b.payment_method,
    'payment_proof_path', b.payment_proof_path,
    'admin_seen_at', b.admin_seen_at,
    'notes', b.notes,
    'created_at', b.created_at,
    'created_by_admin', b.created_by_admin
  ) into v_result
  from public.bookings b
  where b.id = v_booking_id;

  return v_result;
end;
$$;


-- 6) Verificación rápida --------------------------------------
--   -- Debe listar 'soccer' y 'padel':
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'fields_sport_check';
--
--   -- Debe incluir 'PADEL':
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname in (
--       'field_units_type_check',
--       'bookings_field_type_check',
--       'pricing_rules_field_type_check'
--     );
