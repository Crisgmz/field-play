-- ============================================================
-- MIGRATION 020: Sub-rol 'admin' de staff + flag de cambio de contraseña
-- ============================================================
-- CONTEXT:
--   1) Agregamos 'admin' como cuarto staff_role. A diferencia de
--      los otros 3 sub-roles (groundskeeper, receptionist,
--      accountant), el admin tiene TODOS los permisos. Su acceso
--      es equivalente al del dueño del club excepto que no es
--      propietario — es un "manager con full poder".
--
--      Para que pueda crear clubes / canchas / precios etc.
--      (operaciones protegidas por RLS con `is_club_admin()`),
--      actualizamos esa función para reconocer staff con
--      `staff_role = 'admin'` como admin-level.
--
--   2) Agregamos `must_change_password` a profiles. Cuando un
--      administrador crea un empleado con una contraseña inicial,
--      ese empleado debe cambiarla en su primer login. El frontend
--      bloquea la UI hasta que el cambio ocurra.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


-- 1) Aceptar 'admin' como staff_role válido --------------------

alter table public.profiles
  drop constraint if exists profiles_staff_role_check;
alter table public.profiles
  add constraint profiles_staff_role_check
  check (
    staff_role is null
    or staff_role in ('groundskeeper', 'receptionist', 'accountant', 'admin')
  );


-- 2) is_club_admin() ahora también acepta staff con sub-rol admin

create or replace function public.is_club_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'club_admin'
    or (
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff'
      and (auth.jwt() -> 'user_metadata' ->> 'staff_role') = 'admin'
    ),
    false
  );
$$;


-- 3) Trigger handle_new_user: incluir 'admin' en validación ----
-- Re-define con el nuevo valor permitido (extends migración 019).

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

  if v_role <> 'staff' then
    v_staff_club_id := null;
    v_staff_role := null;
  end if;

  if v_staff_role is not null
     and v_staff_role not in ('groundskeeper', 'receptionist', 'accountant', 'admin') then
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
    staff_role,
    must_change_password
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'national_id', ''),
    v_role,
    v_staff_club_id,
    v_staff_role,
    -- Si vinieron metadata explícita pidiendo cambio de contraseña
    -- en primer login (admin creando un empleado), respétalo.
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- 4) Columna must_change_password ------------------------------

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;


-- 5) RPC para que el usuario marque su propia contraseña como cambiada
--    El frontend la llama después de actualizar exitosamente
--    la contraseña via `supabase.auth.updateUser({ password })`.

create or replace function public.rpc_mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.profiles
     set must_change_password = false
   where id = v_actor_id;
end;
$$;

grant execute on function public.rpc_mark_password_changed() to authenticated;


-- 6) Whitelist del RPC `rpc_set_staff_permission` no requiere
--    cambios — sigue validando keys de permisos, no el sub-rol.
--    Solo el frontend decide qué hacer cuando staff_role='admin'.
