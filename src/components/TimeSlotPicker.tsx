import { TimeSlot } from '@/types';
import { Clock } from 'lucide-react';

interface Props {
  slots: TimeSlot[];
  selectedSlots: string[];
  onSelect: (start: string) => void;
  maxSlots?: number;
}

export default function TimeSlotPicker({ slots, selectedSlots, onSelect, maxSlots = 4 }: Props) {
  const handleClick = (slotStart: string) => {
    onSelect(slotStart);
  };

  // Check if a slot can be selected (must be consecutive with existing selection)
  const canSelect = (slotStart: string) => {
    if (selectedSlots.length === 0) return true;
    if (selectedSlots.includes(slotStart)) return true; // can deselect
    if (selectedSlots.length >= maxSlots) return false;

    const slotIndex = slots.findIndex(s => s.start === slotStart);
    const selectedIndices = selectedSlots.map(s => slots.findIndex(sl => sl.start === s)).sort((a, b) => a - b);
    const minIdx = selectedIndices[0];
    const maxIdx = selectedIndices[selectedIndices.length - 1];

    // Must extend from either end
    return slotIndex === minIdx - 1 || slotIndex === maxIdx + 1;
  };

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Selecciona de 1 a {maxSlots} horas consecutivas. Seleccionadas: {selectedSlots.length}h
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {slots.map((slot) => {
          const isSelected = selectedSlots.includes(slot.start);
          const selectable = slot.available && canSelect(slot.start);
          return (
            <button
              key={slot.start}
              disabled={!slot.available || (!isSelected && !selectable)}
              onClick={() => handleClick(slot.start)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm transition-all ${
                !slot.available
                  ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-50'
                  : isSelected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : !selectable
                  ? 'cursor-not-allowed border-border bg-muted/50 text-muted-foreground opacity-40'
                  : 'border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span className="font-medium">{slot.start}</span>
              </div>
              <span className="text-[10px] opacity-75">
                {slot.available ? `${slot.availableUnits}/${slot.totalUnits} open` : 'Full'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
