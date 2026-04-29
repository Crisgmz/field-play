import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Mail, Pencil, Phone, Save, Shield, User as UserIcon, X } from 'lucide-react';
import { getDisplayName, useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    national_id: '',
  });

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name ?? '',
        last_name: user.last_name ?? '',
        phone: user.phone ?? '',
        national_id: user.national_id ?? '',
      });
    }
  }, [user?.id]);

  if (!user) return null;

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('Nombre y apellido son obligatorios.');
      return;
    }
    if (!form.phone.trim()) {
      toast.error('El teléfono es obligatorio.');
      return;
    }

    setSubmitting(true);
    const result = await updateProfile({
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      national_id: form.national_id.trim() ? form.national_id : null,
    });
    setSubmitting(false);

    if (result.ok) {
      toast.success('Perfil actualizado.');
      setEditing(false);
    } else {
      toast.error(result.message ?? 'No se pudo actualizar el perfil.');
    }
  };

  const handleCancel = () => {
    setForm({
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      phone: user.phone ?? '',
      national_id: user.national_id ?? '',
    });
    setEditing(false);
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">Mi perfil</h1>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {(user.first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-lg font-bold text-card-foreground">{getDisplayName(user)}</h2>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
            </Button>
          )}
        </div>

        {editing ? (
          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input value={form.first_name} onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Apellido</label>
                <Input value={form.last_name} onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teléfono</label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="809-555-5555" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cédula</label>
              <Input value={form.national_id} onChange={(e) => setForm((prev) => ({ ...prev, national_id: e.target.value }))} placeholder="000-0000000-0" />
            </div>
            <p className="text-xs text-muted-foreground">El correo se gestiona desde la cuenta de acceso y no se puede cambiar aquí.</p>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={submitting}>
                <Save className="mr-2 h-4 w-4" /> {submitting ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={submitting}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
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
              <span className="ml-auto font-medium text-foreground">{user.phone || 'No registrado'}</span>
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
        )}
      </div>
    </div>
  );
}
