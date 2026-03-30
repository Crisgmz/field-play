import { useParams, useNavigate } from 'react-router-dom';
import { mockClubs, mockFields } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { MapPin, Star, ArrowLeft, Clock, Users } from 'lucide-react';

export default function ClubDetail() {
  const { clubId } = useParams();
  const navigate = useNavigate();

  const club = mockClubs.find((c) => c.id === clubId);
  const field = mockFields.find((f) => f.club_id === clubId);

  if (!club) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Club not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>Go back</Button>
      </div>
    );
  }

  const f11Units = field?.units.filter((u) => u.type === 'F11').length ?? 0;
  const f7Units = field?.units.filter((u) => u.type === 'F7').length ?? 0;
  const f5Units = field?.units.filter((u) => u.type === 'F5').length ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => navigate('/')} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to clubs
      </button>

      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex h-48 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 md:h-64">
          <span className="text-6xl">⚽</span>
        </div>
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl font-extrabold text-card-foreground">{club.name}</h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{club.location}</span>
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-warning text-warning" />{club.rating}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="font-heading text-2xl font-bold text-primary">${club.price_per_hour}</span>
              <span className="text-xs text-muted-foreground">/hour</span>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{club.description}</p>

          {/* Field info */}
          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
              <span className="field-badge-11 rounded-full px-2 py-0.5 text-[10px] font-bold">F11</span>
              <span className="text-xs text-accent-foreground">{f11Units} full field</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
              <span className="field-badge-7 rounded-full px-2 py-0.5 text-[10px] font-bold">F7</span>
              <span className="text-xs text-accent-foreground">{f7Units} pitches</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
              <span className="field-badge-5 rounded-full px-2 py-0.5 text-[10px] font-bold">F5</span>
              <span className="text-xs text-accent-foreground">{f5Units} courts</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />8:00 AM – 10:00 PM</span>
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Modular fields</span>
          </div>

          <Button className="mt-6 w-full sm:w-auto" onClick={() => navigate(`/clubs/${club.id}/book`)}>
            Book Now
          </Button>
        </div>
      </div>
    </div>
  );
}
