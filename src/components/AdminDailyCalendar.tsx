import { useMemo } from 'react';
import { Block, Booking, Field, FieldType, User } from '@/types';
import { TIME_SLOTS } from '@/data/mockData';
import { formatBlockType, formatBookingStatus, formatCurrency, formatTime12h } from '@/lib/bookingFormat';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ============================================================
// Vista DIARIA del calendario: columnas por unidad jugable
// (F11, F7_1, F7_2, ..., C1, C2, ...) y filas por slot horario.
// Cada reserva o bloqueo se posiciona absolutamente sobre la columna
// y altura proporcional a su duración.
//
// Click en una celda vacía → onSlotClick(unitId, time)
//   → permite que el padre abra el dialog de "crear reserva manual"
//     prellenado con cancha + fecha + hora.
// Hover sobre una reserva → tooltip con info (cliente, status, $).
// Click en una reserva → onBookingClick(id) → abre detalle existente.
// ============================================================

interface Props {
  date: string;
  fields: Field[];
  bookings: Booking[];
  blocks: Block[];
  profiles: User[];
  onBookingClick: (bookingId: string) => void;
  onSlotClick: (unitId: string, time: string) => void;
}

const SLOT_HEIGHT = 32;
const TIME_LABEL_WIDTH = 64;
const COL_MIN_WIDTH = 120;

const STATUS_COLORS: Record<Booking['status'], string> = {
  confirmed: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  pending: 'bg-amber-400 hover:bg-amber-500 text-amber-950',
  cancelled: 'bg-rose-300 hover:bg-rose-400 text-rose-950',
};

const TYPE_LABEL: Record<FieldType, string> = {
  F11: 'Fútbol 11',
  F7: 'Fútbol 7',
  F5: 'Fútbol 5',
};

function timeToSlotIdx(time: string): number {
  const trimmed = time.length >= 5 ? time.slice(0, 5) : time;
  return TIME_SLOTS.indexOf(trimmed);
}

function durationInSlots(start: string, end: string): number {
  const startIdx = timeToSlotIdx(start);
  const endIdx = timeToSlotIdx(end);
  if (startIdx < 0 || endIdx < 0) return 1;
  return Math.max(1, endIdx - startIdx);
}

interface ConflictRange {
  startIdx: number;
  endIdx: number;
  reason: string;
}

interface ColumnData {
  unitId: string;
  unitName: string;
  unitType: FieldType;
  fieldName: string;
  // Bookings + blocks ya filtrados a esta unidad para la fecha actual.
  bookingsHere: Booking[];
  blocksHere: Block[];
  // Rangos donde esta unidad NO se puede reservar porque otra unidad
  // del mismo field (que comparte slot físico) ya está ocupada.
  // Ej: si C1 (S1) está bloqueada → F7_1 (S1+S4) y F11 (S1-S6) tienen
  //     un conflict range a la hora del bloqueo.
  conflictRanges: ConflictRange[];
  // Set de índices de TIME_SLOTS que caen dentro de algún conflict range,
  // para chequear rápido si un click cae en zona bloqueada.
  conflictedTimeIdx: Set<number>;
}

export default function AdminDailyCalendar({
  date,
  fields,
  bookings,
  blocks,
  profiles,
  onBookingClick,
  onSlotClick,
}: Props) {
  const columns = useMemo<ColumnData[]>(() => {
    const cols: ColumnData[] = [];
    fields
      .filter((f) => f.is_active !== false)
      .forEach((field) => {
        // Ordenamos: F11 primero, luego F7s, luego F5s.
        const orderedUnits = [...field.units]
          .filter((u) => u.is_active !== false)
          .sort((a, b) => {
            const order: Record<FieldType, number> = { F11: 0, F7: 1, F5: 2 };
            if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
            return a.name.localeCompare(b.name);
          });

        // Bookings y blocks del field para este día (cualquier unidad).
        const fieldBookingsToday = bookings.filter(
          (b) => b.date === date && b.status !== 'cancelled' &&
            field.units.some((u) => u.id === b.field_unit_id),
        );
        const fieldBlocksToday = blocks.filter(
          (b) => b.field_id === field.id && b.date === date,
        );

        orderedUnits.forEach((unit) => {
          const bookingsHere = fieldBookingsToday.filter((b) => b.field_unit_id === unit.id);
          const blocksHere = fieldBlocksToday.filter((b) => b.field_unit_ids.includes(unit.id));

          // Calcular rangos de conflicto: bookings/blocks de OTRAS unidades
          // del field cuyas slots se solapan con las de esta unidad.
          const requiredSlots = new Set(unit.slot_ids);
          const conflictRanges: ConflictRange[] = [];

          fieldBookingsToday
            .filter((b) => b.field_unit_id !== unit.id)
            .forEach((b) => {
              const otherUnit = field.units.find((u) => u.id === b.field_unit_id);
              if (!otherUnit) return;
              const sharesSlot = otherUnit.slot_ids.some((s) => requiredSlots.has(s));
              if (!sharesSlot) return;
              const sIdx = TIME_SLOTS.indexOf(b.start_time);
              const eIdx = TIME_SLOTS.indexOf(b.end_time);
              if (sIdx >= 0 && eIdx > sIdx) {
                conflictRanges.push({
                  startIdx: sIdx,
                  endIdx: eIdx,
                  reason: `Reservado en ${otherUnit.name} (comparte espacio físico)`,
                });
              }
            });

          fieldBlocksToday
            .filter((b) => !b.field_unit_ids.includes(unit.id))
            .forEach((b) => {
              const blockedUnits = b.field_unit_ids
                .map((id) => field.units.find((u) => u.id === id))
                .filter(Boolean) as typeof field.units;
              const sharesSlot = blockedUnits.some((bu) =>
                bu.slot_ids.some((s) => requiredSlots.has(s)),
              );
              if (!sharesSlot) return;
              const sIdx = TIME_SLOTS.indexOf(b.start_time);
              const eIdx = TIME_SLOTS.indexOf(b.end_time);
              if (sIdx >= 0 && eIdx > sIdx) {
                conflictRanges.push({
                  startIdx: sIdx,
                  endIdx: eIdx,
                  reason: `Bloqueado por otra cancha que comparte espacio: ${b.reason}`,
                });
              }
            });

          // Set de índices conflictivos para chequeo O(1) en el click.
          const conflictedTimeIdx = new Set<number>();
          conflictRanges.forEach((r) => {
            for (let i = r.startIdx; i < r.endIdx; i += 1) {
              conflictedTimeIdx.add(i);
            }
          });

          cols.push({
            unitId: unit.id,
            unitName: unit.name,
            unitType: unit.type,
            fieldName: field.name,
            bookingsHere,
            blocksHere,
            conflictRanges,
            conflictedTimeIdx,
          });
        });
      });
    return cols;
  }, [fields, bookings, blocks, date]);

  const totalHeight = TIME_SLOTS.length * SLOT_HEIGHT;
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = date === todayStr;

  if (columns.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Este club aún no tiene canchas configuradas. Crea una desde la sección "Campos".
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        {/* Header con nombres de unidad */}
        <div
          className="grid border-b border-border bg-muted/30"
          style={{
            gridTemplateColumns: `${TIME_LABEL_WIDTH}px repeat(${columns.length}, minmax(${COL_MIN_WIDTH}px, 1fr))`,
          }}
        >
          <div className="px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hora
          </div>
          {columns.map((col) => (
            <div
              key={col.unitId}
              className="border-l border-border px-2 py-2 text-center"
              title={`${TYPE_LABEL[col.unitType]} · ${col.fieldName}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {TYPE_LABEL[col.unitType]}
              </div>
              <div className="font-heading text-xs font-bold leading-tight text-foreground">
                {col.unitName}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">{col.fieldName}</div>
            </div>
          ))}
        </div>

        {/* Grid de slots */}
        <div className="overflow-x-auto">
          <div
            className="relative grid"
            style={{
              height: totalHeight,
              gridTemplateColumns: `${TIME_LABEL_WIDTH}px repeat(${columns.length}, minmax(${COL_MIN_WIDTH}px, 1fr))`,
            }}
          >
            {/* Columna de horas */}
            <div className="relative border-r border-border">
              {TIME_SLOTS.map((time, idx) => (
                <div
                  key={time}
                  className="flex items-start justify-end pr-2 pt-0.5 text-[10px] tabular-nums text-muted-foreground"
                  style={{ height: SLOT_HEIGHT }}
                >
                  {idx % 2 === 0 ? formatTime12h(time) : ''}
                </div>
              ))}
            </div>

            {/* Columnas por unidad */}
            {columns.map((col) => (
              <div
                key={col.unitId}
                className={`relative border-l border-border ${isToday ? 'bg-primary/5' : ''}`}
              >
                {/* Background grid de slots clickeables. Si el slot cae en
                    un rango de conflicto (otra cancha del field comparte
                    espacio físico), se renderiza no-clickeable. */}
                {TIME_SLOTS.slice(0, -1).map((time, idx) => {
                  const isConflicted = col.conflictedTimeIdx.has(idx);
                  if (isConflicted) {
                    return (
                      <div
                        key={time}
                        className={`block w-full border-b ${
                          idx % 2 === 0 ? 'border-border/70' : 'border-border/40'
                        }`}
                        style={{ height: SLOT_HEIGHT }}
                      />
                    );
                  }
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => onSlotClick(col.unitId, time)}
                      className={`block w-full cursor-pointer border-b transition-colors hover:bg-primary/10 ${
                        idx % 2 === 0 ? 'border-border/70' : 'border-border/40'
                      }`}
                      style={{ height: SLOT_HEIGHT }}
                      title={`Crear reserva en ${col.unitName} a las ${formatTime12h(time)}`}
                      aria-label={`Crear reserva en ${col.unitName} a las ${formatTime12h(time)}`}
                    />
                  );
                })}
                {/* Última fila como visual filler */}
                <div className="border-b border-border/40" style={{ height: SLOT_HEIGHT }} />

                {/* Overlay de conflictos: rayado gris claro indicando que
                    esa zona está ocupada por una unidad hermana que
                    comparte espacio físico. No clickeable. */}
                {col.conflictRanges.map((range, i) => {
                  const top = range.startIdx * SLOT_HEIGHT;
                  const height = (range.endIdx - range.startIdx) * SLOT_HEIGHT - 2;
                  return (
                    <Tooltip key={`conflict-${i}-${range.startIdx}`}>
                      <TooltipTrigger asChild>
                        <div
                          className="pointer-events-auto absolute left-1 right-1 cursor-not-allowed rounded-md border border-dashed border-zinc-400/60 bg-white/40"
                          style={{
                            top,
                            height,
                            backgroundImage:
                              'repeating-linear-gradient(45deg, rgba(0,0,0,0) 0 6px, rgba(0,0,0,0.06) 6px 12px)',
                          }}
                          aria-label="No disponible por conflicto"
                        />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">{range.reason}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* Bookings posicionados absolutamente sobre la columna */}
                {col.bookingsHere.map((booking) => {
                  const startIdx = timeToSlotIdx(booking.start_time);
                  if (startIdx < 0) return null;
                  const slots = durationInSlots(booking.start_time, booking.end_time);
                  const top = startIdx * SLOT_HEIGHT;
                  const height = slots * SLOT_HEIGHT - 4;
                  const colorClass = STATUS_COLORS[booking.status];
                  const client = profiles.find((p) => p.id === booking.user_id);
                  const clientName = client
                    ? `${client.first_name} ${client.last_name}`.trim() || client.email
                    : 'Cliente';

                  return (
                    <Tooltip key={booking.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onBookingClick(booking.id)}
                          className={`absolute left-1 right-1 flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm ring-1 ring-inset ring-black/10 transition-transform hover:z-10 hover:scale-[1.02] ${colorClass}`}
                          style={{ top, height }}
                        >
                          <div className="text-[10px] font-bold leading-tight">
                            {formatTime12h(booking.start_time)}
                          </div>
                          {height >= 36 && (
                            <div className="truncate text-[10px] font-medium leading-tight">
                              {clientName}
                            </div>
                          )}
                          {height >= 56 && (
                            <div className="mt-auto truncate text-[9px] uppercase tracking-wide opacity-90">
                              {formatBookingStatus(booking.status)}
                            </div>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">{clientName}</p>
                          <p>
                            <span className="text-muted-foreground">Horario:</span>{' '}
                            {formatTime12h(booking.start_time)} – {formatTime12h(booking.end_time)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Modalidad:</span>{' '}
                            {booking.field_type} · {col.unitName}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Total:</span>{' '}
                            {formatCurrency(booking.total_price)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Estado:</span>{' '}
                            {formatBookingStatus(booking.status)}
                          </p>
                          {client?.email && (
                            <p className="text-muted-foreground">{client.email}</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* Blocks */}
                {col.blocksHere.map((block) => {
                  const startIdx = timeToSlotIdx(block.start_time);
                  if (startIdx < 0) return null;
                  const slots = durationInSlots(block.start_time, block.end_time);
                  const top = startIdx * SLOT_HEIGHT;
                  const height = slots * SLOT_HEIGHT - 4;
                  return (
                    <Tooltip key={block.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute left-1 right-1 flex flex-col overflow-hidden rounded-md bg-zinc-700 px-1.5 py-1 text-left text-white shadow-sm ring-1 ring-inset ring-zinc-800"
                          style={{
                            top,
                            height,
                            backgroundImage:
                              'repeating-linear-gradient(45deg, rgba(255,255,255,0) 0 6px, rgba(255,255,255,0.1) 6px 12px)',
                          }}
                        >
                          <div className="text-[10px] font-bold leading-tight">
                            {formatTime12h(block.start_time)}
                          </div>
                          {height >= 36 && (
                            <div className="truncate text-[10px] font-medium leading-tight">
                              {block.reason}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">Bloqueo · {formatBlockType(block.type)}</p>
                          <p>
                            <span className="text-muted-foreground">Horario:</span>{' '}
                            {formatTime12h(block.start_time)} – {formatTime12h(block.end_time)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Razón:</span>{' '}
                            {block.reason}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Leyenda */}
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
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-md border border-dashed border-zinc-400 bg-white"
              style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.1) 2px 4px)' }}
            />
            En conflicto
          </span>
          <span className="ml-auto opacity-70">
            Click en un slot vacío para crear una reserva. Hover para ver detalles.
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
