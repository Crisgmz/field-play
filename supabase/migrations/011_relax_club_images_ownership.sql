-- ============================================================
-- MIGRATION 011: Relajar la RLS de club_images
-- ============================================================
-- ANTES: solo el `owner_id` exacto del club podía subir/borrar
--        fotos de la galería. En la práctica esto fallaba para
--        admins legítimos por desfases de auth.uid() vs owner_id.
--
-- AHORA:
--   * Cualquier `club_admin` (rol en JWT) puede gestionar fotos
--     de cualquier club.
--   * Staff puede gestionar solo las del club al que está
--     asignado (consistente con bookings/blocks).
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run. Idempotente.
-- ============================================================


-- 1) Tabla public.club_images ------------------------------

drop policy if exists "club_images_owner_write" on public.club_images;
drop policy if exists "club_images_admin_or_staff_write" on public.club_images;

create policy "club_images_admin_or_staff_write"
on public.club_images for all
using (public.is_admin_or_staff_of_club(club_id))
with check (public.is_admin_or_staff_of_club(club_id));


-- 2) Storage objects (bucket club-images) ------------------
-- Path convention: "<club_id>/<filename>". El primer segmento del
-- path tiene que apuntar a un club que el caller pueda gestionar.

drop policy if exists "club_images_storage_read" on storage.objects;
create policy "club_images_storage_read"
on storage.objects for select
using (bucket_id = 'club-images');

-- INSERT
drop policy if exists "club_images_storage_insert_owner" on storage.objects;
drop policy if exists "club_images_storage_insert_admin" on storage.objects;
create policy "club_images_storage_insert_admin"
on storage.objects for insert
with check (
  bucket_id = 'club-images'
  and (
    public.is_club_admin()
    or (public.is_staff() and public.staff_club_id_jwt()::text = split_part(name, '/', 1))
  )
);

-- UPDATE
drop policy if exists "club_images_storage_update_owner" on storage.objects;
drop policy if exists "club_images_storage_update_admin" on storage.objects;
create policy "club_images_storage_update_admin"
on storage.objects for update
using (
  bucket_id = 'club-images'
  and (
    public.is_club_admin()
    or (public.is_staff() and public.staff_club_id_jwt()::text = split_part(name, '/', 1))
  )
)
with check (
  bucket_id = 'club-images'
  and (
    public.is_club_admin()
    or (public.is_staff() and public.staff_club_id_jwt()::text = split_part(name, '/', 1))
  )
);

-- DELETE
drop policy if exists "club_images_storage_delete_owner" on storage.objects;
drop policy if exists "club_images_storage_delete_admin" on storage.objects;
create policy "club_images_storage_delete_admin"
on storage.objects for delete
using (
  bucket_id = 'club-images'
  and (
    public.is_club_admin()
    or (public.is_staff() and public.staff_club_id_jwt()::text = split_part(name, '/', 1))
  )
);


-- 3) Verificación ------------------------------------------
--   select policyname, cmd from pg_policies
--   where schemaname = 'storage'
--     and tablename = 'objects'
--     and policyname like 'club_images%';
--   -- Debe devolver 4 filas (read, insert, update, delete).
