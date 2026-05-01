import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDialogBackButton } from '@/hooks/useDialogBackButton';
import { findAvailableUnit, getUnitsByType } from '@/lib/availability';
import { TIME_SLOTS } from '@/data/mockData';
import { FieldType, PaymentMethod } from '@/types';
import { formatCurrency, formatTime12h } from '@/lib/bookingFormat';

const STATUS_OPTIONS: { value: 'confirmed' | 'pending'; label: string }[] = [
  { value: 'confirmed', label: 'Confirmada (pago recibido)' },
  { value: 'pending', label: 'Pendiente de pago' },
];

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank_transfer', label: 'Transferencia bancaria' },
];

interface FormState {
  client_id: string;
  client_query: string;
  club_id: string;
  field_id: string;
  mode: FieldType | '';
  date: string;
  start_time: string;
  end_time: string;
  payment_method: PaymentMethod;
  status: 'confirmed' | 'pending';
  total_price: string;
  notes: string;
  /** Si está presente, el submit usa esta unidad específica en lugar de auto-seleccionar. */
  field_unit_id: string;
}

export interface AdminCreateBookingInitialValues {
  club_id?: string;
  field_id?: string;
  field_unit_id?: string;
  mode?: FieldType;
  date?: string;
  start_time?: string;
  end_time?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: AdminCreateBookingInitialValues;
}

const todayIso = () => new Date().toISOString().split('T')[0];

export default function AdminCreateBookingDialog({ open, onOpenChange, initialValues }: Props) {
  const { user, isStaff, staffClubId } = useAuth();
  const { clubs, fields, profiles, pricingRules, bookings, blocks, createBooking } = useAppData();
  const [submitting, setSubmitting] = useState(false);

  useDialogBackButton(open, () => onOpenChange(false));

  const ownedClubs = useMemo(() => {
    if (isStaff && staffClubId) return clubs.filter((c) => c.id === staffClubId);
    return clubs.filter((c) => c.owner_id === user?.id && c.is_active);
  }, [clubs, user?.id, isStaff, staffClubId]);

  const clientProfiles = useMemo(
    () => profiles.filter((p) => p.role === 'client').sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    ),
    [profiles],
  );

  const [form, setForm] = useState<FormState>({
    client_id: '',
    client_query: '',
    club_id: ownedClubs[0]?.id ?? '',
    field_id: '',
    mode: '',
    date: todayIso(),
    start_time: '18:00',
    end_time: '20:00',
    payment_method: 'cash',
    status: 'confirmed',
    total_price: '',
    notes: '',
    field_unit_id: '',
  });

  // Cuando se abre el dialog, aplicamos los initialValues (si vienen del
  // calendario diario) y sincronizamos el club por defecto.
  useEffect(() => {
    if (!open) return;
    setForm((prev) => ({
      ...prev,
      club_id: initialValues?.club_id ?? prev.club_id ?? ownedClubs[0]?.id ?? '',
      field_id: initialValues?.field_id ?? prev.field_id,
      mode: initialValues?.mode ?? prev.mode,
      date: initialValues?.date ?? prev.date,
      start_time: initialValues?.start_time ?? prev.start_time,
      end_time: initialValues?.end_time ?? prev.end_time,
      field_unit_id: initialValues?.field_unit_id ?? '',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !form.club_id && ownedClubs[0]) {
      setForm((prev) => ({ ...prev, club_id: ownedClubs[0].id }));
    }
  }, [open, form.club_id, ownedClubs]);

  // Cuando cambia el club, resetea cancha y modo.
  const clubFields = useMemo(
    () => fields.filter((f) => f.club_id === form.club_id && f.is_active !== false),
    [fields, form.club_id],
  );
  useEffect(() => {
    if (!form.field_id || !clubFields.some((f) => f.id === form.field_id)) {
      setForm((prev) => ({ ...prev, field_id: clubFields[0]?.id ?? '', mode: '' }));
    }
  }, [clubFields, form.field_id]);

  // Modalidades disponibles según las unidades reales del field.
  const selectedField = clubFields.find((f) => f.id === form.field_id) ?? null;
  const availableModes = useMemo<FieldType[]>(() => {
    if (!selectedField) return [];
    return (['F11', 'F7', 'F5'] as FieldType[]).filter(
      (type) => getUnitsByType(selectedField, type).length > 0,
    );
  }, [selectedField]);

  // Si la modalidad seleccionada deja de ser válida (cambio de field), limpiar.
  useEffect(() => {
    if (form.mode && !availableModes.includes(form.mode as FieldType)) {
      setForm((prev) => ({ ...prev, mode: '' }));
    }
  }, [availableModes, form.mode]);

  // Auto-cálculo del precio en base a pricingRules (editable).
  const pricingRule = pricingRules.find(
    (r) => r.club_id === form.club_id && r.field_type === form.mode && r.is_active,
  );
  const minutesSelected = useMemo(() => {
    if (!form.start_time || !form.end_time) return 0;
    const [sh, sm] = form.start_time.split(':').map(Number);
    const [eh, em] = form.end_time.split(':').map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }, [form.start_time, form.end_time]);

  const computedPrice = useMemo(() => {
    if (!pricingRule || minutesSelected <= 0) return 0;
    return Math.round((pricingRule.price_per_hour / 60) * minutesSelected);
  }, [pricingRule, minutesSelected]);

  // Cuando cambian los inputs que afectan el precio, autocompletamos
  // (sin pisar si el admin lo editó manualmente y todavía no se vacía).
  useEffect(() => {
    if (computedPrice > 0) {
      setForm((prev) => {
        if (prev.total_price === '' || prev.total_price === '0') {
          return { ...prev, total_price: String(computedPrice) };
        }
        return prev;
      });
    }
  }, [computedPrice]);

  // Filtro client-side de clientes por texto.
  const filteredClients = useMemo(() => {
    const q = form.client_query.trim().toLowerCase();
    if (!q) return clientProfiles.slice(0, 25);
    return clientProfiles
      .filter((c) => {
        const haystack = `${c.first_name} ${c.last_name} ${c.email} ${c.phone}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 25);
  }, [clientProfiles, form.client_query]);

  const selectedClient = clientProfiles.find((c) => c.id === form.client_id) ?? null;

  const resetForm = () => {
    setForm({
      client_id: '',
      client_query: '',
      club_id: ownedClubs[0]?.id ?? '',
      field_id: '',
      mode: '',
      date: todayIso(),
      start_time: '18:00',
      end_time: '20:00',
      payment_method: 'cash',
      status: 'confirmed',
      total_price: '',
      notes: '',
      field_unit_id: '',
    });
  };

  const validate = (): string | null => {
    if (!form.client_id) return 'Selecciona el cliente.';
    if (!form.club_id) return 'Selecciona el club.';
    if (!form.field_id) return 'Selecciona la cancha.';
    if (!form.mode) return 'Selecciona la modalidad.';
    if (!form.date) return 'Selecciona la fecha.';
    if (!form.start_time || !form.end_time) return 'Selecciona el horario.';
    if (form.end_time <= form.start_time) return 'La hora de fin debe ser posterior a la de inicio.';
    if (minutesSelected < (pricingRule?.minimum_minutes ?? 60)) {
      return `La duración mínima es ${pricingRule?.minimum_minutes ?? 60} minutos.`;
    }
    if (pricingRule && minutesSelected % pricingRule.increment_minutes !== 0) {
      return `Solo se permiten incrementos de ${pricingRule.increment_minutes} minutos.`;
    }
    if (!Number(form.total_price) || Number(form.total_price) <= 0) return 'Ingresa el precio total.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!selectedField || !form.mode) return;

    // Si vino prefilled con una unidad específica (click en calendario diario),
    // usamos esa. Si no, auto-seleccionamos la primera disponible.
    let unitId: string | null = null;
    if (form.field_unit_id && selectedField.units.some((u) => u.id === form.field_unit_id)) {
      unitId = form.field_unit_id;
    } else {
      const auto = findAvailableUnit(
        form.date,
        form.start_time,
        form.end_time,
        form.mode as FieldType,
        selectedField,
        bookings,
        blocks,
      );
      unitId = auto?.id ?? null;
    }
    if (!unitId) {
      toast.error('No hay una unidad disponible para ese horario. Ya está reservada o bloqueada.');
      return;
    }

    setSubmitting(true);
    const created = await createBooking({
      user_id: form.client_id,
      club_id: form.club_id,
      field_unit_id: unitId,
      field_type: form.mode as FieldType,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      total_price: Number(form.total_price),
      status: form.status,
      payment_method: form.payment_method,
      notes: form.notes || null,
      created_by_admin: true,
    });
    setSubmitting(false);

    if (!created) {
      toast.error('No se pudo crear la reserva. Verifica que la migración 010 esté aplicada y que el horario no choque con otra reserva.');
      return;
    }

    toast.success(`Reserva creada para ${selectedClient?.first_name} ${selectedClient?.last_name}.`);
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva reserva manual</DialogTitle>
          <DialogDescription>
            Crea una reserva en nombre de un cliente registrado (caja, walk-in, coordinación previa). La reserva se guarda con la marca de "creada por admin".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Cliente</label>
            <Input
              placeholder="Buscar por nombre, email o teléfono..."
              value={form.client_query}
              onChange={(e) => setForm((p) => ({ ...p, client_query: e.target.value }))}
            />
            <div className="max-h-44 overflow-y-auto rounded-xl border border-border">
              {filteredClients.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Sin resultados.</p>
              ) : (
                filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, client_id: c.id, client_query: `${c.first_name} ${c.last_name}` }))}
                    className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent ${
                      form.client_id === c.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{c.first_name} {c.last_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.email} · {c.phone}</p>
                    </div>
                    {form.client_id === c.id && <span className="text-[10px] font-bold uppercase text-primary">Seleccionado</span>}
                  </button>
                ))
              )}
            </div>
            {selectedClient && (
              <p className="text-xs text-muted-foreground">
                Cliente: <span className="font-medium text-foreground">{selectedClient.first_name} {selectedClient.last_name}</span> · {selectedClient.email}
              </p>
            )}
          </div>

          {/* Club + Cancha */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Club</label>
              <Select value={form.club_id} onValueChange={(value) => setForm((p) => ({ ...p, club_id: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ownedClubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Cancha</label>
              <Select value={form.field_id} onValueChange={(value) => setForm((p) => ({ ...p, field_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>
                  {clubFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Modalidad + Fecha */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Modalidad</label>
              <Select value={form.mode} onValueChange={(value) => setForm((p) => ({ ...p, mode: value as FieldType }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>
                  {availableModes.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableModes.length === 0 && form.field_id && (
                <p className="mt-1 text-xs text-amber-700">Esta cancha no tiene modalidades configuradas.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fecha</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
          </div>

          {/* Horario */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Hora inicio</label>
              <Select value={form.start_time} onValueChange={(value) => setForm((p) => ({ ...p, start_time: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.slice(0, -1).map((t) => <SelectItem key={t} value={t}>{formatTime12h(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hora fin</label>
              <Select value={form.end_time} onValueChange={(value) => setForm((p) => ({ ...p, end_time: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.slice(1).map((t) => <SelectItem key={t} value={t}>{formatTime12h(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pago + Estado */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Forma de pago</label>
              <Select value={form.payment_method} onValueChange={(value) => setForm((p) => ({ ...p, payment_method: value as PaymentMethod }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Estado inicial</label>
              <Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value as 'confirmed' | 'pending' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Precio */}
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Precio total (RD$)</label>
              {computedPrice > 0 && (
                <span className="text-xs text-muted-foreground">
                  Sugerido: {formatCurrency(computedPrice)}
                </span>
              )}
            </div>
            <Input
              type="number"
              min={0}
              placeholder="0"
              value={form.total_price}
              onChange={(e) => setForm((p) => ({ ...p, total_price: e.target.value }))}
              className="mt-2"
            />
            {pricingRule && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(pricingRule.price_per_hour)}/h · mínimo {pricingRule.minimum_minutes} min · incremento {pricingRule.increment_minutes} min
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="mb-1 block text-sm font-medium">Notas (opcional)</label>
            <Input
              placeholder="Ej: pagó en efectivo, descuento por amistad, etc."
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
            {submitting ? 'Creando...' : 'Crear reserva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
