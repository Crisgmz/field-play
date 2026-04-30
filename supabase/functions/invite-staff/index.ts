// ============================================================
// EDGE FUNCTION: invite-staff (a.k.a. create-staff)
// ============================================================
// PURPOSE:
//   Allow a club_admin to CREATE an employee account directly with
//   email + password. The admin shares the credentials with the
//   employee out-of-band; the employee can sign in immediately.
//
//   (We keep the URL `invite-staff` so older deploys still work.)
//
// SECURITY:
//   - Requires Authorization: Bearer <user JWT>.
//   - Verifies the caller is a club_admin AND the owner of the
//     target club_id BEFORE creating the user.
//   - Service role key never leaves the function.
//
// REUSE OF EXISTING ACCOUNTS:
//   - If the email already exists in auth.users with role='client',
//     we DO NOT change their password. We upgrade their profile to
//     staff and update user_metadata. The admin must already know
//     their existing password (or they can use Forgot Password).
//   - If they're already staff at another club, or already a club_admin,
//     we reject the request.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateStaffRequest {
  email: string;
  password: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  club_id: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(500, { error: 'La función no está configurada (faltan variables de entorno).' });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { error: 'Falta el header Authorization.' });
  }

  let payload: CreateStaffRequest;
  try {
    payload = (await req.json()) as CreateStaffRequest;
  } catch {
    return json(400, { error: 'Body JSON inválido.' });
  }

  const { email, password, first_name, last_name, phone, club_id } = payload;
  if (!email || !first_name || !club_id) {
    return json(400, { error: 'email, first_name y club_id son obligatorios.' });
  }
  if (!password || password.length < 8) {
    return json(400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1) Identify the caller from their JWT.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerUserData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerUserData?.user) {
    return json(401, { error: 'Sesión inválida o expirada.' });
  }
  const callerId = callerUserData.user.id;

  // 2) Service-role client for privileged ops.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3) Confirm caller is a club_admin AND owns the target club.
  const { data: club, error: clubErr } = await adminClient
    .from('clubs')
    .select('id, owner_id')
    .eq('id', club_id)
    .maybeSingle();
  if (clubErr) return json(500, { error: 'No se pudo cargar el club.', details: clubErr.message });
  if (!club) return json(404, { error: 'Club no encontrado.' });
  if (club.owner_id !== callerId) {
    return json(403, { error: 'Solo el dueño de este club puede crear empleados.' });
  }

  const { data: callerProfile, error: callerProfileErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (callerProfileErr) {
    return json(500, { error: 'No se pudo cargar el perfil del solicitante.', details: callerProfileErr.message });
  }
  if (callerProfile?.role !== 'club_admin') {
    return json(403, { error: 'Solo cuentas con rol de administrador pueden crear empleados.' });
  }

  // 4) Branch: existing user vs new account.
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id, role, staff_club_id, email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.role === 'club_admin') {
      return json(409, { error: 'Este email pertenece a otro administrador y no puede ser asignado como empleado.' });
    }
    if (existingProfile.role === 'staff' && existingProfile.staff_club_id !== club_id) {
      return json(409, { error: 'Este email ya está asignado como empleado a otro club.' });
    }

    const { error: upgradeErr } = await adminClient
      .from('profiles')
      .update({
        role: 'staff',
        staff_club_id: club_id,
        is_active: true,
        first_name,
        last_name: last_name ?? '',
        phone: phone ?? '',
      })
      .eq('id', existingProfile.id);
    if (upgradeErr) {
      return json(500, { error: 'No se pudo actualizar el perfil existente.', details: upgradeErr.message });
    }

    // Re-sync user_metadata so RLS helpers (which read from JWT) work
    // on the user's next sign-in or token refresh.
    const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(existingProfile.id, {
      user_metadata: {
        role: 'staff',
        staff_club_id: club_id,
        first_name,
        last_name: last_name ?? '',
        phone: phone ?? '',
      },
    });
    if (updateAuthErr) {
      return json(500, { error: 'No se pudo actualizar la metadata de auth.', details: updateAuthErr.message });
    }

    return json(200, {
      ok: true,
      mode: 'upgraded',
      user_id: existingProfile.id,
      message: 'La cuenta ya existía y se actualizó a empleado. El usuario debe usar su contraseña actual (o "Olvidé mi contraseña" si la perdió).',
    });
  }

  // 5) New user flow: create with email + password, auto-confirmed.
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'staff',
      staff_club_id: club_id,
      first_name,
      last_name: last_name ?? '',
      phone: phone ?? '',
    },
  });

  if (createErr || !created?.user) {
    const message = createErr?.message ?? 'Error desconocido.';
    if (message.toLowerCase().includes('already')) {
      return json(409, { error: 'Ya existe una cuenta con ese email pero el perfil no se sincronizó. Contacta al administrador del sistema.' });
    }
    return json(500, { error: 'No se pudo crear el empleado.', details: message });
  }

  return json(200, {
    ok: true,
    mode: 'created',
    user_id: created.user.id,
    message: 'Empleado creado correctamente. Comparte el email y contraseña con tu empleado.',
  });
});
