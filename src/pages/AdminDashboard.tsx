import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BellRing,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Edit2,
  ExternalLink,
  Info,
  LayoutGrid,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Block, FieldType } from '@/types';
import { TIME_SLOTS } from '@/data/mockData';
import CourtLayoutPreview from '@/components/CourtLayoutPreview';
import FieldConfigPanel from '@/components/FieldConfigPanel';
import VenueScheduleEditor from '@/components/VenueScheduleEditor';
import ClosedDatesEditor from '@/components/ClosedDatesEditor';
import ClubGalleryManager from '@/components/ClubGalleryManager';
import TeamPanel from '@/components/TeamPanel';
import AdminWeekCalendar from '@/components/AdminWeekCalendar';
import ReportsSection from '@/components/ReportsSection';
import AdminCreateBookingDialog from '@/components/AdminCreateBookingDialog';
import { formatBlockType, formatBookingDate, formatBookingStatus, formatCurrency, getStatusTone } from '@/lib/bookingFormat';
import { KpiRowSkeleton, TableRowSkeleton } from '@/components/skeletons';
import { useDialogBackButton } from '@/hooks/useDialogBackButton';
import { Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const adminSections = ['overview', 'calendar', 'bookings', 'blocks', 'reports', 'clubs', 'fields', 'config', 'pricing', 'team'] as const;
type AdminSection = (typeof adminSections)[number];

// Sections a staff member is allowed to view. Anything outside this set
// must redirect to the overview when accessed by a staff account.
const STAFF_ALLOWED_SECTIONS = new Set<AdminSection>(['overview', 'calendar', 'bookings', 'blocks']);

const layoutLabels = {
  full_11: 'Cancha completa — solo Fútbol 11',
  three_7: '3 canchas de Fútbol 7',
  six_5: '6 mini canchas de Fútbol 5',
  versatile_full: 'Versátil — F11, F7 y F5 (recomendado)',
} as const;

const layoutDescriptions: Record<keyof typeof layoutLabels, string> = {
  full_11: 'Toda la cancha se alquila como una sola unidad. Ideal si solo ofreces partidos de 11 vs 11.',
  three_7: 'La cancha se divide en 3 espacios independientes para Fútbol 7. Cada espacio usa 2 zonas.',
  six_5: 'La cancha se divide en 6 mini canchas individuales. Máxima capacidad simultánea.',
  versatile_full: 'Ofrece todas las modalidades: F11 completo, 3 de F7, o 6 de F5. El sistema evita conflictos automáticamente. Más flexibilidad = más ingresos.',
};

export default function AdminDashboard() {
  const { section } = useParams();
  const { user, isStaff, canManageTeam, canManageClubInfo } = useAuth();
  const navigate = useNavigate();
  const {
    clubs,
    fields,
    bookings,
    blocks,
    pricingRules,
    createBlock,
    deleteBlock,
    confirmBooking,
    rejectBooking,
    cancelBooking,
    markBookingSeen,
    createClub,
    updateClub,
    createField,
    updateField,
    deleteField,
    updatePricingRule,
    getVenueConfig,
    updateVenueConfig,
    toggleFieldUnit,
    profiles,
    loading: appLoading,
  } = useAppData();

  const currentSection: AdminSection = adminSections.includes((section as AdminSection) || 'overview')
    ? ((section as AdminSection) || 'overview')
    : 'overview';

  useEffect(() => {
    if (isStaff && !STAFF_ALLOWED_SECTIONS.has(currentSection)) {
      toast.error('No tienes permisos para esta sección.');
      navigate('/admin/overview', { replace: true });
    }
  }, [isStaff, currentSection, navigate]);

  // Back button del navegador / gesto en mobile cierra el modal en lugar de
  // hacer navigate-back que sacaría al admin de la sección actual.

  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMobileCalendarDate, setSelectedMobileCalendarDate] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [clubDialogOpen, setClubDialogOpen] = useState(false);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<string | null>(null);
  const [deleteFieldBusy, setDeleteFieldBusy] = useState(false);
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<string | null>(null);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedBookingProofUrl, setSelectedBookingProofUrl] = useState<string | null>(null);
  const [loadingBookingProofUrl, setLoadingBookingProofUrl] = useState(false);
  const [bookingActionMode, setBookingActionMode] = useState<'idle' | 'reject' | 'cancel-confirmed'>('idle');
  const [bookingActionReason, setBookingActionReason] = useState('');
  const [bookingActionBusy, setBookingActionBusy] = useState(false);

  // Conectamos los modales más críticos del admin con el back button del
  // navegador. Esto fixea el caso "abro modal de reserva, presiono atrás
  // y se va a otra sección" — ahora el back solo cierra el modal.
  useDialogBackButton(Boolean(selectedBookingId), () => setSelectedBookingId(null));
  useDialogBackButton(blockDialogOpen, () => setBlockDialogOpen(false));
  useDialogBackButton(clubDialogOpen, () => setClubDialogOpen(false));
  useDialogBackButton(fieldDialogOpen, () => setFieldDialogOpen(false));
  useDialogBackButton(Boolean(deleteFieldTarget), () => setDeleteFieldTarget(null));
  useDialogBackButton(Boolean(deleteBlockTarget), () => setDeleteBlockTarget(null));

  // Edit states
  const [editingClubId, setEditingClubId] = useState<string | null>(null);
  const [editClubForm, setEditClubForm] = useState({
    name: '',
    location: '',
    description: '',
    open_time: '',
    close_time: '',
    phone: '',
    email: '',
    amenities: '',
  });
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldForm, setEditFieldForm] = useState({ name: '', surface: '' });
  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [editPricingForm, setEditPricingForm] = useState({ price_per_hour: '', minimum_minutes: '' });

  // `target` selecciona qué unidades del field se bloquean:
  //   'all'           → toda la cancha (todas las unidades)
  //   'type:F11'      → todas las modalidades F11 del field (suele ser solo 1)
  //   'type:F7'       → todas las F7
  //   'type:F5'       → todas las F5
  //   'unit:<uuid>'   → una sola unidad específica (ej. C1, F7_1)
  const [blockForm, setBlockForm] = useState({
    field_id: '',
    target: 'all' as string,
    date_start: new Date().toISOString().split('T')[0],
    date_end: new Date().toISOString().split('T')[0],
    start_time: '18:00',
    end_time: '20:00',
    type: 'maintenance' as Block['type'],
    reason: '',
  });
  const [clubForm, setClubForm] = useState({
    name: '',
    location: '',
    description: '',
  });
  const [fieldForm, setFieldForm] = useState({
    club_id: '',
    name: '',
    surface: 'Gramilla sintética',
    layout: 'versatile_full' as keyof typeof layoutLabels,
    priceF5: '3000',
    priceF7: '6000',
    priceF11: '18000',
  });

  const totalRevenue = bookings
    .filter((booking) => booking.status === 'confirmed')
    .reduce((sum, booking) => sum + booking.total_price, 0);

  const activeUsers = new Set(bookings.map((booking) => booking.user_id)).size;
  const unseenBookings = bookings.filter((b) => !b.admin_seen_at && b.status === 'pending');
  const unseenCount = unseenBookings.length;

  // Cada card tiene su propia paleta + un destino de navegación. Al
  // hacer click, el admin va a la sección relevante.
  const stats: Array<{
    label: string;
    value: number | string;
    icon: typeof Calendar;
    accent: 'emerald' | 'amber' | 'rose' | 'sky' | 'primary' | 'violet';
    path?: string;
    highlight?: boolean;
  }> = [
    {
      label: 'Reservas confirmadas',
      value: bookings.filter((b) => b.status === 'confirmed').length,
      icon: Calendar,
      accent: 'emerald',
      path: '/admin/bookings',
    },
    {
      label: 'Pendientes nuevas',
      value: unseenCount,
      icon: BellRing,
      accent: 'amber',
      highlight: unseenCount > 0,
      path: '/admin/bookings',
    },
    {
      label: 'Bloqueos activos',
      value: blocks.length,
      icon: Shield,
      accent: 'rose',
      path: '/admin/blocks',
    },
    {
      label: 'Clubes',
      value: clubs.length,
      icon: Building2,
      accent: 'primary',
      path: canManageClubInfo ? '/admin/clubs' : undefined,
    },
    {
      label: 'Ingresos estimados',
      value: `RD$ ${totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      accent: 'sky',
      path: !isStaff ? '/admin/reports' : undefined,
    },
    {
      // Solo informativa: cuenta clientes únicos con reservas. No tiene
      // navegación porque no hay vista dedicada de "lista de usuarios".
      label: 'Usuarios activos',
      value: activeUsers,
      icon: Users,
      accent: 'violet',
    },
  ];

  // Colores sólidos saturados con texto blanco para máximo contraste
  // visual. Tailwind requiere classes literales para incluirlas al bundle.
  const accentClasses: Record<typeof stats[number]['accent'], {
    cardBg: string; cardBorder: string;
    iconBg: string; iconText: string;
    label: string; value: string;
  }> = {
    emerald: {
      cardBg: 'bg-emerald-600', cardBorder: 'border-emerald-700',
      iconBg: 'bg-white/20', iconText: 'text-white',
      label: 'text-white/85', value: 'text-white',
    },
    amber: {
      cardBg: 'bg-amber-500', cardBorder: 'border-amber-600',
      iconBg: 'bg-white/25', iconText: 'text-white',
      label: 'text-white/90', value: 'text-white',
    },
    rose: {
      cardBg: 'bg-rose-500', cardBorder: 'border-rose-600',
      iconBg: 'bg-white/20', iconText: 'text-white',
      label: 'text-white/85', value: 'text-white',
    },
    sky: {
      cardBg: 'bg-sky-600', cardBorder: 'border-sky-700',
      iconBg: 'bg-white/20', iconText: 'text-white',
      label: 'text-white/85', value: 'text-white',
    },
    primary: {
      cardBg: 'bg-primary', cardBorder: 'border-primary',
      iconBg: 'bg-white/20', iconText: 'text-white',
      label: 'text-primary-foreground/85', value: 'text-primary-foreground',
    },
    violet: {
      cardBg: 'bg-violet-600', cardBorder: 'border-violet-700',
      iconBg: 'bg-white/20', iconText: 'text-white',
      label: 'text-white/85', value: 'text-white',
    },
  };

  const calendarDateObj = new Date(`${calendarDate}T00:00:00`);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(calendarDateObj);
    date.setDate(date.getDate() - date.getDay() + i);
    return date.toISOString().split('T')[0];
  });

  const getDayEvents = (date: string) => {
    return [
      ...bookings
        .filter((booking) => booking.date === date)
        .map((booking) => ({
          id: booking.id,
          kind: 'booking' as const,
          time: booking.start_time,
          endTime: booking.end_time,
          label: `${booking.field_type} · Reserva`,
        })),
      ...blocks
        .filter((block) => block.date === date)
        .map((block) => ({
          id: block.id,
          kind: 'block' as const,
          time: block.start_time,
          endTime: block.end_time,
          label: block.reason,
        })),
    ].sort((a, b) => a.time.localeCompare(b.time));
  };

  const latestBookings = useMemo(() => bookings.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')), [bookings]);
  const newPendingBookings = useMemo(() => bookings.filter((booking) => booking.status === 'pending' && !booking.admin_seen_at), [bookings]);
  const selectedBooking = bookings.find((booking) => booking.id === selectedBookingId) ?? null;
  const bookingOwner = selectedBooking
    ? profiles.find((profile) => profile.id === selectedBooking.user_id) ?? null
    : null;

  useEffect(() => {
    let cancelled = false;

    const loadProofUrl = async () => {
      if (!selectedBooking?.payment_proof_path) {
        setSelectedBookingProofUrl(null);
        setLoadingBookingProofUrl(false);
        return;
      }

      setLoadingBookingProofUrl(true);
      const { data, error } = await supabase.storage
        .from('booking-proofs')
        .createSignedUrl(selectedBooking.payment_proof_path, 60 * 60);

      if (!cancelled) {
        if (error) {
          console.error('Error creating signed URL for payment proof:', error);
          setSelectedBookingProofUrl(null);
        } else {
          setSelectedBookingProofUrl(data.signedUrl);
        }
        setLoadingBookingProofUrl(false);
      }
    };

    void loadProofUrl();
    return () => {
      cancelled = true;
    };
  }, [selectedBooking?.payment_proof_path]);

  const openBookingDetails = async (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId) ?? null;
    setSelectedBookingId(bookingId);
    setBookingActionMode('idle');
    setBookingActionReason('');
    if (booking && !booking.admin_seen_at) {
      await markBookingSeen(bookingId);
    }
  };

  const closeBookingDetails = () => {
    setSelectedBookingId(null);
    setSelectedBookingProofUrl(null);
    setBookingActionMode('idle');
    setBookingActionReason('');
    setBookingActionBusy(false);
  };

  const handleConfirmBooking = async (bookingId: string) => {
    setBookingActionBusy(true);
    const ok = await confirmBooking(bookingId);
    setBookingActionBusy(false);
    if (ok) {
      toast.success('Reserva confirmada. Notificamos al cliente.');
      closeBookingDetails();
    } else {
      toast.error('No se pudo confirmar la reserva.');
    }
  };

  const handleSubmitRejection = async (bookingId: string) => {
    if (!bookingActionReason.trim()) {
      toast.error('Escribe un motivo para que el cliente lo reciba por correo.');
      return;
    }
    setBookingActionBusy(true);
    const ok = await rejectBooking(bookingId, bookingActionReason);
    setBookingActionBusy(false);
    if (ok) {
      toast.success('Comprobante rechazado. Notificamos al cliente.');
      closeBookingDetails();
    } else {
      toast.error('No se pudo registrar el rechazo.');
    }
  };

  const handleSubmitCancelConfirmed = async (bookingId: string) => {
    setBookingActionBusy(true);
    const ok = await cancelBooking(bookingId, bookingActionReason);
    setBookingActionBusy(false);
    if (ok) {
      toast.success('Reserva cancelada. Notificamos al cliente.');
      closeBookingDetails();
    } else {
      toast.error('No se pudo cancelar la reserva.');
    }
  };

  const handleCreateBlock = async () => {
    const field = fields.find((item) => item.id === blockForm.field_id);
    if (!field) return;

    let unitIds: string[];
    if (blockForm.target === 'all') {
      unitIds = field.units.map((unit) => unit.id);
    } else if (blockForm.target.startsWith('type:')) {
      const wanted = blockForm.target.slice('type:'.length) as FieldType;
      unitIds = field.units.filter((unit) => unit.type === wanted).map((unit) => unit.id);
    } else if (blockForm.target.startsWith('unit:')) {
      const unitId = blockForm.target.slice('unit:'.length);
      unitIds = field.units.some((u) => u.id === unitId) ? [unitId] : [];
    } else {
      unitIds = [];
    }

    if (unitIds.length === 0) {
      toast.error('No hay unidades para bloquear en esta cancha.');
      return;
    }

    if (blockForm.date_end < blockForm.date_start) {
      toast.error('La fecha de fin no puede ser anterior a la fecha de inicio.');
      return;
    }

    const result = await createBlock({
      field_id: blockForm.field_id,
      field_unit_ids: unitIds,
      date: blockForm.date_start,
      date_end: blockForm.date_end,
      start_time: blockForm.start_time,
      end_time: blockForm.end_time,
      type: blockForm.type,
      reason: blockForm.reason || 'Bloqueo administrativo',
    });

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setBlockDialogOpen(false);
    setBlockForm((prev) => ({ ...prev, reason: '' }));
    if (result.daysCreated > 1) {
      toast.success(`Bloqueo creado para ${result.daysCreated} días.`);
    } else {
      toast.success('Bloqueo creado correctamente.');
    }
  };

  const handleCreateClub = async () => {
    if (!user) return;

    const created = await createClub({
      name: clubForm.name,
      location: clubForm.location,
      description: clubForm.description,
      owner_id: user.id,
    });

    if (!created) {
      toast.error('No se pudo crear el club.');
      return;
    }

    setClubDialogOpen(false);
    setClubForm({ name: '', location: '', description: '' });
    toast.success('Club creado correctamente.');
  };

  const handleUpdateClub = async (clubId: string) => {
    const amenities = editClubForm.amenities
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const success = await updateClub({
      id: clubId,
      name: editClubForm.name,
      location: editClubForm.location,
      description: editClubForm.description,
      open_time: editClubForm.open_time,
      close_time: editClubForm.close_time,
      phone: editClubForm.phone || null,
      email: editClubForm.email || null,
      amenities,
    });
    if (success) {
      setEditingClubId(null);
      toast.success('Club actualizado.');
    } else {
      toast.error('Error al actualizar el club.');
    }
  };

  const handleCreateField = async () => {
    const created = await createField({
      club_id: fieldForm.club_id,
      name: fieldForm.name,
      surface: fieldForm.surface,
      layout: fieldForm.layout,
      prices: {
        F5: fieldForm.layout === 'six_5' || fieldForm.layout === 'versatile_full' ? Number(fieldForm.priceF5) : undefined,
        F7: fieldForm.layout === 'three_7' || fieldForm.layout === 'versatile_full' ? Number(fieldForm.priceF7) : undefined,
        F11: fieldForm.layout === 'full_11' || fieldForm.layout === 'versatile_full' ? Number(fieldForm.priceF11) : undefined,
      },
    });

    if (!created) {
      toast.error('No se pudo crear el campo.');
      return;
    }

    setFieldDialogOpen(false);
    setFieldForm({
      club_id: clubs[0]?.id ?? '',
      name: '',
      surface: 'Gramilla sintética',
      layout: 'versatile_full',
      priceF5: '3000',
      priceF7: '6000',
      priceF11: '18000',
    });
    toast.success('Campo creado correctamente.');
  };

  const handleUpdateField = async (fieldId: string) => {
    const success = await updateField({
      id: fieldId,
      name: editFieldForm.name,
      surface: editFieldForm.surface,
    });
    if (success) {
      setEditingFieldId(null);
      toast.success('Campo actualizado.');
    } else {
      toast.error('Error al actualizar el campo.');
    }
  };

  const confirmDeleteField = async () => {
    if (!deleteFieldTarget) return;
    setDeleteFieldBusy(true);
    const result = await deleteField(deleteFieldTarget);
    setDeleteFieldBusy(false);
    if (!result.ok) {
      // Si hay reservas activas a futuro, dejamos el dialog abierto para que el usuario
      // pueda cancelar manualmente; el copy del dialog ya explicará la situación.
      if (result.reason === 'has_future_active_bookings') {
        toast.error(result.message);
      } else {
        toast.error(result.message);
        setDeleteFieldTarget(null);
      }
      return;
    }
    setDeleteFieldTarget(null);
    toast.success(result.message);
  };

  const handleUpdatePricing = async (ruleId: string) => {
    const success = await updatePricingRule({
      id: ruleId,
      price_per_hour: Number(editPricingForm.price_per_hour),
      minimum_minutes: Number(editPricingForm.minimum_minutes),
    });
    if (success) {
      setEditingPricingId(null);
      toast.success('Precio actualizado.');
    } else {
      toast.error('Error al actualizar el precio.');
    }
  };

  const titles: Record<AdminSection, string> = {
    overview: 'Resumen general',
    calendar: 'Calendario operativo',
    bookings: 'Gestión de reservas',
    blocks: 'Bloqueos y mantenimiento',
    reports: 'Reportes',
    clubs: 'Centros deportivos',
    fields: 'Canchas físicas',
    config: 'Configuración de canchas',
    pricing: 'Precios por modalidad',
    team: 'Equipo',
  };

  const sectionDescriptions: Record<AdminSection, string> = {
    overview: 'Toda la administración se maneja desde el panel lateral.',
    calendar: 'Vista semanal de reservas y bloqueos.',
    bookings: 'Administra el estado de las reservas de tus clientes.',
    blocks: 'Bloquea horarios para mantenimiento, prácticas o eventos.',
    reports: 'Métricas de ingresos, ocupación, clientes y operación.',
    clubs: 'Configura la información general de tu centro deportivo.',
    fields: 'Cada cancha física se divide en zonas que permiten jugar F11, F7 o F5. Aquí configuras la estructura.',
    config: 'Visualiza conflictos, activa/desactiva unidades y configura horarios operativos.',
    pricing: 'Define cuánto cobra cada modalidad de juego por hora.',
    team: 'Invita y gestiona empleados con permisos limitados.',
  };

  const getClubPrices = (clubId: string) => {
    const rules = pricingRules.filter((r) => r.club_id === clubId && r.is_active);
    return {
      F5: rules.find((r) => r.field_type === 'F5')?.price_per_hour ?? 0,
      F7: rules.find((r) => r.field_type === 'F7')?.price_per_hour ?? 0,
      F11: rules.find((r) => r.field_type === 'F11')?.price_per_hour ?? 0,
    };
  };

  const renderSection = () => {
    switch (currentSection) {
      case 'overview':
        if (appLoading && bookings.length === 0) {
          return (
            <div className="space-y-8">
              <KpiRowSkeleton count={6} />
              <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-heading text-lg font-bold text-foreground">Últimas reservas</h2>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }
        return (
          <div className="animate-fade-in space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((stat) => {
                const palette = accentClasses[stat.accent];
                const isInteractive = Boolean(stat.path);
                const baseClasses = `relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all ${palette.cardBg} ${palette.cardBorder} ${
                  isInteractive ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50' : ''
                } ${stat.highlight ? 'ring-2 ring-amber-400 animate-pulse' : ''}`;

                const innerContent = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`text-xs font-medium uppercase tracking-wide ${palette.label}`}>
                          {stat.label}
                        </span>
                        <p className={`mt-2 font-heading text-2xl font-bold ${palette.value}`}>
                          {stat.value}
                        </p>
                      </div>
                      <span
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-sm ${palette.iconBg} ${palette.iconText}`}
                      >
                        <stat.icon className="h-5 w-5" />
                      </span>
                    </div>
                    {stat.highlight && (
                      <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                        <BellRing className="h-3 w-3" />
                        Requiere atención
                      </p>
                    )}
                    {isInteractive && (
                      <span className={`mt-3 inline-flex items-center gap-1 text-[11px] font-medium ${palette.label}`}>
                        Ver detalle →
                      </span>
                    )}
                  </>
                );

                if (isInteractive) {
                  return (
                    <button
                      key={stat.label}
                      type="button"
                      onClick={() => stat.path && navigate(stat.path)}
                      className={`${baseClasses} text-left`}
                    >
                      {innerContent}
                    </button>
                  );
                }

                return (
                  <div key={stat.label} className={baseClasses}>
                    {innerContent}
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-heading text-lg font-bold text-foreground">Últimas reservas</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Fecha</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Hora</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Tipo</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Estado</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestBookings.slice(0, 6).map((booking) => {
                      const tone = getStatusTone(booking.status);
                      return (
                        <tr key={booking.id} className="border-t border-border">
                          <td className="px-4 py-3 text-foreground">{formatBookingDate(booking.date)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{booking.start_time} – {booking.end_time}</td>
                          <td className="px-4 py-3">{booking.field_type}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone.bg} ${tone.text}`}>
                              {formatBookingStatus(booking.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{formatCurrency(booking.total_price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'calendar':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-1.5 sm:gap-3 px-1">
              <Button variant="outline" size="sm" className="h-9 w-9 sm:h-12 sm:w-12 shrink-0 rounded-lg sm:rounded-2xl" onClick={() => {
                const date = new Date(calendarDateObj);
                date.setDate(date.getDate() - 7);
                setCalendarDate(date.toISOString().split('T')[0]);
              }}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-0 flex-1 text-center font-heading text-[11px] sm:text-sm font-bold leading-tight text-foreground">
                <span className="block sm:hidden">
                  {new Date(`${weekDates[0]}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                  {' - '}
                  {new Date(`${weekDates[6]}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                </span>
                <span className="hidden sm:block">Semana del {weekDates[0]}</span>
              </span>
              <Button variant="outline" size="sm" className="h-9 w-9 sm:h-12 sm:w-12 shrink-0 rounded-lg sm:rounded-2xl" onClick={() => {
                const date = new Date(calendarDateObj);
                date.setDate(date.getDate() + 7);
                setCalendarDate(date.toISOString().split('T')[0]);
              }}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-3 md:hidden">
              <div className="flex gap-1 sm:gap-4 overflow-x-auto pb-2 pt-2 snap-x snap-mandatory px-1">
                {weekDates.map((date) => {
                  const dateObj = new Date(`${date}T00:00:00`);
                  const isActive = (selectedMobileCalendarDate ?? weekDates[0]) === date;
                  return (
                    <button
                      key={`mobile-chip-${date}`}
                      onClick={() => setSelectedMobileCalendarDate(date)}
                      className={`snap-start min-w-[70px] sm:min-w-[110px] rounded-lg sm:rounded-3xl border px-2 sm:px-5 py-2 sm:py-4 text-center text-xs sm:text-base transition-all shrink-0 ${
                        isActive ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-foreground'
                      }`}
                    >
                      <div className="text-[10px] uppercase opacity-75 leading-tight">{dateObj.toLocaleDateString('es', { weekday: 'short' })}</div>
                      <div className="font-heading text-lg sm:text-2xl font-bold leading-none">{dateObj.getDate()}</div>
                    </button>
                  );
                })}
              </div>

              {weekDates.filter((date) => date === (selectedMobileCalendarDate ?? weekDates[0])).map((date) => {
                const dateObj = new Date(`${date}T00:00:00`);
                const dayEvents = getDayEvents(date);

                return (
                  <div key={date} className="rounded-xl sm:rounded-2xl border border-border bg-card p-3 sm:p-6 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-2 sm:gap-3 sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] sm:text-base uppercase tracking-wide text-muted-foreground leading-tight">
                          {dateObj.toLocaleDateString('es', { weekday: 'long' })}
                        </p>
                        <p className="font-heading text-xl sm:text-3xl font-bold text-foreground leading-tight">{dateObj.toLocaleDateString('es')}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] sm:px-4 sm:py-2 sm:text-base text-foreground whitespace-nowrap flex-shrink-0">{dayEvents.length}</span>
                    </div>

                    {dayEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin reservas ni bloqueos.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {dayEvents.map((event, index) => (
                          <div key={`${date}-${event.time}-${index}`} className="flex items-start gap-1.5 sm:gap-4 rounded-lg sm:rounded-3xl border border-border p-2 sm:p-5">
                            <div className="min-w-[50px] sm:min-w-[84px] rounded-md sm:rounded-2xl bg-muted px-1.5 sm:px-4 py-1 sm:py-3 text-center text-[11px] sm:text-base font-semibold text-foreground shrink-0 leading-tight">
                              {event.time}
                            </div>
                            <div className={`rounded-md sm:rounded-2xl px-2 sm:px-4 py-1 sm:py-3 text-[11px] sm:text-base font-medium break-words ${event.kind === 'booking' ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                              {event.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block">
              <AdminWeekCalendar
                weekDates={weekDates}
                bookings={bookings}
                blocks={blocks}
                fields={fields}
                onBookingClick={(id) => void openBookingDetails(id)}
              />
            </div>
          </div>
        );

      case 'bookings':
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <AdminCreateBookingDialog />
            </div>

            {newPendingBookings.length > 0 && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
                <BellRing className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Hay {newPendingBookings.length} reserva{newPendingBookings.length === 1 ? '' : 's'} nueva{newPendingBookings.length === 1 ? '' : 's'} pendiente{newPendingBookings.length === 1 ? '' : 's'} de revisión.</p>
                  <p className="text-sm text-amber-800">Las reservas nuevas quedan resaltadas hasta que abras su detalle y revises el comprobante.</p>
                </div>
              </div>
            )}
            <Dialog open={Boolean(selectedBookingId)} onOpenChange={(open) => {
              if (!open) {
                closeBookingDetails();
              }
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Detalle de reserva</DialogTitle>
                  <DialogDescription>
                    Información del cliente y de la reserva seleccionada.
                  </DialogDescription>
                </DialogHeader>
                {selectedBooking && (
                  <div className="space-y-4 text-sm">
                    <div className="rounded-2xl bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground">Reservó</p>
                      <p className="mt-1 font-heading text-lg font-bold text-foreground">
                        {bookingOwner ? `${bookingOwner.first_name} ${bookingOwner.last_name}` : 'Cliente no identificado'}
                      </p>
                      <p className="mt-1 text-foreground">{bookingOwner?.email ?? 'Sin correo'}</p>
                      <p className="text-foreground">{bookingOwner?.phone ?? 'Sin teléfono'}</p>
                      <p className="text-muted-foreground">Cédula: {bookingOwner?.national_id || 'No registrada'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Tipo</p><p className="mt-1 font-semibold text-foreground">{selectedBooking.field_type}</p></div>
                      <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Estado</p><p className="mt-1 font-semibold text-foreground">{selectedBooking.status}</p></div>
                      <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Fecha</p><p className="mt-1 font-semibold text-foreground">{selectedBooking.date}</p></div>
                      <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Hora</p><p className="mt-1 font-semibold text-foreground">{selectedBooking.start_time} – {selectedBooking.end_time}</p></div>
                    </div>
                    <div className="rounded-xl bg-accent p-4 text-accent-foreground">
                      <p className="text-xs">Total</p>
                      <p className="mt-1 text-xl font-bold">RD$ {selectedBooking.total_price.toLocaleString()}</p>
                    </div>

                    {selectedBooking.payment_method && (
                      <div className="rounded-xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Método de pago</p>
                        <p className="mt-1 font-semibold text-foreground">Transferencia o depósito bancario</p>
                      </div>
                    )}

                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs text-muted-foreground mb-2">Comprobante de pago</p>
                      {loadingBookingProofUrl ? (
                        <p className="text-sm text-muted-foreground">Cargando comprobante...</p>
                      ) : selectedBookingProofUrl ? (
                        <div className="space-y-2">
                          {selectedBooking.payment_proof_path?.toLowerCase().endsWith('.pdf') ? (
                            <iframe src={selectedBookingProofUrl} title="Comprobante de pago" className="h-72 w-full rounded-lg border border-border bg-muted" />
                          ) : (
                            <img src={selectedBookingProofUrl} alt="Comprobante de pago" className="max-h-72 w-full rounded-lg border border-border object-contain bg-muted" />
                          )}
                          <a href={selectedBookingProofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir en nueva pestaña
                          </a>
                          {selectedBooking.proof_replaced_at && (
                            <p className="text-[11px] text-amber-700">El cliente reemplazó el comprobante el {new Date(selectedBooking.proof_replaced_at).toLocaleString('es-DO')}.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No hay comprobante adjunto.</p>
                      )}
                    </div>

                    {selectedBooking.rejection_reason && selectedBooking.status === 'cancelled' && (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        <p className="font-semibold">Motivo del rechazo</p>
                        <p className="mt-1">{selectedBooking.rejection_reason}</p>
                      </div>
                    )}
                    {selectedBooking.cancellation_reason && selectedBooking.status === 'cancelled' && !selectedBooking.rejection_reason && (
                      <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                        <p className="font-semibold text-foreground">Motivo de cancelación</p>
                        <p className="mt-1">{selectedBooking.cancellation_reason}</p>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2">
                      {selectedBooking.status === 'pending' && bookingActionMode === 'idle' && (
                        <>
                          <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void handleConfirmBooking(selectedBooking.id)} disabled={bookingActionBusy}>
                            {bookingActionBusy ? 'Procesando...' : 'Confirmar pago y reserva'}
                          </Button>
                          <Button className="w-full bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => { setBookingActionMode('reject'); setBookingActionReason(''); }}>
                            Rechazar comprobante
                          </Button>
                        </>
                      )}

                      {selectedBooking.status === 'pending' && bookingActionMode === 'reject' && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                          <p className="text-xs font-semibold text-destructive">Motivo del rechazo (lo verá el cliente por correo)</p>
                          <textarea
                            value={bookingActionReason}
                            onChange={(e) => setBookingActionReason(e.target.value)}
                            rows={3}
                            placeholder="Ej: el comprobante no coincide con el monto o no se ve la transacción."
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
                          />
                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => { setBookingActionMode('idle'); setBookingActionReason(''); }} disabled={bookingActionBusy}>
                              Volver
                            </Button>
                            <Button className="flex-1 bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => void handleSubmitRejection(selectedBooking.id)} disabled={bookingActionBusy}>
                              {bookingActionBusy ? 'Enviando...' : 'Rechazar y notificar'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {selectedBooking.status === 'confirmed' && bookingActionMode === 'idle' && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                          <p className="text-xs text-muted-foreground">Acción restringida</p>
                          <p className="mt-1 text-sm text-foreground">Las reservas confirmadas solo pueden cancelarse explícitamente. Se notificará al cliente.</p>
                          <Button className="mt-3 w-full bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => { setBookingActionMode('cancel-confirmed'); setBookingActionReason(''); }}>
                            Cancelar reserva confirmada
                          </Button>
                        </div>
                      )}

                      {selectedBooking.status === 'confirmed' && bookingActionMode === 'cancel-confirmed' && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                          <p className="text-xs font-semibold text-destructive">Motivo de la cancelación (opcional, se enviará al cliente)</p>
                          <textarea
                            value={bookingActionReason}
                            onChange={(e) => setBookingActionReason(e.target.value)}
                            rows={3}
                            placeholder="Ej: cierre por mantenimiento de emergencia."
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
                          />
                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => { setBookingActionMode('idle'); setBookingActionReason(''); }} disabled={bookingActionBusy}>
                              Volver
                            </Button>
                            <Button className="flex-1 bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => void handleSubmitCancelConfirmed(selectedBooking.id)} disabled={bookingActionBusy}>
                              {bookingActionBusy ? 'Cancelando...' : 'Cancelar y notificar'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <div className="grid gap-3 md:hidden">
              {bookings.map((booking) => {
                const isUnseen = !booking.admin_seen_at && booking.status === 'pending';
                const isConfirmed = booking.status === 'confirmed';
                const statusLabel = booking.status === 'confirmed' ? 'Confirmada' : booking.status === 'cancelled' ? 'Cancelada' : 'Pendiente';
                return (
                  <div key={booking.id} className={`rounded-2xl border p-4 shadow-sm ${isUnseen ? 'border-amber-300 bg-amber-50/50' : 'border-border bg-card'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {isUnseen && <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"><BellRing className="h-3 w-3" /> Nueva</span>}
                        <p className="font-mono text-xs text-muted-foreground">{booking.id.slice(0, 8)}</p>
                        <h3 className="mt-1 font-heading text-lg font-bold text-foreground">{booking.field_type}</h3>
                      </div>
                      <span className={booking.status === 'confirmed'
                        ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'
                        : booking.status === 'cancelled'
                          ? 'rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground'
                          : 'rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground'}>
                        {statusLabel}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Fecha</p>
                        <p className="mt-1 font-medium text-foreground break-words">{booking.date}</p>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Hora</p>
                        <p className="mt-1 font-medium text-foreground">{booking.start_time} – {booking.end_time}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      {!isConfirmed && booking.status !== 'cancelled' && (
                        <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" size="sm" onClick={() => void handleConfirmBooking(booking.id)}>Confirmar</Button>
                      )}
                      <Button className="w-full" size="sm" variant="outline" onClick={() => void openBookingDetails(booking.id)}>Ver y validar</Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden rounded-2xl border border-border bg-card shadow-sm overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">ID</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Fecha</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Hora</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Tipo</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Estado</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => {
                      const isUnseen = !booking.admin_seen_at && booking.status === 'pending';
                      const isConfirmed = booking.status === 'confirmed';
                      const statusLabel = booking.status === 'confirmed' ? 'Confirmada' : booking.status === 'cancelled' ? 'Cancelada' : 'Pendiente';
                      return (
                        <tr key={booking.id} className={`border-t border-border ${isUnseen ? 'bg-amber-50/60' : ''}`}>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {isUnseen && <BellRing className="mr-1 inline h-3 w-3 text-amber-500" />}
                            {booking.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3">{booking.date}</td>
                          <td className="px-4 py-3">{booking.start_time} – {booking.end_time}</td>
                          <td className="px-4 py-3">{booking.field_type}</td>
                          <td className="px-4 py-3">
                            <span className={booking.status === 'confirmed'
                              ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'
                              : booking.status === 'cancelled'
                                ? 'rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground'
                                : 'rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground'}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {!isConfirmed && booking.status !== 'cancelled' && (
                                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void handleConfirmBooking(booking.id)}>Confirmar</Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => void openBookingDetails(booking.id)}>Ver y validar</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'blocks':
        return (
          <div className="space-y-4">
            <Dialog open={blockDialogOpen} onOpenChange={(open) => {
              if (open && !blockForm.field_id && fields.length > 0) {
                setBlockForm((prev) => ({ ...prev, field_id: fields[0].id }));
              }
              setBlockDialogOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Crear bloqueo</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo bloqueo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Cancha</label>
                    <Select value={blockForm.field_id} onValueChange={(value) => setBlockForm((prev) => ({ ...prev, field_id: value, target: 'all' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fields.map((field) => {
                          const club = clubs.find((clubItem) => clubItem.id === field.club_id);
                          return <SelectItem key={field.id} value={field.id}>{club?.name} · {field.name}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Qué bloquear</label>
                    <Select value={blockForm.target} onValueChange={(value) => setBlockForm((prev) => ({ ...prev, target: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toda la cancha (todas las modalidades)</SelectItem>
                        {(() => {
                          const selectedField = fields.find((f) => f.id === blockForm.field_id);
                          if (!selectedField) return null;
                          const hasF11 = selectedField.units.some((u) => u.type === 'F11');
                          const hasF7 = selectedField.units.some((u) => u.type === 'F7');
                          const hasF5 = selectedField.units.some((u) => u.type === 'F5');
                          const sortedUnits = [...selectedField.units].sort((a, b) => {
                            const order: Record<FieldType, number> = { F11: 0, F7: 1, F5: 2 };
                            if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
                            return a.name.localeCompare(b.name);
                          });
                          return (
                            <>
                              {hasF11 && <SelectItem value="type:F11">Todas las modalidades F11</SelectItem>}
                              {hasF7 && <SelectItem value="type:F7">Todas las modalidades F7</SelectItem>}
                              {hasF5 && <SelectItem value="type:F5">Todas las modalidades F5</SelectItem>}
                              <div className="my-1 border-t border-border" aria-hidden />
                              {sortedUnits.map((unit) => (
                                <SelectItem key={unit.id} value={`unit:${unit.id}`}>
                                  {unit.name} · {unit.type} · {unit.slot_ids.join(' + ')}
                                </SelectItem>
                              ))}
                            </>
                          );
                        })()}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Si bloqueas una unidad específica, las modalidades que comparten zonas físicas también se bloquean automáticamente.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Rango de fechas</label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
                        <Input
                          type="date"
                          value={blockForm.date_start}
                          onChange={(event) => {
                            const value = event.target.value;
                            setBlockForm((prev) => ({
                              ...prev,
                              date_start: value,
                              // Si el "hasta" queda antes del nuevo "desde", lo igualamos.
                              date_end: prev.date_end < value ? value : prev.date_end,
                            }));
                          }}
                        />
                      </div>
                      <div>
                        <span className="mb-1 block text-xs text-muted-foreground">Hasta (inclusivo)</span>
                        <Input
                          type="date"
                          min={blockForm.date_start}
                          value={blockForm.date_end}
                          onChange={(event) => setBlockForm((prev) => ({ ...prev, date_end: event.target.value }))}
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Para un solo día deja ambas fechas iguales. La franja horaria se aplica a cada día del rango.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Tipo</label>
                    <Select value={blockForm.type} onValueChange={(value) => setBlockForm((prev) => ({ ...prev, type: value as Block['type'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="practice">Práctica</SelectItem>
                        <SelectItem value="maintenance">Mantenimiento</SelectItem>
                        <SelectItem value="event">Evento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={blockForm.start_time} onValueChange={(value) => setBlockForm((prev) => ({ ...prev, start_time: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.slice(0, -1).map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={blockForm.end_time} onValueChange={(value) => setBlockForm((prev) => ({ ...prev, end_time: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.slice(1).map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Razón del bloqueo" value={blockForm.reason} onChange={(event) => setBlockForm((prev) => ({ ...prev, reason: event.target.value }))} />
                  <Button className="w-full" onClick={handleCreateBlock}>Guardar bloqueo</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="space-y-3">
              {blocks.length === 0 && <p className="text-sm text-muted-foreground">No hay bloqueos activos.</p>}
              {(() => {
                // Agrupar bloqueos: los que comparten batch_id se muestran como una sola tarjeta de rango.
                type Group = {
                  representativeId: string;
                  field_id: string;
                  start_time: string;
                  end_time: string;
                  type: Block['type'];
                  reason: string;
                  unitsAffected: number;
                  dates: string[];
                  batchId: string | null;
                };
                const grouped = new Map<string, Group>();
                blocks.forEach((block) => {
                  const key = block.batch_id ?? `single-${block.id}`;
                  const existing = grouped.get(key);
                  if (existing) {
                    existing.dates.push(block.date);
                  } else {
                    grouped.set(key, {
                      representativeId: block.id,
                      field_id: block.field_id,
                      start_time: block.start_time,
                      end_time: block.end_time,
                      type: block.type,
                      reason: block.reason,
                      unitsAffected: block.field_unit_ids.length,
                      dates: [block.date],
                      batchId: block.batch_id ?? null,
                    });
                  }
                });
                const groups = Array.from(grouped.values()).sort((a, b) => {
                  const aStart = a.dates.slice().sort()[0];
                  const bStart = b.dates.slice().sort()[0];
                  return aStart.localeCompare(bStart);
                });

                return groups.map((group) => {
                  const blockField = fields.find((f) => f.id === group.field_id);
                  const blockClub = clubs.find((c) => c.id === blockField?.club_id);
                  const sortedDates = group.dates.slice().sort();
                  const firstDate = sortedDates[0];
                  const lastDate = sortedDates[sortedDates.length - 1];
                  const isRange = sortedDates.length > 1;

                  return (
                    <div key={group.representativeId} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-heading text-sm font-bold text-card-foreground">{group.reason}</h3>
                            {isRange && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                {sortedDates.length} días
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{blockClub?.name} · {blockField?.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {isRange
                              ? `${formatBookingDate(firstDate)} → ${formatBookingDate(lastDate)}`
                              : formatBookingDate(firstDate)}
                            {' · '}
                            {group.start_time} – {group.end_time}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Unidades afectadas: {group.unitsAffected}
                            {isRange ? ' · una entrada por cada día del rango' : ''}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className="rounded-full bg-zinc-700 px-2 py-1 text-[10px] font-bold uppercase text-white">
                            {formatBlockType(group.type)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteBlockTarget(group.representativeId)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        );

      case 'clubs':
        return (
          <div className="space-y-4">
            <Dialog open={clubDialogOpen} onOpenChange={setClubDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Nuevo club</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear club</DialogTitle>
                  <DialogDescription>Al crear un club se generan automáticamente precios por defecto para F5, F7 y F11.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Input placeholder="Nombre del club" value={clubForm.name} onChange={(event) => setClubForm((prev) => ({ ...prev, name: event.target.value }))} />
                  <Input placeholder="Ubicación" value={clubForm.location} onChange={(event) => setClubForm((prev) => ({ ...prev, location: event.target.value }))} />
                  <Input placeholder="Descripción" value={clubForm.description} onChange={(event) => setClubForm((prev) => ({ ...prev, description: event.target.value }))} />
                  <Button className="w-full" onClick={handleCreateClub}>Guardar club</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid gap-4 md:grid-cols-2">
              {clubs.map((club) => {
                const prices = getClubPrices(club.id);
                const isEditing = editingClubId === club.id;

                return (
                  <div key={club.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    {isEditing ? (
                      <div className="space-y-3">
                        <Input value={editClubForm.name} onChange={(e) => setEditClubForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre" />
                        <Input value={editClubForm.location} onChange={(e) => setEditClubForm((p) => ({ ...p, location: e.target.value }))} placeholder="Ubicación" />
                        <Input value={editClubForm.description} onChange={(e) => setEditClubForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripción" />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Apertura</label>
                            <Input type="time" value={editClubForm.open_time} onChange={(e) => setEditClubForm((p) => ({ ...p, open_time: e.target.value }))} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Cierre</label>
                            <Input type="time" value={editClubForm.close_time} onChange={(e) => setEditClubForm((p) => ({ ...p, close_time: e.target.value }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Teléfono</label>
                            <Input value={editClubForm.phone} onChange={(e) => setEditClubForm((p) => ({ ...p, phone: e.target.value }))} placeholder="809-555-0000" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Email de contacto</label>
                            <Input type="email" value={editClubForm.email} onChange={(e) => setEditClubForm((p) => ({ ...p, email: e.target.value }))} placeholder="info@club.com" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Amenidades (separadas por coma)</label>
                          <Input value={editClubForm.amenities} onChange={(e) => setEditClubForm((p) => ({ ...p, amenities: e.target.value }))} placeholder="Estacionamiento, Vestidores, Cafetería" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void handleUpdateClub(club.id)}><Save className="mr-1 h-3 w-3" />Guardar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingClubId(null)}><X className="mr-1 h-3 w-3" />Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-heading text-lg font-bold text-card-foreground">{club.name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{club.location}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditingClubId(club.id);
                            setEditClubForm({
                              name: club.name,
                              location: club.location,
                              description: club.description,
                              open_time: club.open_time,
                              close_time: club.close_time,
                              phone: club.phone ?? '',
                              email: club.email ?? '',
                              amenities: (club.amenities ?? []).join(', '),
                            });
                          }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">{club.description}</p>

                        {(club.phone || club.email || (club.amenities && club.amenities.length > 0)) && (
                          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            {club.phone && <p>Tel: <span className="text-foreground">{club.phone}</span></p>}
                            {club.email && <p>Email: <span className="text-foreground">{club.email}</span></p>}
                            {club.amenities && club.amenities.length > 0 && (
                              <p>Amenidades: <span className="text-foreground">{club.amenities.join(' · ')}</span></p>
                            )}
                          </div>
                        )}

                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">F5</span>
                            <span className="font-semibold text-foreground">RD$ {prices.F5.toLocaleString()} / hora</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">F7</span>
                            <span className="font-semibold text-foreground">RD$ {prices.F7.toLocaleString()} / hora</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">F11</span>
                            <span className="font-semibold text-foreground">RD$ {prices.F11.toLocaleString()} / hora</span>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{club.open_time} - {club.close_time}</span>
                          <span className={club.is_active ? 'text-emerald-600' : 'text-destructive'}>
                            {club.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>

                        <div className="mt-5 border-t border-border pt-4">
                          <ClubGalleryManager clubId={club.id} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'fields':
        return (
          <div className="space-y-6">
            {/* How it works explainer */}
            <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                <div className="text-sm text-sky-900">
                  <p className="font-semibold">¿Cómo funciona?</p>
                  <p className="mt-1 leading-relaxed text-sky-700">
                    Cada <strong>cancha física</strong> tiene 6 zonas. Según la configuración que elijas,
                    los clientes podrán reservar la cancha completa (F11), dividida en 3 espacios de Fútbol 7,
                    o en 6 mini canchas de Fútbol 5. Con la opción <em>Versátil</em> se ofrecen todas las modalidades
                    y el sistema evita conflictos automáticamente.
                  </p>
                </div>
              </div>
            </div>

            <Dialog open={fieldDialogOpen} onOpenChange={(open) => {
              if (open && !fieldForm.club_id && clubs.length > 0) {
                setFieldForm((prev) => ({ ...prev, club_id: clubs[0].id }));
              }
              setFieldDialogOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Nueva cancha física</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Agregar cancha física</DialogTitle>
                  <DialogDescription>
                    Define el nombre, superficie y cómo se dividirá para los jugadores.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                  {/* Step 1: Basic info */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">1. Información básica</p>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Centro deportivo</label>
                      <Select value={fieldForm.club_id} onValueChange={(value) => setFieldForm((prev) => ({ ...prev, club_id: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {clubs.map((club) => <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="Nombre de la cancha (ej: Cancha Principal)" value={fieldForm.name} onChange={(event) => setFieldForm((prev) => ({ ...prev, name: event.target.value }))} />
                    <Input placeholder="Superficie (ej: Gramilla sintética)" value={fieldForm.surface} onChange={(event) => setFieldForm((prev) => ({ ...prev, surface: event.target.value }))} />
                  </div>

                  {/* Step 2: Layout configuration */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">2. Configuración de modalidades</p>
                    <div>
                      <label className="mb-1 block text-sm font-medium">¿Cómo quieres dividir la cancha?</label>
                      <Select value={fieldForm.layout} onValueChange={(value) => setFieldForm((prev) => ({ ...prev, layout: value as keyof typeof layoutLabels }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(layoutLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1.5 text-xs text-muted-foreground">{layoutDescriptions[fieldForm.layout]}</p>
                    </div>

                    {/* Live layout preview */}
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Vista previa de la cancha
                      </p>
                      <CourtLayoutPreview layout={fieldForm.layout} compact={false} />
                    </div>
                  </div>

                  {/* Step 3: Pricing */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">3. Precios por hora (RD$)</p>
                    <p className="text-xs text-muted-foreground">Solo se muestran las modalidades disponibles según tu configuración.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(fieldForm.layout === 'six_5' || fieldForm.layout === 'versatile_full') && (
                        <div className="space-y-1">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                            Fútbol 5
                          </label>
                          <Input type="number" placeholder="3000" value={fieldForm.priceF5} onChange={(e) => setFieldForm(p => ({ ...p, priceF5: e.target.value }))} />
                        </div>
                      )}
                      {(fieldForm.layout === 'three_7' || fieldForm.layout === 'versatile_full') && (
                        <div className="space-y-1">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" />
                            Fútbol 7
                          </label>
                          <Input type="number" placeholder="6000" value={fieldForm.priceF7} onChange={(e) => setFieldForm(p => ({ ...p, priceF7: e.target.value }))} />
                        </div>
                      )}
                      {(fieldForm.layout === 'full_11' || fieldForm.layout === 'versatile_full') && (
                        <div className="space-y-1">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-400" />
                            Fútbol 11
                          </label>
                          <Input type="number" placeholder="18000" value={fieldForm.priceF11} onChange={(e) => setFieldForm(p => ({ ...p, priceF11: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  </div>

                  <Button className="w-full" onClick={handleCreateField}>Guardar cancha</Button>
                </div>
              </DialogContent>
            </Dialog>

            {fields.map((field) => {
              const club = clubs.find((clubItem) => clubItem.id === field.club_id);
              const f11 = field.units.filter((unit) => unit.type === 'F11');
              const f7 = field.units.filter((unit) => unit.type === 'F7');
              const f5 = field.units.filter((unit) => unit.type === 'F5');
              const isEditing = editingFieldId === field.id;
              const clubPrices = getClubPrices(field.club_id);

              // Detect the layout from unit composition
              const detectedLayout: 'full_11' | 'three_7' | 'six_5' | 'versatile_full' =
                f11.length > 0 && f7.length > 0 && f5.length > 0
                  ? 'versatile_full'
                  : f11.length > 0
                    ? 'full_11'
                    : f7.length > 0
                      ? 'three_7'
                      : 'six_5';

              return (
                <div key={field.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                  {/* Header */}
                  <div className="border-b border-border p-5">
                    {isEditing ? (
                      <div className="space-y-3">
                        <Input value={editFieldForm.name} onChange={(e) => setEditFieldForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre de la cancha" />
                        <Input value={editFieldForm.surface} onChange={(e) => setEditFieldForm((p) => ({ ...p, surface: e.target.value }))} placeholder="Superficie" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void handleUpdateField(field.id)}><Save className="mr-1 h-3 w-3" />Guardar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingFieldId(null)}><X className="mr-1 h-3 w-3" />Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <LayoutGrid className="h-4 w-4 text-primary" />
                            <h3 className="font-heading text-lg font-bold text-card-foreground">{field.name}</h3>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{club?.name} · {field.surface ?? 'Sin superficie definida'}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${field.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>
                            {field.is_active !== false ? 'Activa' : 'Inactiva'}
                          </span>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditingFieldId(field.id);
                            setEditFieldForm({ name: field.name, surface: field.surface ?? '' });
                          }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteFieldTarget(field.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="grid gap-0 lg:grid-cols-2">
                      {/* Left: Layout visual */}
                      <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Distribución de zonas</p>
                        <CourtLayoutPreview layout={detectedLayout} units={field.units} compact={false} />
                      </div>

                      {/* Right: Stats + Pricing */}
                      <div className="p-5 space-y-4">
                        {/* Modality counts */}
                        <div>
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Modalidades disponibles</p>
                          <div className="grid grid-cols-3 gap-2">
                            {f11.length > 0 && (
                              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
                                <p className="text-[10px] font-bold uppercase text-violet-500">Fútbol 11</p>
                                <p className="mt-1 font-heading text-2xl font-bold text-violet-700">{f11.length}</p>
                                {clubPrices.F11 > 0 && <p className="mt-0.5 text-[10px] text-violet-500">RD$ {clubPrices.F11.toLocaleString()}/h</p>}
                              </div>
                            )}
                            {f7.length > 0 && (
                              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-center">
                                <p className="text-[10px] font-bold uppercase text-sky-500">Fútbol 7</p>
                                <p className="mt-1 font-heading text-2xl font-bold text-sky-700">{f7.length}</p>
                                {clubPrices.F7 > 0 && <p className="mt-0.5 text-[10px] text-sky-500">RD$ {clubPrices.F7.toLocaleString()}/h</p>}
                              </div>
                            )}
                            {f5.length > 0 && (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                                <p className="text-[10px] font-bold uppercase text-amber-500">Fútbol 5</p>
                                <p className="mt-1 font-heading text-2xl font-bold text-amber-700">{f5.length}</p>
                                {clubPrices.F5 > 0 && <p className="mt-0.5 text-[10px] text-amber-500">RD$ {clubPrices.F5.toLocaleString()}/h</p>}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Unit badges */}
                        <div>
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            Unidades reservables ({field.units.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {field.units.map((unit) => (
                              <span
                                key={unit.id}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  unit.type === 'F11'
                                    ? 'bg-violet-100 text-violet-700 border border-violet-200'
                                    : unit.type === 'F7'
                                      ? 'bg-sky-100 text-sky-700 border border-sky-200'
                                      : 'bg-amber-100 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {unit.name} · {unit.slot_ids.join('+')}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Configuration label */}
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">
                            <strong className="text-foreground">Configuración:</strong>{' '}
                            {layoutLabels[detectedLayout]}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      case 'config':
        return (
          <div className="space-y-8">
            {/* Venue schedule editor for each club */}
            {clubs.map((club) => {
              const venueConfig = getVenueConfig(club.id);
              const clubFields = fields.filter((f) => f.club_id === club.id && f.is_active !== false);

              return (
                <div key={club.id} className="space-y-6">
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <Settings className="h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-heading text-lg font-bold text-foreground">{club.name}</h3>
                        <p className="text-xs text-muted-foreground">{club.location}</p>
                      </div>
                    </div>

                    <VenueScheduleEditor
                      schedule={venueConfig.weekSchedule}
                      onChange={(schedule) => updateVenueConfig({ ...venueConfig, weekSchedule: schedule })}
                    />

                    <div className="mt-4 flex items-center gap-3">
                      <label className="text-sm font-medium text-foreground">Duración de slots:</label>
                      <Select
                        value={String(venueConfig.slotDurationMinutes)}
                        onValueChange={(v) => updateVenueConfig({ ...venueConfig, slotDurationMinutes: Number(v) as 30 | 60 })}
                      >
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 minutos</SelectItem>
                          <SelectItem value="60">60 minutos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-6 border-t border-border pt-4">
                      <ClosedDatesEditor
                        closedDates={venueConfig.closedDates ?? []}
                        onChange={(dates) => {
                          void updateVenueConfig({ ...venueConfig, closedDates: dates }).then((ok) => {
                            if (ok) toast.success('Días cerrados actualizados.');
                            else toast.error('No se pudo guardar.');
                          });
                        }}
                      />
                    </div>
                  </div>

                  {/* Field config panels */}
                  {clubFields.map((field) => (
                    <div key={field.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                      <h4 className="font-heading text-base font-bold text-foreground mb-4">
                        {field.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{field.surface}</span>
                      </h4>
                      <FieldConfigPanel
                        field={field}
                        onToggleUnit={(unitId, active) => {
                          void toggleFieldUnit(unitId, active).then((ok) => {
                            if (ok) toast.success('Unidad actualizada.');
                            else toast.error('Error al actualizar unidad.');
                          });
                        }}
                      />
                    </div>
                  ))}

                  {clubFields.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Este club no tiene canchas configuradas. Ve a la sección "Canchas físicas" para crear una.
                    </p>
                  )}
                </div>
              );
            })}

            {clubs.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay clubes creados aún.</p>
            )}
          </div>
        );

      case 'pricing':
        return (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Configura el precio por hora, duración mínima e incremento para cada tipo de cancha por club.
            </p>

            {clubs.map((club) => {
              const clubRules = pricingRules.filter((r) => r.club_id === club.id);
              if (clubRules.length === 0) return null;

              return (
                <div key={club.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="font-heading text-lg font-bold text-card-foreground mb-4">{club.name}</h3>

                  <div className="grid gap-3 md:grid-cols-3">
                    {(['F5', 'F7', 'F11'] as FieldType[]).map((fieldType) => {
                      const rule = clubRules.find((r) => r.field_type === fieldType);
                      if (!rule) return null;

                      const isEditing = editingPricingId === rule.id;

                      return (
                        <div key={rule.id} className="rounded-xl border border-border p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                              fieldType === 'F11' ? 'field-badge-11' : fieldType === 'F7' ? 'field-badge-7' : 'field-badge-5'
                            }`}>
                              {fieldType}
                            </span>
                            {!isEditing && (
                              <Button variant="ghost" size="sm" onClick={() => {
                                setEditingPricingId(rule.id);
                                setEditPricingForm({
                                  price_per_hour: String(rule.price_per_hour),
                                  minimum_minutes: String(rule.minimum_minutes),
                                });
                              }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-muted-foreground">Precio / hora (RD$)</label>
                                <Input
                                  type="number"
                                  value={editPricingForm.price_per_hour}
                                  onChange={(e) => setEditPricingForm((p) => ({ ...p, price_per_hour: e.target.value }))}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Mínimo (minutos)</label>
                                <Select value={editPricingForm.minimum_minutes} onValueChange={(v) => setEditPricingForm((p) => ({ ...p, minimum_minutes: v }))}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="30">30 min</SelectItem>
                                    <SelectItem value="60">60 min</SelectItem>
                                    <SelectItem value="90">90 min</SelectItem>
                                    <SelectItem value="120">120 min</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <Button size="sm" onClick={() => void handleUpdatePricing(rule.id)}><Save className="mr-1 h-3 w-3" />Guardar</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingPricingId(null)}><X className="mr-1 h-3 w-3" />Cancelar</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Precio/hora</span>
                                <span className="font-semibold text-foreground">RD$ {rule.price_per_hour.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Mínimo</span>
                                <span className="font-medium text-foreground">{rule.minimum_minutes} min</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Incremento</span>
                                <span className="font-medium text-foreground">{rule.increment_minutes} min</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Estado</span>
                                <span className={rule.is_active ? 'text-emerald-600 font-medium' : 'text-destructive font-medium'}>
                                  {rule.is_active ? 'Activo' : 'Inactivo'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'team':
        if (!canManageTeam) {
          return (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Solo el dueño del club puede gestionar el equipo.
            </div>
          );
        }
        return <TeamPanel />;

      case 'reports':
        return <ReportsSection />;
    }
  };

  const fieldToDelete = fields.find((f) => f.id === deleteFieldTarget) ?? null;
  const fieldUnitIdsToDelete = fieldToDelete?.units.map((u) => u.id) ?? [];
  const today = new Date().toISOString().split('T')[0];
  const futureActiveBookings = fieldToDelete
    ? bookings.filter(
        (b) =>
          fieldUnitIdsToDelete.includes(b.field_unit_id) &&
          (b.status === 'pending' || b.status === 'confirmed') &&
          b.date >= today,
      )
    : [];
  const cleanableBookings = fieldToDelete
    ? bookings.filter(
        (b) =>
          fieldUnitIdsToDelete.includes(b.field_unit_id) &&
          !(b.status !== 'cancelled' && b.date >= today),
      )
    : [];
  const hasFutureActiveBookings = futureActiveBookings.length > 0;

  const blockToDelete = blocks.find((b) => b.id === deleteBlockTarget) ?? null;
  const blockBatchSiblings = blockToDelete?.batch_id
    ? blocks.filter((b) => b.batch_id === blockToDelete.batch_id)
    : blockToDelete
      ? [blockToDelete]
      : [];
  const blockToDeleteIsRange = blockBatchSiblings.length > 1;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 px-1 sm:px-0">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-3xl">{titles[currentSection]}</h1>
        <p className="mt-2 text-base text-muted-foreground sm:text-sm">{sectionDescriptions[currentSection]}</p>
      </div>

      {renderSection()}

      <AlertDialog open={!!deleteBlockTarget} onOpenChange={(open) => !open && setDeleteBlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blockToDeleteIsRange ? `¿Eliminar el rango de ${blockBatchSiblings.length} bloqueos?` : '¿Eliminar este bloqueo?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blockToDeleteIsRange
                ? `Se eliminarán los ${blockBatchSiblings.length} bloqueos creados como un solo rango. Las reservas no se ven afectadas.`
                : 'El bloqueo se elimina y los horarios quedan disponibles otra vez. Las reservas no se ven afectadas.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteBlockTarget) return;
                await deleteBlock(deleteBlockTarget);
                setDeleteBlockTarget(null);
                toast.success(blockToDeleteIsRange ? 'Rango de bloqueos eliminado.' : 'Bloqueo eliminado.');
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {blockToDeleteIsRange ? 'Eliminar rango' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFieldTarget} onOpenChange={(open) => !open && setDeleteFieldTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la cancha "{fieldToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {hasFutureActiveBookings ? (
                  <p>
                    Esta cancha tiene <strong className="text-destructive">{futureActiveBookings.length}</strong>{' '}
                    {futureActiveBookings.length === 1 ? 'reserva activa' : 'reservas activas'} a futuro
                    (pendiente{futureActiveBookings.length === 1 ? '' : 's'} o confirmada{futureActiveBookings.length === 1 ? '' : 's'}).
                    Cancélala{futureActiveBookings.length === 1 ? '' : 's'} desde "Reservas" antes de eliminar la cancha.
                  </p>
                ) : (
                  <>
                    <p>
                      La cancha y todas sus modalidades (F11, F7, F5) se eliminarán de forma permanente.
                      Esta acción no se puede deshacer.
                    </p>
                    {cleanableBookings.length > 0 && (
                      <p>
                        También se eliminarán <strong>{cleanableBookings.length}</strong> reserva{cleanableBookings.length === 1 ? '' : 's'} histórica{cleanableBookings.length === 1 ? '' : 's'} (canceladas o pasadas) asociadas a esta cancha.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFieldBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDeleteField()}
              disabled={deleteFieldBusy || hasFutureActiveBookings}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteFieldBusy ? 'Procesando...' : 'Eliminar permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
