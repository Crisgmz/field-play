import { Calendar, MapPin, Clock, Ban } from 'lucide-react';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export default function MyBookings() {
  const { bookings, clubs, fields, cancelBooking } = useAppData();
  const { user } = useAuth();

  const userBookings = bookings.filter((booking) => booking.user_id === user?.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">Mis reservas</h1>

      {userBookings.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Todavía no tienes reservas.</p>
      ) : (
        <div className="space-y-3">
          {userBookings.map((booking) => {
            const field = fields.find((f) => f.units.some((u) => u.id === booking.field_unit_id));
            const unit = field?.units.find((u) => u.id === booking.field_unit_id);
            const club = clubs.find((c) => c.id === field?.club_id);

            return (
              <div key={booking.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-card-foreground">{club?.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />{club?.location}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    booking.field_type === 'F11' ? 'field-badge-11' : booking.field_type === 'F7' ? 'field-badge-7' : 'field-badge-5'
                  }`}>{booking.field_type}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{booking.date}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{booking.start_time} – {booking.end_time}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Unidad: {unit?.name}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    booking.status === 'confirmed'
                      ? 'bg-accent text-accent-foreground'
                      : booking.status === 'cancelled'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-secondary text-secondary-foreground'
                  }`}>{booking.status}</span>
                  {booking.status === 'confirmed' && (
                    <Button variant="outline" size="sm" onClick={() => void cancelBooking(booking.id)}>
                      <Ban className="mr-2 h-4 w-4" />Cancelar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
