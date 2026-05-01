import { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, Mail, Phone, RefreshCw, ShieldOff, Trash2, UserPlus, UserX } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDialogBackButton } from '@/hooks/useDialogBackButton';

export default function TeamPanel() {
  const { user } = useAuth();
  const { clubs, profiles, inviteStaff, setStaffActive, removeStaff } = useAppData();

  const ownedClubs = useMemo(
    () => clubs.filter((club) => club.owner_id === user?.id && club.is_active),
    [clubs, user?.id],
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  useDialogBackButton(inviteOpen, () => setInviteOpen(false));
  useDialogBackButton(Boolean(createdCredentials), () => setCreatedCredentials(null));
  useDialogBackButton(Boolean(removeTarget), () => setRemoveTarget(null));
  const [form, setForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    password: '',
    club_id: ownedClubs[0]?.id ?? '',
  });

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const symbols = '!@#$%';
    const length = 12;
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    const generated = Array.from(bytes, (byte, idx) => {
      if (idx === length - 1) return symbols.charAt(byte % symbols.length);
      return chars.charAt(byte % chars.length);
    }).join('');
    setForm((prev) => ({ ...prev, password: generated }));
    setShowPassword(true);
  };

  const teamMembers = useMemo(() => {
    const ownedClubIds = new Set(ownedClubs.map((c) => c.id));
    return profiles
      .filter((p) => p.role === 'staff' && p.staff_club_id && ownedClubIds.has(p.staff_club_id))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  }, [profiles, ownedClubs]);

  const resetForm = () => {
    setForm({
      email: '',
      first_name: '',
      last_name: '',
      phone: '',
      password: '',
      club_id: ownedClubs[0]?.id ?? '',
    });
    setShowPassword(false);
  };

  const openInvite = () => {
    if (ownedClubs.length === 0) {
      toast.error('Primero crea un club para poder crear empleados.');
      return;
    }
    resetForm();
    setInviteOpen(true);
  };

  const submitInvite = async () => {
    if (!form.email || !form.first_name || !form.club_id) {
      toast.error('Email, nombre y club son obligatorios.');
      return;
    }
    if (!form.password || form.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    const result = await inviteStaff({
      email: form.email,
      password: form.password,
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      club_id: form.club_id,
    });
    setSubmitting(false);
    if (result.ok) {
      if (result.mode === 'created') {
        setCreatedCredentials({ email: form.email.trim().toLowerCase(), password: form.password });
      } else {
        toast.success(result.message);
      }
      setInviteOpen(false);
      resetForm();
    } else {
      toast.error(result.message);
    }
  };

  const copyCredentials = async () => {
    if (!createdCredentials) return;
    const text = `Email: ${createdCredentials.email}\nContraseña: ${createdCredentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Credenciales copiadas al portapapeles.');
    } catch {
      toast.error('No se pudieron copiar. Cópialas manualmente.');
    }
  };

  const toggleActive = async (profileId: string, active: boolean) => {
    const ok = await setStaffActive(profileId, active);
    if (ok) toast.success(active ? 'Empleado reactivado.' : 'Empleado desactivado.');
    else toast.error('No se pudo actualizar el estado del empleado.');
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const ok = await removeStaff(removeTarget);
    setRemoveTarget(null);
    if (ok) toast.success('Empleado removido del equipo.');
    else toast.error('No se pudo remover al empleado.');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Equipo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea cuentas de empleado para que validen reservas y gestionen el calendario, sin acceso a precios o configuración.
          </p>
        </div>
        <Button onClick={openInvite}>
          <UserPlus className="mr-2 h-4 w-4" />
          Crear empleado
        </Button>
      </div>

      {teamMembers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no tienes empleados. Pulsa <strong>Crear empleado</strong> para registrar el primero con email y contraseña.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Empleado</th>
                  <th className="px-4 py-3 font-medium">Club</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((member) => {
                  const club = clubs.find((c) => c.id === member.staff_club_id);
                  const active = member.is_active !== false;
                  return (
                    <tr key={member.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {(member.first_name?.[0] ?? '?').toUpperCase()}
                          </div>
                          <div className="leading-tight">
                            <p className="font-medium text-foreground">
                              {member.first_name} {member.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{club?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{member.email}</span>
                          {member.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{member.phone}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            <ShieldOff className="h-3 w-3" /> Desactivado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant={active ? 'outline' : 'default'}
                            onClick={() => void toggleActive(member.id, !active)}
                          >
                            {active ? 'Desactivar' : 'Reactivar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoveTarget(member.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {teamMembers.map((member) => {
              const club = clubs.find((c) => c.id === member.staff_club_id);
              const active = member.is_active !== false;
              return (
                <div key={member.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {(member.first_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {member.first_name} {member.last_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{club?.name ?? '—'}</p>
                        </div>
                        {active ? (
                          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                            <ShieldOff className="h-3 w-3" /> Inactivo
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5 break-all">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          {member.email}
                        </p>
                        {member.phone && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            {member.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant={active ? 'outline' : 'default'}
                      className="flex-1"
                      onClick={() => void toggleActive(member.id, !active)}
                    >
                      {active ? 'Desactivar' : 'Reactivar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoveTarget(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear empleado</DialogTitle>
            <DialogDescription>
              Tú asignas la contraseña inicial. Si el email ya pertenece a un cliente, se actualizará su rol a empleado conservando su contraseña actual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                placeholder="Nombre"
                value={form.first_name}
                onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
              />
              <Input
                placeholder="Apellido"
                value={form.last_name}
                onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
              />
            </div>
            <Input
              type="email"
              placeholder="empleado@email.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
            <Input
              placeholder="Teléfono (opcional)"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Contraseña inicial</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    className="pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="default" onClick={generatePassword}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Generar
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Se mostrará una vez al crear; cópiala y compártela con el empleado.
              </p>
            </div>

            {ownedClubs.length > 1 ? (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Club asignado</label>
                <select
                  value={form.club_id}
                  onChange={(e) => setForm((p) => ({ ...p, club_id: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {ownedClubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Club asignado: <span className="font-semibold text-foreground">{ownedClubs[0]?.name ?? '—'}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={() => void submitInvite()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              {submitting ? 'Creando...' : 'Crear empleado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdCredentials} onOpenChange={(open) => !open && setCreatedCredentials(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Empleado creado</DialogTitle>
            <DialogDescription>
              Comparte estas credenciales con tu empleado. Esta es la única vez que verás la contraseña.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="mt-1 break-all font-mono text-sm font-medium text-foreground">{createdCredentials?.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Contraseña</p>
              <p className="mt-1 break-all font-mono text-sm font-medium text-foreground">{createdCredentials?.password}</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={copyCredentials}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
            <Button onClick={() => setCreatedCredentials(null)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover del equipo</AlertDialogTitle>
            <AlertDialogDescription>
              Su rol pasará a cliente y perderá acceso al panel. Sus reservas y registros previos no se eliminan. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemove()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <UserX className="mr-2 h-4 w-4" />
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
