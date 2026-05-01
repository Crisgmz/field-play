import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import logoUrl from '@/logos/logo.png';
import VerifyEmailCode from '@/components/VerifyEmailCode';

// Vite resuelve estos globs en build-time. Para agregar más fotos al
// slideshow basta con dejarlas en src/images/ con extensión soportada.
const imageModules = import.meta.glob('@/images/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const SLIDESHOW_IMAGES = Object.values(imageModules);
const SLIDE_DURATION_MS = 6000;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const { login, requestVerificationCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Si Register nos navegó aquí tras verificar, prellena el email para login.
  useEffect(() => {
    const state = location.state as { justVerifiedEmail?: string } | null;
    if (state?.justVerifiedEmail) {
      setEmail(state.justVerifiedEmail);
      toast.success('Cuenta verificada. Inicia sesión para continuar.');
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const slides = useMemo(() => SLIDESHOW_IMAGES, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await login({ email, password });
    setSubmitting(false);

    if (!result.ok) {
      // Si el email no está verificado, abrimos la vista de código y
      // pedimos uno nuevo automáticamente.
      if (result.needsVerification) {
        toast.error(result.message ?? 'Verifica tu cuenta para continuar.');
        const trimmed = email.trim().toLowerCase();
        setVerificationEmail(trimmed);
        void requestVerificationCode(trimmed);
        return;
      }
      toast.error(result.message || 'No se pudo iniciar sesión.');
      return;
    }

    navigate(result.isAdminLevel ? '/admin/overview' : '/');
  };

  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden w-1/2 overflow-hidden bg-primary lg:block">
        {slides.length === 0 && (
          <div className="flex h-full items-center justify-center text-white/80">
            <span className="text-sm">Agrega fotos a src/images/ para mostrarlas aquí.</span>
          </div>
        )}

        {slides.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === slideIndex ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={index !== slideIndex}
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
          </div>
        ))}

        {slides.length > 0 && (
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/85 via-primary/45 to-transparent" />
        )}

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center -ml-12">
            <img
              src={logoUrl}
              alt="RealPlay"
              className="h-24 w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
            />
            <span className="-ml-10 font-heading text-3xl font-bold drop-shadow-md">RealPlay</span>
          </div>

          <div className="max-w-md">
            <h1 className="font-heading text-4xl font-extrabold leading-tight drop-shadow-md">
              Tu cancha, tu horario, en un par de clics.
            </h1>
            <p className="mt-3 text-base text-white/85 drop-shadow">
              Reserva canchas, administra horarios y opera todo el club desde un solo lugar.
            </p>

            {slides.length > 1 && (
              <div className="mt-6 flex gap-2" role="tablist" aria-label="Cambiar imagen">
                {slides.map((src, index) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSlideIndex(index)}
                    aria-label={`Mostrar imagen ${index + 1}`}
                    aria-selected={index === slideIndex}
                    className={`h-1.5 rounded-full transition-all ${
                      index === slideIndex ? 'w-8 bg-white' : 'w-4 bg-white/40 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <h1 className="font-heading text-3xl font-extrabold text-foreground">RealPlay</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gestión de reservas deportivas</p>
          </div>

          {verificationEmail ? (
            <VerifyEmailCode
              email={verificationEmail}
              onVerified={async () => {
                // Si todavía tenemos el password en memoria (vino de un intento
                // de login previo), auto-relogeamos para evitar que el usuario
                // tenga que reingresarlo. Si no, volvemos al form normal.
                if (password) {
                  setSubmitting(true);
                  const retry = await login({ email: verificationEmail, password });
                  setSubmitting(false);
                  if (retry.ok) {
                    setVerificationEmail(null);
                    navigate(retry.isAdminLevel ? '/admin/overview' : '/');
                    return;
                  }
                }
                setVerificationEmail(null);
                toast.success('Cuenta verificada. Ingresa tu contraseña para continuar.');
              }}
              onChangeEmail={() => setVerificationEmail(null)}
            />
          ) : (
            <>
              <h2 className="font-heading text-2xl font-bold text-foreground">Iniciar sesión</h2>
              <p className="mt-1 text-sm text-muted-foreground">Accede a tu cuenta para reservar o administrar.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@realplay.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                ¿No tienes cuenta?{' '}
                <Link to="/register" className="font-medium text-primary hover:underline">Crear cuenta</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
