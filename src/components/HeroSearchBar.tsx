import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Search, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldType } from '@/types';

export interface HeroSearchValue {
  location: string;
  date: string;
  gameType: FieldType | '';
}

interface Props {
  locations: string[];
  initial?: Partial<HeroSearchValue>;
  onSearch: (value: HeroSearchValue) => void;
}

const today = () => new Date().toISOString().split('T')[0];

export default function HeroSearchBar({ locations, initial, onSearch }: Props) {
  const [location, setLocation] = useState(initial?.location ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [gameType, setGameType] = useState<FieldType | ''>(initial?.gameType ?? '');

  useEffect(() => {
    onSearch({ location, date, gameType });
  }, [location, date, gameType]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch({ location, date, gameType });
  };

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end sm:gap-2 sm:p-3"
    >
      <label className="flex flex-col gap-1 text-left">
        <span className="px-1 text-xs font-semibold text-foreground">Ubicación</span>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Todas las ubicaciones</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-left">
        <span className="px-1 text-xs font-semibold text-foreground">Fecha</span>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="date"
            value={date}
            min={today()}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </label>

      <label className="flex flex-col gap-1 text-left">
        <span className="px-1 text-xs font-semibold text-foreground">Tipo de juego</span>
        <div className="relative">
          <Trophy className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={gameType}
            onChange={(e) => setGameType(e.target.value as FieldType | '')}
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Cualquiera</option>
            <option value="F5">Fútbol 5</option>
            <option value="F7">Fútbol 7</option>
            <option value="F11">Fútbol 11</option>
          </select>
        </div>
      </label>

      <Button type="submit" size="lg" className="h-11 px-5 sm:px-4">
        <Search className="h-4 w-4" />
        <span className="ml-2 sm:hidden">Buscar</span>
      </Button>
    </form>
  );
}
