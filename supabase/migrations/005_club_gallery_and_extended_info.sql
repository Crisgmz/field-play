-- ============================================================
-- MIGRATION 005: Club gallery + extended public info
-- ============================================================
-- PURPOSE:
--   1) Add a public gallery of images per club (managed by club owner).
--   2) Extend `clubs` with optional contact info and amenities so the
--      player-facing booking page can display a richer "About" section.
--   3) Provision a public storage bucket `club-images` with RLS that
--      restricts writes to the owner of the club whose UUID matches
--      the first segment of the object path.
--
-- HOW TO APPLY:
--   Open Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   It is idempotent (re-running is safe).
-- ============================================================


-- 1. Extended club info ----------------------------------------

alter table public.clubs
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists amenities jsonb not null default '[]'::jsonb;

comment on column public.clubs.amenities is
  'Array de strings con servicios del club (ej: ["Estacionamiento","Vestidores","Cafetería"]).';


-- 2. club_images table ----------------------------------------

create table if not exists public.club_images (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  storage_path text not null,
  caption text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_club_images_club_position
  on public.club_images(club_id, position);

create unique index if not exists ux_club_images_storage_path
  on public.club_images(storage_path);


-- 3. RLS for club_images --------------------------------------

alter table public.club_images enable row level security;

-- Anyone (including unauthenticated visitors) can read the gallery.
drop policy if exists "club_images_read_all" on public.club_images;
create policy "club_images_read_all"
on public.club_images for select
using (true);

-- Only the club owner can insert/update/delete rows.
drop policy if exists "club_images_owner_write" on public.club_images;
create policy "club_images_owner_write"
on public.club_images for all
using (
  exists (
    select 1 from public.clubs c
    where c.id = club_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.clubs c
    where c.id = club_id and c.owner_id = auth.uid()
  )
);


-- 4. Storage bucket "club-images" -----------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-images',
  'club-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- 5. Storage RLS for "club-images" ----------------------------
-- Object naming convention: "<club_id>/<filename>"
-- Read is open to everyone (public bucket); writes are restricted to
-- the owner of the club whose UUID prefixes the path.

drop policy if exists "club_images_storage_read" on storage.objects;
create policy "club_images_storage_read"
on storage.objects for select
using (bucket_id = 'club-images');

drop policy if exists "club_images_storage_insert_owner" on storage.objects;
create policy "club_images_storage_insert_owner"
on storage.objects for insert
with check (
  bucket_id = 'club-images'
  and auth.uid() is not null
  and exists (
    select 1 from public.clubs c
    where c.owner_id = auth.uid()
      and split_part(name, '/', 1) = c.id::text
  )
);

drop policy if exists "club_images_storage_update_owner" on storage.objects;
create policy "club_images_storage_update_owner"
on storage.objects for update
using (
  bucket_id = 'club-images'
  and auth.uid() is not null
  and exists (
    select 1 from public.clubs c
    where c.owner_id = auth.uid()
      and split_part(name, '/', 1) = c.id::text
  )
)
with check (
  bucket_id = 'club-images'
  and auth.uid() is not null
  and exists (
    select 1 from public.clubs c
    where c.owner_id = auth.uid()
      and split_part(name, '/', 1) = c.id::text
  )
);

drop policy if exists "club_images_storage_delete_owner" on storage.objects;
create policy "club_images_storage_delete_owner"
on storage.objects for delete
using (
  bucket_id = 'club-images'
  and auth.uid() is not null
  and exists (
    select 1 from public.clubs c
    where c.owner_id = auth.uid()
      and split_part(name, '/', 1) = c.id::text
  )
);


-- 6. Verification ---------------------------------------------
-- Run these to confirm the migration applied:
--
--   select id, name, public from storage.buckets where id = 'club-images';
--   select count(*) from public.club_images;
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'clubs'
--       and column_name in ('phone', 'email', 'amenities');
