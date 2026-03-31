import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await login({ email, password });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.message || 'No se pudo iniciar sesión.');
      return;
    }

    navigate(result.isAdmin ? '/admin/overview' : '/');
  };

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-1/2 items-center justify-center bg-primary lg:flex">
        <div className="max-w-lg px-12 text-center text-white">
          <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 text-3xl font-bold shadow-2xl">
            RP
          </div>
          <h1 className="font-heading text-5xl font-extrabold">RealPlay</h1>
          <p className="mt-4 text-lg text-white/80">
            Reserva canchas, administra horarios y opera todo el club desde un solo lugar.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <h1 className="font-heading text-3xl font-extrabold text-foreground">RealPlay</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gestión de reservas deportivas</p>
          </div>

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
        </div>
      </div>
    </div>
  );
}
