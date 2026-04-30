import { ChangeEvent, useState } from 'react';
import { Calendar, MapPin, Clock, Ban, ExternalLink, Upload, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { Booking } from '@/types';

const ACCEPTED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;

export default function MyBookings() {
  const { bookings, clubs, fields, cancelBooking, replacePaymentProof, evaluateCancellation } = useAppData();
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});

  const userBookings = bookings.filter((booking) => booking.user_id === user?.id);

  const openProof = async (booking: Booking) => {
    if (!booking.payment_proof_path) return;
    if (proofUrls[booking.id]) {
      window.open(proofUrls[booking.id], '_blank');
      return;
    }
    const { data, error } = await supabase.storage
      .from('booking-proofs')
      .createSignedUrl(booking.payment_proof_path, 60 * 30);
    if (error || !data?.signedUrl) {
      toast.error('No se pudo abrir el comprobante.');
      return;
    }
    setProofUrls((prev) => ({ ...prev, [booking.id]: data.signedUrl }));
    window.open(data.signedUrl, '_blank');
  };

  const handleProofChange = async (booking: Booking, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
      toast.error('Sube un comprobante en JPG, PNG, WEBP o PDF.');
      return;
    }
    if (file.size > MAX_PROOF_SIZE_BYTES) {
      toast.error('El comprobante no puede exceder 10 MB.');
      return;
    }

    setBusyId(booking.id);
    const result = await replacePaymentProof(booking.id, file);
    setBusyId(null);
    if (result.ok) {
      setProofUrls((prev) => {
        const next = { ...prev };
        delete next[booking.id];
        return next;
      });
      toast.success('Comprobante reemplazado. El club lo revisará.');
    } else {
      toast.error(result.message);
    }
  };

  const openCancelDialog = (booking: Booking) => {
    const check = evaluateCancellation(booking.id);
    if (!check?.allowed) {
      toast.error('Esta reserva ya no se puede cancelar.');
      return;
    }
    setCancelReason('');
    setCancelDialog(booking);
  };

  const submitCancel = async () => {
    if (!cancelDialog) return;
    setBusyId(cancelDialog.id);
    const ok = await cancelBooking(cancelDialog.id, cancelReason);
    setBusyId(null);
    if (ok) {
      const check = evaluateCancellation(cancelDialog.id);
      if (check?.refundEligible) {
        toast.success('Reserva cancelada. Calificas para reembolso, el club te contactará.');
      } else {
        toast.success('Reserva cancelada. Cancelaciones con menos de 24h no son reembolsables.');
      }
      setCancelDialog(null);
      setCancelReason('');
    } else {
      toast.error('No se pudo cancelar la reserva.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-heading text-2xl font-bold text-foreground">Mis reservas</h1>
      <div className="mb-6 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p>Política de cancelación: con más de 24h de anticipación calificas para reembolso. Cancelaciones con menos de 24h o no-shows no son reembolsables.</p>
      </div>

      {userBookings.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Todavía no tienes reservas.</p>
      ) : (
        <div className="space-y-3">
          {userBookings.map((booking) => {
            const field = fields.find((f) => f.units.some((u) => u.id === booking.field_unit_id));
            const unit = field?.units.find((u) => u.id === booking.field_unit_id);
            const club = clubs.find((c) => c.id === field?.club_id);
            const check = evaluateCancellation(booking.id);

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
                <p className="mt-2 text-xs text-muted-foreground">Espacio: {unit?.name}</p>

                {booking.rejection_reason && (
                  <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <p className="font-semibold">Comprobante rechazado</p>
                    <p className="mt-1">{booking.rejection_reason}</p>
                  </div>
                )}

                {booking.cancellation_reason && booking.status === 'cancelled' && !booking.rejection_reason && (
                  <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Motivo de cancelación</p>
                    <p className="mt-1">{booking.cancellation_reason}</p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    booking.status === 'confirmed'
                      ? 'bg-accent text-accent-foreground'
                      : booking.status === 'cancelled'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {booking.status === 'confirmed' ? 'Confirmada' : booking.status === 'cancelled' ? 'Cancelada' : 'Pendiente de validación'}
                  </span>

                  <div className="flex flex-wrap gap-2">
                    {booking.payment_proof_path && (
                      <Button variant="outline" size="sm" onClick={() => void openProof(booking)}>
                        <ExternalLink className="mr-2 h-4 w-4" />Ver comprobante
                      </Button>
                    )}

                    {booking.status === 'pending' && (
                      <label className="inline-flex">
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          className="hidden"
                          onChange={(e) => void handleProofChange(booking, e)}
                          disabled={busyId === booking.id}
                        />
                        <Button asChild variant="outline" size="sm" disabled={busyId === booking.id}>
                          <span><Upload className="mr-2 h-4 w-4" />{busyId === booking.id ? 'Subiendo...' : 'Re-subir'}</span>
                        </Button>
                      </label>
                    )}

                    {booking.status !== 'cancelled' && check?.allowed && (
                      <Button variant="outline" size="sm" onClick={() => openCancelDialog(booking)}>
                        <Ban className="mr-2 h-4 w-4" />Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 className="font-heading text-lg font-bold text-foreground">Cancelar reserva</h2>
            {(() => {
              const check = evaluateCancellation(cancelDialog.id);
              const refundCopy = check?.refundEligible
                ? 'Como cancelas con más de 24h de anticipación, calificas para reembolso. El club te contactará.'
                : 'Cancelaciones con menos de 24h o no-shows no son reembolsables según la política.';
              return (
                <p className="mt-2 text-sm text-muted-foreground">{refundCopy}</p>
              );
            })()}
            <div className="mt-4">
              <label className="text-xs text-muted-foreground">Motivo (opcional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Cuéntale al club por qué cancelas"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelDialog(null)} disabled={busyId === cancelDialog.id}>
                Volver
              </Button>
              <Button className="flex-1 bg-destructive text-destructive-foreground hover:opacity-90" onClick={submitCancel} disabled={busyId === cancelDialog.id}>
                {busyId === cancelDialog.id ? 'Cancelando...' : 'Confirmar cancelación'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
