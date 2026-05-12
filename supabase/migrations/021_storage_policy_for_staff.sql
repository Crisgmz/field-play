-- ============================================================
-- MIGRATION 021: Permitir a staff ver/modificar booking-proofs
-- ============================================================
-- CONTEXT:
--   Las políticas RLS del bucket `booking-proofs` (migración 003)
--   solo permitían acceso al dueño del archivo o a usuarios que
--   pasaran `is_club_admin()` — eso bloqueaba a sub-roles staff
--   como recepción o contable, que también necesitan ver el
--   comprobante para validar pagos.
--
--   Esta migración relaja las políticas para aceptar cualquier
--   usuario admin-level (club_admin o cualquier staff). El
--   frontend sigue gateando por permiso fino (canManagePayments)
--   en la UI; este cambio solo desbloquea storage para que el
--   archivo sí baje cuando el usuario pasa la barra de UI.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


-- Helper: true si el JWT pertenece a un usuario admin-level
-- (club_admin O cualquier staff activo).
create or replace function public.is_admin_level()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('club_admin', 'staff'),
    false
  );
$$;


-- Reemplazamos las 3 políticas que usaban `is_club_admin()` por
-- `is_admin_level()` en booking-proofs.

drop policy if exists "booking_proofs_select_own_or_admin" on storage.objects;
create policy "booking_proofs_select_own_or_admin"
on storage.objects for select
using (
  bucket_id = 'booking-proofs'
  and (
    public.is_admin_level()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
);

drop policy if exists "booking_proofs_update_own_or_admin" on storage.objects;
create policy "booking_proofs_update_own_or_admin"
on storage.objects for update
using (
  bucket_id = 'booking-proofs'
  and (
    public.is_admin_level()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
)
with check (
  bucket_id = 'booking-proofs'
  and (
    public.is_admin_level()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
);

drop policy if exists "booking_proofs_delete_own_or_admin" on storage.objects;
create policy "booking_proofs_delete_own_or_admin"
on storage.objects for delete
using (
  bucket_id = 'booking-proofs'
  and (
    public.is_admin_level()
    or (auth.uid() is not null and name like auth.uid()::text || '/%')
  )
);
