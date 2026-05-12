-- ============================================================
-- MIGRATION 024: Flag de onboarding tour visto
-- ============================================================
-- CONTEXT:
--   Para guiar al cliente la primera vez que entra a la app
--   tras registrarse, mostramos un tour interactivo con
--   react-joyride. La flag `has_seen_onboarding` indica si el
--   cliente ya pasó (o saltó) ese tour, así no lo vemos cada vez
--   que entra.
--
--   Default para nuevos signups: FALSE (verán el tour).
--   Para los profiles existentes en producción: backfill a TRUE
--   (ya conocen la app, no queremos mostrarles el tour).
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


-- 1) Agregar la columna con default false (nuevos signups verán el tour).
alter table public.profiles
  add column if not exists has_seen_onboarding boolean not null default false;

-- 2) Backfill: marcar como vistos a TODOS los profiles existentes.
--    Los que se creen después de esta migración seguirán con default false.
update public.profiles
   set has_seen_onboarding = true
 where has_seen_onboarding = false;


-- 3) RPC para que el cliente marque su propio tour como visto.
--    Lo llamamos cuando completa o salta el tour.
create or replace function public.rpc_mark_onboarding_seen()
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
     set has_seen_onboarding = true
   where id = v_actor_id;
end;
$$;

grant execute on function public.rpc_mark_onboarding_seen() to authenticated;


-- 4) RPC opcional para que el cliente pueda RE-disparar el tour
--    desde Mi perfil ("Ver tutorial otra vez").
create or replace function public.rpc_reset_onboarding()
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
     set has_seen_onboarding = false
   where id = v_actor_id;
end;
$$;

grant execute on function public.rpc_reset_onboarding() to authenticated;
