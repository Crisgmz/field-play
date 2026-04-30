// ============================================================
// EDGE FUNCTION: request-verification-code
// ============================================================
// PURPOSE:
//   Genera un código de 6 dígitos para verificar la cuenta de un
//   usuario recién registrado. Almacena el SHA-256 del código en
//   public.email_verifications (service_role only) y lo envía al
//   correo del usuario vía Resend con branding de RealPlay.
//
// PUBLIC ENDPOINT:
//   No requiere Authorization (el usuario aún no está confirmado).
//   Mitigamos abuso con:
//     * Rate limit: máx 1 código cada 60 segundos por usuario.
//     * Expiración: 10 minutos.
//     * Si el email no existe o ya está confirmado, devolvemos OK
//       silenciosamente (no filtramos info de cuentas existentes).
//
// DEPLOY:
//   supabase functions deploy request-verification-code
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

async function sha256Hex(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSixDigitCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  // Usamos los 4 bytes como uint32 y tomamos módulo 1_000_000.
  // Sesgo despreciable (10^6 / 2^32 ≈ 0.0233%).
  const value = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
  return value.toString().padStart(6, '0');
}

interface AuthUserLite {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  user_metadata: Record<string, unknown>;
}

// `listUsers` no soporta filtro por email. Paginamos hasta encontrarlo
// o agotar los resultados. Cap defensivo de 10 páginas × 1000 = 10k.
async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<AuthUserLite | null> {
  const PER_PAGE = 1000;
  const MAX_PAGES = 10;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error('listUsers error:', error);
      return null;
    }
    const list = (data?.users ?? []) as Array<{
      id: string;
      email?: string | null;
      email_confirmed_at?: string | null;
      user_metadata?: Record<string, unknown> | null;
    }>;
    const match = list.find((u) => (u.email ?? '').toLowerCase() === email);
    if (match) {
      return {
        id: match.id,
        email: match.email ?? null,
        email_confirmed_at: match.email_confirmed_at ?? null,
        user_metadata: (match.user_metadata ?? {}) as Record<string, unknown>,
      };
    }
    if (list.length < PER_PAGE) break;
  }
  return null;
}

function emailHtml(firstName: string | null, code: string) {
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6; max-width: 560px; margin: 0 auto; padding: 32px;">
      <div style="text-align: center; margin-bottom: 28px;">
        <h1 style="font-size: 28px; font-weight: 800; color: #16a34a; margin: 0;">RealPlay</h1>
        <p style="font-size: 13px; color: #6b7280; margin-top: 4px;">Tu plataforma deportiva</p>
      </div>

      <h2 style="margin: 0 0 12px; font-size: 22px;">${greeting}, verifica tu cuenta</h2>
      <p style="margin: 0 0 18px; font-size: 15px; color: #374151;">
        Para activar tu cuenta de RealPlay, ingresa el siguiente código en la pantalla de verificación:
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 22px; text-align: center; margin: 18px 0;">
        <div style="font-size: 14px; color: #15803d; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600;">
          Código de verificación
        </div>
        <div style="font-size: 40px; font-weight: 800; letter-spacing: 0.2em; color: #14532d; margin-top: 10px; font-family: 'Courier New', monospace;">
          ${code}
        </div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 12px;">
          El código vence en ${CODE_TTL_MINUTES} minutos.
        </div>
      </div>

      <p style="margin: 14px 0; font-size: 13px; color: #6b7280;">
        Si no fuiste tú quien solicitó este código, ignora este mensaje. Tu cuenta seguirá protegida.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;" />

      <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 0;">
        Este correo fue enviado automáticamente por RealPlay. Por favor no respondas a este mensaje.
      </p>
    </div>
  `;
}

interface RequestBody {
  email: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('BOOKING_EMAIL_FROM') ?? 'RealPlay <onboarding@resend.dev>';

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Edge function no configurada (faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY).' });
  }
  if (!resendApiKey) {
    return json(500, { error: 'RESEND_API_KEY no configurada.' });
  }

  let payload: RequestBody;
  try {
    payload = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: 'Body JSON inválido.' });
  }
  const email = payload.email?.trim().toLowerCase();
  if (!email) return json(400, { error: 'email es obligatorio.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Buscar el usuario. Si no existe o ya está confirmado,
  //    devolvemos ok silencioso para no filtrar información.
  const targetUser = await findAuthUserByEmail(admin, email);

  if (!targetUser) {
    // No revelamos que el email no existe; respondemos ok igualmente.
    return json(200, { ok: true });
  }
  if (targetUser.email_confirmed_at) {
    // Cuenta ya confirmada; igualmente respondemos ok.
    return json(200, { ok: true, already_confirmed: true });
  }

  // 2) Rate limit: si hay un código activo creado hace menos de 60s, no spammear.
  const { data: lastActive } = await admin
    .from('email_verifications')
    .select('id, created_at')
    .eq('user_id', targetUser.id)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastActive) {
    const lastCreated = new Date(lastActive.created_at).getTime();
    const elapsedSeconds = Math.floor((Date.now() - lastCreated) / 1000);
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      return json(429, {
        error: `Espera ${RESEND_COOLDOWN_SECONDS - elapsedSeconds} segundos antes de pedir otro código.`,
        retry_after_seconds: RESEND_COOLDOWN_SECONDS - elapsedSeconds,
      });
    }
  }

  // 3) Invalida códigos previos del usuario (si los hay) y crea uno nuevo.
  await admin
    .from('email_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('user_id', targetUser.id)
    .is('consumed_at', null);

  const code = generateSixDigitCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertErr } = await admin.from('email_verifications').insert({
    user_id: targetUser.id,
    email,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempts: 0,
  });

  if (insertErr) {
    console.error('Error guardando código:', insertErr);
    return json(500, { error: 'No se pudo generar el código.', details: insertErr.message });
  }

  // 4) Enviar el email. Si falla, eliminamos el registro para que el
  //    usuario pueda reintentar inmediatamente sin chocar con el
  //    rate-limit.
  const firstName = (targetUser.user_metadata?.first_name as string | undefined) ?? null;
  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'Tu código de verificación de RealPlay',
      html: emailHtml(firstName, code),
    }),
  });

  if (!resendResp.ok) {
    const detail = await resendResp.text().catch(() => '');
    console.error('Resend respondió error:', resendResp.status, detail);
    await admin.from('email_verifications').update({ consumed_at: new Date().toISOString() }).eq('code_hash', codeHash);
    return json(502, { error: 'No se pudo enviar el correo de verificación.' });
  }

  return json(200, { ok: true, expires_at: expiresAt });
});
