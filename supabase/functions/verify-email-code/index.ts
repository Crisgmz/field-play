// ============================================================
// EDGE FUNCTION: verify-email-code
// ============================================================
// PURPOSE:
//   Recibe { email, code } y, si el código coincide con el hash
//   activo más reciente y no expiró:
//     * marca consumed_at en email_verifications
//     * marca email_confirmed_at en auth.users vía admin API
//     * devuelve { ok: true }
//
//   Si el código es inválido, incrementa attempts. Tras 5 fallos,
//   invalida el código.
//
// PUBLIC ENDPOINT (no requiere auth, el usuario aún no está
// confirmado al momento de llamar).
//
// DEPLOY:
//   supabase functions deploy verify-email-code
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

const MAX_ATTEMPTS = 5;

async function sha256Hex(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// `auth.admin.listUsers` está paginado (perPage máximo 1000, default 50).
// No tiene filtro por email, así que vamos página por página hasta
// encontrarlo o agotar resultados. Cap defensivo de 10 páginas × 1000 = 10k
// usuarios, suficiente para cualquier club.
interface AuthUserLite {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  user_metadata: Record<string, unknown>;
}

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

interface RequestBody {
  email: string;
  code: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Edge function no configurada.' });
  }

  let payload: RequestBody;
  try {
    payload = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: 'Body JSON inválido.' });
  }
  const email = payload.email?.trim().toLowerCase();
  const rawCode = payload.code?.replace(/\D/g, '') ?? '';
  if (!email || rawCode.length !== 6) {
    return json(400, { error: 'Email y código de 6 dígitos son obligatorios.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Buscar usuario por email.
  const targetUser = await findAuthUserByEmail(admin, email);
  if (!targetUser) {
    return json(404, { error: 'No encontramos una cuenta con ese correo.' });
  }
  if (targetUser.email_confirmed_at) {
    return json(200, { ok: true, already_confirmed: true });
  }

  // 2) Buscar el código activo más reciente.
  const nowIso = new Date().toISOString();
  const { data: verification, error: vErr } = await admin
    .from('email_verifications')
    .select('id, code_hash, expires_at, attempts')
    .eq('user_id', targetUser.id)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (vErr) {
    console.error('Error consultando email_verifications:', vErr);
    return json(500, { error: 'No se pudo procesar la solicitud.' });
  }
  if (!verification) {
    return json(410, {
      error: 'No hay un código activo. Pide uno nuevo desde la pantalla de verificación.',
      reason: 'no_active_code',
    });
  }

  // 3) Comparar hash. Si no coincide, incrementa attempts; si llega al
  //    máximo, marca consumed_at para invalidar el código.
  const inputHash = await sha256Hex(rawCode);
  if (inputHash !== verification.code_hash) {
    const newAttempts = verification.attempts + 1;
    const updates: Record<string, unknown> = { attempts: newAttempts };
    if (newAttempts >= MAX_ATTEMPTS) {
      updates.consumed_at = nowIso;
    }
    await admin.from('email_verifications').update(updates).eq('id', verification.id);

    if (newAttempts >= MAX_ATTEMPTS) {
      return json(429, {
        error: 'Demasiados intentos fallidos. Pide un código nuevo.',
        reason: 'too_many_attempts',
      });
    }

    const remaining = MAX_ATTEMPTS - newAttempts;
    return json(401, {
      error: `Código incorrecto. Te queda${remaining === 1 ? '' : 'n'} ${remaining} intento${remaining === 1 ? '' : 's'}.`,
      reason: 'wrong_code',
      attempts_remaining: remaining,
    });
  }

  // 4) Código válido: marcar como consumido y confirmar email.
  const { error: consumeErr } = await admin
    .from('email_verifications')
    .update({ consumed_at: nowIso })
    .eq('id', verification.id);
  if (consumeErr) {
    console.error('Error marcando código consumido:', consumeErr);
    return json(500, { error: 'No se pudo registrar el consumo del código.' });
  }

  const { error: confirmErr } = await admin.auth.admin.updateUserById(targetUser.id, {
    email_confirm: true,
  });
  if (confirmErr) {
    console.error('Error confirmando email del usuario:', confirmErr);
    return json(500, {
      error: 'No se pudo confirmar el correo. Intenta de nuevo o contacta al soporte.',
    });
  }

  return json(200, { ok: true });
});
