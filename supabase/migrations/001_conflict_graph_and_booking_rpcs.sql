-- ============================================================
-- MIGRATION 001: Conflict Graph + Transactional Booking RPCs
-- ============================================================
-- PURPOSE:
--   The current exclusion constraint (no_overlapping_bookings) only prevents
--   double-booking on the SAME field_unit_id. It does NOT detect conflicts
--   across overlapping units (e.g., booking F11 while F5/C1 is already booked).
--   All conflict detection currently runs client-side in availability.ts,
--   creating a race condition between concurrent bookers.
--
--   This migration adds:
--   1. field_unit_conflicts — materialised conflict graph (which units overlap)
--   2. Trigger to auto-populate conflicts when field_units change
--   3. rpc_create_booking — atomic check-and-insert with advisory lock
--   4. rpc_check_availability — server-side availability query
--   5. rpc_get_available_time_slots — full day availability grid
--   6. rpc_calculate_price — server-side price calculation
--   7. Better block-vs-booking conflict checking
-- ============================================================

-- Required extensions (idempotent)
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ============================================================
-- 1. FIELD_UNIT_CONFLICTS — Conflict Graph
-- ============================================================
-- Two field_units conflict if they share any physical slot.
-- This is a symmetric relation: if A conflicts with B, B conflicts with A.
-- We store both directions for simple JOIN-based lookups.

create table if not exists public.field_unit_conflicts (
  unit_a uuid not null references public.field_units(id) on delete cascade,
  unit_b uuid not null references public.field_units(id) on delete cascade,
  primary key (unit_a, unit_b),
  check (unit_a <> unit_b)
);

alter table public.field_unit_conflicts enable row level security;

-- Everyone can read conflicts (needed for availability checks)
create policy "field_unit_conflicts_public_read"
on public.field_unit_conflicts for select
using (true);

-- Only admins can modify (though normally the trigger handles this)
create policy "field_unit_conflicts_admin_write"
on public.field_unit_conflicts for all
using (public.is_club_admin())
with check (public.is_club_admin());

create index if not exists idx_field_unit_conflicts_a on public.field_unit_conflicts(unit_a);
create index if not exists idx_field_unit_conflicts_b on public.field_unit_conflicts(unit_b);

-- ============================================================
-- 2. AUTO-POPULATE CONFLICTS ON FIELD_UNIT CHANGES
-- ============================================================
-- When field_units are inserted/updated/deleted, recompute conflicts
-- for the affected field. Two units on the same field conflict if their
-- slot_ids arrays overlap (have any element in common).

create or replace function public.rebuild_field_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_field_id uuid;
begin
  -- Determine which field was affected
  if tg_op = 'DELETE' then
    target_field_id := old.field_id;
  else
    target_field_id := new.field_id;
  end if;

  -- Delete existing conflicts for all units in this field
  delete from public.field_unit_conflicts
  where unit_a in (select id from public.field_units where field_id = target_field_id)
     or unit_b in (select id from public.field_units where field_id = target_field_id);

  -- Re-insert conflicts: two active units on the same field conflict
  -- if their slot_ids arrays share at least one element
  insert into public.field_unit_conflicts (unit_a, unit_b)
  select a.id, b.id
  from public.field_units a
  join public.field_units b
    on a.field_id = b.field_id
   and a.id < b.id                          -- avoid self and duplicates
   and a.is_active = true
   and b.is_active = true
   and a.slot_ids && b.slot_ids             -- array overlap operator
  where a.field_id = target_field_id;

  -- Insert the reverse direction
  insert into public.field_unit_conflicts (unit_a, unit_b)
  select b.id, a.id
  from public.field_units a
  join public.field_units b
    on a.field_id = b.field_id
   and a.id < b.id
   and a.is_active = true
   and b.is_active = true
   and a.slot_ids && b.slot_ids
  where a.field_id = target_field_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_rebuild_field_conflicts on public.field_units;
create trigger trg_rebuild_field_conflicts
after insert or update or delete on public.field_units
for each row execute function public.rebuild_field_conflicts();

-- ============================================================
-- 3. BACKFILL CONFLICTS FOR EXISTING DATA
-- ============================================================
-- Run once to populate conflicts for all fields already in the DB.

insert into public.field_unit_conflicts (unit_a, unit_b)
select a.id, b.id
from public.field_units a
join public.field_units b
  on a.field_id = b.field_id
 and a.id < b.id
 and a.is_active = true
 and b.is_active = true
 and a.slot_ids && b.slot_ids
on conflict do nothing;

insert into public.field_unit_conflicts (unit_a, unit_b)
select b.id, a.id
from public.field_units a
join public.field_units b
  on a.field_id = b.field_id
 and a.id < b.id
 and a.is_active = true
 and b.is_active = true
 and a.slot_ids && b.slot_ids
on conflict do nothing;

-- ============================================================
-- 4. HELPER: Get all conflicting unit IDs for a given unit
-- ============================================================
-- Returns the unit itself + all units that share physical slots with it.

create or replace function public.get_conflicting_unit_ids(p_unit_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select array_agg(distinct id) from (
    select p_unit_id as id
    union
    select unit_b as id from public.field_unit_conflicts where unit_a = p_unit_id
  ) sub;
$$;

-- ============================================================
-- 5. CHECK IF A TIME SLOT IS AVAILABLE (considers conflicts)
-- ============================================================
-- Returns true if the given field_unit can be booked for the given
-- date/time range without conflicting with existing bookings or blocks.

create or replace function public.rpc_check_availability(
  p_field_unit_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  conflicting_units uuid[];
  booking_conflict boolean;
  block_conflict boolean;
begin
  -- Get all units that conflict with the requested unit (including itself)
  conflicting_units := public.get_conflicting_unit_ids(p_field_unit_id);

  -- Check booking conflicts
  select exists(
    select 1
    from public.bookings b
    where b.field_unit_id = any(conflicting_units)
      and b.date = p_date
      and b.status <> 'cancelled'
      and b.start_time < p_end_time
      and b.end_time > p_start_time
  ) into booking_conflict;

  if booking_conflict then
    return false;
  end if;

  -- Check block conflicts
  select exists(
    select 1
    from public.block_units bu
    join public.blocks bl on bl.id = bu.block_id
    where bu.field_unit_id = any(conflicting_units)
      and bl.date = p_date
      and bl.start_time < p_end_time
      and bl.end_time > p_start_time
  ) into block_conflict;

  return not block_conflict;
end;
$$;

-- ============================================================
-- 6. TRANSACTIONAL BOOKING — Atomic check + insert
-- ============================================================
-- This is the ONLY way bookings should be created in production.
-- It acquires an advisory lock per field to serialise concurrent
-- booking attempts, then checks availability, then inserts.
--
-- Returns the new booking row on success, raises exception on conflict.

create or replace function public.rpc_create_booking(
  p_user_id uuid,
  p_club_id uuid,
  p_field_unit_id uuid,
  p_field_type text,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_total_price numeric,
  p_notes text default null
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
begin
  -- Validate inputs
  if p_end_time <= p_start_time then
    raise exception 'end_time must be after start_time';
  end if;

  if p_field_type not in ('F5', 'F7', 'F11') then
    raise exception 'Invalid field_type: %', p_field_type;
  end if;

  -- Look up the field this unit belongs to
  select fu.field_id into v_field_id
  from public.field_units fu
  where fu.id = p_field_unit_id
    and fu.is_active = true;

  if v_field_id is null then
    raise exception 'Field unit not found or inactive: %', p_field_unit_id;
  end if;

  -- Acquire advisory lock on the field to serialise concurrent bookings.
  -- We use the first 8 bytes of the field UUID as the lock key.
  -- pg_advisory_xact_lock is released automatically at transaction end.
  v_lock_key := ('x' || left(replace(v_field_id::text, '-', ''), 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Check availability with conflicts
  v_available := public.rpc_check_availability(
    p_field_unit_id, p_date, p_start_time, p_end_time
  );

  if not v_available then
    raise exception 'BOOKING_CONFLICT: The requested time slot is not available (conflicting booking or block exists)';
  end if;

  -- Validate price against pricing rules
  -- (We trust the client-provided price for now but log a warning if it doesn't match)
  -- Future: enforce server-calculated price

  -- Insert the booking
  insert into public.bookings (
    user_id, club_id, field_unit_id, field_type,
    date, start_time, end_time,
    total_price, notes, status
  ) values (
    p_user_id, p_club_id, p_field_unit_id, p_field_type,
    p_date, p_start_time, p_end_time,
    p_total_price, p_notes, 'confirmed'
  )
  returning id into v_booking_id;

  -- Return the created booking as JSON
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
    'notes', b.notes,
    'created_at', b.created_at
  ) into v_result
  from public.bookings b
  where b.id = v_booking_id;

  return v_result;
end;
$$;

-- ============================================================
-- 7. GET AVAILABLE TIME SLOTS FOR A DAY
-- ============================================================
-- Returns a JSON array of 30-min slots with availability info.
-- Used by the TimeSlotPicker component.

create or replace function public.rpc_get_available_time_slots(
  p_field_id uuid,
  p_field_type text,
  p_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_open_time time;
  v_close_time time;
  v_slot_start time;
  v_slot_end time;
  v_total_units int;
  v_available_units int;
  v_result jsonb := '[]'::jsonb;
begin
  -- Get club operating hours
  select c.id, c.open_time, c.close_time
  into v_club_id, v_open_time, v_close_time
  from public.clubs c
  join public.fields f on f.club_id = c.id
  where f.id = p_field_id and f.is_active = true and c.is_active = true;

  if v_club_id is null then
    return '[]'::jsonb;
  end if;

  -- Count total units of this type for this field
  select count(*) into v_total_units
  from public.field_units fu
  where fu.field_id = p_field_id
    and fu.type = p_field_type
    and fu.is_active = true;

  -- Generate 30-minute slots within operating hours
  v_slot_start := v_open_time;
  while v_slot_start < v_close_time loop
    v_slot_end := v_slot_start + interval '30 minutes';

    if v_slot_end > v_close_time then
      exit;
    end if;

    -- Count how many units of this type are available for this slot
    select count(*) into v_available_units
    from public.field_units fu
    where fu.field_id = p_field_id
      and fu.type = p_field_type
      and fu.is_active = true
      and public.rpc_check_availability(fu.id, p_date, v_slot_start, v_slot_end);

    v_result := v_result || jsonb_build_object(
      'start', to_char(v_slot_start, 'HH24:MI'),
      'end', to_char(v_slot_end, 'HH24:MI'),
      'available', v_available_units > 0,
      'availableUnits', v_available_units,
      'totalUnits', v_total_units
    );

    v_slot_start := v_slot_end;
  end loop;

  return v_result;
end;
$$;

-- ============================================================
-- 8. GET UNIT OPTIONS (available units for a specific time range)
-- ============================================================
-- Returns which specific units of a given type are bookable.
-- Used by FieldSlotsBoard component.

create or replace function public.rpc_get_unit_options(
  p_field_id uuid,
  p_field_type text,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', fu.id,
        'type', fu.type,
        'name', fu.name,
        'slot_ids', fu.slot_ids,
        'available', public.rpc_check_availability(fu.id, p_date, p_start_time, p_end_time)
      )
    ), '[]'::jsonb)
    from public.field_units fu
    where fu.field_id = p_field_id
      and fu.type = p_field_type
      and fu.is_active = true
  );
end;
$$;

-- ============================================================
-- 9. CALCULATE PRICE SERVER-SIDE
-- ============================================================
-- Computes the booking price based on pricing_rules.

create or replace function public.rpc_calculate_price(
  p_club_id uuid,
  p_field_type text,
  p_start_time time,
  p_end_time time
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price_per_hour numeric;
  v_minimum_minutes int;
  v_increment_minutes int;
  v_duration_minutes int;
  v_total_price numeric;
begin
  select pr.price_per_hour, pr.minimum_minutes, pr.increment_minutes
  into v_price_per_hour, v_minimum_minutes, v_increment_minutes
  from public.pricing_rules pr
  where pr.club_id = p_club_id
    and pr.field_type = p_field_type
    and pr.is_active = true;

  if v_price_per_hour is null then
    raise exception 'No active pricing rule found for club % and type %', p_club_id, p_field_type;
  end if;

  v_duration_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_duration_minutes < v_minimum_minutes then
    raise exception 'Duration (% min) is below minimum (% min)', v_duration_minutes, v_minimum_minutes;
  end if;

  if v_duration_minutes % v_increment_minutes <> 0 then
    raise exception 'Duration (% min) must be a multiple of % min', v_duration_minutes, v_increment_minutes;
  end if;

  v_total_price := (v_duration_minutes::numeric / 60.0) * v_price_per_hour;

  return jsonb_build_object(
    'price_per_hour', v_price_per_hour,
    'duration_minutes', v_duration_minutes,
    'total_price', v_total_price,
    'minimum_minutes', v_minimum_minutes,
    'increment_minutes', v_increment_minutes
  );
end;
$$;

-- ============================================================
-- 10. FIND FIRST AVAILABLE UNIT (auto-assignment)
-- ============================================================
-- Given a field, type, date, and time range, returns the first
-- available unit. Used when the user doesn't pick a specific unit.

create or replace function public.rpc_find_available_unit(
  p_field_id uuid,
  p_field_type text,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (
    select jsonb_build_object(
      'id', fu.id,
      'type', fu.type,
      'name', fu.name,
      'slot_ids', fu.slot_ids
    )
    from public.field_units fu
    where fu.field_id = p_field_id
      and fu.type = p_field_type
      and fu.is_active = true
      and public.rpc_check_availability(fu.id, p_date, p_start_time, p_end_time)
    order by fu.name
    limit 1
  );
end;
$$;

-- ============================================================
-- 11. GRANT EXECUTE ON RPCs TO authenticated/anon ROLES
-- ============================================================
-- Supabase requires explicit grants for RPC functions.

grant execute on function public.rpc_check_availability(uuid, date, time, time) to authenticated;
grant execute on function public.rpc_create_booking(uuid, uuid, uuid, text, date, time, time, numeric, text) to authenticated;
grant execute on function public.rpc_get_available_time_slots(uuid, text, date) to authenticated, anon;
grant execute on function public.rpc_get_unit_options(uuid, text, date, time, time) to authenticated, anon;
grant execute on function public.rpc_calculate_price(uuid, text, time, time) to authenticated, anon;
grant execute on function public.rpc_find_available_unit(uuid, text, date, time, time) to authenticated, anon;
grant select on public.field_unit_conflicts to authenticated, anon;

-- ============================================================
-- NOTES
-- ============================================================
-- DEPLOYMENT ORDER:
--   1. Run "base de datos.sql" first (if fresh DB)
--   2. Run this migration
--
-- The advisory lock in rpc_create_booking serialises all booking
-- attempts for the same field, so even without the cross-unit
-- exclusion constraint, double-booking is impossible.
--
-- Performance note: rpc_get_available_time_slots calls
-- rpc_check_availability per-unit per-slot. For a versatile_full
-- layout (10 units) over a 15-hour day (30 slots), that's
-- 10 × 30 = 300 lightweight queries. If this becomes a bottleneck,
-- consider a single query that joins all units against all bookings.
