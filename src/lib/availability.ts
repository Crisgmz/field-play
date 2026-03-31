import { Block, Booking, Field, FieldType, PhysicalSlotId, SlotStatus, TimeSlot, UnitOption } from '@/types';
import { TIME_SLOTS } from '@/data/mockData';

function timeOverlaps(start1: string, end1: string, start2: string, end2: string): boolean {
  return start1 < end2 && end1 > start2;
}

export function getUnitsByType(field: Field, fieldType: FieldType) {
  return field.units.filter((unit) => unit.type === fieldType && unit.is_active !== false);
}

export function getOccupiedSlotIds(
  date: string,
  startTime: string,
  endTime: string,
  field: Field,
  bookings: Booking[],
  blocks: Block[],
): Set<PhysicalSlotId> {
  const occupied = new Set<PhysicalSlotId>();

  bookings
    .filter((booking) => booking.date === date && booking.status === 'confirmed' && timeOverlaps(startTime, endTime, booking.start_time, booking.end_time))
    .forEach((booking) => {
      const unit = field.units.find((item) => item.id === booking.field_unit_id);
      unit?.slot_ids.forEach((slotId) => occupied.add(slotId));
    });

  blocks
    .filter((block) => block.field_id === field.id && block.date === date && timeOverlaps(startTime, endTime, block.start_time, block.end_time))
    .forEach((block) => {
      block.field_unit_ids.forEach((unitId) => {
        const unit = field.units.find((item) => item.id === unitId);
        unit?.slot_ids.forEach((slotId) => occupied.add(slotId));
      });
    });

  return occupied;
}

export function getUnitOptions(
  date: string,
  startTime: string,
  endTime: string,
  fieldType: FieldType,
  field: Field,
  bookings: Booking[],
  blocks: Block[],
): UnitOption[] {
  const occupied = getOccupiedSlotIds(date, startTime, endTime, field, bookings, blocks);
  return getUnitsByType(field, fieldType).map((unit) => ({
    id: unit.id,
    type: unit.type,
    name: unit.name,
    slot_ids: unit.slot_ids,
    available: unit.slot_ids.every((slotId) => !occupied.has(slotId)),
  }));
}

export function getSlotStatuses(
  occupied: Set<PhysicalSlotId>,
  selectedSlots: PhysicalSlotId[] = [],
): SlotStatus[] {
  return ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((slotId) => ({
    id: slotId,
    occupied: occupied.has(slotId),
    selected: selectedSlots.includes(slotId),
  }));
}

export function getAvailableTimeSlots(
  date: string,
  fieldType: FieldType,
  field: Field,
  bookings: Booking[],
  blocks: Block[],
): TimeSlot[] {
  const totalUnits = getUnitsByType(field, fieldType).length;

  return TIME_SLOTS.slice(0, -1).map((start, index) => {
    const end = TIME_SLOTS[index + 1];
    const availableUnits = getUnitOptions(date, start, end, fieldType, field, bookings, blocks)
      .filter((option) => option.available).length;

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
  field: Field,
  bookings: Booking[],
  blocks: Block[],
) {
  return getUnitOptions(date, startTime, endTime, fieldType, field, bookings, blocks)
    .find((option) => option.available) ?? null;
}
