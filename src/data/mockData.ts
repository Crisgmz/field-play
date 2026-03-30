import { Club, Field, FieldUnit, Booking, Block, User } from '@/types';

export const mockUser: User = {
  id: 'u1',
  email: 'player@realplay.com',
  name: 'Ahmed K.',
  role: 'client',
};

export const mockAdmin: User = {
  id: 'u2',
  email: 'admin@realplay.com',
  name: 'Club Manager',
  role: 'club_admin',
};

export const mockClubs: Club[] = [
  {
    id: 'c1',
    name: 'Arena Sports Complex',
    location: 'Downtown, City Center',
    description: 'Premium football facility with state-of-the-art synthetic turf and floodlighting. Perfect for competitive and casual play.',
    image: '',
    owner_id: 'u2',
    rating: 4.8,
    price_per_hour: 120,
  },
  {
    id: 'c2',
    name: 'Green Valley FC',
    location: 'North District',
    description: 'Community-focused football club with excellent facilities and a friendly atmosphere.',
    image: '',
    owner_id: 'u2',
    rating: 4.5,
    price_per_hour: 90,
  },
  {
    id: 'c3',
    name: 'Victory Stadium',
    location: 'East Side Park',
    description: 'Professional-grade pitches available for hourly booking. Indoor and outdoor options.',
    image: '',
    owner_id: 'u2',
    rating: 4.9,
    price_per_hour: 150,
  },
];

// Field structure for club c1:
// F11-1 (the full 11-a-side field)
//   ├── F7-1
//   │   ├── F5-1
//   │   └── F5-2
//   ├── F7-2
//   │   ├── F5-3
//   │   └── F5-4
//   └── F7-3
//       ├── F5-5
//       └── F5-6

const fieldUnitsC1: FieldUnit[] = [
  { id: 'fu-11-1', field_id: 'f1', type: 'F11', name: 'Full Field', parent_id: null },
  { id: 'fu-7-1', field_id: 'f1', type: 'F7', name: 'Pitch A', parent_id: 'fu-11-1' },
  { id: 'fu-7-2', field_id: 'f1', type: 'F7', name: 'Pitch B', parent_id: 'fu-11-1' },
  { id: 'fu-7-3', field_id: 'f1', type: 'F7', name: 'Pitch C', parent_id: 'fu-11-1' },
  { id: 'fu-5-1', field_id: 'f1', type: 'F5', name: 'Court A1', parent_id: 'fu-7-1' },
  { id: 'fu-5-2', field_id: 'f1', type: 'F5', name: 'Court A2', parent_id: 'fu-7-1' },
  { id: 'fu-5-3', field_id: 'f1', type: 'F5', name: 'Court B1', parent_id: 'fu-7-2' },
  { id: 'fu-5-4', field_id: 'f1', type: 'F5', name: 'Court B2', parent_id: 'fu-7-2' },
  { id: 'fu-5-5', field_id: 'f1', type: 'F5', name: 'Court C1', parent_id: 'fu-7-3' },
  { id: 'fu-5-6', field_id: 'f1', type: 'F5', name: 'Court C2', parent_id: 'fu-7-3' },
];

export const mockFields: Field[] = [
  { id: 'f1', club_id: 'c1', name: 'Main Field', units: fieldUnitsC1 },
  { id: 'f2', club_id: 'c2', name: 'Main Field', units: fieldUnitsC1.map(u => ({ ...u, field_id: 'f2', id: u.id.replace('fu-', 'f2u-') })) },
  { id: 'f3', club_id: 'c3', name: 'Main Field', units: fieldUnitsC1.map(u => ({ ...u, field_id: 'f3', id: u.id.replace('fu-', 'f3u-') })) },
];

export const mockBookings: Booking[] = [
  {
    id: 'b1',
    user_id: 'u1',
    field_unit_id: 'fu-5-1',
    date: '2026-03-30',
    start_time: '16:00',
    end_time: '17:00',
    status: 'confirmed',
    field_type: 'F5',
  },
  {
    id: 'b2',
    user_id: 'u1',
    field_unit_id: 'fu-7-2',
    date: '2026-03-30',
    start_time: '18:00',
    end_time: '19:00',
    status: 'confirmed',
    field_type: 'F7',
  },
];

export const mockBlocks: Block[] = [
  {
    id: 'bl1',
    field_id: 'f1',
    field_unit_ids: ['fu-11-1'],
    date: '2026-03-30',
    start_time: '20:00',
    end_time: '22:00',
    type: 'event',
    reason: 'Tournament finals',
  },
];

export const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
  '20:00', '21:00', '22:00',
];
