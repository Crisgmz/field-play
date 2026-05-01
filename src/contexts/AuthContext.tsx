import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { LoginInput, RegisterInput, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { sendRegistrationWelcomeEmail } from '@/lib/bookingEmail';

interface UpdateProfileInput {
  first_name?: string;
  last_name?: string;
  phone?: string;
  national_id?: string | null;
}

export type RequestVerificationResult =
  | { ok: true; alreadyConfirmed?: boolean; expiresAt?: string }
  | { ok: false; message: string; retryAfterSeconds?: number };

export type VerifyCodeResult =
  | { ok: true; alreadyConfirmed?: boolean }
  | { ok: false; message: string; reason?: 'wrong_code' | 'too_many_attempts' | 'no_active_code' | 'unknown'; attemptsRemaining?: number };

interface AuthContextType {
  user: User | null;
  login: (payload: LoginInput) => Promise<{ ok: boolean; isAdmin: boolean; isAdminLevel: boolean; message?: string; needsVerification?: boolean }>;
  register: (payload: RegisterInput) => Promise<{ ok: boolean; user?: User; needsVerification?: boolean; email?: string; message?: string }>;
  logout: () => Promise<void>;
  updateProfile: (payload: UpdateProfileInput) => Promise<{ ok: boolean; message?: string }>;
  requestVerificationCode: (email: string) => Promise<RequestVerificationResult>;
  verifyEmailCode: (email: string, code: string) => Promise<VerifyCodeResult>;
  isAdmin: boolean;
  isStaff: boolean;
  isAdminLevel: boolean;
  staffClubId: string | null;
  canManageBookings: boolean;
  canManageBlocks: boolean;
  canManagePricing: boolean;
  canManageClubInfo: boolean;
  canManageFields: boolean;
  canManageVenueConfig: boolean;
  canManageTeam: boolean;
  loading: boolean;
  refreshProfile: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => ({ ok: false, isAdmin: false, isAdminLevel: false }),
  register: async () => ({ ok: false }),
  logout: async () => {},
  updateProfile: async () => ({ ok: false }),
  requestVerificationCode: async () => ({ ok: false, message: 'Sin sesión.' }),
  verifyEmailCode: async () => ({ ok: false, message: 'Sin sesión.' }),
  isAdmin: false,
  isStaff: false,
  isAdminLevel: false,
  staffClubId: null,
  canManageBookings: false,
  canManageBlocks: false,
  canManagePricing: false,
  canManageClubInfo: false,
  canManageFields: false,
  canManageVenueConfig: false,
  canManageTeam: false,
  loading: true,
  refreshProfile: async () => null,
});

const fullName = (user: User) => `${user.first_name} ${user.last_name}`.trim();

// Si Supabase responde muy lento, no queremos colgar el bootstrap.
// 8s es más que suficiente para una query de un solo profile.
const PROFILE_QUERY_TIMEOUT_MS = 8000;

// `PromiseLike` cubre tanto Promises nativos como los thenables que
// devuelven los builders de supabase-js (PostgrestBuilder, etc.).
function withTimeout<T>(thenable: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms);
    thenable.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      },
    );
  });
}

async function loadProfile(session: Session | null): Promise<User | null> {
  if (!session?.user) return null;

  const query = supabase
    .from('profiles')
    .select('id, email, first_name, last_name, phone, national_id, role, staff_club_id, is_active')
    .eq('id', session.user.id)
    .maybeSingle();

  let data: Awaited<typeof query>['data'];
  let error: Awaited<typeof query>['error'];
  try {
    const result = await withTimeout(query, PROFILE_QUERY_TIMEOUT_MS, 'loadProfile');
    data = result.data;
    error = result.error;
  } catch (err) {
    console.error('loadProfile timeout/error:', err);
    return null;
  }

  if (error || !data) {
    return null;
  }

  const extras = data as typeof data & { staff_club_id?: string | null; is_active?: boolean };
  return {
    id: data.id,
    email: data.email,
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
    national_id: data.national_id,
    role: data.role,
    staff_club_id: extras.staff_club_id ?? null,
    is_active: extras.is_active ?? true,
  };
}

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    const profile = await loadProfile(data.session);
    setUser(profile);
    return profile;
  };

  useEffect(() => {
    let mounted = true;

    // Watchdog: si por alguna razón el bootstrap toma más de 10s
    // (Supabase dormido, fetch que cuelga, etc.) forzamos loading=false
    // para que el usuario al menos vea la pantalla de login en vez
    // de un spinner eterno.
    const watchdogId = window.setTimeout(() => {
      if (mounted) {
        console.warn('Auth bootstrap watchdog triggered after 10s. Forzando loading=false.');
        setLoading(false);
      }
    }, 10000);

    const bootstrap = async () => {
      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          PROFILE_QUERY_TIMEOUT_MS,
          'getSession',
        );
        if (sessionResult.error) {
          console.error('Error getting session:', sessionResult.error);
        }
        const profile = await loadProfile(sessionResult.data?.session ?? null);
        if (!mounted) return;
        setUser(profile);
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        if (mounted) {
          window.clearTimeout(watchdogId);
          setLoading(false);
        }
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      try {
        const profile = await loadProfile(session);
        if (!mounted) return;
        setUser(profile);
      } catch (err) {
        console.error('Auth state change error:', err);
      } finally {
        if (mounted) {
          window.clearTimeout(watchdogId);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(watchdogId);
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async ({ email, password }: LoginInput) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      // Supabase devuelve "Email not confirmed" cuando el usuario aún no
      // verificó su cuenta. Surfaceamos eso como needsVerification para
      // que el cliente redirija al flujo de verificación.
      const lower = (error.message ?? '').toLowerCase();
      if (lower.includes('not confirmed') || lower.includes('email_not_confirmed')) {
        return {
          ok: false,
          isAdmin: false,
          isAdminLevel: false,
          needsVerification: true,
          message: 'Tu cuenta aún no ha sido verificada. Te enviamos un código a tu correo.',
        };
      }
      return { ok: false, isAdmin: false, isAdminLevel: false, message: error.message };
    }

    const profile = await refreshProfile();
    if (!profile) {
      return { ok: false, isAdmin: false, isAdminLevel: false, message: 'Sesión iniciada pero no se pudo cargar tu perfil.' };
    }
    if (profile.role === 'staff' && profile.is_active === false) {
      await supabase.auth.signOut();
      setUser(null);
      return { ok: false, isAdmin: false, isAdminLevel: false, message: 'Tu cuenta de empleado está desactivada. Contacta al dueño del club.' };
    }
    const isAdmin = profile.role === 'club_admin';
    const isStaff = profile.role === 'staff';
    return { ok: true, isAdmin, isAdminLevel: isAdmin || isStaff };
  };

  const register = async (payload: RegisterInput) => {
    const normalizedEmail = payload.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: payload.password,
      options: {
        data: {
          first_name: payload.first_name.trim(),
          last_name: payload.last_name.trim(),
          phone: payload.phone.trim(),
          national_id: payload.national_id?.trim() || '',
          // SECURITY: Never trust client-supplied role. Always default to 'client'.
          // Admin role must be granted server-side (e.g., via Supabase dashboard or admin API).
          role: 'client',
        },
      },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    try {
      await sendRegistrationWelcomeEmail({
        email: normalizedEmail,
        firstName: payload.first_name.trim(),
        lastName: payload.last_name.trim(),
      });
    } catch (emailError) {
      console.error('Could not send registration welcome email', emailError);
    }

    // Si Supabase ya devolvió session, la cuenta no requiere verificación
    // (la opción "Confirm email" del proyecto está apagada). Cargamos el
    // profile y entramos directo.
    if (data.session) {
      const profile = await loadProfile(data.session);
      if (profile) setUser(profile);
      return {
        ok: true,
        user: profile ?? undefined,
        message: 'Cuenta creada correctamente.',
      };
    }

    // Sin session => Supabase exige confirmación. Disparamos nuestro
    // código de 6 dígitos vía Edge Function. Ignoramos errores aquí
    // porque la pantalla de verificación tiene botón "Reenviar código".
    void supabase.functions
      .invoke('request-verification-code', { body: { email: normalizedEmail } })
      .catch((err) => console.error('No se pudo enviar el código inicial:', err));

    return {
      ok: true,
      needsVerification: true,
      email: normalizedEmail,
      message: 'Te enviamos un código de 6 dígitos a tu correo. Ingrésalo para activar tu cuenta.',
    };
  };

  const requestVerificationCode = async (email: string): Promise<RequestVerificationResult> => {
    const { data, error } = await supabase.functions.invoke('request-verification-code', {
      body: { email: email.trim().toLowerCase() },
    });

    if (error) {
      console.error('request-verification-code error:', error);
      let serverMessage: string | null = null;
      let retryAfter: number | undefined;
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          serverMessage = body?.error ?? body?.message ?? null;
          retryAfter = typeof body?.retry_after_seconds === 'number' ? body.retry_after_seconds : undefined;
        }
      } catch (parseErr) {
        console.error('No se pudo parsear el error de request-verification-code:', parseErr);
      }
      return {
        ok: false,
        message: serverMessage ?? `No se pudo enviar el código: ${error.message}`,
        retryAfterSeconds: retryAfter,
      };
    }

    const result = data as { ok?: boolean; already_confirmed?: boolean; expires_at?: string };
    if (!result?.ok) {
      return { ok: false, message: 'No se pudo procesar la solicitud.' };
    }
    return { ok: true, alreadyConfirmed: result.already_confirmed, expiresAt: result.expires_at };
  };

  const verifyEmailCode = async (email: string, code: string): Promise<VerifyCodeResult> => {
    const { data, error } = await supabase.functions.invoke('verify-email-code', {
      body: { email: email.trim().toLowerCase(), code: code.trim() },
    });

    if (error) {
      console.error('verify-email-code error:', error);
      let serverMessage: string | null = null;
      let reason: 'wrong_code' | 'too_many_attempts' | 'no_active_code' | 'unknown' = 'unknown';
      let attemptsRemaining: number | undefined;
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          serverMessage = body?.error ?? body?.message ?? null;
          const knownReasons = ['wrong_code', 'too_many_attempts', 'no_active_code'] as const;
          if (typeof body?.reason === 'string' && (knownReasons as readonly string[]).includes(body.reason)) {
            reason = body.reason as typeof reason;
          }
          if (typeof body?.attempts_remaining === 'number') attemptsRemaining = body.attempts_remaining;
        }
      } catch (parseErr) {
        console.error('No se pudo parsear el error de verify-email-code:', parseErr);
      }
      return {
        ok: false,
        message: serverMessage ?? `No se pudo verificar el código: ${error.message}`,
        reason,
        attemptsRemaining,
      };
    }

    const result = data as { ok?: boolean; already_confirmed?: boolean };
    if (!result?.ok) {
      return { ok: false, message: 'No se pudo verificar el código.' };
    }
    return { ok: true, alreadyConfirmed: result.already_confirmed };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile = async (payload: UpdateProfileInput) => {
    if (!user) {
      return { ok: false, message: 'No hay sesión activa.' };
    }

    const updates: Record<string, unknown> = {};
    if (payload.first_name !== undefined) updates.first_name = payload.first_name.trim();
    if (payload.last_name !== undefined) updates.last_name = payload.last_name.trim();
    if (payload.phone !== undefined) updates.phone = payload.phone.trim();
    if (payload.national_id !== undefined) {
      updates.national_id = payload.national_id ? payload.national_id.trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      return { ok: true };
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) {
      return { ok: false, message: error.message };
    }

    await refreshProfile();
    return { ok: true };
  };

  const value = useMemo(() => {
    const isAdmin = user?.role === 'club_admin';
    const isStaff = user?.role === 'staff' && user?.is_active !== false;
    const isAdminLevel = isAdmin || isStaff;
    return {
      user,
      login,
      register,
      logout,
      updateProfile,
      requestVerificationCode,
      verifyEmailCode,
      isAdmin,
      isStaff,
      isAdminLevel,
      staffClubId: user?.staff_club_id ?? null,
      canManageBookings: isAdminLevel,
      canManageBlocks: isAdminLevel,
      canManagePricing: isAdmin,
      canManageClubInfo: isAdmin,
      canManageFields: isAdmin,
      canManageVenueConfig: isAdmin,
      canManageTeam: isAdmin,
      loading,
      refreshProfile,
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const getDisplayName = (user: User | null) => (user ? fullName(user) : '');
