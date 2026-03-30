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
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  if (!club || !field) {
    return <p className="py-20 text-center text-muted-foreground">Club not found</p>;
  }

  const slots = selectedMode
    ? getAvailableTimeSlots(selectedDate, selectedMode, field.units, mockBookings, mockBlocks)
    : [];

  const handleConfirm = () => {
    if (!selectedMode || !selectedSlot) return;
    const endTime = `${String(parseInt(selectedSlot.split(':')[0]) + 1).padStart(2, '0')}:00`;
    const unit = findAvailableUnit(selectedDate, selectedSlot, endTime, selectedMode, field.units, mockBookings, mockBlocks);
    if (!unit) {
      toast.error('No available unit for this slot');
      return;
    }
    setStep(4);
    toast.success(`Booked ${unit.name} (${selectedMode}) at ${selectedSlot}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => step > 1 ? setStep((s) => (s - 1) as any) : navigate(`/clubs/${clubId}`)} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {step > 1 ? 'Back' : 'Back to club'}
      </button>

      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-border'}`} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Select Play Mode</h2>
          <p className="mb-6 text-sm text-muted-foreground">Choose your preferred format at {club.name}</p>
          <FieldModeSelector selected={selectedMode} onSelect={(t) => { setSelectedMode(t); setSelectedSlot(null); }} />
          <Button className="mt-6" disabled={!selectedMode} onClick={() => setStep(2)}>Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Pick a Date</h2>
          <p className="mb-6 text-sm text-muted-foreground">Select when you want to play</p>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date('2026-03-30');
              d.setDate(d.getDate() + i);
              const dateStr = d.toISOString().split('T')[0];
              const dayName = d.toLocaleDateString('en', { weekday: 'short' });
              const dayNum = d.getDate();
              const isSelected = selectedDate === dateStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => { setSelectedDate(dateStr); setSelectedSlot(null); }}
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
          <Button className="mt-6" onClick={() => setStep(3)}>Continue</Button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="mb-1 font-heading text-xl font-bold text-foreground">Choose Time Slot</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
            {selectedDate} · {selectedMode}
          </p>
          <TimeSlotPicker slots={slots} selectedSlot={selectedSlot} onSelect={setSelectedSlot} />
          <Button className="mt-6" disabled={!selectedSlot} onClick={handleConfirm}>Confirm Booking</Button>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle className="h-16 w-16 text-primary" />
          <h2 className="mt-4 font-heading text-2xl font-bold text-foreground">Booking Confirmed!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedMode} at {club.name}<br />
            {selectedDate} · {selectedSlot} – {String(parseInt(selectedSlot!.split(':')[0]) + 1).padStart(2, '0')}:00
          </p>
          <div className="mt-8 flex gap-3">
            <Button variant="outline" onClick={() => navigate('/')}>Back to Home</Button>
            <Button onClick={() => navigate('/bookings')}>My Bookings</Button>
          </div>
        </div>
      )}
    </div>
  );
}
