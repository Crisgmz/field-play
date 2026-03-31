import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FieldType, PhysicalSlotId } from '@/types';
import { findAvailableUnit, getAvailableTimeSlots, getOccupiedSlotIds, getSlotStatuses, getUnitOptions } from '@/lib/availability';
import FieldModeSelector from '@/components/FieldModeSelector';
import TimeSlotPicker from '@/components/TimeSlotPicker';
import FieldSlotsBoard from '@/components/FieldSlotsBoard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';

export default function BookingFlow() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { clubs, fields, bookings, blocks, pricingRules, createBooking } = useAppData();
  const { user } = useAuth();

  const club = clubs.find((item) => item.id === clubId);
  const field = fields.find((item) => item.club_id === clubId);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedMode, setSelectedMode] = useState<FieldType | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  if (!club || !field) {
    return <p className="py-20 text-center text-muted-foreground">Club no encontrado.</p>;
  }

  const pricingRule = pricingRules.find((rule) => rule.club_id === club.id && rule.field_type === selectedMode && rule.is_active);
  const minimumMinutes = pricingRule?.minimum_minutes ?? 60;
  const incrementMinutes = pricingRule?.increment_minutes ?? 30;
  const pricePerHour = pricingRule?.price_per_hour ?? 0;

  const timeline = selectedMode
    ? getAvailableTimeSlots(selectedDate, selectedMode, field, bookings, blocks)
    : [];

  const handleHourToggle = (slotStart: string) => {
    setSelectedUnitId(null);
    setSelectedHours((prev) => {
      if (prev.includes(slotStart)) {
        const indices = prev.map((s) => timeline.findIndex((sl) => sl.start === s)).sort((a, b) => a - b);
        const slotIdx = timeline.findIndex((s) => s.start === slotStart);
        if (slotIdx === indices[0] || slotIdx === indices[indices.length - 1]) {
          return prev.filter((s) => s !== slotStart);
        }
        return prev;
      }
      return [...prev, slotStart].sort();
    });
  };

  const sortedHours = [...selectedHours].sort();
  const startTime = sortedHours[0];
  const endTime = sortedHours.length > 0 ? timeline.find((slot) => slot.start === sortedHours[sortedHours.length - 1])?.end ?? '' : '';
  const selectedMinutes = sortedHours.length * 30;

  const occupiedSlotIds = useMemo(() => {
    if (!selectedMode || !startTime || !endTime) return new Set<PhysicalSlotId>();
    return getOccupiedSlotIds(selectedDate, startTime, endTime, field, bookings, blocks);
  }, [selectedMode, startTime, endTime, selectedDate, field, bookings, blocks]);

  const options = useMemo(() => {
    if (!selectedMode || !startTime || !endTime) return [];
    return getUnitOptions(selectedDate, startTime, endTime, selectedMode, field, bookings, blocks);
  }, [selectedMode, startTime, endTime, selectedDate, field, bookings, blocks]);

  const selectedUnit = options.find((option) => option.id === selectedUnitId) ?? null;
  const slotStatuses = getSlotStatuses(occupiedSlotIds, selectedUnit?.slot_ids ?? []);
  const totalPrice = Math.round((pricePerHour / 60) * selectedMinutes);

  const canConfirm = Boolean(
    selectedMode &&
    startTime &&
    endTime &&
    selectedUnitId &&
    selectedMinutes >= minimumMinutes &&
    selectedMinutes % incrementMinutes === 0,
  );

  const handleConfirm = async () => {
    if (!selectedMode || !user || !startTime || !endTime) return;

    if (selectedMinutes < minimumMinutes) {
      toast.error(`La reserva mínima es de ${minimumMinutes} minutos.`);
      return;
    }

    if (selectedMinutes % incrementMinutes !== 0) {
      toast.error(`Solo se permiten incrementos de ${incrementMinutes} minutos.`);
      return;
    }

    const unit = selectedUnit ?? findAvailableUnit(selectedDate, startTime, endTime, selectedMode, field, bookings, blocks);
    if (!unit) {
      toast.error('No hay una combinación válida disponible para ese horario.');
      return;
    }

    const created = await createBooking({
      user_id: user.id,
      field_unit_id: unit.id,
      field_type: selectedMode,
      date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      total_price: totalPrice,
    });

    if (!created) {
      toast.error('No se pudo crear la reserva.');
      return;
    }

    setStep(4);
    toast.success(`Reservado ${unit.name} de ${startTime} a ${endTime}`);
  };

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
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Seleccionar tipo de juego</h2>
          <p className="mb-6 text-sm text-muted-foreground">La disponibilidad sale de 6 slots físicos reales por cancha.</p>
          <FieldModeSelector selected={selectedMode} onSelect={(type) => { setSelectedMode(type); setSelectedHours([]); setSelectedUnitId(null); }} />
          <Button className="mt-6" disabled={!selectedMode} onClick={() => setStep(2)}>Continuar</Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Elegir fecha</h2>
          <p className="mb-6 text-sm text-muted-foreground">Responsive y simple para móvil: 7 días al frente.</p>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {Array.from({ length: 7 }, (_, i) => {
              const date = new Date();
              date.setDate(date.getDate() + i);
              const dateStr = date.toISOString().split('T')[0];
              const dayName = date.toLocaleDateString('es', { weekday: 'short' });
              const dayNum = date.getDate();
              const isSelected = selectedDate === dateStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => { setSelectedDate(dateStr); setSelectedHours([]); setSelectedUnitId(null); }}
                  className={`flex min-w-[88px] flex-col items-center rounded-xl border px-3 py-3 transition-all ${
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-card-foreground hover:border-primary/50'
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase opacity-70">{dayName}</span>
                  <span className="font-heading text-lg font-bold">{dayNum}</span>
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
            <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Disponibilidad</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
              {selectedDate} · {selectedMode}
            </p>
            {pricingRule && (
              <p className="mb-6 text-sm text-muted-foreground">
                Precio/hora: RD$ {pricePerHour.toLocaleString()} · mínimo {minimumMinutes} min · incremento {incrementMinutes} min
              </p>
            )}
            <TimeSlotPicker slots={timeline} selectedSlots={selectedHours} onSelect={handleHourToggle} maxSlots={8} />
          </div>

          {startTime && endTime && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h3 className="font-heading text-lg font-bold text-foreground">Mapa físico de slots</h3>
                <p className="mt-1 text-sm text-muted-foreground">Verde disponible, rojo ocupado, azul seleccionado.</p>
              </div>
              <FieldSlotsBoard statuses={slotStatuses} options={options} selectedUnitId={selectedUnitId} onSelectUnit={setSelectedUnitId} />
            </div>
          )}

          {selectedUnit && (
            <div className="rounded-lg border border-primary/30 bg-accent p-4 text-sm text-accent-foreground">
              <strong>Resumen:</strong> {selectedUnit.name} · Slots {selectedUnit.slot_ids.join(' + ')} · {startTime} – {endTime} · {selectedMinutes} min · RD$ {totalPrice.toLocaleString()}
            </div>
          )}

          <Button className="w-full sm:w-auto" disabled={!canConfirm} onClick={handleConfirm}>Confirmar reserva</Button>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle className="h-16 w-16 text-primary" />
          <h2 className="mt-4 font-heading text-2xl font-bold text-foreground">¡Reserva confirmada!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedMode} en {club.name}<br />
            {selectedDate} · {startTime} – {endTime}<br />
            Combinación: {selectedUnit?.name} ({selectedUnit?.slot_ids.join(' + ')})<br />
            Total: RD$ {totalPrice.toLocaleString()}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al inicio</Button>
            <Button onClick={() => navigate('/bookings')}>Mis reservas</Button>
          </div>
        </div>
      )}
    </div>
  );
}
