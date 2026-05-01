import { Block, Booking, Field, FieldType, User } from '@/types';
import { VenueConfig } from '@/types/courtConfig';

function hourLabel12h(hour: number): string {
  if (hour === 0) return '12 am';
  if (hour === 12) return '12 pm';
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

// ============================================================
// Cálculos puros para la sección de reportes.
// Recibimos los arrays ya filtrados por club + rango de fechas
// para mantener cada función simple y testeable.
// ============================================================

export interface ReportsRange {
  startDate: string; // YYYY-MM-DD inclusivo
  endDate: string;   // YYYY-MM-DD inclusivo
}

export interface ReportsKPIs {
  totalRevenue: number;
  confirmedBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  totalBookings: number;
  cancellationRate: number; // 0-1
  occupancyRate: number;    // 0-1 (horas confirmadas / horas operativas)
  uniqueClients: number;
  averageTicket: number;
}

export function isDateInRange(date: string, range: ReportsRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}

export function durationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

export function durationHours(start: string, end: string): number {
  return durationMinutes(start, end) / 60;
}

function enumerateDates(range: ReportsRange): string[] {
  const out: string[] = [];
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ── KPIs principales ──────────────────────────────────────────

export function computeKPIs(
  bookings: Booking[],
  range: ReportsRange,
  totalFields: number,
  venueConfig: VenueConfig | null,
): ReportsKPIs {
  const inRange = bookings.filter((b) => isDateInRange(b.date, range));
  const confirmed = inRange.filter((b) => b.status === 'confirmed');
  const pending = inRange.filter((b) => b.status === 'pending');
  const cancelled = inRange.filter((b) => b.status === 'cancelled');

  const totalRevenue = confirmed.reduce((sum, b) => sum + (b.total_price ?? 0), 0);
  const confirmedHours = confirmed.reduce(
    (sum, b) => sum + durationHours(b.start_time, b.end_time),
    0,
  );

  // Capacidad total operativa: días en el rango × horas operativas × N canchas físicas.
  const dates = enumerateDates(range);
  const operatingHours = dates.reduce((sum, dateStr) => {
    if ((venueConfig?.closedDates ?? []).includes(dateStr)) return sum;
    const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();
    const day = venueConfig?.weekSchedule?.find((d) => d.day === dayOfWeek);
    if (day?.closed) return sum;
    const open = day?.open ?? '08:00';
    const close = day?.close ?? '23:00';
    return sum + durationHours(open, close);
  }, 0);

  const totalCapacityHours = operatingHours * Math.max(1, totalFields);
  const occupancyRate = totalCapacityHours > 0 ? confirmedHours / totalCapacityHours : 0;

  const uniqueClients = new Set(confirmed.map((b) => b.user_id)).size;
  const totalBookings = inRange.length;
  const cancellationRate = totalBookings > 0 ? cancelled.length / totalBookings : 0;
  const averageTicket = confirmed.length > 0 ? totalRevenue / confirmed.length : 0;

  return {
    totalRevenue,
    confirmedBookings: confirmed.length,
    pendingBookings: pending.length,
    cancelledBookings: cancelled.length,
    totalBookings,
    cancellationRate,
    occupancyRate,
    uniqueClients,
    averageTicket,
  };
}

// ── Series temporales de ingresos ────────────────────────────

export interface DailyRevenuePoint {
  date: string;       // YYYY-MM-DD
  label: string;      // "12 abr"
  revenue: number;
  bookings: number;
}

export function computeDailyRevenue(bookings: Booking[], range: ReportsRange): DailyRevenuePoint[] {
  const buckets = new Map<string, { revenue: number; bookings: number }>();
  enumerateDates(range).forEach((d) => buckets.set(d, { revenue: 0, bookings: 0 }));

  bookings
    .filter((b) => isDateInRange(b.date, range) && b.status === 'confirmed')
    .forEach((b) => {
      const bucket = buckets.get(b.date);
      if (!bucket) return;
      bucket.revenue += b.total_price ?? 0;
      bucket.bookings += 1;
    });

  return Array.from(buckets.entries()).map(([date, data]) => {
    const dt = new Date(`${date}T12:00:00`);
    return {
      date,
      label: dt.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }),
      revenue: data.revenue,
      bookings: data.bookings,
    };
  });
}

// ── Distribución por modalidad ───────────────────────────────

export interface ModalityBreakdown {
  type: FieldType;
  bookings: number;
  revenue: number;
  hours: number;
}

export function computeModalityBreakdown(bookings: Booking[], range: ReportsRange): ModalityBreakdown[] {
  const types: FieldType[] = ['F11', 'F7', 'F5'];
  return types.map((type) => {
    const subset = bookings.filter(
      (b) => isDateInRange(b.date, range) && b.status === 'confirmed' && b.field_type === type,
    );
    return {
      type,
      bookings: subset.length,
      revenue: subset.reduce((sum, b) => sum + (b.total_price ?? 0), 0),
      hours: subset.reduce((sum, b) => sum + durationHours(b.start_time, b.end_time), 0),
    };
  });
}

// ── Distribución por día de la semana ────────────────────────

export interface WeekdayBreakdown {
  day: number; // 0 = domingo
  label: string;
  bookings: number;
  revenue: number;
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function computeWeekdayBreakdown(bookings: Booking[], range: ReportsRange): WeekdayBreakdown[] {
  const buckets: WeekdayBreakdown[] = WEEKDAY_LABELS.map((label, day) => ({
    day,
    label,
    bookings: 0,
    revenue: 0,
  }));

  bookings
    .filter((b) => isDateInRange(b.date, range) && b.status === 'confirmed')
    .forEach((b) => {
      const day = new Date(`${b.date}T12:00:00`).getDay();
      buckets[day].bookings += 1;
      buckets[day].revenue += b.total_price ?? 0;
    });

  return buckets;
}

// ── Distribución por hora del día ────────────────────────────

export interface HourBreakdown {
  hour: number; // 0-23
  label: string;
  bookings: number;
}

export function computeHourBreakdown(bookings: Booking[], range: ReportsRange): HourBreakdown[] {
  const buckets: HourBreakdown[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hourLabel12h(hour),
    bookings: 0,
  }));

  bookings
    .filter((b) => isDateInRange(b.date, range) && b.status === 'confirmed')
    .forEach((b) => {
      const startHour = parseInt(b.start_time.split(':')[0], 10);
      const endHour = parseInt(b.end_time.split(':')[0], 10);
      // Una reserva puede cruzar varias horas; le cuenta a cada hora cubierta.
      for (let h = startHour; h < endHour; h += 1) {
        buckets[h].bookings += 1;
      }
    });

  // Filtramos horas con 0 reservas para evitar gráficos con 24 puntos vacíos.
  // Mantenemos al menos del 6:00 al 23:00 para contexto operativo.
  return buckets.filter((b) => b.hour >= 6 && b.hour <= 23);
}

// ── Top clientes ─────────────────────────────────────────────

export interface ClientStats {
  userId: string;
  fullName: string;
  email: string;
  bookings: number;
  spent: number;
}

export function computeTopClients(
  bookings: Booking[],
  profiles: User[],
  range: ReportsRange,
  limit = 10,
): ClientStats[] {
  const map = new Map<string, ClientStats>();

  bookings
    .filter((b) => isDateInRange(b.date, range) && b.status === 'confirmed')
    .forEach((b) => {
      const profile = profiles.find((p) => p.id === b.user_id);
      const existing = map.get(b.user_id) ?? {
        userId: b.user_id,
        fullName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Cliente desconocido',
        email: profile?.email ?? '',
        bookings: 0,
        spent: 0,
      };
      existing.bookings += 1;
      existing.spent += b.total_price ?? 0;
      map.set(b.user_id, existing);
    });

  return Array.from(map.values())
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
}

// ── Bloqueos por tipo ────────────────────────────────────────

export interface BlockBreakdown {
  type: 'practice' | 'maintenance' | 'event';
  label: string;
  count: number;
  hours: number;
}

export function computeBlockBreakdown(blocks: Block[], range: ReportsRange): BlockBreakdown[] {
  const labels: Record<BlockBreakdown['type'], string> = {
    practice: 'Práctica',
    maintenance: 'Mantenimiento',
    event: 'Evento',
  };
  const buckets: Record<BlockBreakdown['type'], BlockBreakdown> = {
    practice: { type: 'practice', label: labels.practice, count: 0, hours: 0 },
    maintenance: { type: 'maintenance', label: labels.maintenance, count: 0, hours: 0 },
    event: { type: 'event', label: labels.event, count: 0, hours: 0 },
  };

  blocks
    .filter((b) => isDateInRange(b.date, range))
    .forEach((b) => {
      const bucket = buckets[b.type];
      if (!bucket) return;
      bucket.count += 1;
      bucket.hours += durationHours(b.start_time, b.end_time);
    });

  return Object.values(buckets);
}

// ── Helper: filtrar bookings por club ────────────────────────

export function bookingsForClub(
  bookings: Booking[],
  clubId: string | 'all',
  fieldsByClub: Record<string, Field[]>,
): Booking[] {
  if (clubId === 'all') return bookings;
  const allowedUnitIds = new Set(
    (fieldsByClub[clubId] ?? []).flatMap((f) => f.units.map((u) => u.id)),
  );
  return bookings.filter((b) => allowedUnitIds.has(b.field_unit_id));
}

// ── Helper: rango por preset ─────────────────────────────────

export type RangePreset = '7d' | '30d' | '90d' | 'year' | 'custom';

export function rangeFromPreset(preset: RangePreset, customStart?: string, customEnd?: string): ReportsRange {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (preset === 'custom') {
    return {
      startDate: customStart ?? todayStr,
      endDate: customEnd ?? todayStr,
    };
  }

  const start = new Date(today);
  if (preset === '7d') start.setDate(start.getDate() - 6);
  else if (preset === '30d') start.setDate(start.getDate() - 29);
  else if (preset === '90d') start.setDate(start.getDate() - 89);
  else if (preset === 'year') start.setMonth(0, 1);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: todayStr,
  };
}
