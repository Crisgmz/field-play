import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarDays, CheckCircle, Clock3, Landmark, Mail, MapPin, Phone, Sparkles, Star, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import FieldModeSelector from '@/components/FieldModeSelector';
import TimeSlotPicker from '@/components/TimeSlotPicker';
import ClubGallery from '@/components/ClubGallery';
import { findAvailableUnit, getAvailableTimeSlotsV2, getUnitsByType } from '@/lib/availability';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { FieldType, TimeSlot } from '@/types';

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
  const clubFields = useMemo(
    () => fields.filter((item) => item.club_id === clubId && item.is_active !== false),
    [fields, clubId],
  );
  const field = clubFields[0] ?? null;
  const owner = club ? profiles.find((p) => p.id === club.owner_id) : null;

  const initialType = (searchParams.get('type') as FieldType | null) ?? null;

  const [step, setStep] = useState<Step>('configure');
  const [selectedMode, setSelectedMode] = useState<FieldType | null>(initialType);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [showAllDates, setShowAllDates] = useState(false);
  const [serverTimeline, setServerTimeline] = useState<TimeSlot[] | null>(null);
  const [serverPrice, setServerPrice] = useState<number | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
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
  const timeline = serverTimeline ?? fallbackTimeline;

  const sortedHours = [...selectedHours].sort();
  const startTime = sortedHours[0];
  const endTime = sortedHours.length > 0 ? timeline.find((slot) => slot.start === sortedHours[sortedHours.length - 1])?.end ?? '' : '';
  const selectedMinutes = sortedHours.length * slotDurationMinutes;
  const maxSelectableSlots = Math.max(1, Math.floor(240 / slotDurationMinutes));

  const autoUnit = useMemo(() => {
    if (!selectedMode || !startTime || !endTime || !field) return null;
    return findAvailableUnit(selectedDate, startTime, endTime, selectedMode, field, bookings, blocks);
  }, [selectedMode, selectedDate, startTime, endTime, field, bookings, blocks]);

  const fallbackTotalPrice = Math.round((pricePerHour / 60) * selectedMinutes);
  const totalPrice = serverPrice ?? fallbackTotalPrice;

  const visibleDays = showAllDates ? BOOKING_MAX_ADVANCE_DAYS : VISIBLE_DATE_WINDOW_DAYS;

  const modeAvailabilityCount = useMemo(() => {
    if (!field) return { F5: 0, F7: 0, F11: 0 } as Record<FieldType, number>;
    return {
      F5: getUnitsByType(field, 'F5').length,
      F7: getUnitsByType(field, 'F7').length,
      F11: getUnitsByType(field, 'F11').length,
    };
  }, [field]);

  const availableModes = useMemo<FieldType[]>(() => {
    return (['F5', 'F7', 'F11'] as FieldType[]).filter((type) => modeAvailabilityCount[type] > 0);
  }, [modeAvailabilityCount]);

  useEffect(() => {
    if (selectedMode && !availableModes.includes(selectedMode)) {
      setSelectedMode(null);
      setSelectedHours([]);
    }
  }, [availableModes, selectedMode]);

  useEffect(() => {
    let cancelled = false;
    const loadServerTimeline = async () => {
      if (!selectedMode || !field) {
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
  }, [selectedMode, selectedDate, field?.id, venueConfig?.slotDurationMinutes]);

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
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedHours([]);
  };

  const handleSelectionChange = (newSlots: string[]) => {
    setSelectedHours(newSlots);
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
    autoUnit &&
    selectedMinutes >= minimumMinutes &&
    selectedMinutes % incrementMinutes === 0,
  );

  const canConfirm = canProceedToPay && Boolean(paymentProofFile);

  const handleContinueToPay = () => {
    if (!canProceedToPay) {
      if (!selectedMode) toast.error('Selecciona la modalidad');
      else if (!startTime) toast.error('Selecciona la hora');
      else if (!autoUnit) toast.error('No hay disponibilidad para ese horario.');
      else if (selectedMinutes < minimumMinutes) toast.error(`La reserva mínima es de ${minimumMinutes} minutos.`);
      else if (selectedMinutes % incrementMinutes !== 0) toast.error(`Solo se permiten incrementos de ${incrementMinutes} minutos.`);
      return;
    }
    setStep('pay');
  };

  const handleConfirm = async () => {
    if (!selectedMode || !user || !startTime || !endTime || !club || !field || !autoUnit) return;
    if (!paymentProofFile) {
      toast.error('Adjunta el comprobante de pago para continuar.');
      return;
    }

    setSubmitting(true);
    let uploadedProofPath: string | null = null;
    try {
      uploadedProofPath = await uploadPaymentProof();
      const created = await createBooking({
        user_id: user.id,
        club_id: club.id,
        field_unit_id: autoUnit.id,
        field_type: selectedMode,
        date: selectedDate,
        start_time: startTime,
        end_time: endTime,
        total_price: totalPrice,
        status: 'pending',
        payment_method: 'bank_transfer',
        payment_proof_path: uploadedProofPath,
      });
      if (!created) throw new Error('No se pudo registrar la reserva.');
      setStep('done');
      toast.success('Reserva enviada. Te avisaremos cuando el pago sea validado.');
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
          {selectedDate} · {startTime} – {endTime}<br />
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

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-heading text-2xl font-bold text-foreground">{club.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{club.location}</span>
                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{club.rating.toFixed(1)}</span>
                  <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{club.open_time}–{club.close_time}</span>
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

              <section className="space-y-3">
                <header className="flex items-end justify-between gap-2">
                  <div>
                    <h2 className="font-heading text-base font-bold text-foreground">2. Fecha y hora</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedMode ? 'Verde: disponible · Rojo: ocupado' : 'Selecciona primero la modalidad.'}
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
                    <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
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
                  </>
                )}
              </section>

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
            <section className="rounded-3xl border border-primary/20 bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-primary">
                <Landmark className="h-5 w-5" />
                <h2 className="font-heading text-lg font-bold">Pago por transferencia o depósito</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Realiza el pago a la cuenta a continuación y adjunta el comprobante.
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

              <Button
                className="mt-5 w-full sm:w-auto"
                size="lg"
                disabled={!canConfirm || submitting}
                onClick={handleConfirm}
              >
                {submitting ? 'Enviando reserva...' : 'Enviar reserva y comprobante'}
              </Button>

              <p className="mt-4 text-xs text-muted-foreground">
                <strong>Política de cancelación:</strong> con más de {CANCELLATION_POLICY_HOURS}h de anticipación calificas para reembolso.
                Cancelaciones con menos de {CANCELLATION_POLICY_HOURS}h o no-shows no son reembolsables.
              </p>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
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
                <dd className="font-medium text-right">{startTime && endTime ? `${startTime} – ${endTime}` : '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Duración</dt>
                <dd className="font-medium text-right">{selectedMinutes ? `${selectedMinutes} min` : '—'}</dd>
              </div>
              {autoUnit && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" />Espacio</dt>
                  <dd className="font-medium text-right">{autoUnit.name}</dd>
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
