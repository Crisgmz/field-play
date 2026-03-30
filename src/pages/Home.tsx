import { mockClubs } from '@/data/mockData';
import ClubCard from '@/components/ClubCard';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export default function Home() {
  const [search, setSearch] = useState('');

  const filtered = mockClubs.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 md:p-10">
        <h1 className="font-heading text-2xl font-extrabold text-primary-foreground md:text-3xl">
          Find & Book Your Pitch
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">
          Browse clubs, pick your format, and play.
        </p>
        <div className="relative mt-5 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="border-none bg-card pl-10 shadow-sm"
            placeholder="Search clubs or locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Clubs grid */}
      <h2 className="mb-4 font-heading text-lg font-bold text-foreground">Available Clubs</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((club) => (
          <ClubCard key={club.id} club={club} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No clubs found.</p>
      )}
    </div>
  );
}
