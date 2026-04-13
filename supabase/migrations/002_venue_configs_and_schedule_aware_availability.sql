-- ============================================================
-- MIGRATION 002: Venue Configs + Schedule-Aware Availability
-- ============================================================
-- PURPOSE:
--   Represent venue-level scheduling rules server-side so BookingFlow's
--   client-side venue config expectations match Supabase RPC behavior.
--
--   Adds:
--   1. venue_configs table (weekly schedule + slot duration per club)
--   2. Backfill for existing clubs
--   3. Helpers to resolve schedule for a date and validate slot alignment
--   4. Schedule-aware versions of:
--        - rpc_check_availability
--        - rpc_create_booking
--        - rpc_get_available_time_slots
--
-- NOTES:
--   - This is intentionally scoped. It does not redesign pricing or UI.
--   - Existing clubs are backfilled using their current open/close times
--     for all 7 days, with 30-minute slots by default.
-- ============================================================

create table if not exists public.venue_configs (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  week_schedule jsonb not null,
  slot_duration_minutes integer not null default 30
    check (slot_duration_minutes in (30, 60)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(week_schedule) = 'array')
);

alter table public.venue_configs enable row level security;

drop policy if exists "venue_configs_read" on public.venue_configs;
create policy "venue_configs_read"
on public.venue_configs for select
using (true);

drop policy if exists "venue_configs_admin_write" on public.venue_configs;
create policy "venue_configs_admin_write"
on public.venue_configs for all
using (public.is_club_admin())
with check (public.is_club_admin());

drop trigger if exists trg_venue_configs_updated_at on public.venue_configs;
create trigger trg_venue_configs_updated_at
before update on public.venue_configs
for each row execute function public.set_updated_at();

insert into public.venue_configs (club_id, week_schedule, slot_duration_minutes)
select
  c.id,
  jsonb_build_array(
    jsonb_build_object('day', 0, 'open', to_char(c.open_time, 'HH24:MI'), 'close', to_char(c.close_time, 'HH24:MI'), 'closed', false),
    jsonb_build_object('day', 1, 'open', to_char(c.open_time, 'HH24:MI'), 'close', to_char(c.close_time, 'HH24:MI'), 'closed', false),
    jsonb_build_object('day', 2, 'open', to_char(c.open_time, 'HH24:MI'), 'close', to_char(c.close_time, 'HH24:MI'), 'closed', false),
    jsonb_build_object('day', 3, 'open', to_char(c.open_time, 'HH24:MI'), 'close', to_char(c.close_time, 'HH24:MI'), 'closed', false),
    jsonb_build_object('day', 4, 'open', to_char(c.open_time, 'HH24:MI'), 'close', to_char(c.close_time, 'HH24:MI'), 'closed', false),
    jsonb_build_object('day', 5, 'open', to_char(c.open_time, 'HH24:MI'), 'close', to_char(c.close_time, 'HH24:MI'), 'closed', false),
    jsonb_build_object('day', 6, 'open', to_char(c.open_time, 'HH24:MI'), 'close', to_char(c.close_time, 'HH24:MI'), 'closed', false)
  ),
  30
from public.clubs c
on conflict (club_id) do nothing;

create or replace function public.get_venue_config_for_date(
  p_club_id uuid,
  p_date date
)
returns table (
  open_time time,
  close_time time,
  is_closed boolean,
  slot_duration_minutes integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club_open time;
  v_club_close time;
  v_week_schedule jsonb;
  v_day_config jsonb;
  v_slot_duration integer := 30;
  v_day_of_week integer;
begin
  select
    c.open_time,
    c.close_time,
    vc.week_schedule,
    coalesce(vc.slot_duration_minutes, 30)
  into
    v_club_open,
    v_club_close,
    v_week_schedule,
    v_slot_duration
  from public.clubs c
  left join public.venue_configs vc on vc.club_id = c.id
  where c.id = p_club_id
    and c.is_active = true;

  if v_club_open is null or v_club_close is null then
    return;
  end if;

  v_day_of_week := extract(dow from p_date);

  if v_week_schedule is not null then
    select elem
    into v_day_config
    from jsonb_array_elements(v_week_schedule) as elem
    where (elem->>'day')::integer = v_day_of_week
    limit 1;
  end if;

  if v_day_config is null then
    open_time := v_club_open;
    close_time := v_club_close;
    is_closed := false;
  else
    open_time := coalesce((v_day_config->>'open')::time, v_club_open);
    close_time := coalesce((v_day_config->>'close')::time, v_club_close);
    is_closed := coalesce((v_day_config->>'closed')::boolean, false);
  end if;

  slot_duration_minutes := v_slot_duration;
  return next;
end;
$$;

create or replace function public.is_time_on_slot_boundary(
  p_time time,
  p_open_time time,
  p_slot_duration_minutes integer
)
returns boolean
language sql
immutable
as $$
  select case
    when p_slot_duration_minutes is null or p_slot_duration_minutes <= 0 then false
    when p_time < p_open_time then false
    else mod(
      (extract(epoch from (p_time - p_open_time)) / 60)::integer,
      p_slot_duration_minutes
    ) = 0
  end;
$$;

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
  v_club_id uuid;
  v_open_time time;
  v_close_time time;
  v_is_closed boolean;
  v_slot_duration integer;
begin
  select f.club_id
  into v_club_id
  from public.field_units fu
  join public.fields f on f.id = fu.field_id
  where fu.id = p_field_unit_id
    and fu.is_active = true
    and f.is_active = true;

  if v_club_id is null then
    return false;
  end if;

  select open_time, close_time, is_closed, slot_duration_minutes
  into v_open_time, v_close_time, v_is_closed, v_slot_duration
  from public.get_venue_config_for_date(v_club_id, p_date);

  if v_open_time is null or v_close_time is null or coalesce(v_is_closed, false) then
    return false;
  end if;

  if p_end_time <= p_start_time then
    return false;
  end if;

  if p_start_time < v_open_time or p_end_time > v_close_time then
    return false;
  end if;

  if not public.is_time_on_slot_boundary(p_start_time, v_open_time, v_slot_duration)
     or not public.is_time_on_slot_boundary(p_end_time, v_open_time, v_slot_duration) then
    return false;
  end if;

  conflicting_units := public.get_conflicting_unit_ids(p_field_unit_id);

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
    user_id, club_id, field_unit_id, field_type,
    date, start_time, end_time,
    total_price, notes, status
  ) values (
    p_user_id, p_club_id, p_field_unit_id, p_field_type,
    p_date, p_start_time, p_end_time,
    p_total_price, p_notes, 'confirmed'
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
    'notes', b.notes,
    'created_at', b.created_at
  ) into v_result
  from public.bookings b
  where b.id = v_booking_id;

  return v_result;
end;
$$;

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
  v_is_closed boolean;
  v_slot_duration integer;
  v_slot_start time;
  v_slot_end time;
  v_total_units int;
  v_available_units int;
  v_result jsonb := '[]'::jsonb;
begin
  select f.club_id
  into v_club_id
  from public.fields f
  join public.clubs c on c.id = f.club_id
  where f.id = p_field_id
    and f.is_active = true
    and c.is_active = true;

  if v_club_id is null then
    return '[]'::jsonb;
  end if;

  select open_time, close_time, is_closed, slot_duration_minutes
  into v_open_time, v_close_time, v_is_closed, v_slot_duration
  from public.get_venue_config_for_date(v_club_id, p_date);

  if v_open_time is null or v_close_time is null or coalesce(v_is_closed, false) then
    return '[]'::jsonb;
  end if;

  select count(*) into v_total_units
  from public.field_units fu
  where fu.field_id = p_field_id
    and fu.type = p_field_type
    and fu.is_active = true;

  v_slot_start := v_open_time;
  while v_slot_start < v_close_time loop
    v_slot_end := v_slot_start + make_interval(mins => v_slot_duration);

    if v_slot_end > v_close_time then
      exit;
    end if;

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

grant select on public.venue_configs to authenticated;
grant insert, update on public.venue_configs to authenticated;
