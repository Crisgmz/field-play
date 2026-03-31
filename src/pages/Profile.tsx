import { getDisplayName, useAuth } from '@/contexts/AuthContext';
import { User, Mail, Shield, Phone, CreditCard } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">Mi perfil</h1>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {user.first_name[0]}
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-card-foreground">{getDisplayName(user)}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Nombre:</span>
            <span className="ml-auto font-medium text-foreground">{getDisplayName(user)}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Correo:</span>
            <span className="ml-auto font-medium text-foreground">{user.email}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Teléfono:</span>
            <span className="ml-auto font-medium text-foreground">{user.phone}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Cédula:</span>
            <span className="ml-auto font-medium text-foreground">{user.national_id || 'No registrada'}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Rol:</span>
            <span className="ml-auto font-medium capitalize text-foreground">{user.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
