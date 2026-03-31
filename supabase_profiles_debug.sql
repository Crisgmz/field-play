-- Debug query for profiles lookup
-- Replace the UUID if needed.

-- 1) Minimal check
select id
from public.profiles
where id = '8563a223-6f3f-4b99-b9b9-34ab6393307d';

-- 2) Full row check
select *
from public.profiles
where id = '8563a223-6f3f-4b99-b9b9-34ab6393307d';

-- 3) Exact column set used by the frontend
select id, email, first_name, last_name, phone, national_id, role
from public.profiles
where id = '8563a223-6f3f-4b99-b9b9-34ab6393307d';

-- 4) Verify actual columns on profiles
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;

-- 5) Inspect RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles';

-- 6) Inspect triggers attached to profiles
select trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'profiles'
order by trigger_name;
