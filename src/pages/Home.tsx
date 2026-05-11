import { useMemo, useState } from 'react';
import { CircleDot, Target } from 'lucide-react';
import ClubCard from '@/components/ClubCard';
import HeroSearchBar, { HeroSearchValue } from '@/components/HeroSearchBar';
import { ClubGridSkeleton } from '@/components/skeletons';
import { useAppData } from '@/contexts/AppDataContext';
import { FieldType, Sport } from '@/types';
import { getAvailableTimeSlotsV2 } from '@/lib/availability';

type SportFilter = 'all' | Sport;

export default function Home() {
  const { clubs, fields, bookings, blocks, getVenueConfig, loading } = useAppData();
  const [filters, setFilters] = useState<HeroSearchValue>({ location: '', date: '', gameType: '' });
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');

  const locations = useMemo(() => {
    const set = new Set<string>();
    clubs.forEach((club) => {
      if (club.is_active && club.location) set.add(club.location);
    });
    return [...set].sort();
  }, [clubs]);

  const filtered = useMemo(() => {
    return clubs.filter((club) => {
      if (!club.is_active) return false;

      if (filters.location && club.location !== filters.location) return false;

      const clubFields = fields.filter(
        (f) => f.club_id === club.id
          && f.is_active !== false
          && (sportFilter === 'all' || (f.sport ?? 'soccer') === sportFilter),
      );

      if (sportFilter !== 'all' && clubFields.length === 0) return false;

      if (filters.gameType) {
        const hasType = clubFields.some((f) => f.units.some((u) => u.type === filters.gameType && u.is_active !== false));
        if (!hasType) return false;
      }

      if (filters.date) {
        if (clubFields.length === 0) return false;
        const venueConfig = getVenueConfig(club.id);
        const types: FieldType[] = filters.gameType
          ? [filters.gameType as FieldType]
          : sportFilter === 'padel'
            ? ['PADEL']
            : sportFilter === 'soccer'
              ? ['F5', 'F7', 'F11']
              : ['F5', 'F7', 'F11', 'PADEL'];
        const anyAvailable = clubFields.some((field) =>
          types.some((type) =>
            getAvailableTimeSlotsV2(filters.date, type, field, bookings, blocks, club, venueConfig)
              .some((slot) => slot.available),
          ),
        );
        if (!anyAvailable) return false;
      }

      return true;
    });
  }, [clubs, fields, bookings, blocks, getVenueConfig, filters, sportFilter]);

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8">
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-emerald-700 px-4 pt-10 pb-28 text-white sm:px-6 lg:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.25) 0, transparent 50%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl">
          <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
            Reserva tu cancha en minutos
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/85 md:text-base">
            Encuentra clubes cerca de ti, revisa disponibilidad real y confirma tu juego sin llamadas.
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto -mt-16 max-w-6xl">
          <HeroSearchBar locations={locations} initial={filters} onSearch={setFilters} />
        </div>
      </section>

      <section className="px-4 pt-10 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSportFilter('all')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                sportFilter === 'all'
                  ? 'bg-foreground text-background'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSportFilter('soccer')}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                sportFilter === 'soccer'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <CircleDot className="h-3.5 w-3.5" />
              Fútbol
            </button>
            <button
              type="button"
              onClick={() => setSportFilter('padel')}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                sportFilter === 'padel'
                  ? 'bg-sky-600 text-white'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <Target className="h-3.5 w-3.5" />
              Pádel
            </button>
          </div>

          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">Clubes disponibles</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {loading
                  ? 'Cargando...'
                  : filtered.length === 1
                    ? '1 club encontrado'
                    : `${filtered.length} clubes encontrados`}
              </p>
            </div>
          </div>

          {loading ? (
            <ClubGridSkeleton count={6} />
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No encontramos clubes con esos filtros. Prueba ajustar la búsqueda.
              </p>
            </div>
          ) : (
            <div className="grid animate-fade-in gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((club) => (
                <ClubCard
                  key={club.id}
                  club={club}
                  preselectedType={filters.gameType ? (filters.gameType as FieldType) : null}
                  preselectedSport={sportFilter === 'all' ? null : sportFilter}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
