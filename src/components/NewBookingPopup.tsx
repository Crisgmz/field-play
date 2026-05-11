import { useNavigate } from 'react-router-dom';
import { BellRing, ExternalLink, X } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatBookingDate, formatTime12h } from '@/lib/bookingFormat';

/**
 * Popup global de "nueva reserva entrante". Lo monta AppLayout y se
 * dispara cuando realtime detecta un booking pendiente recién creado
 * por un cliente desde la web (no por admin/staff manual).
 *
 * El sonido lo dispara directamente AppDataContext al setear el state,
 * no este componente — así no depende de que el popup esté montado.
 */
export default function NewBookingPopup() {
  const navigate = useNavigate();
  const { newBookingPopup, dismissNewBookingPopup, clubs, fields, profiles } = useAppData();
  const { isAdminLevel } = useAuth();

  // Solo admin/staff debería ver este popup. Defensa redundante por si
  // se llegara a montar en un layout que no filtre por rol.
  if (!isAdminLevel || !newBookingPopup) return null;

  const booking = newBookingPopup;
  const owner = profiles.find((p) => p.id === booking.user_id) ?? null;
  const club = clubs.find((c) => c.id === booking.club_id) ?? null;
  const unit = fields
    .flatMap((f) => f.units)
    .find((u) => u.id === booking.field_unit_id) ?? null;

  const handleViewDetail = () => {
    dismissNewBookingPopup();
    // Navega a la sección de reservas; el listado ya estará filtrado
    // por defecto a "más recientes" así que la nueva sale arriba.
    navigate('/admin/bookings');
  };

  return (
    <Dialog
      open={Boolean(newBookingPopup)}
      onOpenChange={(open) => { if (!open) dismissNewBookingPopup(); }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <BellRing className="h-5 w-5" />
            </div>
            <DialogTitle className="text-left">¡Nueva reserva!</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Un cliente acaba de reservar. Revisa el comprobante (si aplica) y confirma la reserva.
          </p>

          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">Cliente</span>
              <span className="font-semibold text-foreground">
                {owner ? `${owner.first_name} ${owner.last_name}`.trim() : 'No identificado'}
              </span>
            </div>
            {owner?.email && (
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Email</span>
                <span className="truncate text-foreground">{owner.email}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">Club</span>
              <span className="font-medium text-foreground">{club?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">Modalidad</span>
              <span className="font-medium text-foreground">
                {booking.field_type}{unit ? ` · ${unit.name}` : ''}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">Fecha</span>
              <span className="font-medium text-foreground">{formatBookingDate(booking.date)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">Horario</span>
              <span className="font-medium text-foreground">
                {formatTime12h(booking.start_time)} – {formatTime12h(booking.end_time)}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="font-heading text-base font-bold text-foreground">
                RD$ {booking.total_price.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={dismissNewBookingPopup}>
            <X className="mr-2 h-4 w-4" />
            Cerrar
          </Button>
          <Button onClick={handleViewDetail}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Ver reservas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
