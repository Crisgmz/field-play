-- ============================================================
-- MIGRATION 003: Bank transfer booking flow + admin alerts
-- ============================================================

alter table public.bookings
  alter column status set default 'pending';

alter table public.bookings
  add column if not exists payment_method text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer')),
  add column if not exists payment_proof_path text,
  add column if not exists admin_seen_at timestamptz;

create index if not exists idx_bookings_admin_seen_pending
  on public.bookings(admin_seen_at)
  where status = 'pending';

update public.bookings
set admin_seen_at = coalesce(admin_seen_at, now())
where admin_seen_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-proofs',
  'booking-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "booking_proofs_insert_own" on storage.objects;
create policy "booking_proofs_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'booking-proofs'
  and auth.uid() is not null
  and name like auth.uid()::text || '/%'
);

drop policy if exists "booking_proofs_select_own_or_admin" on storage.objects;
create policy "booking_proofs_select_own_or_admin"
on storage.objects for select
using (
  bucket_id = 'booking-proofs'
  and (
    public.is_club_admin()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
);

drop policy if exists "booking_proofs_update_own_or_admin" on storage.objects;
create policy "booking_proofs_update_own_or_admin"
on storage.objects for update
using (
  bucket_id = 'booking-proofs'
  and (
    public.is_club_admin()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
)
with check (
  bucket_id = 'booking-proofs'
  and (
    public.is_club_admin()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
);

drop policy if exists "booking_proofs_delete_own_or_admin" on storage.objects;
create policy "booking_proofs_delete_own_or_admin"
on storage.objects for delete
using (
  bucket_id = 'booking-proofs'
  and (
    public.is_club_admin()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
);

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

  if p_status not in ('pending', 'confirmed', 'cancelled') then
    raise exception 'Invalid booking status: %', p_status;
  end if;

  if p_payment_method not in ('bank_transfer') then
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
    admin_seen_at
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
    null
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
    'created_at', b.created_at
  ) into v_result
  from public.bookings b
  where b.id = v_booking_id;

  return v_result;
end;
$$;
