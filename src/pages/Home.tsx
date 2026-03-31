import { useState } from 'react';
import ClubCard from '@/components/ClubCard';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAppData } from '@/contexts/AppDataContext';

export default function Home() {
  const [search, setSearch] = useState('');
  const { clubs } = useAppData();

  const filtered = clubs.filter(
    (club) =>
      club.is_active &&
      (club.name.toLowerCase().includes(search.toLowerCase()) ||
        club.location.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 rounded-3xl bg-primary p-6 md:p-10 text-white shadow-xl">
        <h1 className="font-heading text-2xl font-extrabold md:text-4xl">
          Reserva tu cancha en minutos
        </h1>
        <p className="mt-2 text-sm text-white/80 md:text-base">
          Encuentra clubes, revisa disponibilidad y confirma tu juego sin llamadas ni hojas de cálculo.
        </p>
        <div className="relative mt-5 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            className="border-none bg-white pl-10 text-slate-900 shadow-sm"
            placeholder="Buscar por club o ubicación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <h2 className="mb-4 font-heading text-lg font-bold text-foreground">Clubes disponibles</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((club) => (
          <ClubCard key={club.id} club={club} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No se encontraron clubes.</p>
      )}
    </div>
  );
}
