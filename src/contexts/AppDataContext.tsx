import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PHYSICAL_SLOTS } from '@/data/mockData';
import { supabase } from '@/lib/supabase';
import { sendBookingReceivedEmail } from '@/lib/bookingEmail';
import { useAuth } from '@/contexts/AuthContext';
import { Block, BlockType, Booking, BookingStatus, Club, Field, FieldType, FieldUnit, PhysicalSlotId, PricingRule, User } from '@/types';

interface CreateBookingInput {
  user_id: string;
  field_unit_id: string;
  field_type: FieldType;
  date: string;
  start_time: string;
  end_time: string;
  total_price: number;
  status?: BookingStatus;
}

interface CreateBlockInput {
  field_id: string;
  field_unit_ids: string[];
  date: string;
  start_time: string;
  end_time: string;
  type: BlockType;
  reason: string;
}

interface CreateClubInput {
  name: string;
  location: string;
  description: string;
  price_per_hour: number;
  owner_id: string;
}

interface CreateFieldInput {
  club_id: string;
  name: string;
  surface?: string;
  layout: 'full_11' | 'three_7' | 'six_5' | 'playtomic_full';
}

interface AppDataContextType {
  clubs: Club[];
  fields: Field[];
  bookings: Booking[];
  blocks: Block[];
  pricingRules: PricingRule[];
  profiles: User[];
  createBooking: (payload: CreateBookingInput) => Promise<Booking | null>;
  cancelBooking: (bookingId: string) => Promise<void>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  createBlock: (payload: CreateBlockInput) => Promise<Block | null>;
  deleteBlock: (blockId: string) => Promise<void>;
  createClub: (payload: CreateClubInput) => Promise<Club | null>;
  createField: (payload: CreateFieldInput) => Promise<Field | null>;
  clubCount: number;
  fieldCount: number;
  loading: boolean;
  reload: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

function createUnit(id: string, fieldId: string, type: FieldType, name: string, slotIds: PhysicalSlotId[]): Omit<FieldUnit, 'created_at'> {
  return {
    id,
    field_id: fieldId,
    type,
    name,
    parent_id: null,
    slot_ids: slotIds,
    is_active: true,
  };
}

function buildFieldUnits(fieldId: string, layout: CreateFieldInput['layout']): Omit<FieldUnit, 'created_at'>[] {
  if (layout === 'full_11') {
    return [createUnit(`${fieldId}-f11`, fieldId, 'F11', 'F11', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'])];
  }

  if (layout === 'three_7') {
    return [
      createUnit(`${fieldId}-f7-1`, fieldId, 'F7', 'F7_1', ['S1', 'S2']),
      createUnit(`${fieldId}-f7-2`, fieldId, 'F7', 'F7_2', ['S3', 'S4']),
      createUnit(`${fieldId}-f7-3`, fieldId, 'F7', 'F7_3', ['S5', 'S6']),
    ];
  }

  if (layout === 'six_5') {
    return PHYSICAL_SLOTS.map((slotId, index) => createUnit(`${fieldId}-f5-${index + 1}`, fieldId, 'F5', `C${index + 1}`, [slotId]));
  }

  return [
    createUnit(`${fieldId}-f11`, fieldId, 'F11', 'F11', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']),
    createUnit(`${fieldId}-f7-1`, fieldId, 'F7', 'F7_1', ['S1', 'S2']),
    createUnit(`${fieldId}-f7-2`, fieldId, 'F7', 'F7_2', ['S3', 'S4']),
    createUnit(`${fieldId}-f7-3`, fieldId, 'F7', 'F7_3', ['S5', 'S6']),
    createUnit(`${fieldId}-f5-1`, fieldId, 'F5', 'C1', ['S1']),
    createUnit(`${fieldId}-f5-2`, fieldId, 'F5', 'C2', ['S2']),
    createUnit(`${fieldId}-f5-3`, fieldId, 'F5', 'C3', ['S3']),
    createUnit(`${fieldId}-f5-4`, fieldId, 'F5', 'C4', ['S4']),
    createUnit(`${fieldId}-f5-5`, fieldId, 'F5', 'C5', ['S5']),
    createUnit(`${fieldId}-f5-6`, fieldId, 'F5', 'C6', ['S6']),
  ];
}

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [profiles, setProfiles] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);

    const [profilesRes, clubsRes, pricingRes, fieldsRes, unitsRes, bookingsRes, blocksRes, blockUnitsRes] = await Promise.all([
      supabase.from('profiles').select('id, email, first_name, last_name, phone, national_id, role'),
      supabase.from('clubs').select('*').order('created_at', { ascending: false }),
      supabase.from('pricing_rules').select('*').eq('is_active', true),
      supabase.from('fields').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('field_units').select('*').eq('is_active', true),
      supabase.from('bookings').select('*').order('date', { ascending: true }),
      supabase.from('blocks').select('*').order('date', { ascending: true }),
      supabase.from('block_units').select('*'),
    ]);

    const profilesData: User[] = (profilesRes.data ?? []).map((item) => ({
      id: item.id,
      email: item.email,
      first_name: item.first_name,
      last_name: item.last_name,
      phone: item.phone,
      national_id: item.national_id,
      role: item.role,
    }));

    const clubsData: Club[] = (clubsRes.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      location: item.location,
      description: item.description,
      image: item.image_url ?? '',
      owner_id: item.owner_id,
      rating: Number(item.rating ?? 5),
      price_per_hour: 0,
      open_time: item.open_time,
      close_time: item.close_time,
      is_active: item.is_active,
    }));

    const unitsByField = new Map<string, FieldUnit[]>();
    for (const item of unitsRes.data ?? []) {
      const current = unitsByField.get(item.field_id) ?? [];
      current.push({
        id: item.id,
        field_id: item.field_id,
        type: item.type,
        name: item.name,
        parent_id: item.parent_id,
        slot_ids: (item.slot_ids as PhysicalSlotId[]) ?? [],
        is_active: item.is_active,
      });
      unitsByField.set(item.field_id, current);
    }

    const fieldsData: Field[] = (fieldsRes.data ?? []).map((item) => ({
      id: item.id,
      club_id: item.club_id,
      name: item.name,
      surface: item.surface ?? undefined,
      is_active: item.is_active,
      physical_slots: PHYSICAL_SLOTS,
      units: unitsByField.get(item.id) ?? [],
    }));

    const blockUnitMap = new Map<string, string[]>();
    for (const item of blockUnitsRes.data ?? []) {
      const current = blockUnitMap.get(item.block_id) ?? [];
      current.push(item.field_unit_id);
      blockUnitMap.set(item.block_id, current);
    }

    const blocksData: Block[] = (blocksRes.data ?? []).map((item) => ({
      id: item.id,
      field_id: item.field_id,
      field_unit_ids: blockUnitMap.get(item.id) ?? [],
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      type: item.type,
      reason: item.reason,
    }));

    const bookingsData: Booking[] = (bookingsRes.data ?? []).map((item) => ({
      id: item.id,
      user_id: item.user_id,
      field_unit_id: item.field_unit_id,
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      status: item.status,
      field_type: item.field_type,
      total_price: Number(item.total_price ?? 0),
      notes: item.notes ?? undefined,
      created_at: item.created_at,
    }));

    const pricingData: PricingRule[] = (pricingRes.data ?? []).map((item) => ({
      id: item.id,
      club_id: item.club_id,
      field_type: item.field_type,
      price_per_hour: Number(item.price_per_hour),
      minimum_minutes: item.minimum_minutes,
      increment_minutes: item.increment_minutes,
      is_active: item.is_active,
    }));

    setProfiles(profilesData);
    setClubs(clubsData);
    setFields(fieldsData);
    setBlocks(blocksData);
    setBookings(bookingsData);
    setPricingRules(pricingData);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setClubs([]);
      setFields([]);
      setBookings([]);
      setBlocks([]);
      setPricingRules([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    reload();
  }, [user?.id]);

  const createBooking = async (payload: CreateBookingInput) => {
    const { data, error } = await supabase
      .from('bookings')
      .insert({ ...payload, status: payload.status ?? 'confirmed' })
      .select('*')
      .single();

    if (error || !data) return null;

    const field = fields.find((item) => item.units.some((unit) => unit.id === data.field_unit_id));
    const unit = field?.units.find((item) => item.id === data.field_unit_id);
    const club = clubs.find((item) => item.id === field?.club_id);

    if (user?.email) {
      try {
        await sendBookingReceivedEmail({
          email: user.email,
          firstName: user.first_name,
          clubName: club?.name,
          fieldName: field?.name,
          unitName: unit?.name,
          fieldType: data.field_type,
          date: data.date,
          startTime: data.start_time,
          endTime: data.end_time,
        });
      } catch (emailError) {
        console.error('Could not send booking received email', emailError);
      }
    }

    await reload();
    return {
      id: data.id,
      user_id: data.user_id,
      field_unit_id: data.field_unit_id,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      status: data.status,
      field_type: data.field_type,
      total_price: Number(data.total_price ?? 0),
      notes: data.notes ?? undefined,
      created_at: data.created_at,
    };
  };

  const cancelBooking = async (bookingId: string) => {
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    if (error) {
      console.error('Error cancelling booking:', error);
      return;
    }
    await reload();
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    if (error) {
      console.error('Error updating booking status:', error);
      return;
    }
    await reload();
  };

  const createBlock = async (payload: CreateBlockInput) => {
    const { data, error } = await supabase
      .from('blocks')
      .insert({
        field_id: payload.field_id,
        date: payload.date,
        start_time: payload.start_time,
        end_time: payload.end_time,
        type: payload.type,
        reason: payload.reason,
        created_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (error || !data) return null;

    if (payload.field_unit_ids.length > 0) {
      const { error: blockUnitsError } = await supabase.from('block_units').insert(
        payload.field_unit_ids.map((fieldUnitId) => ({
          block_id: data.id,
          field_unit_id: fieldUnitId,
        })),
      );
      if (blockUnitsError) {
        console.error('Error inserting block units:', blockUnitsError);
        await supabase.from('blocks').delete().eq('id', data.id);
        return null;
      }
    }

    await reload();
    return {
      id: data.id,
      field_id: data.field_id,
      field_unit_ids: payload.field_unit_ids,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      type: data.type,
      reason: data.reason,
    };
  };

  const deleteBlock = async (blockId: string) => {
    const { error: unitsError } = await supabase.from('block_units').delete().eq('block_id', blockId);
    if (unitsError) {
      console.error('Error deleting block units:', unitsError);
      return;
    }
    const { error: blockError } = await supabase.from('blocks').delete().eq('id', blockId);
    if (blockError) {
      console.error('Error deleting block:', blockError);
      return;
    }
    await reload();
  };

  const createClub = async (payload: CreateClubInput) => {
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        owner_id: payload.owner_id,
        name: payload.name,
        location: payload.location,
        description: payload.description,
        rating: 5,
        open_time: '08:00',
        close_time: '23:00',
        is_active: true,
      })
      .select('*')
      .single();

    if (error || !data) return null;

    const { error: pricingError } = await supabase.from('pricing_rules').insert([
      { club_id: data.id, field_type: 'F5', price_per_hour: 3000, minimum_minutes: 60, increment_minutes: 30, is_active: true },
      { club_id: data.id, field_type: 'F7', price_per_hour: 6000, minimum_minutes: 60, increment_minutes: 30, is_active: true },
      { club_id: data.id, field_type: 'F11', price_per_hour: 18000, minimum_minutes: 60, increment_minutes: 30, is_active: true },
    ]);
    if (pricingError) {
      console.error('Error inserting pricing rules:', pricingError);
      await supabase.from('clubs').delete().eq('id', data.id);
      return null;
    }

    await reload();
    return {
      id: data.id,
      name: data.name,
      location: data.location,
      description: data.description,
      image: data.image_url ?? '',
      owner_id: data.owner_id,
      rating: Number(data.rating ?? 5),
      price_per_hour: 0,
      open_time: data.open_time,
      close_time: data.close_time,
      is_active: data.is_active,
    };
  };

  const createField = async (payload: CreateFieldInput) => {
    const { data, error } = await supabase
      .from('fields')
      .insert({
        club_id: payload.club_id,
        name: payload.name,
        surface: payload.surface || 'Gramilla sintética',
        is_active: true,
      })
      .select('*')
      .single();

    if (error || !data) return null;

    const units = buildFieldUnits(data.id, payload.layout);
    const { error: unitsError } = await supabase.from('field_units').insert(units);
    if (unitsError) {
      console.error('Error inserting field units:', unitsError);
      await supabase.from('fields').delete().eq('id', data.id);
      return null;
    }
    await reload();

    return {
      id: data.id,
      club_id: data.club_id,
      name: data.name,
      surface: data.surface ?? undefined,
      is_active: data.is_active,
      physical_slots: PHYSICAL_SLOTS,
      units: units as FieldUnit[],
    };
  };

  const value = useMemo(() => ({
    clubs,
    fields,
    bookings,
    blocks,
    pricingRules,
    profiles,
    createBooking,
    cancelBooking,
    updateBookingStatus,
    createBlock,
    deleteBlock,
    createClub,
    createField,
    clubCount: clubs.length,
    fieldCount: fields.length,
    loading,
    reload,
  }), [clubs, fields, bookings, blocks, pricingRules, profiles, loading]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider');
  return context;
};
