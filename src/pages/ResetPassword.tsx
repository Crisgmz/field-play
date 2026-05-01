import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Estados del flujo de recovery:
//   * checking   → esperando que Supabase procese el hash de la URL
//                   (#access_token=... &type=recovery&...) y dispare el evento
//                   PASSWORD_RECOVERY que valida el token.
//   * ready      → token válido, mostrar form para escribir la contraseña.
//   * invalid    → no llegó el evento o el link expiró/ya se usó.
//   * submitting → guardando la nueva contraseña.
//   * success    → contraseña actualizada, vamos a redirigir a /login.
type Phase = 'checking' | 'ready' | 'invalid' | 'submitting' | 'success';

const RECOVERY_TIMEOUT_MS = 4000;

export default function ResetPassword() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    // Si el usuario llega aquí desde el email, Supabase procesa el hash y
    // dispara PASSWORD_RECOVERY tras unos ms. Si nunca lo dispara, el link
    // probablemente expiró o se reutilizó — mostramos error.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setPhase('ready');
      }
    });

    // También revisamos por si ya se procesó antes de montar el listener.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) setPhase((prev) => (prev === 'checking' ? 'ready' : prev));
    });

    const watchdog = window.setTimeout(() => {
      if (mounted) {
        setPhase((prev) => (prev === 'checking' ? 'invalid' : prev));
      }
    }, RECOVERY_TIMEOUT_MS);

    return () => {
      mounted = false;
      window.clearTimeout(watchdog);
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }

    setPhase('submitting');
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message ?? 'No se pudo actualizar la contraseña.');
      setPhase('ready');
      return;
    }

    // Cerramos sesión para que vuelva a iniciar sesión con la nueva contraseña.
    // Esto evita que la sesión "de recovery" quede activa con permisos normales.
    await supabase.auth.signOut();
    setPhase('success');
    setTimeout(() => navigate('/login', { state: { passwordReset: true } }), 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        {phase === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Validando enlace...</p>
          </div>
        )}

        {phase === 'invalid' && (
          <div className="text-center">
            <h1 className="font-heading text-2xl font-bold text-foreground">Enlace inválido o expirado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El enlace que usaste ya no es válido. Pueden ser dos razones:
            </p>
            <ul className="mt-3 space-y-1 text-left text-sm text-muted-foreground">
              <li>• Pasó más de 1 hora desde que lo solicitaste.</li>
              <li>• Ya lo usaste antes (los enlaces son de un solo uso).</li>
            </ul>
            <Button asChild className="mt-6 w-full">
              <Link to="/forgot-password">Solicitar nuevo enlace</Link>
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full">
              <Link to="/login">Volver al inicio de sesión</Link>
            </Button>
          </div>
        )}

        {phase === 'success' && (
          <div className="text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-foreground">¡Contraseña actualizada!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Te llevamos al inicio de sesión...
            </p>
          </div>
        )}

        {(phase === 'ready' || phase === 'submitting') && (
          <>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold text-foreground">Nueva contraseña</h1>
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirma tu contraseña</Label>
                <Input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <Button type="submit" className="w-full" disabled={phase === 'submitting'}>
                {phase === 'submitting' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar nueva contraseña'
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
