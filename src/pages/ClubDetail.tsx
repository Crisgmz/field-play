import { useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '@/contexts/AppDataContext';
import { Button } from '@/components/ui/button';
import { MapPin, Star, ArrowLeft, Clock, Users } from 'lucide-react';

export default function ClubDetail() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { clubs, fields, pricingRules } = useAppData();

  const club = clubs.find((item) => item.id === clubId);
  const clubFields = fields.filter((item) => item.club_id === clubId);

  if (!club) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Club no encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>Volver</Button>
      </div>
    );
  }

  const allUnits = clubFields.flatMap((f) => f.units);
  const f11Units = allUnits.filter((u) => u.type === 'F11').length;
  const f7Units = allUnits.filter((u) => u.type === 'F7').length;
  const f5Units = allUnits.filter((u) => u.type === 'F5').length;

  const clubPrices = pricingRules.filter((r) => r.club_id === clubId && r.is_active);
  const priceF5 = clubPrices.find((r) => r.field_type === 'F5')?.price_per_hour ?? 0;
  const priceF7 = clubPrices.find((r) => r.field_type === 'F7')?.price_per_hour ?? 0;
  const priceF11 = clubPrices.find((r) => r.field_type === 'F11')?.price_per_hour ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => navigate('/')} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a clubes
      </button>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex h-48 items-center justify-center bg-primary md:h-64">
          <span className="text-6xl text-white">⚽</span>
        </div>
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl font-extrabold text-card-foreground">{club.name}</h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{club.location}</span>
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-[#f89217] text-[#f89217]" />{club.rating}</span>
              </div>
            </div>
            <div className="text-right space-y-0.5">
              {priceF5 > 0 && <div className="text-sm"><span className="text-muted-foreground">F5:</span> <span className="font-semibold text-primary">RD$ {priceF5.toLocaleString()}</span><span className="text-xs text-muted-foreground">/h</span></div>}
              {priceF7 > 0 && <div className="text-sm"><span className="text-muted-foreground">F7:</span> <span className="font-semibold text-primary">RD$ {priceF7.toLocaleString()}</span><span className="text-xs text-muted-foreground">/h</span></div>}
              {priceF11 > 0 && <div className="text-sm"><span className="text-muted-foreground">F11:</span> <span className="font-semibold text-primary">RD$ {priceF11.toLocaleString()}</span><span className="text-xs text-muted-foreground">/h</span></div>}
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{club.description}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
              <span className="field-badge-11 rounded-full px-2 py-0.5 text-[10px] font-bold">F11</span>
              <span className="text-xs text-accent-foreground">{f11Units} cancha completa</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
              <span className="field-badge-7 rounded-full px-2 py-0.5 text-[10px] font-bold">F7</span>
              <span className="text-xs text-accent-foreground">{f7Units} divisiones</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
              <span className="field-badge-5 rounded-full px-2 py-0.5 text-[10px] font-bold">F5</span>
              <span className="text-xs text-accent-foreground">{f5Units} mini-canchas</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{club.open_time} – {club.close_time}</span>
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Configuración modular</span>
          </div>

          <Button className="mt-6 w-full sm:w-auto" onClick={() => navigate(`/clubs/${club.id}/book`)}>
            Reservar ahora
          </Button>
        </div>
      </div>
    </div>
  );
}
