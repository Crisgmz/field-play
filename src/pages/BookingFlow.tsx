import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Building2, CalendarDays, CheckCircle, CircleDot, Clock3, CreditCard, Landmark, Loader2, Mail, MapPin, Phone, Sparkles, Star, Target, Upload, Users } from 'lucide-react';
import { PaymentMethod } from '@/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import FieldModeSelector from '@/components/FieldModeSelector';
import TimeSlotPicker from '@/components/TimeSlotPicker';
import ClubGallery from '@/components/ClubGallery';
import { enforceClientTimeRestriction, findAvailableUnit, getAvailableTimeSlotsV2, getUnitOptions, getUnitsByType } from '@/lib/availability';
import { formatTime12h } from '@/lib/bookingFormat';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Field, FieldType, Sport, TimeSlot } from '@/types';

const BANK_ACCOUNT = {
  bank: 'Banco Popular',
  accountType: 'Cuenta corriente',
  accountNumber: '832296057',
  accountName: 'Club Real Deportivo',
};

const ACCEPTED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;
const BOOKING_MAX_ADVANCE_DAYS = 60;
const VISIBLE_DATE_WINDOW_DAYS = 14;
const CANCELLATION_POLICY_HOURS = 24;

type Step = 'configure' | 'pay' | 'done';

export default function BookingFlow() {
  const { clubId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clubs, fields, bookings, blocks, pricingRules, profiles, createBooking, getVenueConfig } = useAppData();
  const { user } = useAuth();

  const club = clubs.find((item) => item.id === clubId) ?? null;
  const allClubFields = useMemo(
    () => fields.filter((item) => item.club_id === clubId && item.is_active !== false),
    [fields, clubId],
  );

  // Deporte del flujo: viene por ?sport=padel, o default al primero
  // disponible. Si el club ofrece ambos, el usuario lo puede cambiar
  // desde el switcher (chips arriba) sin salir del BookingFlow.
  const sportParam = (searchParams.get('sport') as Sport | null);
  const clubHasSoccer = allClubFields.some((f) => (f.sport ?? 'soccer') === 'soccer');
  const clubHasPadel = allClubFields.some((f) => f.sport === 'padel');
  const initialSport: Sport = sportParam === 'padel' && clubHasPadel
    ? 'padel'
    : sportParam === 'soccer' && clubHasSoccer
      ? 'soccer'
      : clubHasSoccer
        ? 'soccer'
        : clubHasPadel
          ? 'padel'
          : 'soccer';

  const [activeSport, setActiveSport] = useState<Sport>(initialSport);

  // Si el club cambia o si el clubHasSoccer/Padel cambia (ej. data llegó
  // después del primer render), re-evaluamos el sport activo para que
  // no quede apuntando a un deporte que el club no ofrece.
  useEffect(() => {
    if (activeSport === 'padel' && !clubHasPadel && clubHasSoccer) {
      setActiveSport('soccer');
    } else if (activeSport === 'soccer' && !clubHasSoccer && clubHasPadel) {
      setActiveSport('padel');
    }
  }, [clubHasSoccer, clubHasPadel, activeSport]);

  const clubFields = useMemo(
    () => allClubFields.filter((f) => (f.sport ?? 'soccer') === activeSport),
    [allClubFields, activeSport],
  );

  // Para pádel: cada cancha es su propio `field`, pero la lógica de
  // availability/conflictos asume un único field. Como las unidades de
  // pádel no comparten slots, podemos sintetizar un "field virtual" que
  // agrega las unidades de todas las canchas de pádel del club.
  // Renombramos cada unit con el nombre del field padre para que el
  // jugador pueda distinguir entre "Cancha 1", "Cancha 2", etc. (el
  // admin pone esos nombres al crear cada cancha de pádel).
  // Para fútbol mantenemos el comportamiento anterior (un solo field).
  const field: Field | null = useMemo(() => {
    if (clubFields.length === 0) return null;
    if (activeSport === 'padel') {
      return {
        id: `virtual-padel-${clubId}`,
        club_id: clubId ?? '',
        name: 'Canchas de Pádel',
        units: clubFields.flatMap((f) => f.units.map((u) => ({ ...u, name: f.name }))),
        is_active: true,
        sport: 'padel',
      };
    }
    return clubFields[0];
  }, [clubFields, activeSport, clubId]);

  const owner = club ? profiles.find((p) => p.id === club.owner_id) : null;

  const initialType = (searchParams.get('type') as FieldType | null) ?? (activeSport === 'padel' ? 'PADEL' : null);

  const [step, setStep] = useState<Step>('configure');
  const [selectedMode, setSelectedMode] = useState<FieldType | null>(initialType);
  // Arrancamos sin fecha — el jugador debe elegir explícitamente. Antes
  // defaulteábamos a hoy y eso engañaba a usuarios que terminaban
  // reservando "hoy" sin querer.
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [showAllDates, setShowAllDates] = useState(false);
  const [serverTimeline, setServerTimeline] = useState<TimeSlot[] | null>(null);
  const [serverPrice, setServerPrice] = useState<number | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [manualUnitId, setManualUnitId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const venueConfig = club ? getVenueConfig(club.id) : null;
  const pricingRule = club
    ? pricingRules.find((rule) => rule.club_id === club.id && rule.field_type === selectedMode && rule.is_active)
    : undefined;
  const minimumMinutes = pricingRule?.minimum_minutes ?? 60;
  const incrementMinutes = pricingRule?.increment_minutes ?? 30;
  const pricePerHour = pricingRule?.price_per_hour ?? 0;
  const slotDurationMinutes = venueConfig?.slotDurationMinutes ?? 30;

  const fallbackTimeline = selectedMode && field
    ? getAvailableTimeSlotsV2(selectedDate, selectedMode, field, bookings, blocks, club, venueConfig)
    : [];
  const timeline = enforceClientTimeRestriction(serverTimeline ?? fallbackTimeline, selectedDate);

  const sortedHours = [...selectedHours].sort();
  const startTime = sortedHours[0];
  const endTime = sortedHours.length > 0 ? timeline.find((slot) => slot.start === sortedHours[sortedHours.length - 1])?.end ?? '' : '';
  const selectedMinutes = sortedHours.length * slotDurationMinutes;
  const maxSelectableSlots = Math.max(1, Math.floor(240 / slotDurationMinutes));

  const autoUnit = useMemo(() => {
    if (!selectedMode || !startTime || !endTime || !field) return null;
    return findAvailableUnit(selectedDate, startTime, endTime, selectedMode, field, bookings, blocks);
  }, [selectedMode, selectedDate, startTime, endTime, field, bookings, blocks]);

  // Lista completa de unidades del tipo (con su disponibilidad). El cliente
  // puede elegir manualmente una específica si no le sirve la auto-seleccionada.
  const unitOptions = useMemo(() => {
    if (!selectedMode || !startTime || !endTime || !field) return [];
    return getUnitOptions(selectedDate, startTime, endTime, selectedMode, field, bookings, blocks);
  }, [selectedMode, selectedDate, startTime, endTime, field, bookings, blocks]);

  // Unidad efectiva: la manual si existe y sigue disponible, si no la auto.
  const selectedUnit = useMemo(() => {
    if (manualUnitId) {
      const found = unitOptions.find((u) => u.id === manualUnitId);
      if (found && found.available) return found;
    }
    return autoUnit;
  }, [manualUnitId, unitOptions, autoUnit]);

  const fallbackTotalPrice = Math.round((pricePerHour / 60) * selectedMinutes);
  const totalPrice = serverPrice ?? fallbackTotalPrice;

  const visibleDays = showAllDates ? BOOKING_MAX_ADVANCE_DAYS : VISIBLE_DATE_WINDOW_DAYS;

  const modeAvailabilityCount = useMemo(() => {
    if (!field) return { F5: 0, F7: 0, F11: 0, PADEL: 0 } as Record<FieldType, number>;
    return {
      F5: getUnitsByType(field, 'F5').length,
      F7: getUnitsByType(field, 'F7').length,
      F11: getUnitsByType(field, 'F11').length,
      PADEL: getUnitsByType(field, 'PADEL').length,
    };
  }, [field]);

  const availableModes = useMemo<FieldType[]>(() => {
    const candidates: FieldType[] = activeSport === 'padel' ? ['PADEL'] : ['F5', 'F7', 'F11'];
    return candidates.filter((type) => modeAvailabilityCount[type] > 0);
  }, [modeAvailabilityCount, activeSport]);

  useEffect(() => {
    if (selectedMode && !availableModes.includes(selectedMode)) {
      setSelectedMode(null);
      setSelectedHours([]);
    }
  }, [availableModes, selectedMode]);

  // Pádel solo tiene una modalidad: auto-seleccionarla para saltar el paso.
  useEffect(() => {
    if (activeSport === 'padel' && availableModes.includes('PADEL') && selectedMode !== 'PADEL') {
      setSelectedMode('PADEL');
    }
  }, [activeSport, availableModes, selectedMode]);

  useEffect(() => {
    let cancelled = false;
    const loadServerTimeline = async () => {
      if (!selectedMode || !field) {
        setServerTimeline(null);
        return;
      }
      // El campo virtual de pádel agrega unidades de múltiples canchas
      // físicas — el RPC server-side no entiende ese agregado. Usamos
      // el fallback client-side para pádel.
      if (activeSport === 'padel') {
        setServerTimeline(null);
        return;
      }
      const { data, error } = await supabase.rpc('rpc_get_available_time_slots', {
        p_field_id: field.id,
        p_field_type: selectedMode,
        p_date: selectedDate,
      });
      if (cancelled) return;
      setServerTimeline(!error && Array.isArray(data) ? (data as TimeSlot[]) : null);
    };
    void loadServerTimeline();
    return () => { cancelled = true; };
  }, [selectedMode, selectedDate, field?.id, venueConfig?.slotDurationMinutes, activeSport]);

  useEffect(() => {
    let cancelled = false;
    const loadServerPrice = async () => {
      if (!selectedMode || !startTime || !endTime || !club) {
        setServerPrice(null);
        return;
      }
      const { data, error } = await supabase.rpc('rpc_calculate_price', {
        p_club_id: club.id,
        p_field_type: selectedMode,
        p_start_time: startTime,
        p_end_time: endTime,
      });
      if (cancelled) return;
      if (!error && data && typeof data.total_price === 'number') {
        setServerPrice(Number(data.total_price));
      } else {
        setServerPrice(null);
      }
    };
    void loadServerPrice();
    return () => { cancelled = true; };
  }, [selectedMode, startTime, endTime, club?.id]);

  const handleSelectMode = (type: FieldType) => {
    setSelectedMode(type);
    setSelectedHours([]);
    setPaymentProofFile(null);
    setManualUnitId(null);
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedHours([]);
    setManualUnitId(null);
  };

  const handleSelectionChange = (newSlots: string[]) => {
    setSelectedHours(newSlots);
    setManualUnitId(null);
  };

  const handlePaymentProofChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setPaymentProofFile(null);
      return;
    }
    if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
      toast.error('Sube un comprobante en JPG, PNG, WEBP o PDF.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_PROOF_SIZE_BYTES) {
      toast.error('El comprobante no puede exceder 10 MB.');
      event.target.value = '';
      return;
    }
    setPaymentProofFile(file);
  };

  const uploadPaymentProof = async () => {
    if (!paymentProofFile || !user) return null;
    const ext = paymentProofFile.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const safeDate = selectedDate.replaceAll('-', '');
    const filePath = `${user.id}/${safeDate}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('booking-proofs')
      .upload(filePath, paymentProofFile, { upsert: false, contentType: paymentProofFile.type });
    if (error) throw error;
    return filePath;
  };

  const canProceedToPay = Boolean(
    selectedMode &&
    startTime &&
    endTime &&
    selectedUnit &&
    selectedMinutes >= minimumMinutes &&
    selectedMinutes % incrementMinutes === 0,
  );

  // Solo la transferencia exige comprobante. Para efectivo y tarjeta el
  // cliente paga al llegar al club, así que la reserva queda 'pending' y
  // el admin la confirma en persona.
  const requiresProof = paymentMethod === 'bank_transfer';
  const canConfirm = canProceedToPay && (!requiresProof || Boolean(paymentProofFile));

  const handleContinueToPay = () => {
    if (!canProceedToPay) {
      if (!selectedMode) toast.error('Selecciona la modalidad');
      else if (!startTime) toast.error('Selecciona la hora');
      else if (!selectedUnit) toast.error('No hay disponibilidad para ese horario.');
      else if (selectedMinutes < minimumMinutes) toast.error(`La reserva mínima es de ${minimumMinutes} minutos.`);
      else if (selectedMinutes % incrementMinutes !== 0) toast.error(`Solo se permiten incrementos de ${incrementMinutes} minutos.`);
      return;
    }
    setStep('pay');
  };

  const handleConfirm = async () => {
    if (!selectedMode || !user || !startTime || !endTime || !club || !field || !selectedUnit) return;
    if (requiresProof && !paymentProofFile) {
      toast.error('Adjunta el comprobante de pago para continuar.');
      return;
    }

    setSubmitting(true);
    let uploadedProofPath: string | null = null;
    try {
      // Solo subimos comprobante si el método elegido es transferencia.
      if (requiresProof) {
        uploadedProofPath = await uploadPaymentProof();
      }
      const created = await createBooking({
        user_id: user.id,
        club_id: club.id,
        field_unit_id: selectedUnit.id,
        field_type: selectedMode,
        date: selectedDate,
        start_time: startTime,
        end_time: endTime,
        total_price: totalPrice,
        status: 'pending',
        payment_method: paymentMethod,
        payment_proof_path: uploadedProofPath,
      });
      if (!created) throw new Error('No se pudo registrar la reserva.');
      setStep('done');
      const successMsg = requiresProof
        ? 'Reserva enviada. Te avisaremos cuando el pago sea validado.'
        : 'Reserva creada. Pasa por el club a completar el pago para confirmarla.';
      toast.success(successMsg);
    } catch (error) {
      if (uploadedProofPath) {
        await supabase.storage.from('booking-proofs').remove([uploadedProofPath]);
      }
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la reserva.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!club || !field) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-muted-foreground">Club no encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>Volver al inicio</Button>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <CheckCircle className="mx-auto h-16 w-16 text-primary" />
        <h2 className="mt-4 font-heading text-2xl font-bold text-foreground">Solicitud enviada correctamente</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedMode} en {club.name}<br />
          {selectedDate} · {formatTime12h(startTime)} – {formatTime12h(endTime)}<br />
          Total reportado: RD$ {totalPrice.toLocaleString()}<br />
          Estado actual: pendiente de validación administrativa.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => navigate('/')}>Volver al inicio</Button>
          <Button onClick={() => navigate('/bookings')}>Ver mis reservas</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <button
        onClick={() => (step === 'pay' ? setStep('configure') : navigate('/'))}
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {step === 'pay' ? 'Volver a configurar' : 'Volver a clubes'}
      </button>

      <div className="mb-6 flex items-center gap-2">
        <div className={`h-1.5 flex-1 rounded-full ${step === 'configure' ? 'bg-primary' : 'bg-primary/40'}`} />
        <div className={`h-1.5 flex-1 rounded-full ${step === 'pay' ? 'bg-primary' : 'bg-border'}`} />
      </div>

      <div className="mb-6">
        <ClubGallery clubId={club.id} fallbackInitial={club.name.charAt(0).toUpperCase()} />
      </div>

      {/* `grid-cols-1` explícito + `minmax(0, 1fr)` (via `min-w-0` en
          los hijos) evita que contenido largo (ej. nombre de cancha
          de pádel) expanda las columnas más allá del viewport y rompa
          el responsive en mobile. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-heading text-2xl font-bold text-foreground">{club.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{club.location}</span>
                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{club.rating.toFixed(1)}</span>
                  <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatTime12h(club.open_time)} – {formatTime12h(club.close_time)}</span>
                </div>
              </div>
              {owner && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(owner.first_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="leading-tight">
                    <p className="font-medium text-foreground">{owner.first_name}</p>
                    <p className="text-xs text-muted-foreground">Anfitrión</p>
                  </div>
                </div>
              )}
            </div>

            {club.description && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sobre este club</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{club.description}</p>
              </div>
            )}

            {club.amenities && club.amenities.length > 0 && (
              <div className="mt-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Amenidades
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {club.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(club.phone || club.email) && (
              <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
                {club.phone && (
                  <a href={`tel:${club.phone}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                    <Phone className="h-4 w-4 text-primary" />
                    {club.phone}
                  </a>
                )}
                {club.email && (
                  <a href={`mailto:${club.email}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                    <Mail className="h-4 w-4 text-primary" />
                    {club.email}
                  </a>
                )}
              </div>
            )}
          </section>

          {step === 'configure' && (
            <>
              {/* Switcher de deporte cuando el club ofrece ambos. Si solo
                  ofrece uno, no tiene sentido mostrar el switcher. */}
              {clubHasSoccer && clubHasPadel && (
                <section className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">¿Qué deporte vas a jugar?</p>
                  <div className="inline-flex w-full rounded-2xl border border-border bg-card p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSport('soccer');
                        setSelectedMode(null);
                        setSelectedHours([]);
                        setManualUnitId(null);
                      }}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                        activeSport === 'soccer'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <CircleDot className="h-4 w-4" />
                      Fútbol
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSport('padel');
                        setSelectedMode('PADEL');
                        setSelectedHours([]);
                        setManualUnitId(null);
                      }}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                        activeSport === 'padel'
                          ? 'bg-sky-600 text-white shadow'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Target className="h-4 w-4" />
                      Pádel
                    </button>
                  </div>
                </section>
              )}

              {activeSport !== 'padel' && (
                <section className="space-y-3">
                  <header>
                    <h2 className="font-heading text-base font-bold text-foreground">1. Modalidad</h2>
                    <p className="text-xs text-muted-foreground">El sistema autoselecciona la cancha disponible que mejor encaje.</p>
                  </header>
                  <FieldModeSelector
                    selected={selectedMode}
                    onSelect={handleSelectMode}
                    availableTypes={availableModes}
                  />
                </section>
              )}

              <section className="space-y-3">
                <header className="flex items-end justify-between gap-2">
                  <div>
                    <h2 className="font-heading text-base font-bold text-foreground">
                      {activeSport === 'padel' ? '1. Fecha y hora' : '2. Fecha y hora'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {!selectedMode
                        ? 'Selecciona primero la modalidad.'
                        : !selectedDate
                          ? 'Elige una fecha para ver los horarios.'
                          : 'Verde: disponible · Rojo: ocupado'}
                    </p>
                  </div>
                  {selectedMode && (
                    <button
                      type="button"
                      onClick={() => setShowAllDates((v) => !v)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {showAllDates ? 'Ver menos fechas' : 'Más fechas'}
                    </button>
                  )}
                </header>

                {selectedMode && (
                  <>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 snap-x snap-mandatory">
                      {Array.from({ length: visibleDays }, (_, i) => {
                        const date = new Date();
                        date.setDate(date.getDate() + i);
                        const dateStr = date.toISOString().split('T')[0];
                        const dayName = date.toLocaleDateString('es', { weekday: 'short' });
                        const dayNum = date.getDate();
                        const monthName = date.toLocaleDateString('es', { month: 'short' });
                        const isSelected = selectedDate === dateStr;
                        const dayOfWeek = date.getDay();
                        const daySchedule = venueConfig?.weekSchedule?.find((d) => d.day === dayOfWeek);
                        const isDayClosed = daySchedule?.closed === true;
                        const isHoliday = (venueConfig?.closedDates ?? []).includes(dateStr);
                        const isClosed = isDayClosed || isHoliday;
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            disabled={isClosed}
                            onClick={() => handleSelectDate(dateStr)}
                            className={`snap-start flex min-w-[76px] flex-shrink-0 flex-col items-center rounded-2xl border px-3 py-3 transition-all ${
                              isClosed
                                ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-50'
                                : isSelected
                                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                  : 'border-border bg-card text-card-foreground hover:border-primary/50'
                            }`}
                          >
                            <span className="text-[10px] font-medium uppercase opacity-70">{dayName}</span>
                            <span className="font-heading text-lg font-bold">{dayNum}</span>
                            <span className="text-[9px] uppercase opacity-60">{monthName}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedDate ? (
                      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                        <TimeSlotPicker
                          slots={timeline}
                          selectedSlots={selectedHours}
                          onSelectionChange={handleSelectionChange}
                          minMinutes={minimumMinutes}
                          maxMinutes={maxSelectableSlots * slotDurationMinutes}
                          incrementMinutes={incrementMinutes}
                          slotDurationMinutes={slotDurationMinutes}
                        />
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        Selecciona una fecha arriba para ver los horarios disponibles.
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Selector de cancha específica — aparece cuando hay
                  fecha+hora válidas y más de una unidad disponible. Si
                  hay solo una, no tiene sentido pedir que elija. */}
              {selectedMode && startTime && endTime && unitOptions.length > 1 && (
                <section className="space-y-3">
                  <header>
                    <h2 className="font-heading text-base font-bold text-foreground">3. Cancha</h2>
                    <p className="text-xs text-muted-foreground">
                      Te seleccionamos una automáticamente. Si prefieres otra, elige la que quieras de las disponibles.
                    </p>
                  </header>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {unitOptions.map((option) => {
                      const isAuto = autoUnit?.id === option.id && !manualUnitId;
                      const isManual = manualUnitId === option.id;
                      const isSelected = isAuto || isManual;
                      // El subtítulo muestra "TIPO · S1 + S2" para fútbol,
                      // pero para pádel slot_ids es [] — evitamos el " · "
                      // colgante al final.
                      const subtitle = option.slot_ids.length > 0
                        ? `${option.type} · ${option.slot_ids.join(' + ')}`
                        : option.type;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!option.available}
                          onClick={() => setManualUnitId(option.id)}
                          className={`relative rounded-2xl border-2 p-3 text-left transition-all ${
                            !option.available
                              ? 'cursor-not-allowed border-border bg-muted/40 opacity-60'
                              : isSelected
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border bg-card hover:border-primary/40 hover:bg-accent/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-heading text-sm font-bold text-foreground truncate">{option.name}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                {subtitle}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                option.available
                                  ? isSelected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {option.available ? (isSelected ? 'Elegida' : 'Disponible') : 'Ocupada'}
                            </span>
                          </div>
                          {isAuto && (
                            <p className="mt-2 text-[10px] uppercase tracking-wide text-primary">
                              Auto-seleccionada
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <Button
                size="lg"
                className="w-full sm:w-auto"
                disabled={!canProceedToPay}
                onClick={handleContinueToPay}
              >
                Continuar al pago
              </Button>
            </>
          )}

          {step === 'pay' && (
            <section className="space-y-4">
              {/* Selector de método de pago */}
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <h2 className="font-heading text-lg font-bold text-foreground">¿Cómo vas a pagar?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tu reserva queda en estado pendiente hasta que el pago se confirme.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {([
                    { value: 'bank_transfer' as const, label: 'Transferencia', description: 'Subes el comprobante', Icon: Landmark },
                    { value: 'cash' as const, label: 'Efectivo', description: 'Pagas en oficina', Icon: Banknote },
                    { value: 'card' as const, label: 'Tarjeta', description: 'Pagas en oficina', Icon: CreditCard },
                  ]).map((option) => {
                    const isActive = paymentMethod === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPaymentMethod(option.value)}
                        className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all ${
                          isActive
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border bg-background hover:border-primary/40 hover:bg-accent/40'
                        }`}
                      >
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          <option.Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contenido condicional según método */}
              {paymentMethod === 'bank_transfer' ? (
                <div className="rounded-3xl border border-primary/20 bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-primary">
                    <Landmark className="h-5 w-5" />
                    <h3 className="font-heading text-base font-bold">Datos para la transferencia</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Realiza el pago a la cuenta y adjunta el comprobante para que el club lo valide.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Banco</p>
                      <p className="mt-1 font-semibold text-foreground">{BANK_ACCOUNT.bank}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Tipo de cuenta</p>
                      <p className="mt-1 font-semibold text-foreground">{BANK_ACCOUNT.accountType}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Número de cuenta</p>
                      <p className="mt-1 font-semibold text-foreground">{BANK_ACCOUNT.accountNumber}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Beneficiario</p>
                      <p className="mt-1 font-semibold text-foreground">{BANK_ACCOUNT.accountName}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-dashed border-border bg-background p-4">
                    <label htmlFor="payment-proof" className="flex cursor-pointer flex-col gap-2 text-sm text-foreground">
                      <span className="flex items-center gap-2 font-medium">
                        <Upload className="h-4 w-4" /> Adjuntar comprobante de pago
                      </span>
                      <span className="text-muted-foreground">Aceptamos JPG, PNG, WEBP o PDF de hasta 10 MB.</span>
                      <input
                        id="payment-proof"
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        className="hidden"
                        onChange={handlePaymentProofChange}
                      />
                      <span className="inline-flex w-fit rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                        Seleccionar archivo
                      </span>
                    </label>
                    {paymentProofFile && (
                      <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        Comprobante listo: {paymentProofFile.name} · {(paymentProofFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <strong>Importante:</strong> si no completas el pago antes de tu hora reservada, el club puede liberar el espacio.
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-primary/20 bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-primary">
                    {paymentMethod === 'cash' ? <Banknote className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                    <h3 className="font-heading text-base font-bold">
                      {paymentMethod === 'cash' ? 'Pago en efectivo en el club' : 'Pago con tarjeta en el club'}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tu reserva quedará registrada de inmediato. Pasa por el club a completar el pago para que se confirme.
                  </p>

                  <div className="mt-4 space-y-3 rounded-xl bg-muted/30 p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <div className="text-sm">
                        <p className="font-semibold text-foreground">{club.name}</p>
                        <p className="text-muted-foreground">{club.location}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <div className="text-sm">
                        <p className="font-semibold text-foreground">Horario de atención</p>
                        <p className="text-muted-foreground">{formatTime12h(club.open_time)} – {formatTime12h(club.close_time)}</p>
                      </div>
                    </div>
                    {club.phone && (
                      <div className="flex items-start gap-3">
                        <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                        <a href={`tel:${club.phone}`} className="text-sm text-foreground hover:text-primary">
                          {club.phone}
                        </a>
                      </div>
                    )}
                  </div>

                </div>
              )}

              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <Button
                  className="w-full sm:w-auto"
                  size="lg"
                  disabled={!canConfirm || submitting}
                  onClick={handleConfirm}
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando reserva...</>
                  ) : paymentMethod === 'bank_transfer'
                    ? 'Enviar reserva y comprobante'
                    : 'Reservar y pagar en el club'}
                </Button>

                <p className="mt-4 text-xs text-muted-foreground">
                  <strong>Política de cancelación:</strong> con más de {CANCELLATION_POLICY_HOURS}h de anticipación calificas para reembolso.
                  Cancelaciones con menos de {CANCELLATION_POLICY_HOURS}h o no-shows no son reembolsables.
                </p>
              </div>
            </section>
          )}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl border border-border bg-accent p-5 text-accent-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <h3 className="font-heading text-lg font-bold">Tu reserva</h3>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Club</dt>
                <dd className="font-medium text-right">{club.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Modalidad</dt>
                <dd className="font-medium text-right">{selectedMode ?? '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Fecha</dt>
                <dd className="font-medium text-right">{selectedDate}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Horario</dt>
                <dd className="font-medium text-right">{startTime && endTime ? `${formatTime12h(startTime)} – ${formatTime12h(endTime)}` : '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Duración</dt>
                <dd className="font-medium text-right">{selectedMinutes ? `${selectedMinutes} min` : '—'}</dd>
              </div>
              {selectedUnit && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground flex shrink-0 items-center gap-1"><Users className="h-3.5 w-3.5" />Espacio</dt>
                  <dd className="min-w-0 break-words font-medium text-right">{selectedUnit.name}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-heading text-2xl font-bold text-primary">
                  RD$ {totalPrice.toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {pricePerHour > 0
                  ? `RD$ ${pricePerHour.toLocaleString()} / hora · mínimo ${minimumMinutes} min`
                  : 'Precio se calcula al elegir la modalidad.'}
              </p>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              La reserva queda en estado <strong>pendiente</strong> hasta que el equipo administrativo confirme el pago.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
