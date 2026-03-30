import { Booking, Block, FieldUnit, FieldType, TimeSlot } from '@/types';
import { TIME_SLOTS } from '@/data/mockData';

function timeOverlaps(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * Get all unit IDs that are blocked when a given unit is booked.
 * F11 → blocks all F7 and F5
 * F7 → blocks itself, its 2 F5 children, and makes F11 unavailable
 * F5 → blocks itself, its parent F7, and makes F11 unavailable
 */
export function getAffectedUnitIds(unitId: string, units: FieldUnit[]): string[] {
  const unit = units.find(u => u.id === unitId);
  if (!unit) return [unitId];

  const affected = new Set<string>();
  affected.add(unitId);

  if (unit.type === 'F11') {
    // Block all children
    units.forEach(u => {
      if (u.type === 'F7' || u.type === 'F5') affected.add(u.id);
    });
  } else if (unit.type === 'F7') {
    // Block children F5s
    units.filter(u => u.parent_id === unitId).forEach(u => affected.add(u.id));
    // Block parent F11
    if (unit.parent_id) affected.add(unit.parent_id);
  } else if (unit.type === 'F5') {
    // Block parent F7
    if (unit.parent_id) {
      affected.add(unit.parent_id);
      // Block grandparent F11
      const parent = units.find(u => u.id === unit.parent_id);
      if (parent?.parent_id) affected.add(parent.parent_id);
    }
  }

  return Array.from(affected);
}

export function getBlockedUnitIds(
  date: string,
  startTime: string,
  endTime: string,
  units: FieldUnit[],
  bookings: Booking[],
  blocks: Block[]
): Set<string> {
  const blocked = new Set<string>();

  // Check bookings
  bookings
    .filter(b => b.date === date && b.status === 'confirmed' && timeOverlaps(startTime, endTime, b.start_time, b.end_time))
    .forEach(b => {
      getAffectedUnitIds(b.field_unit_id, units).forEach(id => blocked.add(id));
    });

  // Check blocks
  blocks
    .filter(bl => bl.date === date && timeOverlaps(startTime, endTime, bl.start_time, bl.end_time))
    .forEach(bl => {
      bl.field_unit_ids.forEach(uid => {
        getAffectedUnitIds(uid, units).forEach(id => blocked.add(id));
      });
    });

  return blocked;
}

export function getAvailableTimeSlots(
  date: string,
  fieldType: FieldType,
  units: FieldUnit[],
  bookings: Booking[],
  blocks: Block[]
): TimeSlot[] {
  const targetUnits = units.filter(u => u.type === fieldType);
  const totalUnits = targetUnits.length;

  return TIME_SLOTS.slice(0, -1).map((start, i) => {
    const end = TIME_SLOTS[i + 1];
    const blockedIds = getBlockedUnitIds(date, start, end, units, bookings, blocks);
    const availableUnits = targetUnits.filter(u => !blockedIds.has(u.id)).length;

    return {
      start,
      end,
      available: availableUnits > 0,
      availableUnits,
      totalUnits,
    };
  });
}

export function findAvailableUnit(
  date: string,
  startTime: string,
  endTime: string,
  fieldType: FieldType,
  units: FieldUnit[],
  bookings: Booking[],
  blocks: Block[]
): FieldUnit | null {
  const blockedIds = getBlockedUnitIds(date, startTime, endTime, units, bookings, blocks);
  const targetUnits = units.filter(u => u.type === fieldType);
  return targetUnits.find(u => !blockedIds.has(u.id)) || null;
}
