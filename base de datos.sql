-- REALPLAY MVP · BASE DE DATOS PARA SUPABASE
-- Ejecuta este archivo completo en Supabase SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;  -- necesario para exclusion constraints

-- ============================================================
-- LIMPIEZA (drop en orden inverso de dependencias)
-- ============================================================

drop table if exists public.block_units cascade;
drop table if exists public.bookings cascade;
drop table if exists public.blocks cascade;
drop table if exists public.field_units cascade;
drop table if exists public.fields cascade;
drop table if exists public.pricing_rules cascade;
drop table if exists public.clubs cascade;
drop table if exists public.profiles cascade;

-- ============================================================
-- TABLAS
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  first_name text not null,
  last_name text not null,
  phone text not null,
  national_id text,
  role text not null default 'client' check (role in ('client', 'club_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  location text not null,
  description text not null default '',
  image_url text,
  rating numeric(3,2) not null default 5.00
    check (rating >= 0 and rating <= 5),
  open_time time not null default '08:00',
  close_time time not null default '23:00',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (close_time > open_time)
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  field_type text not null check (field_type in ('F11', 'F7', 'F5')),
  price_per_hour numeric(10,2) not null check (price_per_hour >= 0),
  minimum_minutes integer not null default 60
    check (minimum_minutes >= 30 and minimum_minutes % 30 = 0),
  increment_minutes integer not null default 30
    check (increment_minutes >= 30 and increment_minutes % 30 = 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, field_type)
);

create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  surface text not null default 'Gramilla sintética',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_units (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  type text not null check (type in ('F11', 'F7', 'F5')),
  name text not null,
  parent_id uuid references public.field_units(id) on delete cascade,
  slot_ids text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  type text not null check (type in ('practice', 'maintenance', 'event')),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.block_units (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  field_unit_id uuid not null references public.field_units(id) on delete cascade,
  unique (block_id, field_unit_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete restrict,
  field_unit_id uuid not null references public.field_units(id) on delete restrict,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'cancelled')),
  field_type text not null check (field_type in ('F11', 'F7', 'F5')),
  total_price numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- Exclusion constraint: impide reservas solapadas en la misma field_unit
-- Solo aplica a reservas que NO estén canceladas
alter table public.bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    field_unit_id with =,
    date with =,
    tsrange(
      ('2000-01-01'::date + start_time)::timestamp,
      ('2000-01-01'::date + end_time)::timestamp
    ) with &&
  )
  where (status <> 'cancelled');

-- ============================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger trg_clubs_updated_at
before update on public.clubs
for each row execute function public.set_updated_at();

create or replace trigger trg_pricing_rules_updated_at
before update on public.pricing_rules
for each row execute function public.set_updated_at();

create or replace trigger trg_fields_updated_at
before update on public.fields
for each row execute function public.set_updated_at();

create or replace trigger trg_field_units_updated_at
before update on public.field_units
for each row execute function public.set_updated_at();

create or replace trigger trg_blocks_updated_at
before update on public.blocks
for each row execute function public.set_updated_at();

create or replace trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- Auto-crear profile cuando se registra un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    national_id,
    role
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'national_id', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'client')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

-- Función helper para verificar rol admin sin causar recursión
create or replace function public.is_club_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'club_admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.fields enable row level security;
alter table public.field_units enable row level security;
alter table public.blocks enable row level security;
alter table public.block_units enable row level security;
alter table public.bookings enable row level security;

-- PROFILES
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
using (auth.uid() = id or public.is_club_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- CLUBS
drop policy if exists "clubs_public_read" on public.clubs;
create policy "clubs_public_read"
on public.clubs for select
using (true);

drop policy if exists "clubs_admin_insert" on public.clubs;
create policy "clubs_admin_insert"
on public.clubs for insert
with check (public.is_club_admin());

drop policy if exists "clubs_admin_update" on public.clubs;
create policy "clubs_admin_update"
on public.clubs for update
using (public.is_club_admin())
with check (public.is_club_admin());

drop policy if exists "clubs_admin_delete" on public.clubs;
create policy "clubs_admin_delete"
on public.clubs for delete
using (public.is_club_admin());

-- PRICING RULES
drop policy if exists "pricing_rules_public_read" on public.pricing_rules;
create policy "pricing_rules_public_read"
on public.pricing_rules for select
using (true);

drop policy if exists "pricing_rules_admin_insert" on public.pricing_rules;
create policy "pricing_rules_admin_insert"
on public.pricing_rules for insert
with check (public.is_club_admin());

drop policy if exists "pricing_rules_admin_update" on public.pricing_rules;
create policy "pricing_rules_admin_update"
on public.pricing_rules for update
using (public.is_club_admin())
with check (public.is_club_admin());

drop policy if exists "pricing_rules_admin_delete" on public.pricing_rules;
create policy "pricing_rules_admin_delete"
on public.pricing_rules for delete
using (public.is_club_admin());

-- FIELDS
drop policy if exists "fields_public_read" on public.fields;
create policy "fields_public_read"
on public.fields for select
using (true);

drop policy if exists "fields_admin_insert" on public.fields;
create policy "fields_admin_insert"
on public.fields for insert
with check (public.is_club_admin());

drop policy if exists "fields_admin_update" on public.fields;
create policy "fields_admin_update"
on public.fields for update
using (public.is_club_admin())
with check (public.is_club_admin());

drop policy if exists "fields_admin_delete" on public.fields;
create policy "fields_admin_delete"
on public.fields for delete
using (public.is_club_admin());

-- FIELD UNITS
drop policy if exists "field_units_public_read" on public.field_units;
create policy "field_units_public_read"
on public.field_units for select
using (true);

drop policy if exists "field_units_admin_insert" on public.field_units;
create policy "field_units_admin_insert"
on public.field_units for insert
with check (public.is_club_admin());

drop policy if exists "field_units_admin_update" on public.field_units;
create policy "field_units_admin_update"
on public.field_units for update
using (public.is_club_admin())
with check (public.is_club_admin());

drop policy if exists "field_units_admin_delete" on public.field_units;
create policy "field_units_admin_delete"
on public.field_units for delete
using (public.is_club_admin());

-- BLOCKS
drop policy if exists "blocks_public_read" on public.blocks;
create policy "blocks_public_read"
on public.blocks for select
using (true);

drop policy if exists "blocks_admin_insert" on public.blocks;
create policy "blocks_admin_insert"
on public.blocks for insert
with check (public.is_club_admin());

drop policy if exists "blocks_admin_update" on public.blocks;
create policy "blocks_admin_update"
on public.blocks for update
using (public.is_club_admin())
with check (public.is_club_admin());

drop policy if exists "blocks_admin_delete" on public.blocks;
create policy "blocks_admin_delete"
on public.blocks for delete
using (public.is_club_admin());

-- BLOCK UNITS
drop policy if exists "block_units_public_read" on public.block_units;
create policy "block_units_public_read"
on public.block_units for select
using (true);

drop policy if exists "block_units_admin_insert" on public.block_units;
create policy "block_units_admin_insert"
on public.block_units for insert
with check (public.is_club_admin());

drop policy if exists "block_units_admin_update" on public.block_units;
create policy "block_units_admin_update"
on public.block_units for update
using (public.is_club_admin())
with check (public.is_club_admin());

drop policy if exists "block_units_admin_delete" on public.block_units;
create policy "block_units_admin_delete"
on public.block_units for delete
using (public.is_club_admin());

-- BOOKINGS
drop policy if exists "bookings_user_read_own_or_admin" on public.bookings;
create policy "bookings_user_read_own_or_admin"
on public.bookings for select
using (
  auth.uid() = user_id or public.is_club_admin()
);

drop policy if exists "bookings_user_create_own" on public.bookings;
create policy "bookings_user_create_own"
on public.bookings for insert
with check (auth.uid() = user_id);

drop policy if exists "bookings_user_update_own_or_admin" on public.bookings;
create policy "bookings_user_update_own_or_admin"
on public.bookings for update
using (
  auth.uid() = user_id or public.is_club_admin()
)
with check (
  auth.uid() = user_id or public.is_club_admin()
);

drop policy if exists "bookings_admin_delete" on public.bookings;
create policy "bookings_admin_delete"
on public.bookings for delete
using (public.is_club_admin());

-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_clubs_owner_id on public.clubs(owner_id);
create index if not exists idx_clubs_is_active on public.clubs(is_active) where is_active = true;

create index if not exists idx_pricing_rules_club_id on public.pricing_rules(club_id);
create index if not exists idx_pricing_rules_club_type on public.pricing_rules(club_id, field_type);

create index if not exists idx_fields_club_id on public.fields(club_id);

create index if not exists idx_field_units_field_id on public.field_units(field_id);
create index if not exists idx_field_units_type on public.field_units(type);

create index if not exists idx_blocks_field_id_date on public.blocks(field_id, date);

create index if not exists idx_block_units_block_id on public.block_units(block_id);
create index if not exists idx_block_units_field_unit_id on public.block_units(field_unit_id);

create index if not exists idx_bookings_user_id on public.bookings(user_id);
create index if not exists idx_bookings_club_id on public.bookings(club_id);
create index if not exists idx_bookings_field_unit_id_date on public.bookings(field_unit_id, date);
create index if not exists idx_bookings_status on public.bookings(status) where status = 'confirmed';

-- ============================================================
-- NOTAS
-- ============================================================
-- pricing_rules es la fuente de verdad para:
-- - precio por hora (por tipo de cancha F5/F7/F11)
-- - duración mínima
-- - incremento permitido (30 min)
-- El frontend solo debe leer esa configuración.
--
-- bookings.club_id es una denormalización intencional para
-- facilitar queries de admin sin hacer joins.
--
-- La exclusion constraint no_overlapping_bookings previene
-- reservas solapadas en la misma field_unit a nivel de DB.
