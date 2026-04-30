-- ============================================================
-- MIGRATION 008: Bloqueos por rango (batch_id)
-- ============================================================
-- PURPOSE:
--   Permitir crear un bloqueo que cubra varios días con la misma
--   franja horaria (ej: "todos los días de 18:00 a 20:00 desde
--   hoy hasta fin de mes"). Mantenemos UNA fila por día (que es
--   lo que el resto del sistema ya entiende — calendario,
--   conflictos, RPCs) y las agrupamos con `block_batch_id`.
--
--   Eso nos da:
--     * Sin cambios en RPCs ni en RLS de blocks/block_units.
--     * El admin puede borrar el grupo entero con un solo clic.
--     * Bloqueos individuales (un solo día) siguen funcionando
--       igual: batch_id = NULL.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega este archivo → Run.
--   Idempotente.
-- ============================================================

alter table public.blocks
  add column if not exists block_batch_id uuid;

create index if not exists idx_blocks_batch on public.blocks(block_batch_id)
  where block_batch_id is not null;

comment on column public.blocks.block_batch_id is
  'Agrupa varios bloqueos diarios creados de una sola operación (rango de fechas con misma franja horaria). NULL = bloqueo individual.';

-- Verificación:
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='blocks'
--       and column_name='block_batch_id';
--   -- Debe devolver 1 fila.
