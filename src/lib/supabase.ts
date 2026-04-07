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
