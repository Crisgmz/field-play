import { useMemo, useState, useEffect } from 'react';
import { TimeSlot } from '@/types';
import { Clock, Timer } from 'lucide-react';
import { formatTime12h } from '@/lib/bookingFormat';

interface Props {
  slots: TimeSlot[];
  selectedSlots: string[];
  onSelectionChange: (slots: string[]) => void;
  minMinutes?: number;
  maxMinutes?: number;
  incrementMinutes?: number;
  slotDurationMinutes?: number;
}

interface DurationOption {
  label: string;
  minutes: number;
  slotsNeeded: number;
  available: boolean;
}

export default function TimeSlotPicker({
  slots,
  selectedSlots,
  onSelectionChange,
  minMinutes = 60,
  maxMinutes = 240,
  incrementMinutes = 30,
  slotDurationMinutes = 30,
}: Props) {
  const [selectedStart, setSelectedStart] = useState<string | null>(null);

  // Sync selectedStart from parent's selectedSlots
  useEffect(() => {
    if (selectedSlots.length > 0) {
      const sorted = [...selectedSlots].sort();
      setSelectedStart(sorted[0]);
    }
  }, []);

  // Build duration options based on pricing rules
  const durationOptions = useMemo((): DurationOption[] => {
    const options: DurationOption[] = [];
    for (let mins = minMinutes; mins <= maxMinutes; mins += incrementMinutes) {
      const hours = mins / 60;
      const slotsNeeded = Math.ceil(mins / slotDurationMinutes);
      options.push({
        label: hours % 1 === 0 ? `${hours}h` : `${Math.floor(hours)}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}h`,
        minutes: mins,
        slotsNeeded,
        available: true, // Will be recalculated per start time
      });
    }
    return options;
  }, [minMinutes, maxMinutes, incrementMinutes, slotDurationMinutes]);

  // Calculate which durations are available for the selected start
  const availableDurations = useMemo((): DurationOption[] => {
    if (!selectedStart) return durationOptions.map((d) => ({ ...d, available: false }));

    const startIdx = slots.findIndex((s) => s.start === selectedStart);
    if (startIdx === -1) return durationOptions.map((d) => ({ ...d, available: false }));

    return durationOptions.map((opt) => {
      // Check if we have enough consecutive available slots from startIdx
      let available = true;
      for (let i = 0; i < opt.slotsNeeded; i++) {
        const slot = slots[startIdx + i];
        if (!slot || !slot.available) {
          available = false;
          break;
        }
      }
      return { ...opt, available };
    });
  }, [selectedStart, slots, durationOptions]);

  // Current duration in minutes based on selected slots
  const currentDuration = selectedSlots.length * slotDurationMinutes;

  // Determine which start times can fit at least the minimum duration
  const startTimeAvailability = useMemo(() => {
    const minSlotsNeeded = Math.ceil(minMinutes / slotDurationMinutes);
    return slots.map((slot, idx) => {
      if (!slot.available) return false;
      for (let i = 0; i < minSlotsNeeded; i++) {
        const s = slots[idx + i];
        if (!s || !s.available) return false;
      }
      return true;
    });
  }, [slots, minMinutes, slotDurationMinutes]);

  const handleStartSelect = (start: string) => {
    setSelectedStart(start);
    // Auto-select minimum duration
    const startIdx = slots.findIndex((s) => s.start === start);
    const minSlots = Math.ceil(minMinutes / slotDurationMinutes);
    const newSelection: string[] = [];
    for (let i = 0; i < minSlots; i++) {
      const slot = slots[startIdx + i];
      if (slot?.available) newSelection.push(slot.start);
    }
    onSelectionChange(newSelection);
  };

  const handleDurationSelect = (minutes: number) => {
    if (!selectedStart) return;
    const startIdx = slots.findIndex((s) => s.start === selectedStart);
    const slotsNeeded = Math.ceil(minutes / slotDurationMinutes);
    const newSelection: string[] = [];
    for (let i = 0; i < slotsNeeded; i++) {
      const slot = slots[startIdx + i];
      if (slot?.available) newSelection.push(slot.start);
    }
    onSelectionChange(newSelection);
  };

  // Compute end time label
  const endTimeLabel = useMemo(() => {
    if (selectedSlots.length === 0) return '';
    const sorted = [...selectedSlots].sort();
    const lastSlotStart = sorted[sorted.length - 1];
    const lastSlot = slots.find((s) => s.start === lastSlotStart);
    return lastSlot?.end ?? '';
  }, [selectedSlots, slots]);

  // Group slots by time-of-day
  const groupedSlots = useMemo(() => {
    const morning: { slot: TimeSlot; canStart: boolean; idx: number }[] = [];
    const afternoon: { slot: TimeSlot; canStart: boolean; idx: number }[] = [];
    const evening: { slot: TimeSlot; canStart: boolean; idx: number }[] = [];

    slots.forEach((slot, idx) => {
      const hour = parseInt(slot.start.split(':')[0], 10);
      const entry = { slot, canStart: startTimeAvailability[idx], idx };
      if (hour < 12) morning.push(entry);
      else if (hour < 18) afternoon.push(entry);
      else evening.push(entry);
    });

    return { morning, afternoon, evening };
  }, [slots, startTimeAvailability]);

  const renderTimeGroup = (label: string, items: { slot: TimeSlot; canStart: boolean; idx: number }[]) => {
    if (items.length === 0) return null;
    return (
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="flex flex-wrap gap-2">
          {items.map(({ slot, canStart }) => {
            const isSelected = slot.start === selectedStart;
            const disabled = !slot.available || !canStart;
            return (
              <button
                key={slot.start}
                disabled={disabled}
                onClick={() => handleStartSelect(slot.start)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  disabled
                    ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-40'
                    : isSelected
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent/20'
                }`}
              >
                {formatTime12h(slot.start)}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Start time */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">¿A qué hora quieres jugar?</span>
        </div>
        <div className="space-y-4">
          {renderTimeGroup('Mañana', groupedSlots.morning)}
          {renderTimeGroup('Tarde', groupedSlots.afternoon)}
          {renderTimeGroup('Noche', groupedSlots.evening)}
        </div>
      </div>

      {/* Step 2: Duration */}
      {selectedStart && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">¿Cuánto tiempo?</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableDurations.map((opt) => {
              const isActive = currentDuration === opt.minutes;
              return (
                <button
                  key={opt.minutes}
                  disabled={!opt.available}
                  onClick={() => handleDurationSelect(opt.minutes)}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                    !opt.available
                      ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-40'
                      : isActive
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent/20'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      {selectedStart && currentDuration > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            <Clock className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
            {formatTime12h(selectedStart)} – {formatTime12h(endTimeLabel)}
            <span className="ml-2 text-muted-foreground">({currentDuration} min)</span>
          </p>
        </div>
      )}
    </div>
  );
}
