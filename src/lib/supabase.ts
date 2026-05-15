import { createClient } from '@supabase/supabase-js';

const sanitizeEnv = (value: string | undefined) =>
  value
    ?.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();

const supabaseUrl = sanitizeEnv(import.meta.env.VITE_SUPABASE_URL)?.replace(/\/+$/, '');
const supabaseAnonKey = sanitizeEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Cliente Supabase aislado para signUps que el admin ejecuta en nombre
 * de otro usuario (crear empleado, crear cliente walk-in).
 *
 * `supabase.auth.signUp()` siempre setea el nuevo usuario como la
 * sesión activa del cliente y emite `SIGNED_IN`, lo que hace que el
 * AuthContext de la app re-renderice como ese nuevo usuario hasta
 * que restauramos la sesión admin. El usuario veía un "flash" del
 * perfil del cliente recién creado.
 *
 * Este cliente:
 *   - No persiste sesión (`persistSession: false`)
 *   - No auto-refresca tokens (no le interesan)
 *   - Usa un storageKey distinto para no interferir con el principal
 *
 * Como resultado, el signUp crea al usuario en DB (vía el trigger
 * `handle_new_user`) pero el cliente principal `supabase` nunca se
 * entera del cambio de sesión.
 */
export const supabaseSignupClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-signup-only',
  },
});
