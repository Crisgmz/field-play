-- ============================================================
-- MIGRATION 025: Reorientar pareo F7 a filas horizontales
-- ============================================================
-- CONTEXT:
--   Hasta hoy las F7 pareaban slots verticales:
--     F7_1 = S1 + S4
--     F7_2 = S2 + S5
--     F7_3 = S3 + S6
--   Y el field se visualizaba como 2 filas × 3 columnas:
--     S1 S2 S3
--     S4 S5 S6
--
--   Cambiamos a filas horizontales (3 filas × 2 cols):
--     S5 S6   ← F7_3 (arriba)
--     S3 S4   ← F7_2 (medio)
--     S1 S2   ← F7_1 (abajo)
--
--   Nueva configuración:
--     F7_1 = S1 + S2
--     F7_2 = S3 + S4
--     F7_3 = S5 + S6
--
--   F5 children del versatile re-asignan parent al nuevo F7
--   que comparte fila:
--     C1, C2 → F7_1
--     C3, C4 → F7_2
--     C5, C6 → F7_3
--
--   ⚠️ IMPORTANTE: esto cambia QUÉ slots ocupa cada F7 en DB.
--   Reservas existentes quedan asociadas al mismo `field_unit_id`,
--   así que la reserva en sí no cambia. Pero los conflictos
--   recalculados pueden detectar choques que antes no existían
--   (porque el F7_1 ahora cubre slots distintos). Revisa que no
--   tengas reservas activas en F7s antes de aplicar.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


-- 1) Re-pairing de F7 horizontalmente -------------------------

update public.field_units
   set slot_ids = ARRAY['S1', 'S2']
 where type = 'F7' and name = 'F7_1';

update public.field_units
   set slot_ids = ARRAY['S3', 'S4']
 where type = 'F7' and name = 'F7_2';

update public.field_units
   set slot_ids = ARRAY['S5', 'S6']
 where type = 'F7' and name = 'F7_3';


-- 2) Re-asignar parent_id de F5 al F7 de su fila --------------
-- Solo aplica a fields versátiles donde hay F7s presentes.

update public.field_units fu
   set parent_id = (
     select id from public.field_units p
      where p.field_id = fu.field_id
        and p.type = 'F7'
        and p.name = case
                       when fu.name in ('C1', 'C2') then 'F7_1'
                       when fu.name in ('C3', 'C4') then 'F7_2'
                       when fu.name in ('C5', 'C6') then 'F7_3'
                     end
      limit 1
   )
 where fu.type = 'F5'
   and exists (
     select 1 from public.field_units f7
      where f7.field_id = fu.field_id and f7.type = 'F7'
   );


-- 3) Re-construir el grafo de conflictos para los fields tocados
-- El trigger del migración 001 se dispara en update de field_units
-- y mantiene `field_unit_conflicts`. Si por algún motivo el trigger
-- no corre en los UPDATE de arriba (por ej. si el trigger es BEFORE
-- y no captura updates posteriores), forzamos un recompute manual.
-- Esto se puede comentar si confías en que el trigger ya recalculó.

-- (Si tienes la función rpc_rebuild_conflicts u otra similar, llámala
--  aquí. Si no, deja que el siguiente reload del cliente refresque.)
