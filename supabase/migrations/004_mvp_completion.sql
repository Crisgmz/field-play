-- ============================================================
-- MIGRATION 004: MVP Completion
-- ============================================================
-- PURPOSE:
--   Close the booking lifecycle: admin rejection with reason,
--   client-side cancellation tracking, payment-proof replacement,
--   closed-day overrides on top of weekly schedules, and the RPCs
--   that wire those flows into a single transaction.
-- ============================================================

-- 1. Lifecycle metadata on bookings ----------------------------

alter table public.bookings
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists proof_replaced_at timestamptz;

create index if not exists idx_bookings_status_pending_old
  on public.bookings(created_at)
  where status = 'pending';


-- 2. Closed dates per club (holiday overrides) -----------------

alter table public.venue_configs
  add column if not exists closed_dates date[] not null default '{}'::date[];


-- Wrap the existing date helper to also honor closed_dates.
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
  v_closed_dates date[];
  v_is_closed boolean := false;
begin
  select
    c.open_time,
    c.close_time,
    vc.week_schedule,
    coalesce(vc.slot_duration_minutes, 30),
    coalesce(vc.closed_dates, '{}'::date[])
  into
    v_club_open,
    v_club_close,
    v_week_schedule,
    v_slot_duration,
    v_closed_dates
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
    v_is_closed := false;
  else
    open_time := coalesce((v_day_config->>'open')::time, v_club_open);
    close_time := coalesce((v_day_config->>'close')::time, v_club_close);
    v_is_closed := coalesce((v_day_config->>'closed')::boolean, false);
  end if;

  if p_date = any(v_closed_dates) then
    v_is_closed := true;
  end if;

  is_closed := v_is_closed;
  slot_duration_minutes := v_slot_duration;
  return next;
end;
$$;


-- 3. Reject booking RPC (admin rejects with reason) ------------

create or replace function public.rpc_reject_booking(
  p_booking_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_is_owner boolean;
begin
  if v_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED: a non-empty reason is required';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Only the club owner (or the global is_club_admin role) may reject.
  select exists (
    select 1 from public.clubs c
    where c.id = v_booking.club_id
      and c.owner_id = v_admin_id
  ) into v_is_owner;

  if not (v_is_owner or public.is_club_admin()) then
    raise exception 'FORBIDDEN: only the club owner can reject this booking';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;

  update public.bookings
    set status = 'cancelled',
        rejection_reason = p_reason,
        rejected_at = now(),
        cancelled_at = now(),
        cancelled_by = v_admin_id
    where id = p_booking_id
    returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'status', v_booking.status,
    'rejection_reason', v_booking.rejection_reason,
    'rejected_at', v_booking.rejected_at
  );
end;
$$;


-- 4. Confirm booking RPC (admin confirms payment) --------------

create or replace function public.rpc_confirm_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_is_owner boolean;
begin
  if v_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  select exists (
    select 1 from public.clubs c
    where c.id = v_booking.club_id
      and c.owner_id = v_admin_id
  ) into v_is_owner;

  if not (v_is_owner or public.is_club_admin()) then
    raise exception 'FORBIDDEN: only the club owner can confirm this booking';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'CANNOT_CONFIRM_CANCELLED';
  end if;

  update public.bookings
    set status = 'confirmed',
        confirmed_at = now(),
        admin_seen_at = coalesce(admin_seen_at, now())
    where id = p_booking_id
    returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'status', v_booking.status,
    'confirmed_at', v_booking.confirmed_at
  );
end;
$$;


-- 5. Cancel booking RPC (client or admin cancels with reason) --

create or replace function public.rpc_cancel_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_is_owner_of_booking boolean;
  v_is_club_owner boolean;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  v_is_owner_of_booking := v_booking.user_id = v_actor_id;

  select exists (
    select 1 from public.clubs c
    where c.id = v_booking.club_id and c.owner_id = v_actor_id
  ) into v_is_club_owner;

  if not (v_is_owner_of_booking or v_is_club_owner or public.is_club_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;

  update public.bookings
    set status = 'cancelled',
        cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        cancelled_at = now(),
        cancelled_by = v_actor_id
    where id = p_booking_id
    returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'status', v_booking.status,
    'cancellation_reason', v_booking.cancellation_reason,
    'cancelled_at', v_booking.cancelled_at,
    'cancelled_by', v_booking.cancelled_by
  );
end;
$$;


-- 6. Replace payment proof (client re-uploads while pending) --

create or replace function public.rpc_replace_payment_proof(
  p_booking_id uuid,
  p_new_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_new_path is null or btrim(p_new_path) = '' then
    raise exception 'PROOF_PATH_REQUIRED';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.user_id <> v_user_id then
    raise exception 'FORBIDDEN: you can only replace proof on your own booking';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'NOT_PENDING: proof can only be replaced while pending validation';
  end if;

  update public.bookings
    set payment_proof_path = p_new_path,
        proof_replaced_at = now(),
        admin_seen_at = null,
        rejection_reason = null,
        rejected_at = null
    where id = p_booking_id
    returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'payment_proof_path', v_booking.payment_proof_path,
    'proof_replaced_at', v_booking.proof_replaced_at
  );
end;
$$;


-- 7. Permissions -----------------------------------------------

grant execute on function public.rpc_reject_booking(uuid, text) to authenticated;
grant execute on function public.rpc_confirm_booking(uuid) to authenticated;
grant execute on function public.rpc_cancel_booking(uuid, text) to authenticated;
grant execute on function public.rpc_replace_payment_proof(uuid, text) to authenticated;
