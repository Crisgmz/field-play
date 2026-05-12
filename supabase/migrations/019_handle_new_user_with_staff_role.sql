-- ============================================================
-- MIGRATION 019: handle_new_user propaga staff_role del metadata
-- ============================================================
-- CONTEXT:
--   El trigger de migración 006 lee role + staff_club_id del JWT
--   pero no conoce `staff_role` (agregado en migración 016).
--   Como ahora vamos a crear empleados desde el frontend con
--   `supabase.auth.signUp()`, necesitamos que el trigger termine
--   el trabajo: leer staff_role del user_metadata y persistirlo
--   en `profiles.staff_role`.
--
--   Sin esto, el admin tendría que hacer un UPDATE manual después
--   del signUp para grabar el sub-rol — sujeto a RLS y race
--   conditions. Con el trigger actualizado, una sola llamada
--   signUp deja el profile completo.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_staff_club_id uuid;
  v_staff_role text;
begin
  v_role := coalesce(new.raw_user_meta_data ->> 'role', 'client');
  v_staff_club_id := nullif(new.raw_user_meta_data ->> 'staff_club_id', '')::uuid;
  v_staff_role := nullif(new.raw_user_meta_data ->> 'staff_role', '');

  -- Defensive: only staff carries a staff_club_id / staff_role.
  if v_role <> 'staff' then
    v_staff_club_id := null;
    v_staff_role := null;
  end if;

  -- Validamos staff_role contra los 3 valores aceptados; si llega
  -- algo raro lo dejamos null para no romper el check constraint.
  if v_staff_role is not null
     and v_staff_role not in ('groundskeeper', 'receptionist', 'accountant') then
    v_staff_role := null;
  end if;

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    national_id,
    role,
    staff_club_id,
    staff_role
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'national_id', ''),
    v_role,
    v_staff_club_id,
    v_staff_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
