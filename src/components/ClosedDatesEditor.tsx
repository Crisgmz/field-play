import { useState } from 'react';
import { CalendarOff, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  closedDates: string[];
  onChange: (dates: string[]) => void;
  disabled?: boolean;
}

const formatDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('es-DO', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export default function ClosedDatesEditor({ closedDates, onChange, disabled }: Props) {
  const [pending, setPending] = useState('');

  const sorted = [...closedDates].sort();

  const handleAdd = () => {
    if (!pending) return;
    if (sorted.includes(pending)) {
      setPending('');
      return;
    }
    onChange([...sorted, pending]);
    setPending('');
  };

  const handleRemove = (date: string) => {
    onChange(sorted.filter((d) => d !== date));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Días cerrados puntuales</p>
        <p className="text-[10px] text-muted-foreground">Feriados o cierres por mantenimiento</p>
      </div>

      <div className="flex gap-2">
        <Input
          type="date"
          value={pending}
          min={new Date().toISOString().split('T')[0]}
          onChange={(e) => setPending(e.target.value)}
          disabled={disabled}
          className="h-9 text-xs"
        />
        <Button size="sm" onClick={handleAdd} disabled={disabled || !pending}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Añadir
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          No hay días cerrados configurados.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((date) => (
            <li
              key={date}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 text-foreground">
                <CalendarOff className="h-3.5 w-3.5 text-destructive" />
                {formatDate(date)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(date)}
                disabled={disabled}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
