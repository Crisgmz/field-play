import { Field, FieldType, FieldUnit, PhysicalSlotId } from '@/types';
import {
  ConflictPair,
  CourtTemplate,
  CourtTemplateUnit,
  COURT_TEMPLATES,
  DaySchedule,
  DEFAULT_WEEK_SCHEDULE,
  FieldConfigSummary,
  VenueConfig,
} from '@/types/courtConfig';

// ── TEMPLATE LOOKUP ────────────────────────────────────────

export function getTemplate(templateId: string): CourtTemplate | undefined {
  return COURT_TEMPLATES.find((t) => t.id === templateId);
}

export function getTemplateForField(field: Field): CourtTemplate | undefined {
  // Infer template from existing units
  const f11Count = field.units.filter((u) => u.type === 'F11').length;
  const f7Count = field.units.filter((u) => u.type === 'F7').length;
  const f5Count = field.units.filter((u) => u.type === 'F5').length;

  if (f11Count === 1 && f7Count === 3 && f5Count === 6) return getTemplate('versatile_full');
  if (f11Count === 1 && f7Count === 0 && f5Count === 0) return getTemplate('full_11');
  if (f7Count === 3 && f11Count === 0 && f5Count === 0) return getTemplate('three_7');
  if (f5Count === 6 && f11Count === 0 && f7Count === 0) return getTemplate('six_5');
  return undefined; // custom config
}

// ── CONFLICT DETECTION ─────────────────────────────────────
// Two field units conflict if they share any physical slot.
// This is the core rule: booking F11 blocks all F7 and F5 on the same field.

export function findSharedSlots(
  slotsA: PhysicalSlotId[],
  slotsB: PhysicalSlotId[],
): PhysicalSlotId[] {
  const setB = new Set(slotsB);
  return slotsA.filter((s) => setB.has(s));
}

export function getConflictPairs(units: FieldUnit[]): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const shared = findSharedSlots(units[i].slot_ids, units[j].slot_ids);
      if (shared.length > 0) {
        pairs.push({
          unitA: units[i].id,
          unitB: units[j].id,
          sharedSlots: shared,
        });
      }
    }
  }
  return pairs;
}

/**
 * Given a unit id, returns all other unit ids that conflict with it
 * (share at least one physical slot).
 */
export function getConflictingUnitIds(unitId: string, units: FieldUnit[]): string[] {
  const target = units.find((u) => u.id === unitId);
  if (!target) return [];
  const targetSlots = new Set(target.slot_ids);
  return units
    .filter((u) => u.id !== unitId && u.slot_ids.some((s) => targetSlots.has(s)))
    .map((u) => u.id);
}

/**
 * Returns a map of unitId → list of conflicting unitIds.
 * Useful for the admin UI to show which units block each other.
 */
export function buildConflictMap(units: FieldUnit[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const unit of units) {
    map.set(unit.id, getConflictingUnitIds(unit.id, units));
  }
  return map;
}

// ── TIME SLOT GENERATION ───────────────────────────────────
// Replaces the hardcoded TIME_SLOTS array from mockData.

export function generateTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes: number = 30,
): string[] {
  const slots: string[] = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openTotal = openH * 60 + openM;
  const closeTotal = closeH * 60 + closeM;

  for (let m = openTotal; m <= closeTotal; m += intervalMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return slots;
}

/**
 * Get time slots for a specific date, respecting the venue's per-day schedule.
 * Falls back to club open/close times if no venue config exists.
 */
export function getTimeSlotsForDate(
  date: string,
  venueConfig: VenueConfig | null,
  clubOpenTime: string,
  clubCloseTime: string,
): string[] {
  if (!venueConfig) {
    return generateTimeSlots(clubOpenTime, clubCloseTime);
  }

  const dateObj = new Date(`${date}T00:00:00`);
  const dayOfWeek = dateObj.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const daySchedule = venueConfig.weekSchedule.find((d) => d.day === dayOfWeek);

  if (!daySchedule || daySchedule.closed) {
    return [];
  }

  return generateTimeSlots(daySchedule.open, daySchedule.close, venueConfig.slotDurationMinutes);
}

// ── VENUE CONFIG ───────────────────────────────────────────

export function createDefaultVenueConfig(clubId: string): VenueConfig {
  return {
    clubId,
    weekSchedule: DEFAULT_WEEK_SCHEDULE.map((d) => ({ ...d })),
    slotDurationMinutes: 30,
  };
}

/**
 * Check if a given day is operational (club is open).
 */
export function isDayOpen(date: string, venueConfig: VenueConfig | null): boolean {
  if (!venueConfig) return true; // assume open if no config
  const dateObj = new Date(`${date}T00:00:00`);
  const dayOfWeek = dateObj.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const daySchedule = venueConfig.weekSchedule.find((d) => d.day === dayOfWeek);
  return daySchedule ? !daySchedule.closed : true;
}

// ── FIELD CONFIG SUMMARY ───────────────────────────────────

export function buildFieldConfigSummary(field: Field): FieldConfigSummary {
  const template = getTemplateForField(field);
  const activeUnits = field.units.filter((u) => u.is_active !== false);
  const allSlots = new Set<PhysicalSlotId>();
  field.units.forEach((u) => u.slot_ids.forEach((s) => allSlots.add(s)));

  const unitCounts: Record<FieldType, number> = { F11: 0, F7: 0, F5: 0 };
  for (const unit of activeUnits) {
    unitCounts[unit.type]++;
  }

  return {
    fieldId: field.id,
    fieldName: field.name,
    templateId: template?.id ?? 'custom',
    templateName: template?.name ?? 'Configuración personalizada',
    totalSlots: allSlots.size,
    unitCounts,
    conflicts: getConflictPairs(activeUnits),
    activeUnitIds: activeUnits.map((u) => u.id),
  };
}

// ── TEMPLATE VALIDATION ────────────────────────────────────

/**
 * Validates that a template's units don't exceed the available physical slots
 * and that slot assignments are consistent with the F11/F7/F5 hierarchy.
 */
export function validateTemplate(template: CourtTemplate): string[] {
  const errors: string[] = [];
  const ALL_SLOTS: PhysicalSlotId[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

  for (const unit of template.units) {
    // Validate slot count matches field type
    if (unit.type === 'F11' && unit.slotIds.length !== 6) {
      errors.push(`${unit.name}: F11 debe usar exactamente 6 slots`);
    }
    if (unit.type === 'F7' && unit.slotIds.length !== 2) {
      errors.push(`${unit.name}: F7 debe usar exactamente 2 slots`);
    }
    if (unit.type === 'F5' && unit.slotIds.length !== 1) {
      errors.push(`${unit.name}: F5 debe usar exactamente 1 slot`);
    }

    // Validate slots are valid
    for (const slot of unit.slotIds) {
      if (!ALL_SLOTS.includes(slot)) {
        errors.push(`${unit.name}: slot inválido "${slot}"`);
      }
    }
  }

  // Validate parent relationships
  for (let i = 0; i < template.units.length; i++) {
    const unit = template.units[i];
    if (unit.parentIndex !== null) {
      if (unit.parentIndex < 0 || unit.parentIndex >= template.units.length) {
        errors.push(`${unit.name}: parentIndex fuera de rango`);
        continue;
      }
      const parent = template.units[unit.parentIndex];
      // Child slots must be a subset of parent slots
      const parentSlots = new Set(parent.slotIds);
      const orphanSlots = unit.slotIds.filter((s) => !parentSlots.has(s));
      if (orphanSlots.length > 0) {
        errors.push(`${unit.name}: slots ${orphanSlots.join(', ')} no pertenecen al padre ${parent.name}`);
      }
    }
  }

  return errors;
}

// ── SLOT ALLOCATION HELPERS ────────────────────────────────

/**
 * Given a field type, returns which slot groupings are valid.
 * This encodes the fixed business rule: F11=6slots, F7=2slots(adjacent), F5=1slot.
 */
export function getValidSlotGroupings(fieldType: FieldType): PhysicalSlotId[][] {
  switch (fieldType) {
    case 'F11':
      return [['S1', 'S2', 'S3', 'S4', 'S5', 'S6']];
    case 'F7':
      return [['S1', 'S2'], ['S3', 'S4'], ['S5', 'S6']];
    case 'F5':
      return [['S1'], ['S2'], ['S3'], ['S4'], ['S5'], ['S6']];
  }
}

/**
 * Build the full unit hierarchy for a template, setting parent_id
 * based on slot containment.
 */
export function buildUnitHierarchy(
  templateUnits: CourtTemplateUnit[],
): Array<CourtTemplateUnit & { resolvedParentName: string | null }> {
  return templateUnits.map((unit) => ({
    ...unit,
    resolvedParentName: unit.parentIndex !== null ? templateUnits[unit.parentIndex].name : null,
  }));
}

// ── CAPACITY HELPERS ───────────────────────────────────────

/**
 * Calculate maximum simultaneous bookings possible for a field type on a field.
 * F11: 1 max (uses all slots)
 * F7: 3 max (3 pairs of slots)
 * F5: 6 max (one per slot)
 */
export function getMaxSimultaneousBookings(fieldType: FieldType): number {
  switch (fieldType) {
    case 'F11': return 1;
    case 'F7': return 3;
    case 'F5': return 6;
  }
}

/**
 * For a versatile field, calculates the effective capacity considering
 * that mixed bookings reduce available slots.
 * E.g., 1 F7 booking uses 2 slots → reduces F5 capacity by 2, blocks F11 entirely.
 */
export function getEffectiveCapacity(
  fieldType: FieldType,
  occupiedSlots: Set<PhysicalSlotId>,
): number {
  const groupings = getValidSlotGroupings(fieldType);
  return groupings.filter((group) => group.every((s) => !occupiedSlots.has(s))).length;
}
