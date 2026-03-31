import { Block, Booking, Club, Field, FieldUnit, PhysicalSlotId, PricingRule, User } from '@/types';

export const mockUser: User = {
  id: 'u1',
  email: 'player@fieldplay.com',
  first_name: 'Cristian',
  last_name: 'Player',
  phone: '809-000-0001',
  national_id: null,
  role: 'client',
};

export const mockAdmin: User = {
  id: 'u2',
  email: 'admin@fieldplay.com',
  first_name: 'Field',
  last_name: 'Manager',
  phone: '809-000-0002',
  national_id: '001-0000000-0',
  role: 'club_admin',
};

export const PHYSICAL_SLOTS: PhysicalSlotId[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

export const mockClubs: Club[] = [
  {
    id: 'c1',
    name: 'RealPlay Central',
    location: 'Santo Domingo, Distrito Nacional',
    description: 'Complejo principal con canchas modulares, iluminación y reservas por hora.',
    image: '',
    owner_id: 'u2',
    rating: 4.9,
    price_per_hour: 0,
    open_time: '08:00',
    close_time: '23:00',
    is_active: true,
  },
  {
    id: 'c2',
    name: 'RealPlay Norte',
    location: 'Santiago, República Dominicana',
    description: 'Sede secundaria para partidos rápidos, torneos y entrenamientos.',
    image: '',
    owner_id: 'u2',
    rating: 4.7,
    price_per_hour: 0,
    open_time: '08:00',
    close_time: '22:00',
    is_active: true,
  },
];

export const mockPricingRules: PricingRule[] = [
  {
    id: 'pr-1',
    club_id: 'c1',
    field_type: 'F5',
    price_per_hour: 3000,
    minimum_minutes: 60,
    increment_minutes: 30,
    is_active: true,
  },
  {
    id: 'pr-2',
    club_id: 'c1',
    field_type: 'F7',
    price_per_hour: 6000,
    minimum_minutes: 60,
    increment_minutes: 30,
    is_active: true,
  },
  {
    id: 'pr-3',
    club_id: 'c1',
    field_type: 'F11',
    price_per_hour: 18000,
    minimum_minutes: 60,
    increment_minutes: 30,
    is_active: true,
  },
  {
    id: 'pr-4',
    club_id: 'c2',
    field_type: 'F5',
    price_per_hour: 3000,
    minimum_minutes: 60,
    increment_minutes: 30,
    is_active: true,
  },
  {
    id: 'pr-5',
    club_id: 'c2',
    field_type: 'F7',
    price_per_hour: 6000,
    minimum_minutes: 60,
    increment_minutes: 30,
    is_active: true,
  },
  {
    id: 'pr-6',
    club_id: 'c2',
    field_type: 'F11',
    price_per_hour: 18000,
    minimum_minutes: 60,
    increment_minutes: 30,
    is_active: true,
  },
];

function buildUnits(fieldId: string): FieldUnit[] {
  return [
    { id: `${fieldId}-f11`, field_id: fieldId, type: 'F11', name: 'F11', parent_id: null, slot_ids: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], is_active: true },
    { id: `${fieldId}-f7-1`, field_id: fieldId, type: 'F7', name: 'F7_1', parent_id: null, slot_ids: ['S1', 'S2'], is_active: true },
    { id: `${fieldId}-f7-2`, field_id: fieldId, type: 'F7', name: 'F7_2', parent_id: null, slot_ids: ['S3', 'S4'], is_active: true },
    { id: `${fieldId}-f7-3`, field_id: fieldId, type: 'F7', name: 'F7_3', parent_id: null, slot_ids: ['S5', 'S6'], is_active: true },
    { id: `${fieldId}-f5-1`, field_id: fieldId, type: 'F5', name: 'C1', parent_id: null, slot_ids: ['S1'], is_active: true },
    { id: `${fieldId}-f5-2`, field_id: fieldId, type: 'F5', name: 'C2', parent_id: null, slot_ids: ['S2'], is_active: true },
    { id: `${fieldId}-f5-3`, field_id: fieldId, type: 'F5', name: 'C3', parent_id: null, slot_ids: ['S3'], is_active: true },
    { id: `${fieldId}-f5-4`, field_id: fieldId, type: 'F5', name: 'C4', parent_id: null, slot_ids: ['S4'], is_active: true },
    { id: `${fieldId}-f5-5`, field_id: fieldId, type: 'F5', name: 'C5', parent_id: null, slot_ids: ['S5'], is_active: true },
    { id: `${fieldId}-f5-6`, field_id: fieldId, type: 'F5', name: 'C6', parent_id: null, slot_ids: ['S6'], is_active: true },
  ];
}

export const mockFields: Field[] = [
  {
    id: 'f1',
    club_id: 'c1',
    name: 'Cancha Principal',
    surface: 'Gramilla sintética',
    is_active: true,
    physical_slots: PHYSICAL_SLOTS,
    units: buildUnits('f1'),
  },
  {
    id: 'f2',
    club_id: 'c2',
    name: 'Cancha Norte',
    surface: 'Gramilla sintética',
    is_active: true,
    physical_slots: PHYSICAL_SLOTS,
    units: buildUnits('f2'),
  },
];

export const mockBookings: Booking[] = [
  {
    id: 'b1',
    user_id: 'u1',
    field_unit_id: 'f1-f5-3',
    date: '2026-03-30',
    start_time: '18:00',
    end_time: '19:00',
    status: 'confirmed',
    field_type: 'F5',
    total_price: 3000,
    created_at: '2026-03-30T10:00:00.000Z',
  },
  {
    id: 'b2',
    user_id: 'u1',
    field_unit_id: 'f1-f5-6',
    date: '2026-03-30',
    start_time: '18:00',
    end_time: '19:00',
    status: 'confirmed',
    field_type: 'F5',
    total_price: 3000,
    created_at: '2026-03-30T11:00:00.000Z',
  },
];

export const mockBlocks: Block[] = [
  {
    id: 'bl1',
    field_id: 'f1',
    field_unit_ids: ['f1-f7-2'],
    date: '2026-04-01',
    start_time: '20:00',
    end_time: '22:00',
    type: 'event',
    reason: 'Torneo interno',
  },
];

export const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00',
];
