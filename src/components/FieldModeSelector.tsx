import { FieldType } from '@/types';
import { Users } from 'lucide-react';

interface Props {
  selected: FieldType | null;
  onSelect: (type: FieldType) => void;
}

const modes: { type: FieldType; label: string; players: string; units: number; colorClass: string }[] = [
  { type: 'F11', label: 'Football 11', players: '11 vs 11', units: 1, colorClass: 'field-badge-11' },
  { type: 'F7', label: 'Football 7', players: '7 vs 7', units: 3, colorClass: 'field-badge-7' },
  { type: 'F5', label: 'Football 5', players: '5 vs 5', units: 6, colorClass: 'field-badge-5' },
];

export default function FieldModeSelector({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {modes.map((mode) => {
        const isSelected = selected === mode.type;
        return (
          <button
            key={mode.type}
            onClick={() => onSelect(mode.type)}
            className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all ${
              isSelected
                ? 'border-primary bg-accent shadow-sm'
                : 'border-border bg-card hover:border-primary/30 hover:bg-accent/50'
            }`}
          >
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${mode.colorClass}`}>
              {mode.type}
            </span>
            <span className="font-heading text-sm font-bold text-card-foreground">{mode.label}</span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {mode.players}
            </div>
            <span className="text-[10px] text-muted-foreground">{mode.units} {mode.units === 1 ? 'field' : 'fields'} available</span>
          </button>
        );
      })}
    </div>
  );
}
