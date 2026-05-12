-- ============================================================
-- MIGRATION 022: Eliminar la auto-cancelación de pendientes vencidas
-- ============================================================
-- CONTEXT:
--   En migración 015 agregamos `rpc_cancel_expired_pending_bookings`
--   que marcaba como `cancelled` con `cancellation_reason = 'AUTO_EXPIRED'`
--   cualquier reserva pending cuyo end_time ya pasó. El cliente
--   la corría en cada reload y cada 5 minutos.
--
--   Quitamos ese comportamiento. Las reservas pendientes vencidas
--   se quedan como pendientes hasta que un admin las cancele
--   manualmente. Las que ya quedaron marcadas como AUTO_EXPIRED
--   en producción se mantienen así — el frontend sigue mostrándolas
--   como "No confirmada" para que no se confundan con cancelaciones
--   normales. Si quieres revertir esas filas a `pending`, hay una
--   query opcional al final.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


-- Drop de la RPC (idempotente)
drop function if exists public.rpc_cancel_expired_pending_bookings();

-- El índice parcial que la apoyaba ya no es necesario.
drop index if exists public.idx_bookings_pending_date;


-- OPCIONAL — revertir bookings que fueron auto-canceladas a pendientes:
--   update public.bookings
--      set status = 'pending',
--          cancellation_reason = null,
--          cancelled_at = null,
--          cancelled_by = null
--    where status = 'cancelled'
--      and cancellation_reason = 'AUTO_EXPIRED';
--
-- Si las dejas como están, la UI las muestra como "No confirmada"
-- (etiqueta gris) hasta que un admin decida qué hacer con ellas.
