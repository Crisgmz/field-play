-- ============================================================
-- MIGRATION 018: Cascade delete desde clubs y field_units
-- ============================================================
-- CONTEXT:
--   `bookings.club_id` y `bookings.field_unit_id` están como
--   `ON DELETE RESTRICT`, lo que impide borrar un club o una
--   unidad si existen reservas (incluso canceladas). Para que
--   el admin pueda eliminar un club completo sin SQL manual,
--   cambiamos esos FKs a `ON DELETE CASCADE` — borrar un club
--   ahora arrastra automáticamente sus reservas y bloqueos.
--
--   Trade-off: se pierde el historial de reservas del club
--   borrado. Si necesitas conservar historial, usa el soft
--   delete que ya existe (`is_active = false`) en lugar de
--   borrar físicamente.
--
--   Las demás tablas dependientes (`field_units`, `fields`,
--   `pricing_rules`, `club_images`, `venue_configs`,
--   `blocks → field_id`) YA cascadean correctamente.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega completo y Run.
--   Idempotente: dropea y recrea las constraints.
-- ============================================================


-- 1) bookings.club_id → ON DELETE CASCADE -------------------

alter table public.bookings
  drop constraint if exists bookings_club_id_fkey;
alter table public.bookings
  add constraint bookings_club_id_fkey
  foreign key (club_id)
  references public.clubs(id)
  on delete cascade;


-- 2) bookings.field_unit_id → ON DELETE CASCADE -------------
-- También cascadea cuando se borra una unidad (ej. al eliminar
-- una cancha física). Si una unit se borra, los bookings
-- históricos asociados también.

alter table public.bookings
  drop constraint if exists bookings_field_unit_id_fkey;
alter table public.bookings
  add constraint bookings_field_unit_id_fkey
  foreign key (field_unit_id)
  references public.field_units(id)
  on delete cascade;


-- 3) Verificación ------------------------------------------
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.bookings'::regclass
--      and conname in (
--        'bookings_club_id_fkey',
--        'bookings_field_unit_id_fkey'
--      );
--   -- Cada definición debe incluir "ON DELETE CASCADE".
