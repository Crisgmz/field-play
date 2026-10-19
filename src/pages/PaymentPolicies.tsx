import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Clock3, Mail, MapPin, Phone } from 'lucide-react';
import logoUrl from '@/logos/logo.png';
import PaymentBrands from '@/components/PaymentBrands';
import { CANCELLATION_POLICY_HOURS, LEGAL_INFO } from '@/lib/legal';

const SECTIONS = [
  { id: 'introduccion', label: '1. Introducción' },
  { id: 'moneda', label: '2. Moneda de cobro' },
  { id: 'metodos', label: '3. Métodos de pago aceptados' },
  { id: 'confirmacion', label: '4. Confirmación y comprobantes' },
  { id: 'devoluciones', label: '5. Devoluciones, reembolsos y cancelaciones' },
  { id: 'seguridad', label: '6. Políticas de seguridad' },
  { id: 'pagos', label: '7. Procesamiento de pagos' },
  { id: '3d-secure', label: '8. Autenticación 3D Secure' },
  { id: 'contacto', label: '9. Servicio al Cliente' },
];

// Página pública (sin login) con las políticas que exige AZUL. Se enlaza
// desde login, checkout y Mis reservas; `#devoluciones` apunta directo a
// la sección de reembolsos.
export default function PaymentPolicies() {
  const { hash } = useLocation();

  // El navegador no puede saltar al ancla en la carga inicial porque el
  // contenido lo pinta React después; lo hacemos manualmente.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="RealPlay" className="h-10 w-auto object-contain" />
            <span className="font-heading text-lg font-bold text-foreground">{LEGAL_INFO.tradeName}</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Políticas de pago
        </span>
        <h1 className="mt-4 font-heading text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          Políticas de Pago, Devoluciones y Seguridad
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Información sobre la moneda de cobro, métodos de pago aceptados, devoluciones, reembolsos,
          cancelaciones y las medidas de seguridad aplicadas a los pagos de reservas en {LEGAL_INFO.tradeName}.
        </p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          En vigor desde {LEGAL_INFO.paymentPolicyEffectiveDate} · Actualizado el {LEGAL_INFO.paymentPolicyUpdatedAt}
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">En esta página</p>
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  {section.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-8 rounded-3xl border border-border bg-card p-5 text-sm leading-6 text-muted-foreground shadow-sm sm:p-8 [&_h2]:mb-3 [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_section]:scroll-mt-6 [&_strong]:text-foreground [&_ul]:my-2 [&_ul]:space-y-1">
            <section id="introduccion">
              <h2>1. Introducción</h2>
              <p>
                Estas Políticas de Pago aplican a todas las reservas de canchas y espacios deportivos realizadas a
                través de <strong>{LEGAL_INFO.tradeName}</strong>. Al completar una reserva, el cliente acepta las
                condiciones aquí descritas.
              </p>
              <p>
                El comercio responsable de la operación es <strong>{LEGAL_INFO.companyName}</strong>, con dirección
                permanente en <strong>{LEGAL_INFO.address}</strong>.
              </p>
            </section>

            <section id="moneda">
              <h2>2. Moneda de cobro</h2>
              <p>
                Todos los precios publicados en {LEGAL_INFO.tradeName} y los cargos efectuados a las tarjetas de los
                clientes se realizan en <strong>{LEGAL_INFO.currency}</strong>.
              </p>
            </section>

            <section id="metodos">
              <h2>3. Métodos de pago aceptados</h2>
              <p>{LEGAL_INFO.tradeName} acepta las siguientes formas de pago:</p>
              <ul>
                <li>Tarjetas de crédito y débito <strong>Visa</strong> y <strong>MasterCard</strong>.</li>
                <li>Transferencia bancaria, adjuntando el comprobante en la reserva.</li>
                <li>Efectivo en las instalaciones del club.</li>
              </ul>
              <p>
                Los pagos con tarjeta son procesados a través de <strong>{LEGAL_INFO.paymentProcessor}</strong>{' '}
                (Servicios Digitales Popular), pasarela de pagos autorizada y certificada para operar en la
                República Dominicana.
              </p>
            </section>

            <section id="confirmacion">
              <h2>4. Confirmación y comprobantes</h2>
              <p>
                Cada reserva queda en estado <strong>pendiente</strong> hasta que el club valida el pago. Una vez
                confirmada, el cliente recibe en su correo registrado un comprobante con:
              </p>
              <ul>
                <li>Club y modalidad reservada.</li>
                <li>Fecha y horario de la reserva.</li>
                <li>Total pagado en RD$.</li>
              </ul>
              <p>El historial completo de reservas y su estado está disponible en la sección «Mis reservas».</p>
            </section>

            <section id="devoluciones">
              <h2>5. Devoluciones, reembolsos y cancelaciones</h2>
              <h3>5.1 Cancelación por el cliente</h3>
              <p>
                El cliente puede cancelar su reserva desde «Mis reservas» en cualquier momento antes de la hora de
                inicio.
              </p>
              <h3>5.2 Política de reembolsos</h3>
              <ul>
                <li>
                  Cancelaciones con <strong>{CANCELLATION_POLICY_HOURS} horas o más</strong> de anticipación a la hora
                  de inicio califican para el <strong>reembolso total</strong> del monto pagado.
                </li>
                <li>
                  Cancelaciones con <strong>menos de {CANCELLATION_POLICY_HOURS} horas</strong> de anticipación o la
                  no presentación (no-show) <strong>no son reembolsables</strong>.
                </li>
                <li>
                  Si el club cancela o rechaza una reserva ya pagada, el cliente recibe el reembolso total.
                </li>
              </ul>
              <h3>5.3 Cobros erróneos o duplicados</h3>
              <p>
                Si se identifica un cobro duplicado o un error atribuible a {LEGAL_INFO.tradeName}, el cliente puede
                solicitar la devolución escribiendo a <strong>{LEGAL_INFO.supportEmail}</strong> dentro de los{' '}
                <strong>treinta (30) días</strong> siguientes al cargo.
              </p>
              <h3>5.4 Forma y plazo del reembolso</h3>
              <p>
                Los reembolsos aprobados de pagos con tarjeta se acreditan a la <strong>misma tarjeta</strong> utilizada
                en un plazo de hasta <strong>quince (15) días hábiles</strong>, sujeto a los tiempos del banco emisor.
                Los pagos por transferencia se reembolsan a la cuenta de origen y los pagos en efectivo se devuelven en
                el club.
              </p>
              <h3>5.5 Devoluciones</h3>
              <p>
                Al tratarse del alquiler de un espacio deportivo por tiempo determinado, {LEGAL_INFO.tradeName} no
                maneja devoluciones de productos físicos. Las solicitudes relacionadas con una reserva se rigen por
                las reglas de reembolso descritas arriba.
              </p>
            </section>

            <section id="seguridad">
              <h2>6. Políticas de seguridad para la transmisión de datos</h2>
              <h3>6.1 Sitio web</h3>
              <p>
                Tomamos todas las medidas y precauciones razonables para proteger la información personal de nuestros
                clientes y seguimos las mejores prácticas de la industria para asegurar que la información no sea
                utilizada de manera inapropiada, alterada o destruida.
              </p>
              <p>
                La información de tarjetas de crédito se cifra utilizando la tecnología{' '}
                <strong>Secure Sockets Layer (SSL/TLS)</strong> durante la transmisión, y cuando se requiere almacenar
                información sensible se hace con cifrado <strong>AES-256</strong>. Adicionalmente, seguimos los
                requerimientos del estándar <strong>PCI-DSS</strong> para el manejo de datos de tarjetas.
              </p>
              <h3>6.2 Datos de tarjeta</h3>
              <p>
                {LEGAL_INFO.tradeName} <strong>no almacena</strong> en sus servidores el número completo de la
                tarjeta, el CVV ni la fecha de expiración. Estos datos son enviados directamente al procesador de
                pagos a través de canales cifrados.
              </p>
            </section>

            <section id="pagos">
              <h2>7. Procesamiento de pagos</h2>
              <p>
                Los métodos de pago utilizados por {LEGAL_INFO.tradeName} son servicios de terceros. Estos servicios
                de terceros (<strong>{LEGAL_INFO.paymentProcessor}</strong>) cumplen con todos los estándares de
                seguridad y cifrado para mantener tu información segura, y solo utilizarán la información necesaria
                para completar el proceso requerido.
              </p>
              <p>
                Recomendamos leer las Políticas de Privacidad y Seguridad de estos proveedores para entender mejor cómo
                manejan la información suministrada.
              </p>
            </section>

            <section id="3d-secure">
              <h2>8. Autenticación 3D Secure</h2>
              <p>
                Las transacciones con tarjeta pueden requerir autenticación adicional bajo el protocolo{' '}
                <strong>3D Secure</strong>, gestionada directamente por el banco emisor a través de:
              </p>
              <ul>
                <li><strong>Verified by Visa</strong> para tarjetas Visa.</li>
                <li><strong>MasterCard ID Check</strong> para tarjetas MasterCard.</li>
              </ul>
              <p>
                Cuando el banco lo solicite, el cliente deberá completar el paso de verificación (clave dinámica, OTP,
                app bancaria o biometría) para que la transacción se procese correctamente.
              </p>
            </section>

            <section id="contacto">
              <h2>9. Servicio al Cliente</h2>
              <p>Para consultas, solicitudes de reembolso, cancelaciones o cualquier asunto relacionado con pagos:</p>
              <ul className="!ml-0 !space-y-2 [&_li]:!ml-0 [&_li]:!list-none">
                <li className="flex items-start gap-2">
                  <Mail className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <a href={`mailto:${LEGAL_INFO.supportEmail}`} className="text-foreground hover:text-primary">
                    {LEGAL_INFO.supportEmail}
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <a href={`tel:${LEGAL_INFO.phone.replace(/[^\d+]/g, '')}`} className="text-foreground hover:text-primary">
                    {LEGAL_INFO.phone}
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <strong>{LEGAL_INFO.companyName}</strong>
                    <br />
                    {LEGAL_INFO.address}
                  </span>
                </li>
              </ul>
            </section>
          </article>
        </div>

        <PaymentBrands className="mt-10 border-t border-border pt-6" />
      </main>
    </div>
  );
}
