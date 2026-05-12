-- ============================================================
-- MIGRATION 023: Permitir a TODO staff leer profiles
-- ============================================================
-- CONTEXT:
--   La política `profiles_select_admin` (definida en base de datos.sql)
--   solo permite SELECT a quien pase `is_club_admin()`. Eso cubre
--   `club_admin` y staff con sub-rol `admin`, pero deja fuera a
--   recepción, encargado de cancha y contable. Resultado: cuando la
--   recepcionista abre una reserva no ve nombre/email/teléfono del
--   cliente porque su query a profiles devuelve vacío.
--
--   Esta migración cambia la política para usar `is_admin_level()`
--   (helper de migración 021) que retorna true para CUALQUIER staff
--   o club_admin. Cualquier usuario admin-level puede leer perfiles.
--
--   `is_admin_level()` se creó en la migración 021. Si esa todavía no
--   está aplicada, aplícala primero.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
on public.profiles for select
using (public.is_admin_level());

-- Verificación:
--   select policyname, qual from pg_policies
--    where schemaname = 'public' and tablename = 'profiles';
--   -- profiles_select_admin debe tener qual: public.is_admin_level()
