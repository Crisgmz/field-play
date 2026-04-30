import { FieldType, PhysicalSlotId } from './index';

// ── COURT TEMPLATE ─────────────────────────────────────────
// Defines a reusable court subdivision pattern for a physical field.

export interface CourtTemplate {
  id: string;
  name: string;
  description: string;
  units: CourtTemplateUnit[];
}

export interface CourtTemplateUnit {
  type: FieldType;
  name: string;
  slotIds: PhysicalSlotId[];
  parentIndex: number | null; // index into this array for hierarchy (F5 → parent F7)
}

// ── BUILT-IN TEMPLATES ─────────────────────────────────────
// The four canonical layouts. Admin can later create custom ones.

export const COURT_TEMPLATES: CourtTemplate[] = [
  {
    id: 'full_11',
    name: 'Solo F11',
    description: 'Cancha completa de fútbol 11 (usa los 6 slots)',
    units: [
      { type: 'F11', name: 'F11', slotIds: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], parentIndex: null },
    ],
  },
  {
    id: 'three_7',
    name: '3x Fútbol 7',
    description: '3 canchas de fútbol 7 (pares de slots)',
    units: [
      { type: 'F7', name: 'F7_1', slotIds: ['S1', 'S4'], parentIndex: null },
      { type: 'F7', name: 'F7_2', slotIds: ['S2', 'S5'], parentIndex: null },
      { type: 'F7', name: 'F7_3', slotIds: ['S3', 'S6'], parentIndex: null },
    ],
  },
  {
    id: 'six_5',
    name: '6x Fútbol 5',
    description: '6 canchas individuales de fútbol 5',
    units: [
      { type: 'F5', name: 'C1', slotIds: ['S1'], parentIndex: null },
      { type: 'F5', name: 'C2', slotIds: ['S2'], parentIndex: null },
      { type: 'F5', name: 'C3', slotIds: ['S3'], parentIndex: null },
      { type: 'F5', name: 'C4', slotIds: ['S4'], parentIndex: null },
      { type: 'F5', name: 'C5', slotIds: ['S5'], parentIndex: null },
      { type: 'F5', name: 'C6', slotIds: ['S6'], parentIndex: null },
    ],
  },
  {
    id: 'versatile_full',
    name: 'Versátil completo',
    description: 'Todas las combinaciones: F11 + 3×F7 + 6×F5',
    units: [
      // F11 (index 0)
      { type: 'F11', name: 'F11', slotIds: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], parentIndex: null },
      // F7 (indices 1-3)
      { type: 'F7', name: 'F7_1', slotIds: ['S1', 'S4'], parentIndex: 0 },
      { type: 'F7', name: 'F7_2', slotIds: ['S2', 'S5'], parentIndex: 0 },
      { type: 'F7', name: 'F7_3', slotIds: ['S3', 'S6'], parentIndex: 0 },
      // F5 (indices 4-9): each S_n is the F5 child of the F7 column it belongs to.
      //   S1, S4 → F7_1 (parentIndex 1)
      //   S2, S5 → F7_2 (parentIndex 2)
      //   S3, S6 → F7_3 (parentIndex 3)
      { type: 'F5', name: 'C1', slotIds: ['S1'], parentIndex: 1 },
      { type: 'F5', name: 'C2', slotIds: ['S2'], parentIndex: 2 },
      { type: 'F5', name: 'C3', slotIds: ['S3'], parentIndex: 3 },
      { type: 'F5', name: 'C4', slotIds: ['S4'], parentIndex: 1 },
      { type: 'F5', name: 'C5', slotIds: ['S5'], parentIndex: 2 },
      { type: 'F5', name: 'C6', slotIds: ['S6'], parentIndex: 3 },
    ],
  },
];

// ── OPERATING HOURS ────────────────────────────────────────

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday

export interface DaySchedule {
  day: DayOfWeek;
  open: string;   // "08:00"
  close: string;  // "23:00"
  closed: boolean; // true = club closed this day
}

export const DEFAULT_WEEK_SCHEDULE: DaySchedule[] = [
  { day: 0, open: '08:00', close: '22:00', closed: false },
  { day: 1, open: '08:00', close: '23:00', closed: false },
  { day: 2, open: '08:00', close: '23:00', closed: false },
  { day: 3, open: '08:00', close: '23:00', closed: false },
  { day: 4, open: '08:00', close: '23:00', closed: false },
  { day: 5, open: '08:00', close: '23:00', closed: false },
  { day: 6, open: '08:00', close: '23:00', closed: false },
];

// ── VENUE CONFIGURATION ────────────────────────────────────
// Per-club configuration that ties together operating hours, fields, and their templates.

export interface VenueConfig {
  clubId: string;
  weekSchedule: DaySchedule[];
  slotDurationMinutes: 30 | 60; // granularity of booking time slots
  closedDates?: string[]; // YYYY-MM-DD overrides on top of the weekly schedule
}

// ── CONFLICT DETECTION ─────────────────────────────────────
// Two units conflict if they share any physical slot.

export interface ConflictPair {
  unitA: string; // unit name or id
  unitB: string;
  sharedSlots: PhysicalSlotId[];
}

// ── FIELD CONFIGURATION SUMMARY ────────────────────────────
// Used in admin UI to show the current config of a field at a glance.

export interface FieldConfigSummary {
  fieldId: string;
  fieldName: string;
  templateId: string;
  templateName: string;
  totalSlots: number;
  unitCounts: Record<FieldType, number>;
  conflicts: ConflictPair[];
  activeUnitIds: string[];
}
