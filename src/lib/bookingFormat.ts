import { BookingStatus, FieldType, PaymentMethod } from '@/types';

const STATUS_LABEL_ES: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
};

const STATUS_TONE: Record<BookingStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-800' },
  confirmed: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  cancelled: { bg: 'bg-rose-100', text: 'text-rose-800' },
};

export function formatBookingStatus(status: BookingStatus | string | null | undefined): string {
  if (!status) return '—';
  return STATUS_LABEL_ES[status as BookingStatus] ?? status;
}

export function getStatusTone(status: BookingStatus | string | null | undefined) {
  if (!status) return { bg: 'bg-muted', text: 'text-muted-foreground' };
  return STATUS_TONE[status as BookingStatus] ?? { bg: 'bg-muted', text: 'text-muted-foreground' };
}

const FIELD_TYPE_LABEL_ES: Record<FieldType, string> = {
  F5: 'Fútbol 5',
  F7: 'Fútbol 7',
  F11: 'Fútbol 11',
};

export function formatFieldType(type: FieldType | string | null | undefined, full = false): string {
  if (!type) return '—';
  return full ? FIELD_TYPE_LABEL_ES[type as FieldType] ?? type : type;
}

const BLOCK_TYPE_LABEL_ES: Record<string, string> = {
  practice: 'Práctica',
  maintenance: 'Mantenimiento',
  event: 'Evento',
};

export function formatBlockType(type: string | null | undefined): string {
  if (!type) return '—';
  return BLOCK_TYPE_LABEL_ES[type] ?? type;
}

export function formatCurrency(amount: number | null | undefined): string {
  return `RD$ ${(amount ?? 0).toLocaleString('es-DO')}`;
}

const PAYMENT_METHOD_LABEL_ES: Record<PaymentMethod, string> = {
  bank_transfer: 'Transferencia bancaria',
  cash: 'Efectivo en oficina',
  card: 'Tarjeta en oficina',
};

export function formatPaymentMethod(method: PaymentMethod | string | null | undefined): string {
  if (!method) return '—';
  return PAYMENT_METHOD_LABEL_ES[method as PaymentMethod] ?? method;
}

/**
 * Convierte "HH:MM" (24h) a "H:MM am/pm" para mostrar al usuario.
 * Internamente la app sigue trabajando en 24h — esto es solo display.
 *
 *   formatTime12h('08:00') → '8:00 am'
 *   formatTime12h('00:30') → '12:30 am'
 *   formatTime12h('13:45') → '1:45 pm'
 *   formatTime12h('23:00') → '11:00 pm'
 */
export function formatTime12h(time: string | null | undefined): string {
  if (!time) return '—';
  const [hStr, mStr] = time.split(':');
  if (!hStr) return time;
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return time;
  const m = (mStr ?? '00').slice(0, 2).padStart(2, '0');
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

export function formatTimeRange12h(start: string, end: string): string {
  return `${formatTime12h(start)} – ${formatTime12h(end)}`;
}

export function formatBookingDate(dateString: string): string {
  if (!dateString) return '—';
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat('es-DO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
