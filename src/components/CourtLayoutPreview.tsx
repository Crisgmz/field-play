import { useState } from 'react';
import { FieldType, FieldUnit, PhysicalSlotId } from '@/types';
import { COURT_TEMPLATES } from '@/types/courtConfig';
import { getConflictPairs } from '@/lib/courtConfig';

type LayoutPreset = 'full_11' | 'three_7' | 'six_5' | 'versatile_full';

interface Props {
  /** Use layout preset (for field creation preview) */
  layout?: LayoutPreset;
  /** Use real field units (for existing field display) */
  units?: FieldUnit[];
  highlightType?: FieldType | null;
  compact?: boolean;
}

const SLOT_LABELS: Record<PhysicalSlotId, string> = {
  S1: 'Zona 1', S2: 'Zona 2', S3: 'Zona 3',
  S4: 'Zona 4', S5: 'Zona 5', S6: 'Zona 6',
};

interface DisplayUnit {
  type: FieldType;
  name: string;
  slots: PhysicalSlotId[];
}

function getUnitsFromLayout(layout: LayoutPreset): DisplayUnit[] {
  const template = COURT_TEMPLATES.find((t) => t.id === layout);
  if (!template) return [];
  return template.units.map((u) => ({ type: u.type, name: u.name, slots: u.slotIds }));
}

function getUnitsFromFieldUnits(fieldUnits: FieldUnit[]): DisplayUnit[] {
  return fieldUnits
    .filter((u) => u.is_active !== false)
    .map((u) => ({ type: u.type, name: u.name, slots: u.slot_ids }));
}

const TYPE_COLORS: Record<FieldType, { bg: string; border: string; text: string; ring: string }> = {
  F11: { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-700', ring: 'ring-violet-400' },
  F7: { bg: 'bg-sky-100', border: 'border-sky-400', text: 'text-sky-700', ring: 'ring-sky-400' },
  F5: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', ring: 'ring-amber-400' },
};

const SLOT_IDS: PhysicalSlotId[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

const GROUP_COLORS = [
  'ring-violet-400 bg-violet-50',
  'ring-sky-400 bg-sky-50',
  'ring-amber-400 bg-amber-50',
  'ring-emerald-400 bg-emerald-50',
  'ring-rose-400 bg-rose-50',
  'ring-indigo-400 bg-indigo-50',
];

function getHighlightedSlots(units: DisplayUnit[], type: FieldType | null): Set<PhysicalSlotId> {
  if (!type) return new Set();
  const filtered = units.filter((u) => u.type === type);
  const slots = new Set<PhysicalSlotId>();
  filtered.forEach((u) => u.slots.forEach((s) => slots.add(s)));
  return slots;
}

function getSlotGrouping(units: DisplayUnit[], type: FieldType | null): Map<PhysicalSlotId, number> {
  const groupMap = new Map<PhysicalSlotId, number>();
  if (!type) return groupMap;
  const filtered = units.filter((u) => u.type === type);
  filtered.forEach((u, idx) => u.slots.forEach((s) => groupMap.set(s, idx)));
  return groupMap;
}

export default function CourtLayoutPreview({ layout, units: fieldUnits, highlightType: externalHighlight, compact }: Props) {
  const [internalHighlight, setInternalHighlight] = useState<FieldType | null>(null);
  const activeType = externalHighlight !== undefined ? externalHighlight : internalHighlight;

  const units = fieldUnits ? getUnitsFromFieldUnits(fieldUnits) : getUnitsFromLayout(layout ?? 'versatile_full');
  const availableTypes = [...new Set(units.map((u) => u.type))];
  const highlightedSlots = getHighlightedSlots(units, activeType);
  const grouping = getSlotGrouping(units, activeType);
  const unitsForType = activeType ? units.filter((u) => u.type === activeType) : [];

  // Compute conflict count for real units
  const conflictCount = fieldUnits ? getConflictPairs(fieldUnits).length : 0;

  // Infer layout description
  const layoutId = layout ?? (fieldUnits ? inferLayout(fieldUnits) : 'versatile_full');

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Type selector pills */}
      {externalHighlight === undefined && (
        <div className="flex flex-wrap gap-2">
          {availableTypes.map((type) => {
            const colors = TYPE_COLORS[type];
            const isActive = activeType === type;
            const count = units.filter((u) => u.type === type).length;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setInternalHighlight(isActive ? null : type)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                  isActive
                    ? `${colors.bg} ${colors.border} ${colors.text} ring-2 ${colors.ring}`
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {type} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Court visual — 3×2 grid representing the physical field */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-300 bg-emerald-700/10 p-1">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[60%] w-px bg-white/20" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />

        <div className={`grid grid-cols-3 ${compact ? 'gap-1' : 'gap-1.5'}`}>
          {SLOT_IDS.map((slotId) => {
            const isHighlighted = highlightedSlots.has(slotId);
            const group = grouping.get(slotId);
            const groupColor = group !== undefined ? GROUP_COLORS[group % GROUP_COLORS.length] : '';

            return (
              <div
                key={slotId}
                className={`relative flex flex-col items-center justify-center transition-all ${
                  compact ? 'rounded-lg py-3 px-2' : 'rounded-xl py-5 px-3'
                } ${
                  isHighlighted
                    ? `${groupColor} ring-2 shadow-sm`
                    : 'bg-emerald-600/20 text-emerald-800'
                }`}
              >
                <span className={`font-heading font-bold ${compact ? 'text-xs' : 'text-sm'} ${
                  isHighlighted ? 'text-foreground' : 'text-emerald-700'
                }`}>
                  {SLOT_LABELS[slotId]}
                </span>
                {!compact && (
                  <span className={`mt-0.5 text-[10px] ${isHighlighted ? 'text-muted-foreground' : 'text-emerald-600'}`}>
                    {slotId}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Unit list for the highlighted type */}
      {activeType && unitsForType.length > 0 && (
        <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {activeType === 'F11' ? 'Cancha completa' : activeType === 'F7' ? 'Modalidades Fútbol 7' : 'Modalidades Fútbol 5'}
            {' '}({unitsForType.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unitsForType.map((unit, idx) => {
              const groupColor = GROUP_COLORS[idx % GROUP_COLORS.length];
              return (
                <span
                  key={`${unit.type}-${unit.name}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ring-1 ${groupColor}`}
                >
                  <span className="font-bold">{unit.name}</span>
                  <span className="opacity-60">{unit.slots.join('+')}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Conflict info for real field units */}
      {!compact && conflictCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-700">
            {conflictCount} {conflictCount === 1 ? 'conflicto' : 'conflictos'} de superposición
          </p>
          <p className="mt-0.5 text-[10px] text-amber-600">
            Las unidades que comparten zonas físicas no pueden reservarse a la vez.
            Ej: reservar F11 bloquea todos los F7 y F5.
          </p>
        </div>
      )}

      {/* Explanation text */}
      {!compact && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {layoutId === 'versatile_full'
            ? 'Configuración versátil: la cancha puede alquilarse como 1 F11, 3 F7, o 6 F5. El sistema previene conflictos automáticamente.'
            : layoutId === 'full_11'
              ? 'Toda la cancha se alquila como una sola unidad F11 (6 zonas).'
              : layoutId === 'three_7'
                ? 'La cancha se divide en 3 canchas F7, cada una usando 2 zonas adyacentes.'
                : layoutId === 'six_5'
                  ? 'La cancha se divide en 6 mini canchas F5 independientes (1 zona cada una).'
                  : 'Configuración personalizada.'}
        </p>
      )}
    </div>
  );
}

function inferLayout(units: FieldUnit[]): LayoutPreset | 'custom' {
  const active = units.filter((u) => u.is_active !== false);
  const f11 = active.filter((u) => u.type === 'F11').length;
  const f7 = active.filter((u) => u.type === 'F7').length;
  const f5 = active.filter((u) => u.type === 'F5').length;

  if (f11 === 1 && f7 === 3 && f5 === 6) return 'versatile_full';
  if (f11 === 1 && f7 === 0 && f5 === 0) return 'full_11';
  if (f7 === 3 && f11 === 0 && f5 === 0) return 'three_7';
  if (f5 === 6 && f11 === 0 && f7 === 0) return 'six_5';
  return 'custom';
}
