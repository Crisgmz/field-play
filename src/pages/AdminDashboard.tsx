import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Map,
  Plus,
  Shield,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Block, FieldType } from '@/types';
import { TIME_SLOTS } from '@/data/mockData';

const adminSections = ['overview', 'calendar', 'bookings', 'blocks', 'clubs', 'fields'] as const;
type AdminSection = (typeof adminSections)[number];

const layoutLabels = {
  full_11: 'Solo F11 (usa S1-S6)',
  three_7: '3 canchas F7 (S1+S2, S3+S4, S5+S6)',
  six_5: '6 canchas F5 (una por slot)',
  playtomic_full: 'Completo estilo Playtomic: F11 + F7 + F5',
} as const;

export default function AdminDashboard() {
  const { section } = useParams();
  const { user } = useAuth();
  const {
    clubs,
    fields,
    bookings,
    blocks,
    createBlock,
    deleteBlock,
    updateBookingStatus,
    createClub,
    createField,
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
  const [blockForm, setBlockForm] = useState({
    field_id: fields[0]?.id ?? '',
    unit_type: 'F11' as FieldType | 'all',
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
    price_per_hour: '2200',
  });
  const [fieldForm, setFieldForm] = useState({
    club_id: clubs[0]?.id ?? '',
    name: '',
    surface: 'Gramilla sintética',
    layout: 'playtomic_full' as keyof typeof layoutLabels,
  });

  const totalRevenue = bookings
    .filter((booking) => booking.status === 'confirmed')
    .reduce((sum, booking) => sum + booking.total_price, 0);

  const activeUsers = new Set(bookings.map((booking) => booking.user_id)).size;

  const stats = [
    { label: 'Reservas confirmadas', value: bookings.filter((b) => b.status === 'confirmed').length, icon: Calendar },
    { label: 'Bloqueos activos', value: blocks.length, icon: Shield },
    { label: 'Clubes', value: clubs.length, icon: Building2 },
    { label: 'Ingresos estimados', value: `RD$ ${totalRevenue.toLocaleString()}`, icon: DollarSign },
    { label: 'Usuarios activos', value: activeUsers, icon: Users },
    { label: 'Campos', value: fields.length, icon: Map },
  ];

  const calendarDateObj = new Date(`${calendarDate}T00:00:00`);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(calendarDateObj);
    date.setDate(date.getDate() - date.getDay() + i);
    return date.toISOString().split('T')[0];
  });

  const displayHours = TIME_SLOTS.slice(0, -1);

  const getEventsForCell = (date: string, time: string) => {
    const cellBookings = bookings.filter((booking) => booking.date === date && booking.start_time === time);
    const cellBlocks = blocks.filter((block) => block.date === date && block.start_time === time);
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

  const getGroupedDayEvents = (date: string) => {
    const events = getDayEvents(date);
    const groups = new Map<string, { kind: 'booking' | 'block'; time: string; endTime: string; labels: string[] }>();

    for (const event of events) {
      const key = `${event.kind}-${event.time}-${event.endTime}`;
      const existing = groups.get(key);
      if (existing) {
        existing.labels.push(event.label);
      } else {
        groups.set(key, {
          kind: event.kind,
          time: event.time,
          endTime: event.endTime,
          labels: [event.label],
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.time.localeCompare(b.time));
  };

  const latestBookings = useMemo(() => bookings.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')), [bookings]);
  const selectedBooking = bookings.find((booking) => booking.id === selectedBookingId) ?? null;
  const bookingOwner = selectedBooking
    ? profiles.find((profile) => profile.id === selectedBooking.user_id) ?? null
    : null;

  const handleCreateBlock = async () => {
    const field = fields.find((item) => item.id === blockForm.field_id);
    if (!field) return;

    let unitIds: string[] = [];
    if (blockForm.unit_type === 'all' || blockForm.unit_type === 'F11') {
      unitIds = field.units.filter((unit) => unit.type === 'F11').map((unit) => unit.id);
    } else if (blockForm.unit_type === 'F7') {
      unitIds = field.units.filter((unit) => unit.type === 'F7').map((unit) => unit.id);
    } else {
      unitIds = field.units.filter((unit) => unit.type === 'F5').map((unit) => unit.id);
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
      price_per_hour: Number(clubForm.price_per_hour),
      owner_id: user.id,
    });

    if (!created) {
      toast.error('No se pudo crear el club.');
      return;
    }

    setClubDialogOpen(false);
    setClubForm({ name: '', location: '', description: '', price_per_hour: '2200' });
    toast.success('Club creado correctamente.');
  };

  const handleCreateField = async () => {
    const created = await createField({
      club_id: fieldForm.club_id,
      name: fieldForm.name,
      surface: fieldForm.surface,
      layout: fieldForm.layout,
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
      layout: 'playtomic_full',
    });
    toast.success('Campo creado correctamente.');
  };

  const titles: Record<AdminSection, string> = {
    overview: 'Resumen general',
    calendar: 'Calendario operativo',
    bookings: 'Gestión de reservas',
    blocks: 'Bloqueos y mantenimiento',
    clubs: 'Clubes',
    fields: 'Campos y unidades',
  };

  const renderSection = () => {
    switch (currentSection) {
      case 'overview':
        return (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                    <stat.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 font-heading text-2xl font-bold text-card-foreground">{stat.value}</p>
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
                const dayEvents = displayHours.flatMap((time) => {
                  const { cellBookings, cellBlocks } = getEventsForCell(date, time);
                  return [
                    ...cellBookings.map((booking) => ({ kind: 'booking' as const, time, label: `${booking.field_type} · Reserva` })),
                    ...cellBlocks.map((block) => ({ kind: 'block' as const, time, label: block.reason })),
                  ];
                });

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
                        return (
                          <td key={`${date}-${time}`} className="px-1 py-1 align-top">
                            {cellBookings.map((booking) => (
                              <div key={booking.id} className="mb-1 rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">
                                {booking.field_type} · Reserva
                              </div>
                            ))}
                            {cellBlocks.map((block) => (
                              <div key={block.id} className="mb-1 rounded bg-destructive px-2 py-1 text-[10px] font-medium text-destructive-foreground">
                                {block.reason}
                              </div>
                            ))}
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
            <Dialog open={Boolean(selectedBookingId)} onOpenChange={(open) => !open && setSelectedBookingId(null)}>
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
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <div className="grid gap-3 md:hidden">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{booking.id}</p>
                      <h3 className="mt-1 font-heading text-lg font-bold text-foreground">{booking.field_type}</h3>
                    </div>
                    <span className={booking.status === 'confirmed'
                      ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'
                      : booking.status === 'cancelled'
                        ? 'rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground'
                        : 'rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground'}>
                      {booking.status}
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
                    <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" size="sm" onClick={() => void updateBookingStatus(booking.id, 'confirmed')}>Confirmar</Button>
                    <Button className="w-full bg-destructive text-destructive-foreground hover:opacity-90" size="sm" onClick={() => void updateBookingStatus(booking.id, 'cancelled')}>Cancelar</Button>
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setSelectedBookingId(booking.id)}>Ver reserva</Button>
                  </div>
                </div>
              ))}
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
                    {bookings.map((booking) => (
                      <tr key={booking.id} className="border-t border-border">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{booking.id}</td>
                        <td className="px-4 py-3">{booking.date}</td>
                        <td className="px-4 py-3">{booking.start_time} – {booking.end_time}</td>
                        <td className="px-4 py-3">{booking.field_type}</td>
                        <td className="px-4 py-3">
                          <span className={booking.status === 'confirmed'
                            ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'
                            : booking.status === 'cancelled'
                              ? 'rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground'
                              : 'rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground'}>
                            {booking.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void updateBookingStatus(booking.id, 'confirmed')}>Confirmar</Button>
                            <Button size="sm" className="bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => void updateBookingStatus(booking.id, 'cancelled')}>Cancelar</Button>
                            <Button size="sm" variant="outline" onClick={() => setSelectedBookingId(booking.id)}>Ver reserva</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'blocks':
        return (
          <div className="space-y-4">
            <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
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
                        <SelectItem value="all">Cancha completa / principal</SelectItem>
                        <SelectItem value="F11">F11</SelectItem>
                        <SelectItem value="F7">F7</SelectItem>
                        <SelectItem value="F5">F5</SelectItem>
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
              {blocks.map((block) => (
                <div key={block.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-sm font-bold text-card-foreground">{block.reason}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{block.date} · {block.start_time} – {block.end_time}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Unidades afectadas: {block.field_unit_ids.length}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-destructive px-2 py-1 text-[10px] font-bold text-destructive-foreground">{block.type}</span>
                      <Button variant="ghost" size="sm" onClick={() => {
                        void deleteBlock(block.id);
                        toast.success('Bloqueo eliminado.');
                      }}>Eliminar</Button>
                    </div>
                  </div>
                </div>
              ))}
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
                </DialogHeader>
                <div className="space-y-4">
                  <Input placeholder="Nombre del club" value={clubForm.name} onChange={(event) => setClubForm((prev) => ({ ...prev, name: event.target.value }))} />
                  <Input placeholder="Ubicación" value={clubForm.location} onChange={(event) => setClubForm((prev) => ({ ...prev, location: event.target.value }))} />
                  <Input placeholder="Descripción" value={clubForm.description} onChange={(event) => setClubForm((prev) => ({ ...prev, description: event.target.value }))} />
                  <Input placeholder="Precio por hora" type="number" value={clubForm.price_per_hour} onChange={(event) => setClubForm((prev) => ({ ...prev, price_per_hour: event.target.value }))} />
                  <Button className="w-full" onClick={handleCreateClub}>Guardar club</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid gap-4 md:grid-cols-2">
              {clubs.map((club) => (
                <div key={club.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="font-heading text-lg font-bold text-card-foreground">{club.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{club.location}</p>
                  <p className="mt-3 text-sm text-muted-foreground">{club.description}</p>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-primary font-semibold">RD$ {club.price_per_hour.toLocaleString()} / hora</span>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground">{club.open_time} - {club.close_time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'fields':
        return (
          <div className="space-y-6">
            <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Crear campo</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo campo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Club</label>
                    <Select value={fieldForm.club_id} onValueChange={(value) => setFieldForm((prev) => ({ ...prev, club_id: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {clubs.map((club) => <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Nombre del campo" value={fieldForm.name} onChange={(event) => setFieldForm((prev) => ({ ...prev, name: event.target.value }))} />
                  <Input placeholder="Superficie" value={fieldForm.surface} onChange={(event) => setFieldForm((prev) => ({ ...prev, surface: event.target.value }))} />
                  <div>
                    <label className="mb-1 block text-sm font-medium">Layout de división</label>
                    <Select value={fieldForm.layout} onValueChange={(value) => setFieldForm((prev) => ({ ...prev, layout: value as keyof typeof layoutLabels }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(layoutLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    <strong className="text-foreground">Preview:</strong> {layoutLabels[fieldForm.layout]}
                  </div>
                  <Button className="w-full" onClick={handleCreateField}>Guardar campo</Button>
                </div>
              </DialogContent>
            </Dialog>

            {fields.map((field) => {
              const club = clubs.find((clubItem) => clubItem.id === field.club_id);
              const f11 = field.units.filter((unit) => unit.type === 'F11');
              const f7 = field.units.filter((unit) => unit.type === 'F7');
              const f5 = field.units.filter((unit) => unit.type === 'F5');

              return (
                <div key={field.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-base font-bold text-card-foreground">{club?.name} · {field.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{field.surface}</p>
                    </div>
                    <span className="rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">{field.units.length} unidades</span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border p-4 text-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">F11</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{f11.length}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4 text-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">F7</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{f7.length}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4 text-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">F5</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{f5.length}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {field.units.map((unit) => (
                      <span
                        key={unit.id}
                        className={unit.type === 'F11'
                          ? 'rounded-full px-3 py-1 text-xs font-semibold field-badge-11'
                          : unit.type === 'F7'
                            ? 'rounded-full px-3 py-1 text-xs font-semibold field-badge-7'
                            : 'rounded-full px-3 py-1 text-xs font-semibold field-badge-5'}
                      >
                        {unit.name}
                      </span>
                    ))}
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
        <p className="mt-2 text-base text-muted-foreground sm:text-sm">Toda la administración se maneja desde el panel lateral.</p>
      </div>

      {renderSection()}
    </div>
  );
}
