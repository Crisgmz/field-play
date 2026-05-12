import { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, Lock, Mail, Phone, RefreshCw, ShieldOff, Trash2, UserPlus, UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Switch } from '@/components/ui/switch';
import type { PermissionKey, StaffRole, User } from '@/types';
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

const STAFF_ROLE_LABELS: Record<StaffRole, { label: string; short: string; tone: string }> = {
  groundskeeper: { label: 'Encargado de cancha', short: 'Encargado', tone: 'bg-emerald-50 text-emerald-700' },
  receptionist: { label: 'Recepción / Secretaria', short: 'Recepción', tone: 'bg-sky-50 text-sky-700' },
  accountant: { label: 'Contable', short: 'Contable', tone: 'bg-violet-50 text-violet-700' },
  admin: { label: 'Administrador', short: 'Admin', tone: 'bg-rose-50 text-rose-700' },
};

// Matriz base por sub-rol (mismo contenido que AuthContext). Aquí solo
// se usa para mostrar al admin qué permisos vienen "por default" y
// cuáles son overrides explícitos sobre el perfil.
const BASE_STAFF_PERMS: Record<StaffRole, Record<PermissionKey, boolean>> = {
  groundskeeper: {
    canManageBookings: false, canManageBlocks: true, canManagePricing: false,
    canManageClubInfo: false, canManageFields: false, canManageVenueConfig: false,
    canManageTeam: false, canViewReports: false, canManagePayments: false, canManageClients: false,
  },
  receptionist: {
    canManageBookings: true, canManageBlocks: true, canManagePricing: false,
    canManageClubInfo: false, canManageFields: false, canManageVenueConfig: false,
    canManageTeam: false, canViewReports: false, canManagePayments: true, canManageClients: true,
  },
  accountant: {
    canManageBookings: false, canManageBlocks: false, canManagePricing: false,
    canManageClubInfo: false, canManageFields: false, canManageVenueConfig: false,
    canManageTeam: false, canViewReports: true, canManagePayments: false, canManageClients: false,
  },
  admin: {
    canManageBookings: true, canManageBlocks: true, canManagePricing: true,
    canManageClubInfo: true, canManageFields: true, canManageVenueConfig: true,
    canManageTeam: true, canViewReports: true, canManagePayments: true, canManageClients: true,
  },
};

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  canManageBookings: 'Gestionar reservas',
  canManageBlocks: 'Crear bloqueos',
  canManagePricing: 'Editar precios',
  canManageClubInfo: 'Editar info del club',
  canManageFields: 'Crear / editar canchas',
  canManageVenueConfig: 'Configurar horarios',
  canManageTeam: 'Gestionar equipo',
  canViewReports: 'Ver reportes',
  canManagePayments: 'Validar pagos',
  canManageClients: 'Gestionar clientes',
};

const PERMISSION_KEYS: PermissionKey[] = [
  'canManageBookings',
  'canManageBlocks',
  'canManagePayments',
  'canManageClients',
  'canViewReports',
  'canManagePricing',
  'canManageClubInfo',
  'canManageFields',
  'canManageVenueConfig',
  'canManageTeam',
];

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
  const [permissionsMemberId, setPermissionsMemberId] = useState<string | null>(null);
  const [permissionBusyKey, setPermissionBusyKey] = useState<PermissionKey | null>(null);

  const permissionsMember = useMemo(
    () => profiles.find((p) => p.id === permissionsMemberId) ?? null,
    [profiles, permissionsMemberId],
  );

  useDialogBackButton(Boolean(permissionsMember), () => setPermissionsMemberId(null));

  useDialogBackButton(inviteOpen, () => setInviteOpen(false));
  useDialogBackButton(Boolean(createdCredentials), () => setCreatedCredentials(null));
  useDialogBackButton(Boolean(removeTarget), () => setRemoveTarget(null));
  const [form, setForm] = useState<{
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    password: string;
    club_id: string;
    staff_role: 'groundskeeper' | 'receptionist' | 'accountant';
  }>({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    password: '',
    club_id: ownedClubs[0]?.id ?? '',
    staff_role: 'receptionist',
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
      staff_role: 'receptionist',
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

  // Permiso efectivo: si hay override en el perfil, ese gana. Si no,
  // se usa el default del sub-rol. Si el staff no tiene sub-rol
  // (cuentas legacy), aplicamos el mismo fallback que AuthContext.
  const getEffectivePermission = (member: User, key: PermissionKey): boolean => {
    const override = member.extra_permissions?.[key];
    if (override !== undefined) return override;
    if (member.staff_role) return BASE_STAFF_PERMS[member.staff_role][key];
    return key === 'canManageBookings' || key === 'canManageBlocks';
  };

  const hasOverride = (member: User, key: PermissionKey): boolean =>
    member.extra_permissions?.[key] !== undefined;

  const setPermission = async (member: User, key: PermissionKey, granted: boolean) => {
    setPermissionBusyKey(key);
    const { error } = await supabase.rpc('rpc_set_staff_permission', {
      p_profile_id: member.id,
      p_permission: key,
      p_granted: granted,
    });
    setPermissionBusyKey(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(granted ? 'Permiso otorgado.' : 'Permiso revocado.');
  };

  const resetPermission = async (member: User, key: PermissionKey) => {
    setPermissionBusyKey(key);
    const { error } = await supabase.rpc('rpc_reset_staff_permission', {
      p_profile_id: member.id,
      p_permission: key,
    });
    setPermissionBusyKey(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Permiso restaurado al default del rol.');
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
      staff_role: form.staff_role,
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
                            {member.staff_role && (
                              <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAFF_ROLE_LABELS[member.staff_role].tone}`}>
                                {STAFF_ROLE_LABELS[member.staff_role].short}
                              </span>
                            )}
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
                            variant="outline"
                            onClick={() => setPermissionsMemberId(member.id)}
                          >
                            <Lock className="mr-1 h-3.5 w-3.5" />
                            Permisos
                          </Button>
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
                          {member.staff_role && (
                            <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAFF_ROLE_LABELS[member.staff_role].tone}`}>
                              {STAFF_ROLE_LABELS[member.staff_role].short}
                            </span>
                          )}
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setPermissionsMemberId(member.id)}
                    >
                      <Lock className="mr-1 h-3.5 w-3.5" />
                      Permisos
                    </Button>
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

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Tipo de empleado</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  { value: 'groundskeeper', label: 'Encargado de cancha', desc: 'Agenda + bloqueos' },
                  { value: 'receptionist', label: 'Recepción / Secretaria', desc: 'Reservas + pagos' },
                  { value: 'accountant', label: 'Contable', desc: 'Solo reportes' },
                  { value: 'admin', label: 'Administrador', desc: 'Todos los permisos' },
                ] as const).map((opt) => {
                  const active = form.staff_role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, staff_role: opt.value }))}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
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

      {/* Dialog de permisos: muestra cada permiso de la matriz con un
          switch. La etiqueta "Default" indica que viene del rol; cuando
          el admin lo cambia, queda marcado como "Personalizado" con un
          botón para restaurarlo al default del rol. */}
      <Dialog
        open={Boolean(permissionsMember)}
        onOpenChange={(open) => { if (!open) setPermissionsMemberId(null); }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Permisos del empleado</DialogTitle>
            <DialogDescription>
              {permissionsMember && (
                <>
                  {permissionsMember.first_name} {permissionsMember.last_name}
                  {permissionsMember.staff_role && (
                    <>
                      {' · '}
                      <span className="font-medium text-foreground">
                        {STAFF_ROLE_LABELS[permissionsMember.staff_role].label}
                      </span>
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {permissionsMember && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {PERMISSION_KEYS.map((key) => {
                const effective = getEffectivePermission(permissionsMember, key);
                const isOverride = hasOverride(permissionsMember, key);
                const baseValue = permissionsMember.staff_role
                  ? BASE_STAFF_PERMS[permissionsMember.staff_role][key]
                  : (key === 'canManageBookings' || key === 'canManageBlocks');
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                      isOverride ? 'border-amber-300 bg-amber-50/50' : 'border-border bg-card'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{PERMISSION_LABELS[key]}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {isOverride
                          ? (<>Personalizado — default del rol: <span className="font-semibold">{baseValue ? 'permitido' : 'denegado'}</span></>)
                          : 'Default del rol'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOverride && (
                        <button
                          type="button"
                          onClick={() => void resetPermission(permissionsMember, key)}
                          disabled={permissionBusyKey === key}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                        >
                          Restaurar
                        </button>
                      )}
                      <Switch
                        checked={effective}
                        disabled={permissionBusyKey === key}
                        onCheckedChange={(next) => void setPermission(permissionsMember, key, next)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsMemberId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
