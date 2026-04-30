-- ============================================================
-- MIGRATION 007: Corrige el pareo de slots de las canchas F7
-- ============================================================
-- CONTEXT:
--   Las canchas F7 estaban configuradas con pares horizontales
--   (S1+S2, S3+S4, S5+S6), pero la cancha física se compone como
--   un grid de 2 filas x 3 columnas:
--
--     S1 | S2 | S3       ← fila superior
--     ---+----+---
--     S4 | S5 | S6       ← fila inferior
--
--   Una cancha F7 ocupa una columna completa (mitad longitudinal),
--   no media fila. Por tanto los pares correctos son:
--     F7_1 = S1+S4
--     F7_2 = S2+S5
--     F7_3 = S3+S6
--
--   Esta migración:
--     1) Reescribe slot_ids de las unidades F7 existentes.
--     2) Reasigna parent_id de las unidades F5 al F7 correcto
--        de su columna.
--
--   field_unit_conflicts se recomputa automáticamente vía trigger
--   cuando se actualiza slot_ids (ver migración 001).
--
--   Las reservas ya creadas no se ven afectadas: referencian
--   field_unit_id, no slot_ids.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pegar este archivo → Run.
--   Idempotente.
-- ============================================================

begin;

-- 1) Reasignar slot_ids de las unidades F7 mal configuradas ----
--    Detectamos por la combinación exacta de slot_ids antiguos
--    para no tocar canchas que ya estén bien.

update public.field_units
set slot_ids = array['S1','S4']::text[]
where type = 'F7'
  and slot_ids = array['S1','S2']::text[];

update public.field_units
set slot_ids = array['S2','S5']::text[]
where type = 'F7'
  and slot_ids = array['S3','S4']::text[];

update public.field_units
set slot_ids = array['S3','S6']::text[]
where type = 'F7'
  and slot_ids = array['S5','S6']::text[];


-- 2) Reasignar parent_id de las unidades F5 al F7 correcto -----
--    En layouts versátiles cada F5 tiene parent_id = F7 de su columna.
--    Con el nuevo pareo:
--      S1, S4 → F7 con slots [S1,S4]
--      S2, S5 → F7 con slots [S2,S5]
--      S3, S6 → F7 con slots [S3,S6]

with f7_by_field as (
  select
    f7.id   as f7_id,
    f7.field_id,
    f7.slot_ids
  from public.field_units f7
  where f7.type = 'F7'
)
update public.field_units f5
set parent_id = (
  select f7_by_field.f7_id
  from f7_by_field
  where f7_by_field.field_id = f5.field_id
    and f5.slot_ids[1] = any(f7_by_field.slot_ids)
  limit 1
)
where f5.type = 'F5'
  and array_length(f5.slot_ids, 1) = 1
  and exists (
    select 1 from f7_by_field
    where f7_by_field.field_id = f5.field_id
  );


-- 3) Verificación ----------------------------------------------
-- Después de aplicar, ejecuta:
--
--   select fu.name, fu.type, fu.slot_ids
--   from public.field_units fu
--   where fu.type = 'F7'
--   order by fu.field_id, fu.name;
--
--   -- Debería devolver para cada cancha versátil:
--   --   F7_1  {S1,S4}
--   --   F7_2  {S2,S5}
--   --   F7_3  {S3,S6}
--
--   -- Y los conflictos se deben haber recomputado automáticamente:
--   select count(*) from public.field_unit_conflicts;

commit;
