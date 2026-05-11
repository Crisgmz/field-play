-- ============================================================
-- MIGRATION 015: Auto-cancelar reservas pendientes vencidas
-- ============================================================
-- CONTEXT:
--   Las reservas en estado 'pending' deberían cancelarse solas
--   cuando el horario ya pasó (el cliente no completó el pago a
--   tiempo o el admin no validó el comprobante). Estas reservas
--   se marcan con `cancellation_reason='AUTO_EXPIRED'` para que
--   la UI las muestre como "No confirmada" (vs "Cancelada" normal).
--
--   La función es security-definer y se puede invocar desde
--   cualquier sesión autenticada — solo opera sobre filas
--   universalmente vencidas (no expone información privada).
--   Es idempotente: re-ejecutarla solo actualiza filas nuevas.
--
--   El cliente la llama en `AppDataContext.reload()` y la corre
--   en un intervalo periódico para mantener el estado fresco.
--
-- TIMEZONE:
--   Se asume que `bookings.date` y `bookings.end_time` están en
--   hora local de República Dominicana ('America/Santo_Domingo').
--   El AT TIME ZONE convierte ese timestamp naive a UTC para
--   compararlo con now() (timestamptz).
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega completo y Run.
-- ============================================================


create or replace function public.rpc_cancel_expired_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.bookings
       set status = 'cancelled',
           cancellation_reason = 'AUTO_EXPIRED',
           cancelled_at = now(),
           cancelled_by = null
     where status = 'pending'
       and ((date::timestamp + end_time) at time zone 'America/Santo_Domingo') < now()
     returning id
  )
  select count(*) into v_count from updated;
  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.rpc_cancel_expired_pending_bookings()
  to authenticated, anon;

-- Índice para que el WHERE de arriba escanee solo las pendientes,
-- que son la minoría. No tocamos las cancelled/confirmed.
create index if not exists idx_bookings_pending_date
  on public.bookings (date)
  where status = 'pending';
