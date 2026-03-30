import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockClubs, mockFields, mockBookings, mockBlocks } from '@/data/mockData';
import { FieldType } from '@/types';
import { getAvailableTimeSlots, findAvailableUnit } from '@/lib/availability';
import FieldModeSelector from '@/components/FieldModeSelector';
import TimeSlotPicker from '@/components/TimeSlotPicker';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

export default function BookingFlow() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const club = mockClubs.find((c) => c.id === clubId);
  const field = mockFields.find((f) => f.club_id === clubId);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedMode, setSelectedMode] = useState<FieldType | null>(null);
  const [selectedDate, setSelectedDate] = useState('2026-03-30');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);

  if (!club || !field) {
    return <p className="py-20 text-center text-muted-foreground">Club not found</p>;
  }

  const slots = selectedMode
    ? getAvailableTimeSlots(selectedDate, selectedMode, field.units, mockBookings, mockBlocks)
    : [];

  const handleSlotToggle = (slotStart: string) => {
    setSelectedSlots(prev => {
      if (prev.includes(slotStart)) {
        // Deselect: only allow removing from ends
        const indices = prev.map(s => slots.findIndex(sl => sl.start === s)).sort((a, b) => a - b);
        const slotIdx = slots.findIndex(s => s.start === slotStart);
        if (slotIdx === indices[0] || slotIdx === indices[indices.length - 1]) {
          return prev.filter(s => s !== slotStart);
        }
        return prev;
      }
      return [...prev, slotStart];
    });
  };

  // Check all selected consecutive slots have available units
  const canConfirm = () => {
    if (!selectedMode || selectedSlots.length === 0) return false;
    const sorted = [...selectedSlots].sort();
    for (const slotStart of sorted) {
      const slotIdx = slots.findIndex(s => s.start === slotStart);
      if (slotIdx < 0 || !slots[slotIdx].available) return false;
    }
    return true;
  };

  const handleConfirm = () => {
    if (!selectedMode || selectedSlots.length === 0) return;
    const sorted = [...selectedSlots].sort();
    const startTime = sorted[0];
    const lastSlot = sorted[sorted.length - 1];
    const endTime = `${String(parseInt(lastSlot.split(':')[0]) + 1).padStart(2, '0')}:00`;

    // Verify availability for the full range
    const unit = findAvailableUnit(selectedDate, startTime, endTime, selectedMode, field.units, mockBookings, mockBlocks);
    if (!unit) {
      toast.error('No hay unidad disponible para este rango horario');
      return;
    }
    setStep(4);
    toast.success(`Reservado ${unit.name} (${selectedMode}) de ${startTime} a ${endTime}`);
  };

  const sortedSlots = [...selectedSlots].sort();
  const startTime = sortedSlots[0];
  const endTime = sortedSlots.length > 0
    ? `${String(parseInt(sortedSlots[sortedSlots.length - 1].split(':')[0]) + 1).padStart(2, '0')}:00`
    : '';

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => step > 1 ? setStep((s) => (s - 1) as any) : navigate(`/clubs/${clubId}`)} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {step > 1 ? 'Volver' : 'Volver al club'}
      </button>

      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-border'}`} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Seleccionar Modo de Juego</h2>
          <p className="mb-6 text-sm text-muted-foreground">Elige tu formato preferido en {club.name}</p>
          <FieldModeSelector selected={selectedMode} onSelect={(t) => { setSelectedMode(t); setSelectedSlots([]); }} />
          <Button className="mt-6" disabled={!selectedMode} onClick={() => setStep(2)}>Continuar</Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Elegir Fecha</h2>
          <p className="mb-6 text-sm text-muted-foreground">Selecciona cuándo quieres jugar</p>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date('2026-03-30');
              d.setDate(d.getDate() + i);
              const dateStr = d.toISOString().split('T')[0];
              const dayName = d.toLocaleDateString('es', { weekday: 'short' });
              const dayNum = d.getDate();
              const isSelected = selectedDate === dateStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => { setSelectedDate(dateStr); setSelectedSlots([]); }}
                  className={`flex flex-col items-center rounded-xl border px-4 py-3 transition-all ${
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
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Elegir Horario</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
            {selectedDate} · {selectedMode}
          </p>
          <TimeSlotPicker slots={slots} selectedSlots={selectedSlots} onSelect={handleSlotToggle} maxSlots={4} />
          {selectedSlots.length > 0 && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-accent p-3 text-sm text-accent-foreground">
              <strong>Resumen:</strong> {startTime} – {endTime} ({selectedSlots.length}h) · ${club.price_per_hour * selectedSlots.length}
            </div>
          )}
          <Button className="mt-6" disabled={!canConfirm()} onClick={handleConfirm}>Confirmar Reserva</Button>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle className="h-16 w-16 text-primary" />
          <h2 className="mt-4 font-heading text-2xl font-bold text-foreground">¡Reserva Confirmada!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedMode} en {club.name}<br />
            {selectedDate} · {startTime} – {endTime} ({selectedSlots.length}h)<br />
            Total: ${club.price_per_hour * selectedSlots.length}
          </p>
          <div className="mt-8 flex gap-3">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Inicio</Button>
            <Button onClick={() => navigate('/bookings')}>Mis Reservas</Button>
          </div>
        </div>
      )}
    </div>
  );
}
