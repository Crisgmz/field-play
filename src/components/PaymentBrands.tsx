import { Lock } from 'lucide-react';
import visaLogo from '@/logos/payments/visa.png';
import mastercardLogo from '@/logos/payments/mastercard.png';
import popularLogo from '@/logos/payments/servicios-digitales-popular.png';
import threeDSecureLogo from '@/logos/payments/verified-visa-mastercard.png';
import { LEGAL_INFO, PAYMENT_POLICY_PATH, PRIVACY_POLICY_PATH, REFUND_POLICY_PATH } from '@/lib/legal';

type PaymentBrandsProps = {
  align?: 'center' | 'start';
  className?: string;
};

// Logos de marcas aceptadas + enlaces a las políticas, requisito de AZUL
// en las pantallas donde el usuario entra o paga. Los logos van sobre
// fondo blanco fijo para que se vean igual en modo oscuro.
export default function PaymentBrands({ align = 'center', className = '' }: PaymentBrandsProps) {
  const justify = align === 'center' ? 'justify-center text-center' : 'justify-start text-left';

  return (
    <div className={`space-y-3 ${className}`}>
      <p className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground ${justify}`}>
        <Lock className="h-3 w-3" />
        Pagos seguros procesados por {LEGAL_INFO.paymentProcessor}
      </p>

      <div className={`flex flex-wrap items-center gap-2 ${justify}`}>
        <span className="flex h-9 items-center rounded-lg border border-border bg-white px-3">
          <img src={visaLogo} alt="Visa" className="h-4 w-auto object-contain" loading="lazy" />
        </span>
        <span className="flex h-9 items-center rounded-lg border border-border bg-white px-3">
          <img src={mastercardLogo} alt="Mastercard" className="h-6 w-auto object-contain" loading="lazy" />
        </span>
        <span className="flex h-9 items-center rounded-lg border border-border bg-white px-2.5">
          <img src={threeDSecureLogo} alt="Verified by Visa · Mastercard ID Check" className="h-7 w-auto object-contain" loading="lazy" />
        </span>
        <span className="flex h-9 items-center rounded-lg border border-border bg-white px-2.5">
          <img src={popularLogo} alt="AZUL · Servicios Digitales Popular" className="h-6 w-auto object-contain" loading="lazy" />
        </span>
      </div>

      {/* Nueva pestaña: en el checkout no queremos perder la reserva en curso. */}
      <p className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${justify}`}>
        <a href={PAYMENT_POLICY_PATH} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          Políticas de pago
        </a>
        <a href={REFUND_POLICY_PATH} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          Devoluciones y reembolsos
        </a>
        <a href={PRIVACY_POLICY_PATH} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          Política de privacidad
        </a>
      </p>
    </div>
  );
}
