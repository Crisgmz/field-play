import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FieldType, PhysicalSlotId, TimeSlot, UnitOption } from '@/types';
import { findAvailableUnit, getAvailableTimeSlotsV2, getOccupiedSlotIds, getSlotStatuses, getUnitOptions } from '@/lib/availability';
import FieldModeSelector from '@/components/FieldModeSelector';
import TimeSlotPicker from '@/components/TimeSlotPicker';
import FieldSlotsBoard from '@/components/FieldSlotsBoard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, CalendarDays, CheckCircle, Landmark, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const BANK_ACCOUNT = {
  bank: 'Banco Popular',
  accountType: 'Cuenta corriente',
  accountNumber: '832296057',
  accountName: 'Club Real Deportivo',
};

const ACCEPTED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;
const BOOKING_MAX_ADVANCE_DAYS = 60;
const CANCELLATION_POLICY_HOURS = 24;

export default function BookingFlow() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { clubs, fields, bookings, blocks, pricingRules, createBooking, getVenueConfig } = useAppData();
  const { user } = useAuth();

  const club = clubs.find((item) => item.id === clubId);
  const clubFields = fields.filter((item) => item.club_id === clubId);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedMode, setSelectedMode] = useState<FieldType | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(clubFields[0]?.id ?? null);
  const [serverTimeline, setServerTimeline] = useState<TimeSlot[] | null>(null);
  const [serverOptions, setServerOptions] = useState<UnitOption[] | null>(null);
  const [serverPrice, setServerPrice] = useState<number | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const field = clubFields.find((f) => f.id === selectedFieldId) ?? clubFields[0] ?? null;

  const venueConfig = club ? getVenueConfig(club.id) : null;
  const pricingRule = club
    ? pricingRules.find((rule) => rule.club_id === club.id && rule.field_type === selectedMode && rule.is_active)
    : undefined;
  const minimumMinutes = pricingRule?.minimum_minutes ?? 60;
  const incrementMinutes = pricingRule?.increment_minutes ?? 30;
  const pricePerHour = pricingRule?.price_per_hour ?? 0;
  const slotDurationMinutes = venueConfig?.slotDurationMinutes ?? 30;

  const fallbackTimeline = selectedMode && field
    ? getAvailableTimeSlotsV2(selectedDate, selectedMode, field, bookings, blocks, club ?? null, venueConfig)
    : [];
  const timeline = serverTimeline ?? fallbackTimeline;

  const handleSelectionChange = (newSlots: string[]) => {
    setSelectedUnitId(null);
    setSelectedHours(newSlots);
  };

  const sortedHours = [...selectedHours].sort();
  const startTime = sortedHours[0];
  const endTime = sortedHours.length > 0 ? timeline.find((slot) => slot.start === sortedHours[sortedHours.length - 1])?.end ?? '' : '';
  const selectedMinutes = sortedHours.length * slotDurationMinutes;
  const maxSelectableSlots = Math.max(1, Math.floor(240 / slotDurationMinutes));

  const occupiedSlotIds = useMemo(() => {
    if (!selectedMode || !startTime || !endTime || !field) return new Set<PhysicalSlotId>();
    return getOccupiedSlotIds(selectedDate, startTime, endTime, field, bookings, blocks);
  }, [selectedMode, startTime, endTime, selectedDate, field, bookings, blocks]);

  const fallbackOptions = useMemo(() => {
    if (!selectedMode || !startTime || !endTime || !field) return [];
    return getUnitOptions(selectedDate, startTime, endTime, selectedMode, field, bookings, blocks);
  }, [selectedMode, startTime, endTime, selectedDate, field, bookings, blocks]);

  const options = serverOptions ?? fallbackOptions;
  const selectedUnit = options.find((option) => option.id === selectedUnitId) ?? null;
  const slotStatuses = getSlotStatuses(occupiedSlotIds, selectedUnit?.slot_ids ?? []);
  const fallbackTotalPrice = Math.round((pricePerHour / 60) * selectedMinutes);
  const totalPrice = serverPrice ?? fallbackTotalPrice;
  const proofSummary = paymentProofFile ? `${paymentProofFile.name} · ${(paymentProofFile.size / 1024 / 1024).toFixed(1)} MB` : null;

  const canConfirm = Boolean(
    selectedMode &&
    startTime &&
    endTime &&
    selectedUnitId &&
    paymentProofFile &&
    selectedMinutes >= minimumMinutes &&
    selectedMinutes % incrementMinutes === 0,
  );

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
      if (!cancelled) {
        if (!error && Array.isArray(data)) {
          setServerTimeline(data as TimeSlot[]);
        } else {
          setServerTimeline(null);
        }
      }
    };

    void loadServerTimeline();
    return () => {
      cancelled = true;
    };
  }, [selectedMode, selectedDate, field?.id, venueConfig?.slotDurationMinutes]);

  useEffect(() => {
    let cancelled = false;

    const loadServerOptions = async () => {
      if (!selectedMode || !startTime || !endTime || !field) {
        setServerOptions(null);
        return;
      }
      const { data, error } = await supabase.rpc('rpc_get_unit_options', {
        p_field_id: field.id,
        p_field_type: selectedMode,
        p_date: selectedDate,
        p_start_time: startTime,
        p_end_time: endTime,
      });
      if (!cancelled) {
        if (!error && Array.isArray(data)) {
          setServerOptions(data as UnitOption[]);
        } else {
          setServerOptions(null);
        }
      }
    };

    void loadServerOptions();
    return () => {
      cancelled = true;
    };
  }, [selectedMode, selectedDate, startTime, endTime, field?.id]);

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
      if (!cancelled) {
        if (!error && data && typeof data.total_price === 'number') {
          setServerPrice(Number(data.total_price));
        } else {
          setServerPrice(null);
        }
      }
    };

    void loadServerPrice();
    return () => {
      cancelled = true;
    };
  }, [selectedMode, startTime, endTime, club?.id]);

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

    if (error) {
      throw error;
    }

    return filePath;
  };

  const handleConfirm = async () => {
    if (!selectedMode || !user || !startTime || !endTime || !club || !field) return;

    if (selectedMinutes < minimumMinutes) {
      toast.error(`La reserva mínima es de ${minimumMinutes} minutos.`);
      return;
    }

    if (selectedMinutes % incrementMinutes !== 0) {
      toast.error(`Solo se permiten incrementos de ${incrementMinutes} minutos.`);
      return;
    }

    if (!paymentProofFile) {
      toast.error('Debes adjuntar el comprobante de pago para continuar.');
      return;
    }

    const unit = selectedUnit ?? findAvailableUnit(selectedDate, startTime, endTime, selectedMode, field, bookings, blocks);
    if (!unit) {
      toast.error('No hay una combinación válida disponible para ese horario.');
      return;
    }

    setSubmitting(true);
    let uploadedProofPath: string | null = null;

    try {
      uploadedProofPath = await uploadPaymentProof();

      const created = await createBooking({
        user_id: user.id,
        club_id: club.id,
        field_unit_id: unit.id,
        field_type: selectedMode,
        date: selectedDate,
        start_time: startTime,
        end_time: endTime,
        total_price: totalPrice,
        status: 'pending',
        payment_method: 'bank_transfer',
        payment_proof_path: uploadedProofPath,
      });

      if (!created) {
        throw new Error('No se pudo registrar la reserva.');
      }

      setStep(4);
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
    return <p className="py-20 text-center text-muted-foreground">Club no encontrado.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={() => step > 1 ? setStep((s) => (s - 1) as 1 | 2 | 3 | 4) : navigate(`/clubs/${clubId}`)} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {step > 1 ? 'Volver' : 'Volver al club'}
      </button>

      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-border'}`} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Seleccionar modalidad</h2>
          <p className="mb-6 text-sm text-muted-foreground">El sistema calcula la disponibilidad real según la configuración física de la cancha.</p>
          <FieldModeSelector selected={selectedMode} onSelect={(type) => { setSelectedMode(type); setSelectedHours([]); setSelectedUnitId(null); setPaymentProofFile(null); }} />
          <Button className="mt-6" disabled={!selectedMode} onClick={() => setStep(2)}>Continuar</Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Elegir fecha</h2>
          <p className="mb-4 text-sm text-muted-foreground">Selecciona el día en que deseas jugar. Puedes reservar hasta 60 días en el futuro.</p>
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
            {Array.from({ length: BOOKING_MAX_ADVANCE_DAYS }, (_, i) => {
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
                  disabled={isClosed}
                  onClick={() => { setSelectedDate(dateStr); setSelectedHours([]); setSelectedUnitId(null); setPaymentProofFile(null); }}
                  className={`snap-start flex min-w-[88px] flex-shrink-0 flex-col items-center rounded-xl border px-3 py-3 transition-all ${
                    isClosed
                      ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-50'
                      : isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-card-foreground hover:border-primary/50'
                  }`}
                  title={isHoliday ? 'Día cerrado' : isDayClosed ? 'No abre este día' : undefined}
                >
                  <span className="text-[10px] font-medium uppercase opacity-70">{dayName}</span>
                  <span className="font-heading text-lg font-bold">{dayNum}</span>
                  <span className="text-[9px] uppercase opacity-60">{monthName}</span>
                </button>
              );
            })}
          </div>
          <Button className="mt-6" onClick={() => setStep(3)}>Continuar</Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Disponibilidad y pago</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
              {selectedDate} · {selectedMode}
            </p>
            {pricingRule && (
              <p className="mb-6 text-sm text-muted-foreground">
                Precio por hora: RD$ {pricePerHour.toLocaleString()} · mínimo {minimumMinutes} min · incremento {incrementMinutes} min
              </p>
            )}
            <TimeSlotPicker slots={timeline} selectedSlots={selectedHours} onSelectionChange={handleSelectionChange} minMinutes={minimumMinutes} maxMinutes={maxSelectableSlots * slotDurationMinutes} incrementMinutes={incrementMinutes} slotDurationMinutes={slotDurationMinutes} />
          </div>

          {startTime && endTime && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h3 className="font-heading text-lg font-bold text-foreground">Selecciona tu espacio</h3>
                <p className="mt-1 text-sm text-muted-foreground">Verde disponible, rojo ocupado, azul seleccionado.</p>
              </div>
              <FieldSlotsBoard statuses={slotStatuses} options={options} selectedUnitId={selectedUnitId} onSelectUnit={setSelectedUnitId} />
            </div>
          )}

          {selectedUnit && (
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <Landmark className="h-5 w-5" />
                  <h3 className="font-heading text-lg font-bold">Pago por transferencia o depósito</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Para completar la solicitud, realiza el pago y adjunta el comprobante correspondiente.</p>
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
                    <input id="payment-proof" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handlePaymentProofChange} />
                    <span className="inline-flex w-fit rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                      Seleccionar archivo
                    </span>
                  </label>
                  {proofSummary && (
                    <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Comprobante listo: {proofSummary}</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-accent p-5 text-accent-foreground shadow-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  <h3 className="font-heading text-lg font-bold">Resumen de la reserva</h3>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <p><strong>Club:</strong> {club.name}</p>
                  <p><strong>Modalidad:</strong> {selectedMode}</p>
                  <p><strong>Espacio:</strong> {selectedUnit.name}</p>
                  <p><strong>Fecha:</strong> {selectedDate}</p>
                  <p><strong>Horario:</strong> {startTime} – {endTime}</p>
                  <p><strong>Duración:</strong> {selectedMinutes} minutos</p>
                  <p><strong>Total:</strong> RD$ {totalPrice.toLocaleString()}</p>
                </div>
                <p className="mt-4 text-sm opacity-90">La reserva quedará en estado <strong>pendiente de validación</strong> hasta que el equipo administrativo confirme el pago.</p>
                <p className="mt-3 text-xs opacity-80">
                  <strong>Política de cancelación:</strong> con más de {CANCELLATION_POLICY_HOURS}h de anticipación calificas para reembolso. Cancelaciones con menos de {CANCELLATION_POLICY_HOURS}h o no-shows no son reembolsables.
                </p>
              </div>
            </div>
          )}

          <Button className="w-full sm:w-auto" disabled={!canConfirm || submitting} onClick={handleConfirm}>
            {submitting ? 'Enviando reserva...' : 'Enviar reserva y comprobante'}
          </Button>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle className="h-16 w-16 text-primary" />
          <h2 className="mt-4 font-heading text-2xl font-bold text-foreground">Solicitud enviada correctamente</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedMode} en {club.name}<br />
            {selectedDate} · {startTime} – {endTime}<br />
            Espacio: {selectedUnit?.name} ({selectedUnit?.slot_ids.join(' + ')})<br />
            Total reportado: RD$ {totalPrice.toLocaleString()}<br />
            Estado actual: pendiente de validación administrativa.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al inicio</Button>
            <Button onClick={() => navigate('/bookings')}>Ver mis reservas</Button>
          </div>
        </div>
      )}
    </div>
  );
}
