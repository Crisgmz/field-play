-- ============================================================
-- MIGRATION 006: Staff role + team management
-- ============================================================
-- PURPOSE:
--   Introduce a third user role `staff` so club_admins can delegate
--   booking validation and calendar/block management to employees,
--   without giving them the keys to pricing, fields, club info, etc.
--
--   Staff are scoped to a single club via `profiles.staff_club_id`.
--   `profiles.is_active` lets admins deactivate employees without
--   losing referential integrity (cancelled_by, created_by, ...).
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   Idempotent.
-- ============================================================


-- 1. profiles: extend role + add scoping/active fields ----------

alter table public.profiles
  add column if not exists staff_club_id uuid references public.clubs(id) on delete set null,
  add column if not exists is_active boolean not null default true;

create index if not exists idx_profiles_staff_club on public.profiles(staff_club_id);

-- Drop and recreate the role check to include 'staff'.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%in%';

  if v_constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('client', 'staff', 'club_admin'));

-- A staff profile MUST have a staff_club_id; non-staff MUST NOT.
alter table public.profiles
  drop constraint if exists profiles_staff_club_consistency;
alter table public.profiles
  add constraint profiles_staff_club_consistency
  check (
    (role = 'staff' and staff_club_id is not null)
    or (role <> 'staff' and staff_club_id is null)
  )
  not valid;
-- `not valid` so existing rows aren't blocked; new rows are checked.


-- 2. handle_new_user: propagate role + staff_club_id from metadata --

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_staff_club_id uuid;
begin
  v_role := coalesce(new.raw_user_meta_data ->> 'role', 'client');
  v_staff_club_id := nullif(new.raw_user_meta_data ->> 'staff_club_id', '')::uuid;

  -- Defensive: only staff carries a staff_club_id.
  if v_role <> 'staff' then
    v_staff_club_id := null;
  end if;

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    national_id,
    role,
    staff_club_id
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'national_id', ''),
    v_role,
    v_staff_club_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- 3. Helper functions ------------------------------------------
-- All helpers read from auth.jwt() so they are RLS-safe (no recursion
-- on public.profiles, no extra round-trips).

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'staff', false);
$$;

create or replace function public.staff_club_id_jwt()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.jwt() -> 'user_metadata' ->> 'staff_club_id', '')::uuid;
$$;

-- True if the caller is a club_admin OR a staff scoped to the given club.
create or replace function public.is_admin_or_staff_of_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_club_admin()
    or (public.is_staff() and public.staff_club_id_jwt() = p_club_id);
$$;

-- Same but for tables that reference `field_id` instead of `club_id`.
create or replace function public.is_admin_or_staff_of_field(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_club_admin()
    or (
      public.is_staff()
      and public.staff_club_id_jwt() = (select club_id from public.fields where id = p_field_id)
    );
$$;


-- 4. RLS updates -----------------------------------------------
-- Strategy:
--   * READ: where the table was admin-only or public, we leave it.
--           Bookings get an extra OR for staff-of-that-club.
--   * WRITE on bookings (update for confirm/reject) and blocks/block_units
--           (full CRUD for calendar management) get expanded to allow staff.
--   * Pricing, fields, field_units, clubs, club_images, venue_configs
--     stay strictly club_admin (handled by existing policies that use
--     is_club_admin()). Staff cannot touch them.
--   * Profiles: allow staff to be read by their club_admin so the team
--           page works. Also allow profile updates from the owner.

-- BOOKINGS ------------------------------------------------------

drop policy if exists "bookings_user_read_own_or_admin" on public.bookings;
create policy "bookings_user_read_own_or_admin"
on public.bookings for select
using (
  auth.uid() = user_id
  or public.is_admin_or_staff_of_club(club_id)
);

drop policy if exists "bookings_user_update_own_or_admin" on public.bookings;
create policy "bookings_user_update_own_or_admin"
on public.bookings for update
using (
  auth.uid() = user_id
  or public.is_admin_or_staff_of_club(club_id)
)
with check (
  auth.uid() = user_id
  or public.is_admin_or_staff_of_club(club_id)
);

-- (booking insert and delete policies stay as-is: clients create their own,
--  only club_admin deletes via existing policy.)


-- BLOCKS --------------------------------------------------------
-- Allow staff to insert/update/delete blocks for their assigned club's fields.

drop policy if exists "blocks_admin_insert" on public.blocks;
create policy "blocks_admin_or_staff_insert"
on public.blocks for insert
with check (public.is_admin_or_staff_of_field(field_id));

drop policy if exists "blocks_admin_or_staff_insert" on public.blocks;
create policy "blocks_admin_or_staff_insert"
on public.blocks for insert
with check (public.is_admin_or_staff_of_field(field_id));

drop policy if exists "blocks_admin_update" on public.blocks;
create policy "blocks_admin_or_staff_update"
on public.blocks for update
using (public.is_admin_or_staff_of_field(field_id))
with check (public.is_admin_or_staff_of_field(field_id));

drop policy if exists "blocks_admin_or_staff_update" on public.blocks;
create policy "blocks_admin_or_staff_update"
on public.blocks for update
using (public.is_admin_or_staff_of_field(field_id))
with check (public.is_admin_or_staff_of_field(field_id));

drop policy if exists "blocks_admin_delete" on public.blocks;
create policy "blocks_admin_or_staff_delete"
on public.blocks for delete
using (public.is_admin_or_staff_of_field(field_id));

drop policy if exists "blocks_admin_or_staff_delete" on public.blocks;
create policy "blocks_admin_or_staff_delete"
on public.blocks for delete
using (public.is_admin_or_staff_of_field(field_id));


-- BLOCK_UNITS ---------------------------------------------------
-- Mirror the parent block table: staff can manage rows whose block
-- belongs to one of their club's fields.

drop policy if exists "block_units_admin_insert" on public.block_units;
create policy "block_units_admin_or_staff_insert"
on public.block_units for insert
with check (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
);

drop policy if exists "block_units_admin_or_staff_insert" on public.block_units;
create policy "block_units_admin_or_staff_insert"
on public.block_units for insert
with check (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
);

drop policy if exists "block_units_admin_update" on public.block_units;
create policy "block_units_admin_or_staff_update"
on public.block_units for update
using (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
)
with check (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
);

drop policy if exists "block_units_admin_or_staff_update" on public.block_units;
create policy "block_units_admin_or_staff_update"
on public.block_units for update
using (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
)
with check (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
);

drop policy if exists "block_units_admin_delete" on public.block_units;
create policy "block_units_admin_or_staff_delete"
on public.block_units for delete
using (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
);

drop policy if exists "block_units_admin_or_staff_delete" on public.block_units;
create policy "block_units_admin_or_staff_delete"
on public.block_units for delete
using (
  public.is_admin_or_staff_of_field(
    (select field_id from public.blocks where id = block_id)
  )
);


-- PROFILES ------------------------------------------------------
-- Allow club_admin to see staff profiles assigned to one of their clubs.
-- (The existing `profiles_select_admin` already lets club_admins read all
--  profiles via JWT-based check, so this is just additive safety.)

drop policy if exists "profiles_select_staff_of_admin_club" on public.profiles;
create policy "profiles_select_staff_of_admin_club"
on public.profiles for select
using (
  public.is_club_admin()
  and staff_club_id is not null
  and exists (
    select 1 from public.clubs c
    where c.id = staff_club_id and c.owner_id = auth.uid()
  )
);

-- Allow club_admin to update profiles of staff scoped to one of their clubs
-- (is_active flag, role demotion to client, reassign staff_club_id).
drop policy if exists "profiles_update_staff_of_admin_club" on public.profiles;
create policy "profiles_update_staff_of_admin_club"
on public.profiles for update
using (
  public.is_club_admin()
  and staff_club_id is not null
  and exists (
    select 1 from public.clubs c
    where c.id = staff_club_id and c.owner_id = auth.uid()
  )
)
with check (
  public.is_club_admin()
  and (
    staff_club_id is null
    or exists (
      select 1 from public.clubs c
      where c.id = staff_club_id and c.owner_id = auth.uid()
    )
  )
);


-- 5. Verification ----------------------------------------------
-- Run these to confirm the migration applied:
--
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'profiles'
--       and column_name in ('staff_club_id', 'is_active');
--
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check';
--
--   select proname from pg_proc
--     where proname in ('is_staff', 'staff_club_id_jwt', 'is_admin_or_staff_of_club', 'is_admin_or_staff_of_field');
