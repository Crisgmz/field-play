import { Club, FieldType } from '@/types';
import { CalendarCheck, CalendarClock, Heart, MapPin, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppData } from '@/contexts/AppDataContext';
import { getAvailableTimeSlotsV2 } from '@/lib/availability';

interface Props {
  club: Club;
  preselectedType?: FieldType | null;
}

const NEXT_AVAILABILITY_LOOKAHEAD_DAYS = 14;
const FALLBACK_IMAGE_GRADIENTS = [
  'linear-gradient(135deg, #2f8a4d 0%, #114b2e 100%)',
  'linear-gradient(135deg, #1f6f7a 0%, #0d3a44 100%)',
  'linear-gradient(135deg, #2a6f3b 0%, #0f3b1f 100%)',
];

function pickGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_IMAGE_GRADIENTS[hash % FALLBACK_IMAGE_GRADIENTS.length];
}

function formatNextAvailability(date: string, today: string): string {
  if (date === today) return 'Hoy';
  const target = new Date(`${date}T12:00:00`);
  const todayDate = new Date(`${today}T12:00:00`);
  const diffDays = Math.round((target.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Mañana';
  return new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' }).format(target);
}

export default function ClubCard({ club, preselectedType }: Props) {
  const navigate = useNavigate();
  const { pricingRules, fields, bookings, blocks, profiles, getVenueConfig } = useAppData();
  const [favorited, setFavorited] = useState(false);

  const clubRules = pricingRules.filter((r) => r.club_id === club.id && r.is_active);
  const minPrice = clubRules.length > 0 ? Math.min(...clubRules.map((r) => r.price_per_hour)) : 0;
  const owner = profiles.find((p) => p.id === club.owner_id) ?? null;
  const isFeatured = club.rating >= 4.5;

  const nextAvailabilityLabel = useMemo(() => {
    const clubFields = fields.filter((f) => f.club_id === club.id && f.is_active !== false);
    if (clubFields.length === 0) return null;
    const venueConfig = getVenueConfig(club.id);
    const todayStr = new Date().toISOString().split('T')[0];
    const types: FieldType[] = preselectedType ? [preselectedType] : ['F5', 'F7', 'F11'];

    for (let i = 0; i < NEXT_AVAILABILITY_LOOKAHEAD_DAYS; i += 1) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      for (const field of clubFields) {
        for (const type of types) {
          const slots = getAvailableTimeSlotsV2(dateStr, type, field, bookings, blocks, club, venueConfig);
          if (slots.some((slot) => slot.available)) {
            return formatNextAvailability(dateStr, todayStr);
          }
        }
      }
    }
    return null;
  }, [club, fields, bookings, blocks, getVenueConfig, preselectedType]);

  const handleNavigate = () => {
    const params = new URLSearchParams();
    if (preselectedType) params.set('type', preselectedType);
    const query = params.toString();
    navigate(`/clubs/${club.id}${query ? `?${query}` : ''}`);
  };

  const toggleFavorite = (event: React.MouseEvent) => {
    event.stopPropagation();
    setFavorited((current) => !current);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div
        className="relative aspect-[16/10] w-full"
        style={{ background: club.image ? undefined : pickGradient(club.id) }}
      >
        {club.image && (
          <img src={club.image} alt={club.name} className="h-full w-full object-cover" loading="lazy" />
        )}
        {!club.image && (
          <div className="flex h-full w-full items-center justify-center text-5xl text-white/90">⚽</div>
        )}

        {isFeatured && (
          <span className="absolute left-3 top-3 rounded-full bg-sky-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
            Destacado
          </span>
        )}

        {minPrice > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm">
            RD$ {minPrice.toLocaleString()}/hr
          </span>
        )}

        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={favorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition-transform hover:scale-105"
        >
          <Heart className={`h-4 w-4 ${favorited ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground'}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-white">
            <Star className="h-3 w-3 fill-white text-white" />
            {club.rating.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">Rating del club</span>
        </div>

        <div>
          <h3 className="font-heading text-base font-bold text-card-foreground">{club.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{club.description}</p>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {club.location}
          </div>
          <div className="flex items-center gap-1.5">
            {nextAvailabilityLabel ? (
              <>
                <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Próxima disponibilidad: <span className="font-semibold text-emerald-600">{nextAvailabilityLabel}</span></span>
              </>
            ) : (
              <>
                <CalendarClock className="h-3.5 w-3.5" />
                <span>Sin disponibilidad próxima</span>
              </>
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {(owner?.first_name?.[0] ?? '?').toUpperCase()}
            </div>
            <span className="text-sm font-medium text-foreground">
              {owner ? `${owner.first_name}` : 'Anfitrión'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleNavigate}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            Reservar
          </button>
        </div>
      </div>
    </article>
  );
}
