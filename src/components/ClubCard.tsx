import { Club } from '@/types';
import { MapPin, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '@/contexts/AppDataContext';

export default function ClubCard({ club }: { club: Club }) {
  const navigate = useNavigate();
  const { pricingRules } = useAppData();

  const clubRules = pricingRules.filter((r) => r.club_id === club.id && r.is_active);
  const minPrice = clubRules.length > 0
    ? Math.min(...clubRules.map((r) => r.price_per_hour))
    : 0;

  return (
    <button
      onClick={() => navigate(`/clubs/${club.id}`)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-accent">
        <div className="flex h-full items-center justify-center bg-primary">
          <span className="text-4xl text-white">⚽</span>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-xs font-semibold backdrop-blur-sm">
          <Star className="h-3 w-3 fill-[#f89217] text-[#f89217]" />
          {club.rating}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <h3 className="font-heading text-base font-bold text-card-foreground transition-colors group-hover:text-primary">
          {club.name}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {club.location}
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-xs text-muted-foreground">Desde</span>
          <span className="font-heading text-lg font-bold text-primary">RD$ {minPrice.toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">/hora</span>
        </div>
      </div>
    </button>
  );
}
