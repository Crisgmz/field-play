-- ============================================================
-- MIGRATION 016: Sub-roles de staff + permisos extras por usuario
-- ============================================================
-- CONTEXT:
--   Hasta hoy el rol 'staff' era monolítico: todos los staff
--   tenían los mismos permisos. Esta migración:
--
--   1) Agrega `staff_role` a `profiles` con 3 sub-tipos:
--        - groundskeeper  (Encargado de cancha)
--        - receptionist   (Recepción / Secretaria)
--        - accountant     (Contable)
--      Los permisos base por sub-rol se definen en el frontend
--      (AuthContext) — la matriz queda documentada en código.
--
--   2) Agrega `extra_permissions` como JSONB de overrides
--      por-usuario. Si la admin quiere que UNA secretaria
--      específica pueda crear canchas (algo que no permite el
--      rol Recepción por defecto), graba la excepción ahí.
--      El frontend hace: permisoFinal = baseDelRol || override.
--
--   3) Provee un RPC `rpc_set_staff_permission` para que la UI
--      admin pueda otorgar/revocar permisos sin SQL manual.
--      Solo club_admins pueden invocarlo.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega completo y Run.
--   Idempotente.
-- ============================================================


-- 1) Columna `staff_role` -------------------------------------

alter table public.profiles
  add column if not exists staff_role text;

alter table public.profiles
  drop constraint if exists profiles_staff_role_check;
alter table public.profiles
  add constraint profiles_staff_role_check
  check (
    staff_role is null
    or staff_role in ('groundskeeper', 'receptionist', 'accountant')
  );

-- Si role != 'staff', staff_role debe ser null. Si role = 'staff',
-- staff_role puede ser null (legacy) o uno de los 3 sub-tipos.
alter table public.profiles
  drop constraint if exists profiles_staff_role_consistency;
alter table public.profiles
  add constraint profiles_staff_role_consistency
  check (role = 'staff' or staff_role is null);


-- 2) Columna `extra_permissions` ------------------------------
-- JSONB con overrides por permiso. Ejemplo de contenido:
--   { "canManageFields": true, "canManageTeam": false }
-- Si una llave no está, se usa el permiso base del rol.

alter table public.profiles
  add column if not exists extra_permissions jsonb not null default '{}'::jsonb;

-- Índice GIN para queries futuras tipo "todos los que tengan tal permiso".
create index if not exists idx_profiles_extra_permissions
  on public.profiles
  using gin (extra_permissions);


-- 3) RPC: otorgar / revocar permiso extra ---------------------

create or replace function public.rpc_set_staff_permission(
  p_profile_id uuid,
  p_permission text,
  p_granted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_new_permissions jsonb;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Solo club_admins pueden modificar permisos extras.
  select role into v_actor_role
  from public.profiles
  where id = v_actor_id;

  if v_actor_role <> 'club_admin' then
    raise exception 'FORBIDDEN: only club_admin can modify permissions';
  end if;

  -- El target debe existir y ser un staff (no se puede dar permisos
  -- a clientes ni a otros admins).
  select role into v_target_role
  from public.profiles
  where id = p_profile_id;

  if v_target_role is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_target_role <> 'staff' then
    raise exception 'INVALID_TARGET: extra permissions only apply to staff';
  end if;

  -- Whitelist de permisos válidos — evita que la UI guarde llaves
  -- arbitrarias por error de tipeo. Si añades un permiso nuevo en
  -- el frontend, agrégalo también acá.
  if p_permission not in (
    'canManageBookings',
    'canManageBlocks',
    'canManagePricing',
    'canManageClubInfo',
    'canManageFields',
    'canManageVenueConfig',
    'canManageTeam',
    'canViewReports',
    'canManagePayments',
    'canManageClients'
  ) then
    raise exception 'INVALID_PERMISSION: %', p_permission;
  end if;

  update public.profiles
  set extra_permissions = extra_permissions || jsonb_build_object(p_permission, p_granted)
  where id = p_profile_id
  returning extra_permissions into v_new_permissions;

  return jsonb_build_object(
    'profile_id', p_profile_id,
    'permission', p_permission,
    'granted', p_granted,
    'extra_permissions', v_new_permissions
  );
end;
$$;

grant execute on function public.rpc_set_staff_permission(uuid, text, boolean)
  to authenticated;


-- 4) RPC opcional: limpiar override (volver al default del rol) ---

create or replace function public.rpc_reset_staff_permission(
  p_profile_id uuid,
  p_permission text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_new_permissions jsonb;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select role into v_actor_role
  from public.profiles
  where id = v_actor_id;

  if v_actor_role <> 'club_admin' then
    raise exception 'FORBIDDEN';
  end if;

  update public.profiles
  set extra_permissions = extra_permissions - p_permission
  where id = p_profile_id
  returning extra_permissions into v_new_permissions;

  return jsonb_build_object(
    'profile_id', p_profile_id,
    'permission', p_permission,
    'extra_permissions', v_new_permissions
  );
end;
$$;

grant execute on function public.rpc_reset_staff_permission(uuid, text)
  to authenticated;


-- ============================================================
-- EJEMPLOS DE USO
-- ============================================================
--
-- Caso 1 — Tu ejemplo: que María (recepcionista) pueda crear canchas:
--
--   select public.rpc_set_staff_permission(
--     (select id from public.profiles where email = 'maria@club.com'),
--     'canManageFields',
--     true
--   );
--
-- O directamente sin RPC (solo si lo corres como service_role):
--
--   update public.profiles
--     set extra_permissions = extra_permissions || '{"canManageFields": true}'::jsonb
--     where email = 'maria@club.com';
--
--
-- Caso 2 — Revocar ese permiso extra (vuelve al default del rol):
--
--   select public.rpc_reset_staff_permission(
--     (select id from public.profiles where email = 'maria@club.com'),
--     'canManageFields'
--   );
--
--
-- Caso 3 — Otorgar al contable acceso temporal a ver clientes:
--
--   select public.rpc_set_staff_permission(
--     (select id from public.profiles where email = 'contador@club.com'),
--     'canManageClients',
--     true
--   );
--
--
-- Caso 4 — Inspeccionar permisos de un usuario:
--
--   select email, role, staff_role, extra_permissions
--   from public.profiles
--   where email = 'maria@club.com';
-- ============================================================
