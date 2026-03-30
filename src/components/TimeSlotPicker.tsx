import { TimeSlot } from '@/types';
import { Clock } from 'lucide-react';

interface Props {
  slots: TimeSlot[];
  selectedSlot: string | null;
  onSelect: (start: string) => void;
}

export default function TimeSlotPicker({ slots, selectedSlot, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {slots.map((slot) => {
        const isSelected = selectedSlot === slot.start;
        return (
          <button
            key={slot.start}
            disabled={!slot.available}
            onClick={() => onSelect(slot.start)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm transition-all ${
              !slot.available
                ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-50'
                : isSelected
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
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
  );
}
