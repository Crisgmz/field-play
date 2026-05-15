-- ============================================================
-- MIGRATION 026: Permitir a TODO staff cancelar reservas
-- ============================================================
-- CONTEXT:
--   `rpc_cancel_booking` (migración 004) restringe la cancelación
--   al dueño de la reserva, al dueño del club, o a quien pase
--   `is_club_admin()`. Esto último solo cubre club_admin y staff
--   con sub-rol 'admin' (post migración 020). Recepción, encargado
--   y contable reciben FORBIDDEN aunque tengan acceso al calendario.
--
--   Esta migración relaja la validación: cualquier admin-level
--   (club_admin o cualquier staff activo) puede cancelar.
--
--   Solo afecta CANCELACIÓN. Confirmación (rpc_confirm_booking) y
--   rechazo de comprobante (rpc_reject_booking) siguen restringidas
--   al dueño / club_admin / staff admin, porque son acciones que
--   afectan la validación de pago y el cliente recibe notificación
--   específica.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
-- ============================================================


create or replace function public.rpc_cancel_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_is_owner_of_booking boolean;
  v_is_club_owner boolean;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  v_is_owner_of_booking := v_booking.user_id = v_actor_id;

  select exists (
    select 1 from public.clubs c
    where c.id = v_booking.club_id and c.owner_id = v_actor_id
  ) into v_is_club_owner;

  -- Permitimos cancelar al dueño de la reserva, al dueño del club,
  -- a cualquier admin-level (club_admin o cualquier staff).
  if not (
    v_is_owner_of_booking
    or v_is_club_owner
    or public.is_admin_level()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;

  update public.bookings
    set status = 'cancelled',
        cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        cancelled_at = now(),
        cancelled_by = v_actor_id
    where id = p_booking_id
    returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'status', v_booking.status,
    'cancellation_reason', v_booking.cancellation_reason,
    'cancelled_at', v_booking.cancelled_at,
    'cancelled_by', v_booking.cancelled_by
  );
end;
$$;

-- Verificación:
--   select pg_get_functiondef(oid) from pg_proc
--    where proname = 'rpc_cancel_booking' and pronamespace = 'public'::regnamespace;
--   -- Debe usar `is_admin_level()` en el check de permisos.
