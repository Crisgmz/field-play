import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BellRing,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Edit2,
  ExternalLink,
  HelpCircle,
  Info,
  LayoutGrid,
  Map,
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Block, FieldType } from '@/types';
import { TIME_SLOTS } from '@/data/mockData';
import { timeOverlaps } from '@/lib/availability';
import CourtLayoutPreview from '@/components/CourtLayoutPreview';
import FieldConfigPanel from '@/components/FieldConfigPanel';
import VenueScheduleEditor from '@/components/VenueScheduleEditor';
import { Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const adminSections = ['overview', 'calendar', 'bookings', 'blocks', 'clubs', 'fields', 'config', 'pricing'] as const;
type AdminSection = (typeof adminSections)[number];

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
  const { user } = useAuth();
  const {
    clubs,
    fields,
    bookings,
    blocks,
    pricingRules,
    createBlock,
    deleteBlock,
    updateBookingStatus,
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
  } = useAppData();

  const currentSection: AdminSection = adminSections.includes((section as AdminSection) || 'overview')
    ? ((section as AdminSection) || 'overview')
    : 'overview';

  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMobileCalendarDate, setSelectedMobileCalendarDate] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [clubDialogOpen, setClubDialogOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedBookingProofUrl, setSelectedBookingProofUrl] = useState<string | null>(null);
  const [loadingBookingProofUrl, setLoadingBookingProofUrl] = useState(false);

  // Edit states
  const [editingClubId, setEditingClubId] = useState<string | null>(null);
  const [editClubForm, setEditClubForm] = useState({ name: '', location: '', description: '', open_time: '', close_time: '' });
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldForm, setEditFieldForm] = useState({ name: '', surface: '' });
  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [editPricingForm, setEditPricingForm] = useState({ price_per_hour: '', minimum_minutes: '' });

  const [blockForm, setBlockForm] = useState({
    field_id: '',
    unit_type: 'all' as FieldType | 'all',
    date: new Date().toISOString().split('T')[0],
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

  const stats = [
    { label: 'Reservas confirmadas', value: bookings.filter((b) => b.status === 'confirmed').length, icon: Calendar },
    { label: 'Pendientes nuevas', value: unseenCount, icon: BellRing, highlight: unseenCount > 0 },
    { label: 'Bloqueos activos', value: blocks.length, icon: Shield },
    { label: 'Clubes', value: clubs.length, icon: Building2 },
    { label: 'Ingresos estimados', value: `RD$ ${totalRevenue.toLocaleString()}`, icon: DollarSign },
    { label: 'Usuarios activos', value: activeUsers, icon: Users },
  ];

  const calendarDateObj = new Date(`${calendarDate}T00:00:00`);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(calendarDateObj);
    date.setDate(date.getDate() - date.getDay() + i);
    return date.toISOString().split('T')[0];
  });

  const displayHours = TIME_SLOTS.slice(0, -1);

  const getEventsForCell = (date: string, time: string) => {
    const timeIdx = TIME_SLOTS.indexOf(time);
    const nextTime = TIME_SLOTS[timeIdx + 1] || '23:59';
    const cellBookings = bookings.filter((booking) => booking.date === date && booking.status === 'confirmed' && timeOverlaps(time, nextTime, booking.start_time, booking.end_time));
    const cellBlocks = blocks.filter((block) => block.date === date && timeOverlaps(time, nextTime, block.start_time, block.end_time));
    return { cellBookings, cellBlocks };
  };

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
    if (booking && !booking.admin_seen_at) {
      await markBookingSeen(bookingId);
    }
  };

  const handleCancelFromDetails = async (bookingId: string) => {
    const confirmed = window.confirm('Esta acción cancelará la reserva confirmada. ¿Deseas continuar?');
    if (!confirmed) return;

    await updateBookingStatus(bookingId, 'cancelled');
    setSelectedBookingId(null);
    toast.success('Reserva cancelada correctamente.');
  };

  const handleCreateBlock = async () => {
    const field = fields.find((item) => item.id === blockForm.field_id);
    if (!field) return;

    let unitIds: string[];
    if (blockForm.unit_type === 'all') {
      // Bloquear TODAS las unidades del campo
      unitIds = field.units.map((unit) => unit.id);
    } else {
      unitIds = field.units.filter((unit) => unit.type === blockForm.unit_type).map((unit) => unit.id);
    }

    if (unitIds.length === 0) {
      toast.error('No hay unidades para bloquear en este campo.');
      return;
    }

    const created = await createBlock({
      field_id: blockForm.field_id,
      field_unit_ids: unitIds,
      date: blockForm.date,
      start_time: blockForm.start_time,
      end_time: blockForm.end_time,
      type: blockForm.type,
      reason: blockForm.reason || 'Bloqueo administrativo',
    });

    if (!created) {
      toast.error('No se pudo crear el bloqueo.');
      return;
    }

    setBlockDialogOpen(false);
    setBlockForm((prev) => ({ ...prev, reason: '' }));
    toast.success('Bloqueo creado correctamente.');
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
    const success = await updateClub({
      id: clubId,
      name: editClubForm.name,
      location: editClubForm.location,
      description: editClubForm.description,
      open_time: editClubForm.open_time,
      close_time: editClubForm.close_time,
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

  const handleDeleteField = async (fieldId: string) => {
    const success = await deleteField(fieldId);
    if (success) {
      toast.success('Campo desactivado.');
    } else {
      toast.error('Error al desactivar el campo.');
    }
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
    clubs: 'Centros deportivos',
    fields: 'Canchas físicas',
    config: 'Configuración de canchas',
    pricing: 'Precios por modalidad',
  };

  const sectionDescriptions: Record<AdminSection, string> = {
    overview: 'Toda la administración se maneja desde el panel lateral.',
    calendar: 'Vista semanal de reservas y bloqueos.',
    bookings: 'Administra el estado de las reservas de tus clientes.',
    blocks: 'Bloquea horarios para mantenimiento, prácticas o eventos.',
    clubs: 'Configura la información general de tu centro deportivo.',
    fields: 'Cada cancha física se divide en zonas que permiten jugar F11, F7 o F5. Aquí configuras la estructura.',
    config: 'Visualiza conflictos, activa/desactiva unidades y configura horarios operativos.',
    pricing: 'Define cuánto cobra cada modalidad de juego por hora.',
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
        return (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className={`rounded-2xl border p-5 shadow-sm ${
                  stat.highlight ? 'border-amber-300 bg-amber-50 animate-pulse' : 'border-border bg-card'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${stat.highlight ? 'text-amber-700' : 'text-muted-foreground'}`}>{stat.label}</span>
                    <stat.icon className={`h-4 w-4 ${stat.highlight ? 'text-amber-600' : 'text-primary'}`} />
                  </div>
                  <p className={`mt-2 font-heading text-2xl font-bold ${stat.highlight ? 'text-amber-800' : 'text-card-foreground'}`}>{stat.value}</p>
                </div>
              ))}
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
                    {latestBookings.slice(0, 6).map((booking) => (
                      <tr key={booking.id} className="border-t border-border">
                        <td className="px-4 py-3">{booking.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{booking.start_time} – {booking.end_time}</td>
                        <td className="px-4 py-3">{booking.field_type}</td>
                        <td className="px-4 py-3">{booking.status}</td>
                        <td className="px-4 py-3">RD$ {booking.total_price.toLocaleString()}</td>
                      </tr>
                    ))}
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

            <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-muted-foreground">Hora</th>
                    {weekDates.map((date) => {
                      const dateObj = new Date(`${date}T00:00:00`);
                      return (
                        <th key={date} className="min-w-[110px] px-2 py-2 text-center text-muted-foreground">
                          <div>{dateObj.toLocaleDateString('es', { weekday: 'short' })}</div>
                          <div className="font-heading text-sm text-foreground">{dateObj.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayHours.map((time) => (
                    <tr key={time} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-muted-foreground">{time}</td>
                      {weekDates.map((date) => {
                        const { cellBookings, cellBlocks } = getEventsForCell(date, time);
                        const isOccupied = cellBookings.length > 0 || cellBlocks.length > 0;
                        return (
                          <td key={`${date}-${time}`} className={`min-w-[120px] border-r border-border p-1 align-top transition-colors ${isOccupied ? 'bg-muted/10' : 'hover:bg-muted/30'}`}>
                            {cellBookings.map((booking) => {
                              const timeIdx = TIME_SLOTS.indexOf(time);
                              const nextTime = TIME_SLOTS[timeIdx + 1] || '23:59';
                              const isStart = booking.start_time === time;
                              const isEnd = booking.end_time === nextTime;
                              const field = fields.find((f) => f.units.some((u) => u.id === booking.field_unit_id));
                              const unit = field?.units.find((u) => u.id === booking.field_unit_id);
                              
                              return (
                                <div 
                                  key={booking.id} 
                                  className={`overflow-hidden transition-all shadow-sm bg-primary ${
                                    isStart ? 'rounded-t-md p-1.5' : 'bg-opacity-60 border-l-4 border-primary p-0.5'
                                  } ${isEnd ? 'rounded-b-md mb-2' : 'mb-0'} ${
                                    isStart ? 'text-primary-foreground' : 'text-primary-foreground/80'
                                  }`}
                                  title={`${booking.field_type} - ${unit?.name}`}
                                >
                                  {isStart ? (
                                    <div className="flex flex-col leading-tight">
                                      <span className="font-bold truncate text-[10px]">{unit?.name || booking.field_type}</span>
                                      <span className="text-[8px] opacity-80">Reserva</span>
                                    </div>
                                  ) : (
                                    <div className="h-2" />
                                  )}
                                </div>
                              );
                            })}
                            {cellBlocks.map((block) => {
                              const timeIdx = TIME_SLOTS.indexOf(time);
                              const nextTime = TIME_SLOTS[timeIdx + 1] || '23:59';
                              const isStart = block.start_time === time;
                              const isEnd = block.end_time === nextTime;
                              
                              return (
                                <div 
                                  key={block.id} 
                                  className={`overflow-hidden transition-all shadow-sm bg-destructive ${
                                    isStart ? 'rounded-t-md p-1.5' : 'bg-opacity-60 border-l-4 border-destructive p-0.5'
                                  } ${isEnd ? 'rounded-b-md mb-2' : 'mb-0'} ${
                                    isStart ? 'text-destructive-foreground' : 'text-destructive-foreground/80'
                                  }`}
                                  title={block.reason}
                                >
                                  {isStart ? (
                                    <div className="flex flex-col leading-tight">
                                      <span className="font-bold truncate text-[10px]">{block.reason}</span>
                                      <span className="text-[8px] opacity-80 uppercase font-semibold">{block.type}</span>
                                    </div>
                                  ) : (
                                    <div className="h-2" />
                                  )}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'bookings':
        return (
          <div className="space-y-4">
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
                setSelectedBookingId(null);
                setSelectedBookingProofUrl(null);
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
                        <a href={selectedBookingProofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                          <ExternalLink className="h-4 w-4" /> Ver comprobante adjunto
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">No hay comprobante adjunto.</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      {selectedBooking.status === 'pending' && (
                        <>
                          <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { void updateBookingStatus(selectedBooking.id, 'confirmed'); setSelectedBookingId(null); toast.success('Reserva confirmada.'); }}>
                            Confirmar reserva
                          </Button>
                          <Button className="w-full bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => { void updateBookingStatus(selectedBooking.id, 'cancelled'); setSelectedBookingId(null); toast.success('Reserva cancelada.'); }}>
                            Cancelar reserva
                          </Button>
                        </>
                      )}
                      {selectedBooking.status === 'confirmed' && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                          <p className="text-xs text-muted-foreground">Acción restringida</p>
                          <p className="mt-1 text-sm text-foreground">Las reservas confirmadas solo pueden cambiarse desde este detalle y mediante una cancelación explícita.</p>
                          <Button className="mt-3 w-full bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => void handleCancelFromDetails(selectedBooking.id)}>
                            Cancelar reserva confirmada
                          </Button>
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
                        <>
                          <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" size="sm" onClick={() => void updateBookingStatus(booking.id, 'confirmed')}>Confirmar</Button>
                          <Button className="w-full bg-destructive text-destructive-foreground hover:opacity-90" size="sm" onClick={() => void updateBookingStatus(booking.id, 'cancelled')}>Cancelar</Button>
                        </>
                      )}
                      <Button className="w-full" size="sm" variant="outline" onClick={() => void openBookingDetails(booking.id)}>Ver reserva</Button>
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
                                <>
                                  <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void updateBookingStatus(booking.id, 'confirmed')}>Confirmar</Button>
                                  <Button size="sm" className="bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => void updateBookingStatus(booking.id, 'cancelled')}>Cancelar</Button>
                                </>
                              )}
                              <Button size="sm" variant="outline" onClick={() => void openBookingDetails(booking.id)}>Ver reserva</Button>
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
                    <label className="mb-1 block text-sm font-medium">Campo</label>
                    <Select value={blockForm.field_id} onValueChange={(value) => setBlockForm((prev) => ({ ...prev, field_id: value }))}>
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
                    <label className="mb-1 block text-sm font-medium">Tipo de unidad</label>
                    <Select value={blockForm.unit_type} onValueChange={(value) => setBlockForm((prev) => ({ ...prev, unit_type: value as FieldType | 'all' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las unidades (cancha completa)</SelectItem>
                        <SelectItem value="F11">Solo F11</SelectItem>
                        <SelectItem value="F7">Solo F7</SelectItem>
                        <SelectItem value="F5">Solo F5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="date" value={blockForm.date} onChange={(event) => setBlockForm((prev) => ({ ...prev, date: event.target.value }))} />
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
              {blocks.map((block) => {
                const blockField = fields.find((f) => f.id === block.field_id);
                const blockClub = clubs.find((c) => c.id === blockField?.club_id);
                return (
                  <div key={block.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-heading text-sm font-bold text-card-foreground">{block.reason}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{blockClub?.name} · {blockField?.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{block.date} · {block.start_time} – {block.end_time}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Unidades afectadas: {block.field_unit_ids.length}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-destructive px-2 py-1 text-[10px] font-bold text-destructive-foreground">{block.type}</span>
                        <Button variant="ghost" size="sm" onClick={() => {
                          void deleteBlock(block.id);
                          toast.success('Bloqueo eliminado.');
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                            });
                          }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">{club.description}</p>
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
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                          <Button variant="ghost" size="sm" onClick={() => void handleDeleteField(field.id)}>
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
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 px-1 sm:px-0">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-3xl">{titles[currentSection]}</h1>
        <p className="mt-2 text-base text-muted-foreground sm:text-sm">{sectionDescriptions[currentSection]}</p>
      </div>

      {renderSection()}
    </div>
  );
}
