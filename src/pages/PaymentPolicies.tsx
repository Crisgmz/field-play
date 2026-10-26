import LegalPageLayout, { LegalContactList } from '@/components/LegalPageLayout';
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
  return (
    <LegalPageLayout
      badge="Políticas de pago"
      title="Políticas de Pago, Devoluciones y Seguridad"
      description={`Información sobre la moneda de cobro, métodos de pago aceptados, devoluciones, reembolsos, cancelaciones y las medidas de seguridad aplicadas a los pagos de reservas en ${LEGAL_INFO.tradeName}.`}
      effectiveDate={LEGAL_INFO.paymentPolicyEffectiveDate}
      updatedAt={LEGAL_INFO.paymentPolicyUpdatedAt}
      sections={SECTIONS}
    >
      <section id="introduccion">
        <h2>1. Introducción</h2>
        <p>
          Estas Políticas de Pago aplican a todas las reservas de canchas y espacios deportivos realizadas a
          través de <strong>{LEGAL_INFO.tradeName}</strong>. Al completar una reserva, el cliente acepta las
          condiciones aquí descritas.
        </p>
        <p>
          El comercio responsable de la operación es <strong>{LEGAL_INFO.companyName}</strong> (RNC{' '}
          {LEGAL_INFO.rnc}), con dirección permanente en <strong>{LEGAL_INFO.address}</strong>.
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
        <LegalContactList />
      </section>
    </LegalPageLayout>
  );
}
