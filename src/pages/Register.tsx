import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const result = await register({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      national_id: nationalId,
      password,
    });

    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.message || 'No se pudo crear la cuenta.');
      return;
    }

    toast.success(result.message || 'Cuenta creada correctamente.');
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-heading text-3xl font-extrabold text-foreground">Crear cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Completa tus datos para empezar a reservar.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">Nombre</Label>
              <Input id="first_name" placeholder="Cristian" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Apellido</Label>
              <Input id="last_name" placeholder="Gómez" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" placeholder="809-000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="national_id">Cédula (opcional)</Label>
            <Input id="national_id" placeholder="001-0000000-0" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" placeholder="usuario@realplay.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creando...' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">Iniciar sesión</Link>
        </p>
      </div>
    </div>
  );
}
