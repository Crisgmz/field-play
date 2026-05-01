import { useEffect, useState } from 'react';
import { Loader2, PencilLine } from 'lucide-react';
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
import { useDialogBackButton } from '@/hooks/useDialogBackButton';
import { TIME_SLOTS } from '@/data/mockData';
import { Booking, PaymentMethod } from '@/types';
import { formatBookingDate, formatPaymentMethod, formatTime12h } from '@/lib/bookingFormat';

interface Props {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAYMENT_OPTIONS: PaymentMethod[] = ['bank_transfer', 'cash', 'card'];

export default function EditBookingDialog({ booking, open, onOpenChange }: Props) {
  const { updateBooking } = useAppData();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: '',
    start_time: '',
    end_time: '',
    total_price: '',
    payment_method: 'bank_transfer' as PaymentMethod,
    notes: '',
  });

  useDialogBackButton(open, () => onOpenChange(false));

  // Sync form cuando se abre el modal con una reserva nueva.
  useEffect(() => {
    if (open && booking) {
      setForm({
        date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        total_price: String(booking.total_price ?? 0),
        payment_method: booking.payment_method ?? 'bank_transfer',
        notes: booking.notes ?? '',
      });
    }
  }, [open, booking]);

  if (!booking) return null;

  const handleSave = async () => {
    if (!form.date) {
      toast.error('Selecciona una fecha.');
      return;
    }
    if (!form.start_time || !form.end_time) {
      toast.error('Selecciona el horario.');
      return;
    }
    if (form.end_time <= form.start_time) {
      toast.error('La hora de fin debe ser posterior a la de inicio.');
      return;
    }
    const totalPriceNum = Number(form.total_price);
    if (Number.isNaN(totalPriceNum) || totalPriceNum < 0) {
      toast.error('El precio debe ser un número válido.');
      return;
    }

    setSubmitting(true);
    const result = await updateBooking({
      bookingId: booking.id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      total_price: totalPriceNum,
      payment_method: form.payment_method,
      notes: form.notes || null,
    });
    setSubmitting(false);

    if (result.ok) {
      toast.success('Reserva actualizada.');
      onOpenChange(false);
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="h-5 w-5 text-primary" />
            Editar reserva
          </DialogTitle>
          <DialogDescription>
            Reserva original: {formatBookingDate(booking.date)} · {formatTime12h(booking.start_time)}–{formatTime12h(booking.end_time)} · {booking.field_type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Fecha</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Hora inicio</label>
              <Select
                value={form.start_time}
                onValueChange={(value) => setForm((p) => ({ ...p, start_time: value }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.slice(0, -1).map((t) => (
                    <SelectItem key={t} value={t}>{formatTime12h(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hora fin</label>
              <Select
                value={form.end_time}
                onValueChange={(value) => setForm((p) => ({ ...p, end_time: value }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.slice(1).map((t) => (
                    <SelectItem key={t} value={t}>{formatTime12h(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Precio total (RD$)</label>
              <Input
                type="number"
                min={0}
                value={form.total_price}
                onChange={(e) => setForm((p) => ({ ...p, total_price: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Forma de pago</label>
              <Select
                value={form.payment_method}
                onValueChange={(value) => setForm((p) => ({ ...p, payment_method: value as PaymentMethod }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{formatPaymentMethod(opt)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Notas internas</label>
            <Input
              placeholder="Ej: el cliente avisó que llega tarde"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>

          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Si cambias fecha u hora, el sistema verifica que no choque con otra reserva o bloqueo.
            Para cambiar la modalidad o cancha, cancela la reserva y crea una nueva.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
