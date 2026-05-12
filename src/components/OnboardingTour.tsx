import { useEffect, useState } from 'react';
import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Onboarding del cliente: al primer login después de registrarse,
 * mostramos un diálogo "¿Te muestro cómo reservar?". Si acepta, corre
 * un tour de 5 pasos con react-joyride. Si rechaza o completa el tour,
 * marca `has_seen_onboarding = true` para no volver a mostrarlo.
 *
 * Se monta a nivel App. Solo dispara para usuarios con rol cliente
 * cuya flag `has_seen_onboarding` esté en false. Admins/staff no lo
 * ven (su panel es distinto).
 */
export default function OnboardingTour() {
  const { user, refreshProfile } = useAuth();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [runTour, setRunTour] = useState(false);

  // Cuando carga el user y vemos que no ha visto el tour, abrimos
  // el dialog de bienvenida. Solo para clientes.
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'client') return;
    if (user.has_seen_onboarding) return;
    setWelcomeOpen(true);
  }, [user?.id, user?.role, user?.has_seen_onboarding]);

  const markSeen = async () => {
    try {
      await supabase.rpc('rpc_mark_onboarding_seen');
      await refreshProfile();
    } catch (err) {
      // Silencioso: si falla, el tour solo no se marca como visto y
      // volverá a salir el próximo login. No es crítico.
      console.warn('No se pudo marcar onboarding como visto:', err);
    }
  };

  const handleStart = () => {
    setWelcomeOpen(false);
    setRunTour(true);
  };

  const handleSkip = async () => {
    setWelcomeOpen(false);
    await markSeen();
  };

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(data.status)) {
      setRunTour(false);
      await markSeen();
    }
  };

  const steps: Step[] = [
    {
      target: '[data-tour="sport-filter"]',
      title: '1. Elige tu deporte',
      content: 'Filtra los clubes según el deporte que vas a jugar — fútbol o pádel.',
      disableBeacon: true,
      placement: 'bottom',
    },
    {
      target: '[data-tour="club-grid"]',
      title: '2. Selecciona un club',
      content: 'Aquí ves los clubes disponibles. Haz click en cualquier card para ver sus canchas y horarios.',
      placement: 'top',
    },
    {
      // Step "imaginario" — no apunta a un elemento porque sería en
      // otra ruta. Usamos body con placement center.
      target: 'body',
      title: '3. Elige fecha y hora',
      content: 'Dentro del club seleccionas la fecha primero, luego el horario disponible y la cancha que prefieras.',
      placement: 'center',
    },
    {
      target: 'body',
      title: '4. Confirma y paga',
      content: 'Elige el método de pago. Si pagas por transferencia, sube el comprobante para que el club lo valide.',
      placement: 'center',
    },
    {
      target: 'body',
      title: '¡Listo!',
      content: 'Tu reserva queda pendiente hasta que el club valide el pago. Recibirás un correo cuando se confirme. ¡Que disfrutes tu partido!',
      placement: 'center',
    },
  ];

  if (!user || user.role !== 'client') return null;

  return (
    <>
      <Dialog
        open={welcomeOpen}
        onOpenChange={(open) => { if (!open) void handleSkip(); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle>
                  {user.first_name ? `Hola ${user.first_name},` : 'Bienvenido,'} ¿te muestro cómo reservar?
                </DialogTitle>
                <DialogDescription>
                  En menos de 1 minuto te enseño los 4 pasos para reservar tu primera cancha.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => void handleSkip()}>
              Saltar
            </Button>
            <Button onClick={handleStart}>
              <Sparkles className="mr-2 h-4 w-4" />
              Sí, muéstrame
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Joyride
        run={runTour}
        steps={steps}
        continuous
        showProgress
        showSkipButton
        disableScrolling={false}
        callback={(data) => void handleJoyrideCallback(data)}
        locale={{
          back: 'Atrás',
          close: 'Cerrar',
          last: 'Listo',
          next: 'Siguiente',
          skip: 'Saltar tour',
        }}
        styles={{
          options: {
            primaryColor: 'hsl(var(--primary))',
            zIndex: 10000,
            arrowColor: 'hsl(var(--card))',
            backgroundColor: 'hsl(var(--card))',
            textColor: 'hsl(var(--foreground))',
            overlayColor: 'rgba(0, 0, 0, 0.55)',
          },
          buttonNext: {
            backgroundColor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            borderRadius: '0.5rem',
          },
          buttonBack: {
            color: 'hsl(var(--muted-foreground))',
          },
          buttonSkip: {
            color: 'hsl(var(--muted-foreground))',
          },
        }}
      />
    </>
  );
}
