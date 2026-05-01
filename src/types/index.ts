export type UserRole = 'client' | 'staff' | 'club_admin';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  national_id?: string | null;
  role: UserRole;
  staff_club_id?: string | null;
  is_active?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  national_id?: string;
  password: string;
  role?: UserRole;
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
  open_time: string;
  close_time: string;
  is_active: boolean;
  phone?: string | null;
  email?: string | null;
  amenities?: string[];
}

export interface ClubImage {
  id: string;
  club_id: string;
  storage_path: string;
  caption: string | null;
  position: number;
  created_at: string;
}

export type FieldType = 'F11' | 'F7' | 'F5';
export type PhysicalSlotId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
export type PaymentMethod = 'bank_transfer' | 'cash' | 'card';

export interface PricingRule {
  id: string;
  club_id: string;
  field_type: FieldType;
  price_per_hour: number;
  minimum_minutes: number;
  increment_minutes: number;
  is_active: boolean;
}

export interface FieldUnit {
  id: string;
  field_id: string;
  type: FieldType;
  name: string;
  parent_id: string | null;
  slot_ids: PhysicalSlotId[];
  price_modifier?: number;
  is_active?: boolean;
}

export interface Field {
  id: string;
  club_id: string;
  name: string;
  units: FieldUnit[];
  surface?: string;
  is_active?: boolean;
  physical_slots?: PhysicalSlotId[];
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  user_id: string;
  club_id: string;
  field_unit_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  field_type: FieldType;
  total_price: number;
  payment_method?: PaymentMethod;
  payment_proof_path?: string | null;
  admin_seen_at?: string | null;
  notes?: string;
  created_at?: string;
  created_by_admin?: boolean;
  cancellation_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  rejection_reason?: string | null;
  rejected_at?: string | null;
  confirmed_at?: string | null;
  proof_replaced_at?: string | null;
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
  batch_id?: string | null;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  availableUnits: number;
  totalUnits: number;
}

export interface SlotStatus {
  id: PhysicalSlotId;
  occupied: boolean;
  selected: boolean;
}

export interface UnitOption {
  id: string;
  type: FieldType;
  name: string;
  slot_ids: PhysicalSlotId[];
  available: boolean;
}
