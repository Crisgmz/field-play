export type UserRole = 'client' | 'club_admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Club {
  id: string;
  name: string;
  location: string;
  description: string;
  image: string;
  owner_id: string;
  rating: number;
  price_per_hour: number;
}

export type FieldType = 'F11' | 'F7' | 'F5';

export interface FieldUnit {
  id: string;
  field_id: string;
  type: FieldType;
  name: string;
  parent_id: string | null; // F5 → parent F7, F7 → parent F11
}

export interface Field {
  id: string;
  club_id: string;
  name: string;
  units: FieldUnit[];
}

export interface Booking {
  id: string;
  user_id: string;
  field_unit_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: 'confirmed' | 'cancelled';
  field_type: FieldType;
}

export type BlockType = 'practice' | 'maintenance' | 'event';

export interface Block {
  id: string;
  field_id: string;
  field_unit_ids: string[];
  date: string;
  start_time: string;
  end_time: string;
  type: BlockType;
  reason: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  availableUnits: number;
  totalUnits: number;
}
