-- ============================================================
-- MIGRATION 009: Verificación de cuenta por código de 6 dígitos
-- ============================================================
-- PURPOSE:
--   Reemplaza el flujo de "haz clic en el link del correo" por uno
--   con código numérico de 6 dígitos enviado vía nuestra Edge
--   Function (Resend), con branding de RealPlay.
--
--   La tabla almacena el HASH SHA-256 del código, nunca el código
--   en plano. Cada código:
--     * vive 10 minutos (expires_at)
--     * se invalida al usarse correctamente (consumed_at)
--     * permite hasta 5 intentos antes de invalidarse
--
--   Acceso: solo Edge Functions con service_role pueden leer/escribir.
--   No hay policies para `anon` ni `authenticated`.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega este archivo → Run.
--   Idempotente.
-- ============================================================

create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_verifications_user_active
  on public.email_verifications(user_id)
  where consumed_at is null;

create index if not exists idx_email_verifications_email_active
  on public.email_verifications(lower(email))
  where consumed_at is null;

create index if not exists idx_email_verifications_created
  on public.email_verifications(user_id, created_at desc);

alter table public.email_verifications enable row level security;

-- Bloqueamos explícitamente cualquier acceso desde anon o authenticated.
-- Solo el service_role (Edge Functions) puede operar sobre esta tabla.
drop policy if exists "email_verifications_no_anon" on public.email_verifications;
create policy "email_verifications_no_anon"
on public.email_verifications for all
to anon, authenticated
using (false)
with check (false);

comment on table public.email_verifications is
  'Códigos de verificación de email (signup). Solo accesible vía service_role en Edge Functions.';
comment on column public.email_verifications.code_hash is
  'SHA-256 hex del código de 6 dígitos. Nunca almacenamos el código en plano.';
comment on column public.email_verifications.attempts is
  'Cantidad de intentos fallidos. Al pasar 5, el código se invalida (consumed_at = now()).';

-- Verificación:
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'email_verifications';
