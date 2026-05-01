import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PHYSICAL_SLOTS } from '@/data/mockData';
import { supabase } from '@/lib/supabase';
import {
  sendAdminBookingAlert,
  sendBookingCancelledEmail,
  sendBookingConfirmedEmail,
  sendBookingReceivedEmail,
} from '@/lib/bookingEmail';
import { useAuth } from '@/contexts/AuthContext';
import { Block, BlockType, Booking, BookingStatus, Club, ClubImage, Field, FieldType, FieldUnit, PaymentMethod, PhysicalSlotId, PricingRule, User } from '@/types';
import { VenueConfig } from '@/types/courtConfig';
import type { Database } from '@/lib/supabase-types';
import { createDefaultVenueConfig } from '@/lib/courtConfig';

const CANCELLATION_POLICY_HOURS = 24;
const PROOF_BUCKET = 'booking-proofs';
const CLUB_IMAGE_BUCKET = 'club-images';

interface UpdateBookingInput {
  bookingId: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  total_price?: number;
  payment_method?: PaymentMethod;
  notes?: string | null;
}

export type UpdateBookingResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'conflict' | 'invalid' | 'db_error'; message: string };

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
  /** True cuando un club_admin/staff crea la reserva manualmente para un cliente. */
  created_by_admin?: boolean;
}

interface CreateBlockInput {
  field_id: string;
  field_unit_ids: string[];
  /** Día de inicio del bloqueo. Si `date_end` es igual o nulo, es un bloqueo de un solo día. */
  date: string;
  /** Día de fin del rango (inclusivo). Si difiere de `date`, se crea un bloqueo por cada día con un mismo `block_batch_id`. */
  date_end?: string;
  start_time: string;
  end_time: string;
  type: BlockType;
  reason: string;
}

export type CreateBlockResult =
  | { ok: true; daysCreated: number; batchId: string | null }
  | { ok: false; message: string };

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
  phone?: string | null;
  email?: string | null;
  amenities?: string[];
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

export type ReplaceProofResult =
  | { ok: true }
  | { ok: false; reason: 'not_logged_in' | 'not_found' | 'not_owner' | 'not_pending' | 'upload_failed' | 'update_failed'; message: string };

export type InviteStaffResult =
  | { ok: true; mode: 'created' | 'upgraded'; userId: string; message: string }
  | { ok: false; message: string };

export type UploadClubImageResult =
  | { ok: true; image: ClubImage }
  | { ok: false; reason: 'not_logged_in' | 'bucket_missing' | 'storage_denied' | 'storage_failed' | 'db_failed'; message: string };

export type DeleteFieldResult =
  | { ok: true; deletedBookings: number; deletedBlocks: number; message: string }
  | { ok: false; reason: 'has_future_active_bookings' | 'unknown'; activeBookings?: number; message: string };

interface InviteStaffInput {
  email: string;
  password: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  club_id: string;
}

interface AppDataContextType {
  clubs: Club[];
  fields: Field[];
  bookings: Booking[];
  blocks: Block[];
  pricingRules: PricingRule[];
  profiles: User[];
  venueConfigs: VenueConfig[];
  clubImages: ClubImage[];
  getClubImages: (clubId: string) => ClubImage[];
  getClubImageUrl: (image: ClubImage) => string;
  uploadClubImage: (clubId: string, file: File, caption?: string) => Promise<UploadClubImageResult>;
  deleteClubImage: (imageId: string) => Promise<boolean>;
  inviteStaff: (payload: InviteStaffInput) => Promise<InviteStaffResult>;
  setStaffActive: (profileId: string, active: boolean) => Promise<boolean>;
  removeStaff: (profileId: string) => Promise<boolean>;
  createBooking: (payload: CreateBookingInput) => Promise<Booking | null>;
  cancelBooking: (bookingId: string, reason?: string) => Promise<boolean>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  updateBooking: (input: UpdateBookingInput) => Promise<UpdateBookingResult>;
  confirmBooking: (bookingId: string) => Promise<boolean>;
  rejectBooking: (bookingId: string, reason: string) => Promise<boolean>;
  replacePaymentProof: (bookingId: string, file: File) => Promise<ReplaceProofResult>;
  evaluateCancellation: (bookingId: string) => CancellationCheck | null;
  markBookingSeen: (bookingId: string) => Promise<void>;
  createBlock: (payload: CreateBlockInput) => Promise<CreateBlockResult>;
  deleteBlock: (blockId: string) => Promise<void>;
  deleteBlockBatch: (batchId: string) => Promise<boolean>;
  createClub: (payload: CreateClubInput) => Promise<Club | null>;
  updateClub: (payload: UpdateClubInput) => Promise<boolean>;
  deleteClub: (clubId: string) => Promise<boolean>;
  createField: (payload: CreateFieldInput) => Promise<Field | null>;
  updateField: (payload: UpdateFieldInput) => Promise<boolean>;
  deleteField: (fieldId: string) => Promise<DeleteFieldResult>;
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
      createUnit(fieldId, 'F7', 'F7_1', ['S1', 'S4']),
      createUnit(fieldId, 'F7', 'F7_2', ['S2', 'S5']),
      createUnit(fieldId, 'F7', 'F7_3', ['S3', 'S6']),
    ];
  }

  if (layout === 'six_5') {
    return PHYSICAL_SLOTS.map((slotId, index) => createUnit(fieldId, 'F5', `C${index + 1}`, [slotId]));
  }

  return [
    createUnit(fieldId, 'F11', 'F11', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']),
    createUnit(fieldId, 'F7', 'F7_1', ['S1', 'S4']),
    createUnit(fieldId, 'F7', 'F7_2', ['S2', 'S5']),
    createUnit(fieldId, 'F7', 'F7_3', ['S3', 'S6']),
    createUnit(fieldId, 'F5', 'C1', ['S1']),
    createUnit(fieldId, 'F5', 'C2', ['S2']),
    createUnit(fieldId, 'F5', 'C3', ['S3']),
    createUnit(fieldId, 'F5', 'C4', ['S4']),
    createUnit(fieldId, 'F5', 'C5', ['S5']),
    createUnit(fieldId, 'F5', 'C6', ['S6']),
  ];
}

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isStaff, staffClubId } = useAuth();
  // Set de booking IDs ya conocidos por el cliente. Cada INSERT de
  // realtime que NO esté en este set → es realmente nuevo y dispara toast.
  // Evita doble-toast cuando es nuestra propia inserción que vuelve por
  // realtime después de reload().
  const knownBookingIdsRef = useRef<Set<string>>(new Set());
  const [clubs, setClubs] = useState<Club[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [profiles, setProfiles] = useState<User[]>([]);
  const [venueConfigs, setVenueConfigs] = useState<VenueConfig[]>([]);
  const [clubImages, setClubImages] = useState<ClubImage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);

    const [profilesRes, clubsRes, pricingRes, fieldsRes, unitsRes, bookingsRes, blocksRes, blockUnitsRes, venueConfigsRes, clubImagesRes] = await Promise.all([
      supabase.from('profiles').select('id, email, first_name, last_name, phone, national_id, role, staff_club_id, is_active'),
      supabase.from('clubs').select('*').order('created_at', { ascending: false }),
      supabase.from('pricing_rules').select('*'),
      supabase.from('fields').select('*').order('created_at', { ascending: false }),
      supabase.from('field_units').select('*'),
      supabase.from('bookings').select('*').order('date', { ascending: true }),
      supabase.from('blocks').select('*').order('date', { ascending: true }),
      supabase.from('block_units').select('*'),
      supabase.from('venue_configs').select('*'),
      supabase.from('club_images').select('*').order('position', { ascending: true }),
    ]);

    const profilesData: User[] = (profilesRes.data ?? []).map((item) => {
      const extras = item as typeof item & { staff_club_id?: string | null; is_active?: boolean };
      return {
        id: item.id,
        email: item.email,
        first_name: item.first_name,
        last_name: item.last_name,
        phone: item.phone,
        national_id: item.national_id,
        role: item.role,
        staff_club_id: extras.staff_club_id ?? null,
        is_active: extras.is_active ?? true,
      };
    });

    const pricingData: PricingRule[] = (pricingRes.data ?? []).map((item) => ({
      id: item.id,
      club_id: item.club_id,
      field_type: item.field_type,
      price_per_hour: Number(item.price_per_hour),
      minimum_minutes: item.minimum_minutes,
      increment_minutes: item.increment_minutes,
      is_active: item.is_active,
    }));

    const clubsData: Club[] = (clubsRes.data ?? []).map((item) => {
      const extras = item as typeof item & { phone?: string | null; email?: string | null; amenities?: string[] | null };
      return {
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
        phone: extras.phone ?? null,
        email: extras.email ?? null,
        amenities: Array.isArray(extras.amenities) ? extras.amenities : [],
      };
    });

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

    const blocksData: Block[] = (blocksRes.data ?? []).map((item) => {
      const extras = item as typeof item & { block_batch_id?: string | null };
      return {
        id: item.id,
        field_id: item.field_id,
        field_unit_ids: blockUnitMap.get(item.id) ?? [],
        date: item.date,
        start_time: item.start_time.slice(0, 5),
        end_time: item.end_time.slice(0, 5),
        type: item.type,
        reason: item.reason,
        batch_id: extras.block_batch_id ?? null,
      };
    });

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
      created_by_admin: Boolean((item as { created_by_admin?: boolean | null }).created_by_admin ?? false),
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

    const clubImagesData: ClubImage[] = (clubImagesRes.data ?? []).map((item) => ({
      id: item.id,
      club_id: item.club_id,
      storage_path: item.storage_path,
      caption: item.caption ?? null,
      position: Number(item.position ?? 0),
      created_at: item.created_at,
    }));

    setProfiles(profilesData);
    setClubs(clubsData);
    setFields(fieldsData);
    setBlocks(blocksData);
    setBookings(bookingsData);
    setPricingRules(pricingData);
    setVenueConfigs(venueConfigsData);
    setClubImages(clubImagesData);
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

  // ── REALTIME ──────────────────────────────────────────────
  // Suscripción a cambios en las tablas operativas. Cada evento
  // dispara un reload() debounced: si llegan 5 cambios en 300ms (ej.
  // un batch), solo recargamos una vez. Eso da feel "en vivo" sin
  // tirar 9 queries por evento.
  //
  // Adicional: si llega una reserva nueva pendiente que el admin/staff
  // aún no conocía, mostramos un toast "Nueva reserva pendiente". El
  // ref `knownBookingIdsRef` evita doble-toast cuando es nuestra propia
  // inserción que vuelve por realtime después del reload del action.
  //
  // Requiere migración 013 aplicada. Si no, las suscripciones se
  // crean pero no reciben eventos (sin error visible).
  useEffect(() => {
    if (!user) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        void reload();
      }, 300);
    };

    const handleBookingInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload.new;
      if (!row || typeof row !== 'object') return;
      const id = String(row.id ?? '');
      if (!id) return;
      // Si ya lo conocemos (fue creado por nosotros y reload lo trajo),
      // no toasteamos.
      if (knownBookingIdsRef.current.has(id)) return;
      knownBookingIdsRef.current.add(id);

      // Solo notificamos a admin/staff. Cliente no necesita toast por
      // reservas que ni le aplican.
      if (!isAdmin && !isStaff) return;
      const status = String(row.status ?? '');
      if (status !== 'pending') return;

      // Para staff: solo si es de su club asignado.
      const bookingClubId = String(row.club_id ?? '');
      if (isStaff && staffClubId && bookingClubId !== staffClubId) return;

      const fieldType = String(row.field_type ?? '');
      const date = String(row.date ?? '');
      const startTime = String(row.start_time ?? '').slice(0, 5);
      toast.info('Nueva reserva pendiente', {
        description: `${fieldType} · ${date} · ${startTime}`,
      });
    };

    const tables = [
      'bookings',
      'blocks',
      'block_units',
      'fields',
      'field_units',
      'clubs',
      'pricing_rules',
      'venue_configs',
      'club_images',
      'profiles',
    ];

    // Blindamos la creación + suscripción del canal con try/catch.
    // Si Supabase Realtime falla por la razón que sea (red, migración 013
    // no aplicada, etc.) NO debe crashear el provider — el resto de la
    // app sigue funcionando con el reload manual de cada acción.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel('app-data-realtime');
      tables.forEach((table) => {
        channel = channel!.on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event: '*', schema: 'public', table },
          (payload: { eventType?: string; new?: Record<string, unknown> }) => {
            try {
              if (table === 'bookings' && payload.eventType === 'INSERT') {
                handleBookingInsert(payload);
              }
              debouncedReload();
            } catch (err) {
              console.error('Realtime payload handler error:', err);
            }
          },
        );
      });
      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Realtime channel status:', status);
        }
      });
    } catch (err) {
      console.error('No se pudo crear el canal Realtime (la app sigue funcionando con reload manual):', err);
      channel = null;
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      if (channel) {
        try {
          void supabase.removeChannel(channel);
        } catch (err) {
          console.error('Error removiendo canal Realtime:', err);
        }
      }
    };
  }, [user?.id, isAdmin, isStaff, staffClubId]);

  // Mantener `knownBookingIdsRef` sincronizado con los IDs actuales del
  // state. Así, cuando llegue un INSERT de realtime para una reserva
  // que YA habíamos cargado vía reload, el set lo identifica y se
  // omite el toast.
  useEffect(() => {
    knownBookingIdsRef.current = new Set(bookings.map((b) => b.id));
  }, [bookings]);

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
      p_created_by_admin: payload.created_by_admin ?? false,
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

  const replacePaymentProof = async (bookingId: string, file: File): Promise<ReplaceProofResult> => {
    if (!user) return { ok: false, reason: 'not_logged_in', message: 'Debes iniciar sesión nuevamente.' };
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return { ok: false, reason: 'not_found', message: 'No encontramos esa reserva.' };
    if (booking.user_id !== user.id) {
      return { ok: false, reason: 'not_owner', message: 'No puedes reemplazar comprobantes de reservas de otro usuario.' };
    }
    if (booking.status !== 'pending') {
      const statusLabel = booking.status === 'confirmed' ? 'confirmada' : 'cancelada o rechazada';
      return {
        ok: false,
        reason: 'not_pending',
        message: `Esta reserva ya está ${statusLabel}; no se puede reemplazar el comprobante. Contacta al club si necesitas cambiarlo.`,
      };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const safeDate = booking.date.replace(/-/g, '');
    const filePath = `${user.id}/${safeDate}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      console.error('Error uploading replacement proof:', uploadError);
      return {
        ok: false,
        reason: 'upload_failed',
        message: uploadError.message?.includes('Bucket not found')
          ? 'El bucket de comprobantes no está configurado. Avisa al administrador.'
          : `No se pudo subir el archivo: ${uploadError.message ?? 'error desconocido'}.`,
      };
    }

    const oldPath = booking.payment_proof_path;
    const { error: rpcError } = await supabase.rpc('rpc_replace_payment_proof', {
      p_booking_id: bookingId,
      p_new_path: filePath,
    });

    if (rpcError) {
      const { error: fallbackError } = await supabase
        .from('bookings')
        .update({ payment_proof_path: filePath, admin_seen_at: null })
        .eq('id', bookingId);
      if (fallbackError) {
        console.error('Error replacing payment proof:', fallbackError);
        await supabase.storage.from(PROOF_BUCKET).remove([filePath]);
        return {
          ok: false,
          reason: 'update_failed',
          message: `No se pudo actualizar la reserva: ${fallbackError.message ?? rpcError.message ?? 'error desconocido'}.`,
        };
      }
    }

    if (oldPath) {
      await supabase.storage.from(PROOF_BUCKET).remove([oldPath]);
    }

    await reload();
    return { ok: true };
  };

  const updateBooking = async (input: UpdateBookingInput): Promise<UpdateBookingResult> => {
    const booking = bookings.find((b) => b.id === input.bookingId);
    if (!booking) {
      return { ok: false, reason: 'not_found', message: 'Reserva no encontrada.' };
    }

    // Datos finales con los cambios aplicados encima del estado actual.
    const next = {
      date: input.date ?? booking.date,
      start_time: input.start_time ?? booking.start_time,
      end_time: input.end_time ?? booking.end_time,
      total_price: input.total_price ?? booking.total_price,
      payment_method: input.payment_method ?? booking.payment_method ?? 'bank_transfer',
      notes: input.notes !== undefined ? input.notes : booking.notes ?? null,
    };

    if (next.end_time <= next.start_time) {
      return { ok: false, reason: 'invalid', message: 'La hora de fin debe ser posterior a la de inicio.' };
    }
    if (next.total_price < 0) {
      return { ok: false, reason: 'invalid', message: 'El precio no puede ser negativo.' };
    }

    // Si cambió fecha u hora, validamos que no choque con otra reserva o
    // bloqueo del mismo field. Excluimos la reserva actual del check.
    const dateOrTimeChanged =
      next.date !== booking.date ||
      next.start_time !== booking.start_time ||
      next.end_time !== booking.end_time;

    if (dateOrTimeChanged) {
      const field = fields.find((f) => f.units.some((u) => u.id === booking.field_unit_id));
      const unit = field?.units.find((u) => u.id === booking.field_unit_id);
      if (!field || !unit) {
        return { ok: false, reason: 'not_found', message: 'No se encontró la cancha de esta reserva.' };
      }
      const requiredSlots = new Set(unit.slot_ids);

      // Buscar otras reservas (no canceladas, no esta misma) en el mismo
      // field y fecha que se solapen y compartan slots con la unidad.
      const otherBookings = bookings.filter(
        (b) =>
          b.id !== booking.id &&
          b.status !== 'cancelled' &&
          b.date === next.date,
      );
      const conflictingBooking = otherBookings.find((b) => {
        const otherUnit = field.units.find((u) => u.id === b.field_unit_id);
        if (!otherUnit) return false;
        const sharesSlot = otherUnit.slot_ids.some((s) => requiredSlots.has(s));
        if (!sharesSlot) return false;
        const overlaps = next.start_time < b.end_time && next.end_time > b.start_time;
        return overlaps;
      });
      if (conflictingBooking) {
        return {
          ok: false,
          reason: 'conflict',
          message: `Choca con la reserva ${conflictingBooking.start_time}–${conflictingBooking.end_time}.`,
        };
      }

      // Validamos también contra bloqueos del field en esa fecha que toquen
      // una unidad que comparte slot.
      const conflictingBlock = blocks.find((b) => {
        if (b.field_id !== field.id || b.date !== next.date) return false;
        const blockedUnits = b.field_unit_ids.map((id) => field.units.find((u) => u.id === id)).filter(Boolean) as typeof field.units;
        const sharesSlot = blockedUnits.some((bu) => bu.slot_ids.some((s) => requiredSlots.has(s)));
        if (!sharesSlot) return false;
        return next.start_time < b.end_time && next.end_time > b.start_time;
      });
      if (conflictingBlock) {
        return {
          ok: false,
          reason: 'conflict',
          message: `Choca con un bloqueo: ${conflictingBlock.reason}.`,
        };
      }
    }

    const { error } = await supabase
      .from('bookings')
      .update({
        date: next.date,
        start_time: next.start_time,
        end_time: next.end_time,
        total_price: next.total_price,
        payment_method: next.payment_method,
        notes: next.notes,
      })
      .eq('id', input.bookingId);

    if (error) {
      console.error('Error updating booking:', error);
      return { ok: false, reason: 'db_error', message: error.message ?? 'Error al guardar los cambios.' };
    }

    await reload();
    return { ok: true };
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

  const enumerateDates = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [start];
    if (endDate < startDate) return [start];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dates.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  const createBlock = async (payload: CreateBlockInput): Promise<CreateBlockResult> => {
    const dates = enumerateDates(payload.date, payload.date_end ?? payload.date);
    if (dates.length === 0) {
      return { ok: false, message: 'Rango de fechas inválido.' };
    }

    const isRange = dates.length > 1;
    const batchId = isRange ? crypto.randomUUID() : null;

    const blockRows = dates.map((date) => ({
      field_id: payload.field_id,
      date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      type: payload.type,
      reason: payload.reason,
      created_by: user?.id ?? null,
      block_batch_id: batchId,
    }));

    const { data: insertedBlocks, error } = await supabase
      .from('blocks')
      .insert(blockRows)
      .select('id');

    if (error || !insertedBlocks) {
      console.error('Error creating block(s):', error);
      // Si la columna block_batch_id no existe (migración 008 no aplicada),
      // intentamos sin ella para no bloquear al usuario en bloqueos de un solo día.
      if (!isRange && /block_batch_id/.test(error?.message ?? '')) {
        const fallback = blockRows.map(({ block_batch_id: _ignore, ...rest }) => rest);
        const retry = await supabase.from('blocks').insert(fallback).select('id');
        if (retry.error || !retry.data) {
          return { ok: false, message: retry.error?.message ?? 'No se pudo crear el bloqueo.' };
        }
        await insertBlockUnits(retry.data, payload.field_unit_ids);
        await reload();
        return { ok: true, daysCreated: dates.length, batchId: null };
      }
      return { ok: false, message: error?.message ?? 'No se pudo crear el bloqueo.' };
    }

    const failed = await insertBlockUnits(insertedBlocks, payload.field_unit_ids);
    if (failed) {
      // Rollback manual de los bloqueos recién creados.
      const ids = insertedBlocks.map((b) => b.id);
      await supabase.from('blocks').delete().in('id', ids);
      return { ok: false, message: failed };
    }

    await reload();
    return { ok: true, daysCreated: dates.length, batchId };
  };

  const insertBlockUnits = async (
    blocksInserted: { id: string }[],
    fieldUnitIds: string[],
  ): Promise<string | null> => {
    if (fieldUnitIds.length === 0) return null;
    const rows = blocksInserted.flatMap((block) =>
      fieldUnitIds.map((fieldUnitId) => ({ block_id: block.id, field_unit_id: fieldUnitId })),
    );
    const { error } = await supabase.from('block_units').insert(rows);
    if (error) {
      console.error('Error inserting block units:', error);
      return error.message ?? 'No se pudieron asociar las unidades al bloqueo.';
    }
    return null;
  };

  const deleteBlock = async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    // Si forma parte de un batch, borramos el rango completo.
    if (block?.batch_id) {
      await deleteBlockBatch(block.batch_id);
      return;
    }
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

  const deleteBlockBatch = async (batchId: string): Promise<boolean> => {
    const blockIds = blocks.filter((b) => b.batch_id === batchId).map((b) => b.id);
    if (blockIds.length === 0) return false;
    const { error: unitsError } = await supabase.from('block_units').delete().in('block_id', blockIds);
    if (unitsError) {
      console.error('Error deleting block units (batch):', unitsError);
      return false;
    }
    const { error: blocksError } = await supabase.from('blocks').delete().in('id', blockIds);
    if (blocksError) {
      console.error('Error deleting blocks (batch):', blocksError);
      return false;
    }
    await reload();
    return true;
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

  // ── CLUB IMAGES ────────────────────────────────────────────

  const getClubImages = (clubId: string) =>
    clubImages.filter((img) => img.club_id === clubId).sort((a, b) => a.position - b.position);

  const getClubImageUrl = (image: ClubImage) => {
    const { data } = supabase.storage.from(CLUB_IMAGE_BUCKET).getPublicUrl(image.storage_path);
    return data.publicUrl;
  };

  const uploadClubImage = async (clubId: string, file: File, caption?: string): Promise<UploadClubImageResult> => {
    if (!user) return { ok: false, reason: 'not_logged_in', message: 'Debes iniciar sesión nuevamente.' };
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const filePath = `${clubId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(CLUB_IMAGE_BUCKET)
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      console.error('Error uploading club image:', uploadError);
      const message = uploadError.message ?? 'error desconocido';
      if (/bucket not found/i.test(message)) {
        return { ok: false, reason: 'bucket_missing', message: 'El bucket "club-images" no existe. Aplica la migración 005 en Supabase.' };
      }
      if (/row[- ]level security|new row violates|not authorized|policy/i.test(message)) {
        return {
          ok: false,
          reason: 'storage_denied',
          message: 'Permisos de Storage rechazaron la subida. Verifica que seas el dueño del club y que la migración 005 esté aplicada.',
        };
      }
      return { ok: false, reason: 'storage_failed', message: `Error al subir el archivo: ${message}.` };
    }

    const nextPosition = (clubImages.filter((img) => img.club_id === clubId)
      .reduce((max, img) => Math.max(max, img.position), -1)) + 1;

    const { data, error } = await supabase
      .from('club_images')
      .insert({
        club_id: clubId,
        storage_path: filePath,
        caption: caption ?? null,
        position: nextPosition,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error inserting club image row:', error);
      await supabase.storage.from(CLUB_IMAGE_BUCKET).remove([filePath]);
      return {
        ok: false,
        reason: 'db_failed',
        message: `No se pudo registrar la imagen en la base de datos: ${error?.message ?? 'error desconocido'}.`,
      };
    }

    const inserted: ClubImage = {
      id: data.id,
      club_id: data.club_id,
      storage_path: data.storage_path,
      caption: data.caption ?? null,
      position: Number(data.position ?? 0),
      created_at: data.created_at,
    };
    setClubImages((current) => [...current, inserted].sort((a, b) => a.position - b.position));
    return { ok: true, image: inserted };
  };

  const deleteClubImage = async (imageId: string): Promise<boolean> => {
    const image = clubImages.find((img) => img.id === imageId);
    if (!image) return false;
    const { error } = await supabase.from('club_images').delete().eq('id', imageId);
    if (error) {
      console.error('Error deleting club image row:', error);
      return false;
    }
    await supabase.storage.from(CLUB_IMAGE_BUCKET).remove([image.storage_path]);
    setClubImages((current) => current.filter((img) => img.id !== imageId));
    return true;
  };

  // ── TEAM / STAFF ───────────────────────────────────────────

  const inviteStaff = async (payload: InviteStaffInput): Promise<InviteStaffResult> => {
    if (!user) return { ok: false, message: 'No hay sesión activa.' };
    const { data, error } = await supabase.functions.invoke('invite-staff', {
      body: {
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        first_name: payload.first_name.trim(),
        last_name: payload.last_name?.trim() ?? '',
        phone: payload.phone?.trim() ?? '',
        club_id: payload.club_id,
      },
    });

    // supabase-js convierte cualquier respuesta no-2xx en `error`. El body
    // real (con nuestro mensaje en español) viene en error.context, que es
    // un Response. Hay que parsearlo para mostrar el motivo concreto.
    if (error) {
      console.error('inviteStaff edge function error:', error);
      let serverMessage: string | null = null;
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          serverMessage = body?.error ?? body?.details ?? body?.message ?? null;
        }
      } catch (parseErr) {
        console.error('No se pudo parsear el body del error:', parseErr);
      }

      if (serverMessage) {
        return { ok: false, message: serverMessage };
      }
      if (error.message?.toLowerCase().includes('not found') || error.message?.toLowerCase().includes('failed to send')) {
        return {
          ok: false,
          message: 'La función "invite-staff" no responde. Verifica que esté desplegada (supabase functions deploy invite-staff) y que SUPABASE_SERVICE_ROLE_KEY esté configurada.',
        };
      }
      return { ok: false, message: `No se pudo crear el empleado: ${error.message}` };
    }

    const result = data as { ok?: boolean; mode?: 'created' | 'upgraded'; user_id?: string; message?: string; error?: string };
    if (!result?.ok) {
      return { ok: false, message: result?.error ?? 'No se pudo crear el empleado.' };
    }

    await reload();
    return {
      ok: true,
      mode: result.mode ?? 'created',
      userId: result.user_id ?? '',
      message: result.message ?? 'Empleado creado.',
    };
  };

  const setStaffActive = async (profileId: string, active: boolean): Promise<boolean> => {
    const { error } = await supabase.from('profiles').update({ is_active: active }).eq('id', profileId);
    if (error) {
      console.error('Error toggling staff active:', error);
      return false;
    }
    setProfiles((current) => current.map((p) => (p.id === profileId ? { ...p, is_active: active } : p)));
    return true;
  };

  const removeStaff = async (profileId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'client', staff_club_id: null, is_active: true })
      .eq('id', profileId);
    if (error) {
      console.error('Error removing staff:', error);
      return false;
    }
    setProfiles((current) =>
      current.map((p) => (p.id === profileId ? { ...p, role: 'client', staff_club_id: null, is_active: true } : p)),
    );
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

  const deleteField = async (fieldId: string): Promise<DeleteFieldResult> => {
    const field = fields.find((f) => f.id === fieldId);
    const unitIds = field?.units.map((u) => u.id) ?? [];

    // 1) Si no hay unidades asociadas, intentamos delete directo.
    if (unitIds.length === 0) {
      const { error } = await supabase.from('fields').delete().eq('id', fieldId);
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message ?? 'Error al eliminar la cancha.' };
      }
      await reload();
      return { ok: true, deletedBookings: 0, deletedBlocks: 0, message: 'Cancha eliminada permanentemente.' };
    }

    // 2) Comprobar reservas activas a futuro: solo esas bloquean el borrado.
    const today = new Date().toISOString().split('T')[0];
    const { data: blockingBookings, error: checkError } = await supabase
      .from('bookings')
      .select('id, date, start_time, status')
      .in('field_unit_id', unitIds)
      .in('status', ['pending', 'confirmed'])
      .gte('date', today);

    if (checkError) {
      console.error('Error verificando reservas activas:', checkError);
      return { ok: false, reason: 'unknown', message: checkError.message ?? 'No se pudo verificar las reservas asociadas.' };
    }

    if ((blockingBookings ?? []).length > 0) {
      const count = blockingBookings!.length;
      return {
        ok: false,
        reason: 'has_future_active_bookings',
        activeBookings: count,
        message: `La cancha tiene ${count} reserva${count === 1 ? '' : 's'} pendiente${count === 1 ? '' : 's'} o confirmada${count === 1 ? '' : 's'} a futuro. Cancélala${count === 1 ? '' : 's'} antes de eliminar la cancha.`,
      };
    }

    // 3) Limpieza de datos históricos referentes a esta cancha:
    //    - bookings (canceladas o pasadas) que mantienen el FK RESTRICT
    //    - blocks asociados al campo (cascade a block_units por FK)
    const { count: bookingsToDelete } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .in('field_unit_id', unitIds);

    if ((bookingsToDelete ?? 0) > 0) {
      const { error: deleteBookingsErr } = await supabase
        .from('bookings')
        .delete()
        .in('field_unit_id', unitIds);
      if (deleteBookingsErr) {
        console.error('Error limpiando reservas históricas:', deleteBookingsErr);
        return {
          ok: false,
          reason: 'unknown',
          message: `No se pudieron limpiar reservas históricas: ${deleteBookingsErr.message}.`,
        };
      }
    }

    const { count: blocksToDelete } = await supabase
      .from('blocks')
      .select('id', { count: 'exact', head: true })
      .eq('field_id', fieldId);

    if ((blocksToDelete ?? 0) > 0) {
      // block_units cascade automáticamente por FK on delete cascade
      const { error: deleteBlocksErr } = await supabase
        .from('blocks')
        .delete()
        .eq('field_id', fieldId);
      if (deleteBlocksErr) {
        console.error('Error eliminando bloqueos del campo:', deleteBlocksErr);
        return {
          ok: false,
          reason: 'unknown',
          message: `No se pudieron eliminar los bloqueos asociados: ${deleteBlocksErr.message}.`,
        };
      }
    }

    // 4) Finalmente, borrar la cancha. field_units cascade, conflict graph se recomputa.
    const { error: deleteFieldErr } = await supabase.from('fields').delete().eq('id', fieldId);
    if (deleteFieldErr) {
      console.error('Error eliminando cancha:', deleteFieldErr);
      return {
        ok: false,
        reason: 'unknown',
        message: deleteFieldErr.message ?? 'Error al eliminar la cancha.',
      };
    }

    await reload();
    const cleanedBookings = bookingsToDelete ?? 0;
    const cleanedBlocks = blocksToDelete ?? 0;
    const detailParts: string[] = [];
    if (cleanedBookings > 0) detailParts.push(`${cleanedBookings} reserva${cleanedBookings === 1 ? '' : 's'} histórica${cleanedBookings === 1 ? '' : 's'}`);
    if (cleanedBlocks > 0) detailParts.push(`${cleanedBlocks} bloqueo${cleanedBlocks === 1 ? '' : 's'}`);
    const detail = detailParts.length > 0 ? ` También se eliminaron ${detailParts.join(' y ')}.` : '';

    return {
      ok: true,
      deletedBookings: cleanedBookings,
      deletedBlocks: cleanedBlocks,
      message: `Cancha eliminada permanentemente.${detail}`,
    };
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
    clubImages,
    getClubImages,
    getClubImageUrl,
    uploadClubImage,
    deleteClubImage,
    inviteStaff,
    setStaffActive,
    removeStaff,
    createBooking,
    cancelBooking,
    updateBookingStatus,
    updateBooking,
    confirmBooking,
    rejectBooking,
    replacePaymentProof,
    evaluateCancellation,
    markBookingSeen,
    createBlock,
    deleteBlock,
    deleteBlockBatch,
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
  }), [clubs, fields, bookings, blocks, pricingRules, profiles, venueConfigs, clubImages, loading]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider');
  return context;
};
