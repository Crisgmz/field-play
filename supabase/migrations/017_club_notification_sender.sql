-- ============================================================
-- MIGRATION 017: Configuración de remitente de notificaciones por club
-- ============================================================
-- CONTEXT:
--   Hasta ahora todos los emails transaccionales salían con el
--   remitente hardcodeado en la variable de entorno `BOOKING_EMAIL_FROM`
--   de las Edge Functions. Cada club ahora puede configurar SU PROPIO
--   correo y nombre de remitente para las notificaciones de reservas
--   de SU club (confirmación, cancelación, comprobante recibido, etc).
--
--   Si el club no configura nada, las Edge Functions caen al default
--   de la variable de entorno (comportamiento previo).
--
--   IMPORTANTE PARA EL USUARIO:
--   El dominio del correo configurado debe estar verificado en Resend.
--   Si no, el email no se enviará. La UI debe avisar de esto.
--
--   Los emails de sistema (verificación de cuenta, recuperación de
--   contraseña) NO usan esta configuración — siguen con el remitente
--   genérico de la plataforma.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega completo y Run.
--   Idempotente.
-- ============================================================


alter table public.clubs
  add column if not exists notification_email text,
  add column if not exists notification_sender_name text;

-- Validación básica de formato — un check simple, no exhaustivo.
-- Si no cumple, el club puede seguir operando y los emails caen al
-- default del entorno.
alter table public.clubs
  drop constraint if exists clubs_notification_email_format;
alter table public.clubs
  add constraint clubs_notification_email_format
  check (
    notification_email is null
    or notification_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

-- Inspección rápida:
--   select id, name, notification_email, notification_sender_name from clubs;
