-- ============================================================
-- MIGRATION 010: Reservas creadas manualmente por el admin
-- ============================================================
-- PURPOSE:
--   Permitir que un club_admin (o staff) registre reservas para
--   clientes que pagan en efectivo / por otros canales (walk-in,
--   coordinación previa, etc.).
--
--   1) Extiende el check de `bookings.payment_method` para aceptar
--      'cash' además de 'bank_transfer'.
--   2) Hace lo mismo en `rpc_create_booking`.
--   3) Agrega flag `created_by_admin` (default false) para auditar
--      qué reservas vinieron del flujo manual.
--   4) RLS: club_admin / staff pueden insertar bookings cuyo
--      user_id NO es el suyo, siempre que el club al que apunten
--      sea suyo (o el staff_club_id).
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run. Idempotente.
-- ============================================================


-- 1) Expandir el check de payment_method ----------------------

alter table public.bookings
  drop constraint if exists bookings_payment_method_check;
alter table public.bookings
  add constraint bookings_payment_method_check
  check (payment_method in ('bank_transfer', 'cash'));


-- 2) Auditoría: marcar las reservas creadas por admin -----------

alter table public.bookings
  add column if not exists created_by_admin boolean not null default false;


-- 3) RLS: permitir al admin/staff crear bookings para terceros --

drop policy if exists "bookings_admin_create_for_others" on public.bookings;
create policy "bookings_admin_create_for_others"
on public.bookings for insert
with check (
  public.is_admin_or_staff_of_club(club_id)
);


-- 4) Actualizar rpc_create_booking ------------------------------
--    * Acepta payment_method 'cash'.
--    * Acepta una bandera p_created_by_admin (default false).
--    * Marca la fila como tal.

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

  if p_field_type not in ('F5', 'F7', 'F11') then
    raise exception 'Invalid field_type: %', p_field_type;
  end if;

  if p_status not in ('pending', 'confirmed', 'cancelled') then
    raise exception 'Invalid booking status: %', p_status;
  end if;

  if p_payment_method not in ('bank_transfer', 'cash') then
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


-- 5) Verificación ---------------------------------------------
-- After applying:
--
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.bookings'::regclass
--       and conname = 'bookings_payment_method_check';
--   -- Debe incluir 'cash'.
--
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'bookings'
--       and column_name = 'created_by_admin';
--   -- Debe devolver 1 fila.
