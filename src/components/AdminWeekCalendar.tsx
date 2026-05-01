import { useMemo } from 'react';
import { Block, Booking, Field } from '@/types';
import { TIME_SLOTS } from '@/data/mockData';
import { formatBlockType, formatBookingStatus, formatTime12h } from '@/lib/bookingFormat';

interface Props {
  weekDates: string[];
  bookings: Booking[];
  blocks: Block[];
  fields: Field[];
  onBookingClick?: (bookingId: string) => void;
}

const SLOT_HEIGHT = 32;
const TIME_LABEL_HEIGHT = SLOT_HEIGHT;
const VISIBLE_LABEL_INTERVAL = 2;

const STATUS_COLORS: Record<Booking['status'], { bg: string; ring: string; text: string; accent: string }> = {
  confirmed: {
    bg: 'bg-emerald-500',
    ring: 'ring-emerald-600',
    text: 'text-white',
    accent: 'bg-emerald-700',
  },
  pending: {
    bg: 'bg-amber-400',
    ring: 'ring-amber-500',
    text: 'text-amber-950',
    accent: 'bg-amber-600',
  },
  cancelled: {
    bg: 'bg-rose-300',
    ring: 'ring-rose-400',
    text: 'text-rose-950',
    accent: 'bg-rose-600',
  },
};

function timeToSlotIdx(time: string): number {
  if (!time) return -1;
  const trimmed = time.length >= 5 ? time.slice(0, 5) : time;
  return TIME_SLOTS.indexOf(trimmed);
}

function durationInSlots(start: string, end: string): number {
  const startIdx = timeToSlotIdx(start);
  const endIdx = timeToSlotIdx(end);
  if (startIdx < 0 || endIdx < 0) return 1;
  return Math.max(1, endIdx - startIdx);
}

export default function AdminWeekCalendar({ weekDates, bookings, blocks, fields, onBookingClick }: Props) {
  const totalHeight = TIME_SLOTS.length * SLOT_HEIGHT;

  const eventsByDate = useMemo(() => {
    const map = new Map<string, { bookings: Booking[]; blocks: Block[] }>();
    weekDates.forEach((date) => {
      map.set(date, {
        bookings: bookings.filter((b) => b.date === date && b.status !== 'cancelled'),
        blocks: blocks.filter((b) => b.date === date),
      });
    });
    return map;
  }, [weekDates, bookings, blocks]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-[64px_repeat(7,minmax(120px,1fr))] border-b border-border bg-muted/30">
        <div className="px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Hora
        </div>
        {weekDates.map((date) => {
          const dateObj = new Date(`${date}T00:00:00`);
          const isToday = date === today;
          return (
            <div
              key={date}
              className={`px-2 py-3 text-center ${isToday ? 'bg-primary/10' : ''}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {dateObj.toLocaleDateString('es', { weekday: 'short' })}
              </div>
              <div className={`font-heading text-base font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                {dateObj.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <div
          className="relative grid grid-cols-[64px_repeat(7,minmax(120px,1fr))]"
          style={{ height: totalHeight }}
        >
          <div className="relative border-r border-border">
            {TIME_SLOTS.map((time, idx) => {
              const showLabel = idx % VISIBLE_LABEL_INTERVAL === 0;
              return (
                <div
                  key={time}
                  className="flex items-start justify-end pr-2 pt-0.5 text-[10px] tabular-nums text-muted-foreground"
                  style={{ height: TIME_LABEL_HEIGHT }}
                >
                  {showLabel ? formatTime12h(time) : ''}
                </div>
              );
            })}
          </div>

          {weekDates.map((date) => {
            const events = eventsByDate.get(date)!;
            const isToday = date === today;
            return (
              <div
                key={date}
                className={`relative border-r border-border last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}
              >
                {TIME_SLOTS.map((time, idx) => (
                  <div
                    key={time}
                    className={`border-b border-border/40 ${idx % VISIBLE_LABEL_INTERVAL === 0 ? 'border-border/70' : ''}`}
                    style={{ height: SLOT_HEIGHT }}
                  />
                ))}

                {events.bookings.map((booking) => {
                  const startIdx = timeToSlotIdx(booking.start_time);
                  if (startIdx < 0) return null;
                  const slots = durationInSlots(booking.start_time, booking.end_time);
                  const top = startIdx * SLOT_HEIGHT;
                  const height = slots * SLOT_HEIGHT - 4;
                  const colors = STATUS_COLORS[booking.status];
                  const field = fields.find((f) => f.units.some((u) => u.id === booking.field_unit_id));
                  const unit = field?.units.find((u) => u.id === booking.field_unit_id);
                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => onBookingClick?.(booking.id)}
                      className={`absolute left-1 right-1 flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm ring-1 ring-inset transition-transform hover:z-10 hover:scale-[1.02] ${colors.bg} ${colors.ring} ${colors.text}`}
                      style={{ top, height }}
                      title={`${formatBookingStatus(booking.status)} · ${formatTime12h(booking.start_time)}–${formatTime12h(booking.end_time)} · ${unit?.name ?? booking.field_type}`}
                    >
                      <div className="flex items-center gap-1 text-[10px] font-bold leading-tight">
                        <span className="rounded bg-white/30 px-1 py-px">{booking.field_type}</span>
                        <span className="tabular-nums opacity-90">{formatTime12h(booking.start_time)}</span>
                      </div>
                      {height >= 36 && (
                        <div className="mt-0.5 truncate text-[10px] font-medium leading-tight opacity-95">
                          {unit?.name ?? 'Reserva'}
                        </div>
                      )}
                      {height >= 56 && (
                        <div className="mt-auto truncate text-[9px] uppercase tracking-wide opacity-80">
                          {formatBookingStatus(booking.status)}
                        </div>
                      )}
                    </button>
                  );
                })}

                {events.blocks.map((block) => {
                  const startIdx = timeToSlotIdx(block.start_time);
                  if (startIdx < 0) return null;
                  const slots = durationInSlots(block.start_time, block.end_time);
                  const top = startIdx * SLOT_HEIGHT;
                  const height = slots * SLOT_HEIGHT - 4;
                  return (
                    <div
                      key={block.id}
                      className="absolute left-1 right-1 flex flex-col overflow-hidden rounded-md bg-zinc-700 px-1.5 py-1 text-left text-white shadow-sm ring-1 ring-inset ring-zinc-800"
                      style={{
                        top,
                        height,
                        backgroundImage:
                          'repeating-linear-gradient(45deg, rgba(255,255,255,0) 0 6px, rgba(255,255,255,0.1) 6px 12px)',
                      }}
                      title={`${formatBlockType(block.type)} · ${formatTime12h(block.start_time)}–${formatTime12h(block.end_time)} · ${block.reason}`}
                    >
                      <div className="flex items-center gap-1 text-[10px] font-bold leading-tight">
                        <span className="rounded bg-white/20 px-1 py-px uppercase">{formatBlockType(block.type)}</span>
                        <span className="tabular-nums opacity-90">{formatTime12h(block.start_time)}</span>
                      </div>
                      {height >= 36 && (
                        <div className="mt-0.5 truncate text-[10px] font-medium leading-tight opacity-95">
                          {block.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Confirmada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Pendiente
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full bg-zinc-700"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0) 0 2px, rgba(255,255,255,0.3) 2px 4px)' }}
          />
          Bloqueo
        </span>
        <span className="ml-auto opacity-70">Click en una reserva para ver el detalle.</span>
      </div>
    </div>
  );
}
