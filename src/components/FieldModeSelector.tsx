import { FieldType } from '@/types';
import { Users } from 'lucide-react';

interface Props {
  selected: FieldType | null;
  onSelect: (type: FieldType) => void;
  availableTypes?: FieldType[];
}

const modes = [
  { type: 'F5' as FieldType, label: 'Fútbol 5', players: '5 vs 5', desc: 'Mini cancha', colorClass: 'field-badge-5' },
  { type: 'F7' as FieldType, label: 'Fútbol 7', players: '7 vs 7', desc: 'Media cancha', colorClass: 'field-badge-7' },
  { type: 'F11' as FieldType, label: 'Fútbol 11', players: '11 vs 11', desc: 'Cancha completa', colorClass: 'field-badge-11' },
];

export default function FieldModeSelector({ selected, onSelect, availableTypes }: Props) {
  const visibleModes = availableTypes
    ? modes.filter((mode) => availableTypes.includes(mode.type))
    : modes;

  if (visibleModes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Esta cancha aún no tiene modalidades configuradas.
      </p>
    );
  }

  const cols = visibleModes.length === 1 ? 'sm:grid-cols-1' : visibleModes.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';

  return (
    <div className={`grid grid-cols-1 gap-3 ${cols}`}>
      {visibleModes.map((mode) => {
        const isSelected = selected === mode.type;
        return (
          <button
            key={mode.type}
            onClick={() => onSelect(mode.type)}
            className={`group relative flex min-h-[138px] flex-col items-center justify-center gap-2 rounded-2xl border-2 p-5 text-center transition-all ${
              isSelected
                ? 'border-primary bg-accent shadow-sm'
                : 'border-border bg-card hover:border-primary/30 hover:bg-accent/10'
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
            <span className="text-[11px] text-muted-foreground">{mode.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
