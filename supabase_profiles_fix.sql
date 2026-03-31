-- Potential fixes for profiles lookup issues in Supabase
-- Review before running in production.

-- 1) Make sure RLS is enabled intentionally
alter table public.profiles enable row level security;

-- 2) Example policy: users can read their own profile
-- Drop/recreate only if needed.
-- drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- 3) Optional: allow users to update their own profile
-- drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 4) If a column in the frontend select does not exist, inspect and adjust the app query.
-- Expected columns used by the frontend:
-- id, email, first_name, last_name, phone, national_id, role

-- 5) Safe verification query
select id, email, first_name, last_name, phone, national_id, role
from public.profiles
where id = '8563a223-6f3f-4b99-b9b9-34ab6393307d';
