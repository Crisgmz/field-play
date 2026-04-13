import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { LoginInput, RegisterInput, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { sendRegistrationWelcomeEmail } from '@/lib/bookingEmail';

interface AuthContextType {
  user: User | null;
  login: (payload: LoginInput) => Promise<{ ok: boolean; isAdmin: boolean; message?: string }>;
  register: (payload: RegisterInput) => Promise<{ ok: boolean; user?: User; message?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => ({ ok: false, isAdmin: false }),
  register: async () => ({ ok: false }),
  logout: async () => {},
  isAdmin: false,
  loading: true,
  refreshProfile: async () => null,
});

const fullName = (user: User) => `${user.first_name} ${user.last_name}`.trim();

async function loadProfile(session: Session | null): Promise<User | null> {
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, phone, national_id, role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
    national_id: data.national_id,
    role: data.role,
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

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error getting session:", error);
        }
        const profile = await loadProfile(data?.session || null);
        if (!mounted) return;
        setUser(profile);
      } catch (err) {
        console.error("Bootstrap error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      try {
        const profile = await loadProfile(session);
        if (!mounted) return;
        setUser(profile);
      } catch (err) {
        console.error("Auth state change error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async ({ email, password }: LoginInput) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return { ok: false, isAdmin: false, message: error.message };
    }

    const profile = await refreshProfile();
    if (!profile) {
      return { ok: false, isAdmin: false, message: "Sesión iniciada pero no se pudo cargar tu perfil." };
    }
    return { ok: true, isAdmin: profile.role === 'club_admin' };
  };

  const register = async (payload: RegisterInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email.trim().toLowerCase(),
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
        email: payload.email.trim().toLowerCase(),
        firstName: payload.first_name.trim(),
        lastName: payload.last_name.trim(),
      });
    } catch (emailError) {
      console.error('Could not send registration welcome email', emailError);
    }

    const profile = await loadProfile(data.session ?? null);
    if (profile) setUser(profile);

    return {
      ok: true,
      user: profile ?? undefined,
      message: data.session
        ? 'Cuenta creada correctamente.'
        : 'Cuenta creada. Revisa tu correo: te enviamos un mensaje de bienvenida y el correo de confirmación para activar el acceso.',
    };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, login, register, logout, isAdmin: user?.role === 'club_admin', loading, refreshProfile }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const getDisplayName = (user: User | null) => (user ? fullName(user) : '');
