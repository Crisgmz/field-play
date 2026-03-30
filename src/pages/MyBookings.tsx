import { mockBookings, mockClubs, mockFields } from '@/data/mockData';
import { Calendar, MapPin, Clock } from 'lucide-react';

export default function MyBookings() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">My Bookings</h1>

      {mockBookings.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No bookings yet</p>
      ) : (
        <div className="space-y-3">
          {mockBookings.map((booking) => {
            const field = mockFields.find((f) => f.units.some((u) => u.id === booking.field_unit_id));
            const unit = field?.units.find((u) => u.id === booking.field_unit_id);
            const club = mockClubs.find((c) => c.id === field?.club_id);

            return (
              <div key={booking.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-card-foreground">{club?.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{club?.location}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    booking.field_type === 'F11' ? 'field-badge-11' : booking.field_type === 'F7' ? 'field-badge-7' : 'field-badge-5'
                  }`}>{booking.field_type}</span>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{booking.date}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{booking.start_time} – {booking.end_time}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Unit: {unit?.name}</p>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  booking.status === 'confirmed' ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive'
                }`}>{booking.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
