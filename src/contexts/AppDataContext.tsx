import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PHYSICAL_SLOTS } from '@/data/mockData';
import { supabase } from '@/lib/supabase';
import {
  sendAdminBookingAlert,
  sendBookingCancelledEmail,
  sendBookingConfirmedEmail,
  sendBookingReceivedEmail,
} from '@/lib/bookingEmail';
import { useAuth } from '@/contexts/AuthContext';
import { Block, BlockType, Booking, BookingStatus, Club, Field, FieldType, FieldUnit, PaymentMethod, PhysicalSlotId, PricingRule, User } from '@/types';
import { VenueConfig } from '@/types/courtConfig';
import type { Database } from '@/lib/supabase-types';
import { createDefaultVenueConfig } from '@/lib/courtConfig';

const CANCELLATION_POLICY_HOURS = 24;
const PROOF_BUCKET = 'booking-proofs';

interface CreateBookingInput {
  user_id: string;
  club_id: string;
  field_unit_id: string;
  field_type: FieldType;
  date: string;
  start_time: string;
  end_time: string;
  total_price: number;
  status?: BookingStatus;
  payment_method?: PaymentMethod;
  payment_proof_path?: string | null;
  notes?: string | null;
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
  owner_id: string;
}

interface UpdateClubInput {
  id: string;
  name?: string;
  location?: string;
  description?: string;
  open_time?: string;
  close_time?: string;
  is_active?: boolean;
}

interface CreateFieldInput {
  club_id: string;
  name: string;
  surface?: string;
  layout: 'full_11' | 'three_7' | 'six_5' | 'versatile_full';
  prices?: {
    F5?: number;
    F7?: number;
    F11?: number;
  };
}

interface UpdateFieldInput {
  id: string;
  name?: string;
  surface?: string;
  is_active?: boolean;
}

interface UpdatePricingRuleInput {
  id: string;
  price_per_hour?: number;
  minimum_minutes?: number;
  increment_minutes?: number;
  is_active?: boolean;
}

interface CancellationCheck {
  allowed: boolean;
  refundEligible: boolean;
  hoursUntilStart: number;
}

interface AppDataContextType {
  clubs: Club[];
  fields: Field[];
  bookings: Booking[];
  blocks: Block[];
  pricingRules: PricingRule[];
  profiles: User[];
  venueConfigs: VenueConfig[];
  createBooking: (payload: CreateBookingInput) => Promise<Booking | null>;
  cancelBooking: (bookingId: string, reason?: string) => Promise<boolean>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  confirmBooking: (bookingId: string) => Promise<boolean>;
  rejectBooking: (bookingId: string, reason: string) => Promise<boolean>;
  replacePaymentProof: (bookingId: string, file: File) => Promise<boolean>;
  evaluateCancellation: (bookingId: string) => CancellationCheck | null;
  markBookingSeen: (bookingId: string) => Promise<void>;
  createBlock: (payload: CreateBlockInput) => Promise<Block | null>;
  deleteBlock: (blockId: string) => Promise<void>;
  createClub: (payload: CreateClubInput) => Promise<Club | null>;
  updateClub: (payload: UpdateClubInput) => Promise<boolean>;
  deleteClub: (clubId: string) => Promise<boolean>;
  createField: (payload: CreateFieldInput) => Promise<Field | null>;
  updateField: (payload: UpdateFieldInput) => Promise<boolean>;
  deleteField: (fieldId: string) => Promise<boolean>;
  updatePricingRule: (payload: UpdatePricingRuleInput) => Promise<boolean>;
  getVenueConfig: (clubId: string) => VenueConfig;
  updateVenueConfig: (config: VenueConfig) => Promise<boolean>;
  toggleFieldUnit: (unitId: string, active: boolean) => Promise<boolean>;
  clubCount: number;
  fieldCount: number;
  loading: boolean;
  reload: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

type BookingRow = Database['public']['Tables']['bookings']['Row'];

interface FieldUnitInput {
  field_id: string;
  type: FieldType;
  name: string;
  parent_id: string | null;
  slot_ids: PhysicalSlotId[];
  is_active: boolean;
}

function createUnit(fieldId: string, type: FieldType, name: string, slotIds: PhysicalSlotId[]): FieldUnitInput {
  return {
    field_id: fieldId,
    type,
    name,
    parent_id: null,
    slot_ids: slotIds,
    is_active: true,
  };
}

function buildFieldUnits(fieldId: string, layout: CreateFieldInput['layout']): FieldUnitInput[] {
  if (layout === 'full_11') {
    return [createUnit(fieldId, 'F11', 'F11', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'])];
  }

  if (layout === 'three_7') {
    return [
      createUnit(fieldId, 'F7', 'F7_1', ['S1', 'S2']),
      createUnit(fieldId, 'F7', 'F7_2', ['S3', 'S4']),
      createUnit(fieldId, 'F7', 'F7_3', ['S5', 'S6']),
    ];
  }

  if (layout === 'six_5') {
    return PHYSICAL_SLOTS.map((slotId, index) => createUnit(fieldId, 'F5', `C${index + 1}`, [slotId]));
  }

  return [
    createUnit(fieldId, 'F11', 'F11', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']),
    createUnit(fieldId, 'F7', 'F7_1', ['S1', 'S2']),
    createUnit(fieldId, 'F7', 'F7_2', ['S3', 'S4']),
    createUnit(fieldId, 'F7', 'F7_3', ['S5', 'S6']),
    createUnit(fieldId, 'F5', 'C1', ['S1']),
    createUnit(fieldId, 'F5', 'C2', ['S2']),
    createUnit(fieldId, 'F5', 'C3', ['S3']),
    createUnit(fieldId, 'F5', 'C4', ['S4']),
    createUnit(fieldId, 'F5', 'C5', ['S5']),
    createUnit(fieldId, 'F5', 'C6', ['S6']),
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
  const [venueConfigs, setVenueConfigs] = useState<VenueConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);

    const [profilesRes, clubsRes, pricingRes, fieldsRes, unitsRes, bookingsRes, blocksRes, blockUnitsRes, venueConfigsRes] = await Promise.all([
      supabase.from('profiles').select('id, email, first_name, last_name, phone, national_id, role'),
      supabase.from('clubs').select('*').order('created_at', { ascending: false }),
      supabase.from('pricing_rules').select('*'),
      supabase.from('fields').select('*').order('created_at', { ascending: false }),
      supabase.from('field_units').select('*'),
      supabase.from('bookings').select('*').order('date', { ascending: true }),
      supabase.from('blocks').select('*').order('date', { ascending: true }),
      supabase.from('block_units').select('*'),
      supabase.from('venue_configs').select('*'),
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

    const pricingData: PricingRule[] = (pricingRes.data ?? []).map((item) => ({
      id: item.id,
      club_id: item.club_id,
      field_type: item.field_type,
      price_per_hour: Number(item.price_per_hour),
      minimum_minutes: item.minimum_minutes,
      increment_minutes: item.increment_minutes,
      is_active: item.is_active,
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
      start_time: item.start_time.slice(0, 5),
      end_time: item.end_time.slice(0, 5),
      type: item.type,
      reason: item.reason,
    }));

    const bookingsData: Booking[] = (bookingsRes.data ?? []).map((item) => ({
      id: item.id,
      user_id: item.user_id,
      club_id: item.club_id,
      field_unit_id: item.field_unit_id,
      date: item.date,
      start_time: item.start_time.slice(0, 5),
      end_time: item.end_time.slice(0, 5),
      status: item.status,
      field_type: item.field_type,
      total_price: Number(item.total_price ?? 0),
      payment_method: (item.payment_method ?? 'bank_transfer') as PaymentMethod,
      payment_proof_path: item.payment_proof_path,
      admin_seen_at: item.admin_seen_at,
      notes: item.notes ?? undefined,
      created_at: item.created_at,
      cancellation_reason: (item as { cancellation_reason?: string | null }).cancellation_reason ?? null,
      cancelled_by: (item as { cancelled_by?: string | null }).cancelled_by ?? null,
      cancelled_at: (item as { cancelled_at?: string | null }).cancelled_at ?? null,
      rejection_reason: (item as { rejection_reason?: string | null }).rejection_reason ?? null,
      rejected_at: (item as { rejected_at?: string | null }).rejected_at ?? null,
      confirmed_at: (item as { confirmed_at?: string | null }).confirmed_at ?? null,
      proof_replaced_at: (item as { proof_replaced_at?: string | null }).proof_replaced_at ?? null,
    }));

    const venueConfigsData: VenueConfig[] = (venueConfigsRes.data ?? []).map((item) => {
      const closedDates = (item as { closed_dates?: string[] | null }).closed_dates ?? [];
      return {
        clubId: item.club_id,
        weekSchedule: item.week_schedule as VenueConfig['weekSchedule'],
        slotDurationMinutes: item.slot_duration_minutes as VenueConfig['slotDurationMinutes'],
        closedDates: Array.isArray(closedDates) ? closedDates : [],
      };
    });

    setProfiles(profilesData);
    setClubs(clubsData);
    setFields(fieldsData);
    setBlocks(blocksData);
    setBookings(bookingsData);
    setPricingRules(pricingData);
    setVenueConfigs(venueConfigsData);
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
      setVenueConfigs([]);
      setLoading(false);
      return;
    }

    reload();
  }, [user?.id]);

  // ── BOOKINGS ───────────────────────────────────────────────

  const createBooking = async (payload: CreateBookingInput) => {
    let data: BookingRow | null = null;
    let error: { message?: string } | null = null;

    // Phase 1: prefer the transactional RPC when deployed.
    const rpcResult = await supabase.rpc('rpc_create_booking', {
      p_user_id: payload.user_id,
      p_club_id: payload.club_id,
      p_field_unit_id: payload.field_unit_id,
      p_field_type: payload.field_type,
      p_date: payload.date,
      p_start_time: payload.start_time,
      p_end_time: payload.end_time,
      p_total_price: payload.total_price,
      p_status: payload.status ?? 'pending',
      p_payment_method: payload.payment_method ?? 'bank_transfer',
      p_payment_proof_path: payload.payment_proof_path ?? null,
      p_notes: payload.notes ?? null,
    });

    if (!rpcResult.error && rpcResult.data) {
      data = rpcResult.data as BookingRow;
    } else {
      // Fallback for local/dev environments where the migration hasn't been applied yet.
      const insertResult = await supabase
        .from('bookings')
        .insert({
          user_id: payload.user_id,
          club_id: payload.club_id,
          field_unit_id: payload.field_unit_id,
          field_type: payload.field_type,
          date: payload.date,
          start_time: payload.start_time,
          end_time: payload.end_time,
          total_price: payload.total_price,
          status: payload.status ?? 'pending',
          payment_method: payload.payment_method ?? 'bank_transfer',
          payment_proof_path: payload.payment_proof_path ?? null,
        })
        .select('*')
        .single();
      data = insertResult.data;
      error = insertResult.error;
    }

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

    // Notify the club owner so they validate the proof.
    const owner = club ? profiles.find((profile) => profile.id === club.owner_id) : null;
    if (owner?.email) {
      try {
        let proofUrl: string | null = null;
        if (data.payment_proof_path) {
          const { data: signed } = await supabase.storage
            .from(PROOF_BUCKET)
            .createSignedUrl(data.payment_proof_path, 60 * 60 * 24);
          proofUrl = signed?.signedUrl ?? null;
        }

        await sendAdminBookingAlert({
          adminEmail: owner.email,
          adminName: owner.first_name,
          clientName: user ? `${user.first_name} ${user.last_name}`.trim() : undefined,
          clientEmail: user?.email,
          clientPhone: user?.phone,
          clubName: club?.name,
          fieldName: field?.name,
          unitName: unit?.name,
          fieldType: data.field_type,
          date: data.date,
          startTime: data.start_time,
          endTime: data.end_time,
          totalPrice: Number(data.total_price ?? 0),
          proofUrl: proofUrl ?? undefined,
          panelUrl: typeof window !== 'undefined' ? `${window.location.origin}/admin/bookings` : undefined,
        });
      } catch (alertError) {
        console.error('Could not send admin booking alert', alertError);
      }
    }

    await reload();
    return {
      id: data.id,
      user_id: data.user_id,
      club_id: data.club_id,
      field_unit_id: data.field_unit_id,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      status: data.status,
      field_type: data.field_type,
      total_price: Number(data.total_price ?? 0),
      payment_method: (data.payment_method ?? 'bank_transfer') as PaymentMethod,
      payment_proof_path: data.payment_proof_path ?? null,
      admin_seen_at: data.admin_seen_at ?? null,
      notes: data.notes ?? undefined,
      created_at: data.created_at,
    };
  };

  const findBookingContext = (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return null;
    const owner = profiles.find((profile) => profile.id === booking.user_id) ?? null;
    const field = fields.find((item) => item.units.some((unit) => unit.id === booking.field_unit_id)) ?? null;
    const unit = field?.units.find((item) => item.id === booking.field_unit_id) ?? null;
    const club = clubs.find((item) => item.id === booking.club_id) ?? null;
    return { booking, owner, field, unit, club };
  };

  const evaluateCancellation = (bookingId: string): CancellationCheck | null => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return null;
    const start = new Date(`${booking.date}T${booking.start_time}:00`);
    const hoursUntilStart = (start.getTime() - Date.now()) / (1000 * 60 * 60);
    return {
      allowed: booking.status !== 'cancelled' && hoursUntilStart > 0,
      refundEligible: hoursUntilStart >= CANCELLATION_POLICY_HOURS,
      hoursUntilStart,
    };
  };

  const cancelBooking = async (bookingId: string, reason?: string): Promise<boolean> => {
    const ctx = findBookingContext(bookingId);
    if (!ctx) return false;

    const { error } = await supabase.rpc('rpc_cancel_booking', {
      p_booking_id: bookingId,
      p_reason: reason ?? null,
    });

    if (error) {
      // Fallback for environments where migration 004 hasn't been deployed yet.
      const { error: fallbackError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);
      if (fallbackError) {
        console.error('Error cancelling booking:', fallbackError);
        return false;
      }
    }

    if (ctx.owner?.email) {
      const cancelledBy = user?.id === ctx.booking.user_id ? 'client' : 'admin';
      try {
        await sendBookingCancelledEmail({
          email: ctx.owner.email,
          firstName: ctx.owner.first_name,
          clubName: ctx.club?.name,
          fieldName: ctx.field?.name,
          unitName: ctx.unit?.name,
          fieldType: ctx.booking.field_type,
          date: ctx.booking.date,
          startTime: ctx.booking.start_time,
          endTime: ctx.booking.end_time,
          totalPrice: ctx.booking.total_price,
          reason: reason ?? null,
          cancelledBy,
          isRejection: false,
        });
      } catch (emailError) {
        console.error('Could not send cancellation email', emailError);
      }
    }

    await reload();
    return true;
  };

  const sendConfirmationEmail = async (bookingId: string) => {
    const ctx = findBookingContext(bookingId);
    if (!ctx?.owner?.email) return;
    try {
      await sendBookingConfirmedEmail({
        email: ctx.owner.email,
        firstName: ctx.owner.first_name,
        clubName: ctx.club?.name,
        clubLocation: ctx.club?.location,
        fieldName: ctx.field?.name,
        unitName: ctx.unit?.name,
        fieldType: ctx.booking.field_type,
        date: ctx.booking.date,
        startTime: ctx.booking.start_time,
        endTime: ctx.booking.end_time,
        totalPrice: ctx.booking.total_price,
        policyHours: CANCELLATION_POLICY_HOURS,
      });
    } catch (emailError) {
      console.error('Could not send confirmation email', emailError);
    }
  };

  const confirmBooking = async (bookingId: string): Promise<boolean> => {
    const { error } = await supabase.rpc('rpc_confirm_booking', { p_booking_id: bookingId });
    if (error) {
      const { error: fallbackError } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId);
      if (fallbackError) {
        console.error('Error confirming booking:', fallbackError);
        return false;
      }
    }
    await sendConfirmationEmail(bookingId);
    await reload();
    return true;
  };

  const rejectBooking = async (bookingId: string, reason: string): Promise<boolean> => {
    const trimmed = reason?.trim();
    if (!trimmed) {
      console.error('Rejection reason is required');
      return false;
    }

    const ctx = findBookingContext(bookingId);
    if (!ctx) return false;

    const { error } = await supabase.rpc('rpc_reject_booking', {
      p_booking_id: bookingId,
      p_reason: trimmed,
    });

    if (error) {
      console.error('Error rejecting booking:', error);
      return false;
    }

    if (ctx.owner?.email) {
      try {
        await sendBookingCancelledEmail({
          email: ctx.owner.email,
          firstName: ctx.owner.first_name,
          clubName: ctx.club?.name,
          fieldName: ctx.field?.name,
          unitName: ctx.unit?.name,
          fieldType: ctx.booking.field_type,
          date: ctx.booking.date,
          startTime: ctx.booking.start_time,
          endTime: ctx.booking.end_time,
          totalPrice: ctx.booking.total_price,
          reason: trimmed,
          cancelledBy: 'admin',
          isRejection: true,
        });
      } catch (emailError) {
        console.error('Could not send rejection email', emailError);
      }
    }

    await reload();
    return true;
  };

  const replacePaymentProof = async (bookingId: string, file: File): Promise<boolean> => {
    if (!user) return false;
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return false;
    if (booking.user_id !== user.id) {
      console.error('Cannot replace proof for another user\'s booking');
      return false;
    }
    if (booking.status !== 'pending') {
      console.error('Proof can only be replaced while booking is pending');
      return false;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const safeDate = booking.date.replace(/-/g, '');
    const filePath = `${user.id}/${safeDate}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      console.error('Error uploading replacement proof:', uploadError);
      return false;
    }

    const oldPath = booking.payment_proof_path;
    const { error: rpcError } = await supabase.rpc('rpc_replace_payment_proof', {
      p_booking_id: bookingId,
      p_new_path: filePath,
    });

    if (rpcError) {
      // Fallback if migration 004 isn't applied yet.
      const { error: fallbackError } = await supabase
        .from('bookings')
        .update({ payment_proof_path: filePath, admin_seen_at: null })
        .eq('id', bookingId);
      if (fallbackError) {
        console.error('Error replacing payment proof:', fallbackError);
        await supabase.storage.from(PROOF_BUCKET).remove([filePath]);
        return false;
      }
    }

    if (oldPath) {
      await supabase.storage.from(PROOF_BUCKET).remove([oldPath]);
    }

    await reload();
    return true;
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    if (status === 'confirmed') {
      await confirmBooking(bookingId);
      return;
    }
    if (status === 'cancelled') {
      await cancelBooking(bookingId);
      return;
    }
    const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    if (error) {
      console.error('Error updating booking status:', error);
      return;
    }
    await reload();
  };

  const markBookingSeen = async (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking || booking.admin_seen_at) return;

    const { error } = await supabase
      .from('bookings')
      .update({ admin_seen_at: new Date().toISOString() })
      .eq('id', bookingId);

    if (error) {
      console.error('Error marking booking as seen:', error);
      return;
    }

    setBookings((current) => current.map((item) => (
      item.id === bookingId ? { ...item, admin_seen_at: new Date().toISOString() } : item
    )));
  };

  // ── BLOCKS ─────────────────────────────────────────────────

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

  // ── CLUBS ──────────────────────────────────────────────────

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

  const updateClub = async (payload: UpdateClubInput) => {
    const { id, ...updates } = payload;
    const { error } = await supabase.from('clubs').update(updates).eq('id', id);
    if (error) {
      console.error('Error updating club:', error);
      return false;
    }
    await reload();
    return true;
  };

  const deleteClub = async (clubId: string) => {
    const { error } = await supabase.from('clubs').update({ is_active: false }).eq('id', clubId);
    if (error) {
      console.error('Error deactivating club:', error);
      return false;
    }
    await reload();
    return true;
  };

  // ── FIELDS ─────────────────────────────────────────────────

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

    const unitPayloads = buildFieldUnits(data.id, payload.layout);
    const { data: insertedUnits, error: unitsError } = await supabase
      .from('field_units')
      .insert(unitPayloads)
      .select('*');
    if (unitsError || !insertedUnits) {
      console.error('Error inserting field units:', unitsError);
      await supabase.from('fields').delete().eq('id', data.id);
      return null;
    }

    if (payload.prices) {
      const priceEntries = Object.entries(payload.prices).filter(([_, val]) => val !== undefined);
      if (priceEntries.length > 0) {
        await Promise.all(
          priceEntries.map(([type, price]) =>
            supabase.from('pricing_rules').upsert({
              club_id: payload.club_id,
              field_type: type,
              price_per_hour: price,
              is_active: true,
            }, { onConflict: 'club_id,field_type' })
          )
        );
      }
    }

    await reload();

    return {
      id: data.id,
      club_id: data.club_id,
      name: data.name,
      surface: data.surface ?? undefined,
      is_active: data.is_active,
      physical_slots: PHYSICAL_SLOTS,
      units: insertedUnits.map((u) => ({
        id: u.id,
        field_id: u.field_id,
        type: u.type,
        name: u.name,
        parent_id: u.parent_id,
        slot_ids: (u.slot_ids as PhysicalSlotId[]) ?? [],
        is_active: u.is_active,
      })),
    };
  };

  const updateField = async (payload: UpdateFieldInput) => {
    const { id, ...updates } = payload;
    const { error } = await supabase.from('fields').update(updates).eq('id', id);
    if (error) {
      console.error('Error updating field:', error);
      return false;
    }
    await reload();
    return true;
  };

  const deleteField = async (fieldId: string) => {
    const { error } = await supabase.from('fields').update({ is_active: false }).eq('id', fieldId);
    if (error) {
      console.error('Error deactivating field:', error);
      return false;
    }
    await reload();
    return true;
  };

  // ── PRICING RULES ─────────────────────────────────────────

  const updatePricingRule = async (payload: UpdatePricingRuleInput) => {
    const { id, ...updates } = payload;
    const { error } = await supabase.from('pricing_rules').update(updates).eq('id', id);
    if (error) {
      console.error('Error updating pricing rule:', error);
      return false;
    }
    await reload();
    return true;
  };

  // ── VENUE CONFIG ───────────────────────────────────────────

  const getVenueConfig = (clubId: string): VenueConfig => {
    const existing = venueConfigs.find((vc) => vc.clubId === clubId);
    if (existing) return existing;
    return createDefaultVenueConfig(clubId);
  };

  const updateVenueConfig = async (config: VenueConfig): Promise<boolean> => {
    const closedDates = Array.isArray(config.closedDates) ? config.closedDates : [];
    const payload: Record<string, unknown> = {
      club_id: config.clubId,
      week_schedule: config.weekSchedule,
      slot_duration_minutes: config.slotDurationMinutes,
      closed_dates: closedDates,
    };

    let { error } = await supabase.from('venue_configs').upsert(payload, { onConflict: 'club_id' });

    // If closed_dates column doesn't exist yet (migration 004 not applied), retry without it.
    if (error && /closed_dates/.test(error.message ?? '')) {
      delete payload.closed_dates;
      const retry = await supabase.from('venue_configs').upsert(payload, { onConflict: 'club_id' });
      error = retry.error;
    }

    if (error) {
      console.error('Error updating venue config:', error);
      return false;
    }

    const normalized: VenueConfig = { ...config, closedDates };
    setVenueConfigs((current) => (
      current.some((vc) => vc.clubId === config.clubId)
        ? current.map((vc) => (vc.clubId === config.clubId ? normalized : vc))
        : [...current, normalized]
    ));
    return true;
  };

  // ── FIELD UNIT TOGGLE ─────────────────────────────────────

  const toggleFieldUnit = async (unitId: string, active: boolean): Promise<boolean> => {
    const { error } = await supabase.from('field_units').update({ is_active: active }).eq('id', unitId);
    if (error) {
      console.error('Error toggling field unit:', error);
      return false;
    }
    await reload();
    return true;
  };

  // ── CONTEXT VALUE ──────────────────────────────────────────

  const value = useMemo(() => ({
    clubs,
    fields,
    bookings,
    blocks,
    pricingRules,
    profiles,
    venueConfigs,
    createBooking,
    cancelBooking,
    updateBookingStatus,
    confirmBooking,
    rejectBooking,
    replacePaymentProof,
    evaluateCancellation,
    markBookingSeen,
    createBlock,
    deleteBlock,
    createClub,
    updateClub,
    deleteClub,
    createField,
    updateField,
    deleteField,
    updatePricingRule,
    getVenueConfig,
    updateVenueConfig,
    toggleFieldUnit,
    clubCount: clubs.length,
    fieldCount: fields.length,
    loading,
    reload,
  }), [clubs, fields, bookings, blocks, pricingRules, profiles, venueConfigs, loading]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider');
  return context;
};
