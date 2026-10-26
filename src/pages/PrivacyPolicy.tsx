import LegalPageLayout, { LegalContactList } from '@/components/LegalPageLayout';
import { LEGAL_INFO } from '@/lib/legal';

const SECTIONS = [
  { id: 'introduccion', label: '1. Introducción' },
  { id: 'informacion', label: '2. Información que recopilamos' },
  { id: 'uso', label: '3. Cómo usamos la información' },
  { id: 'bases', label: '4. Bases para el tratamiento' },
  { id: 'compartimos', label: '5. Con quién compartimos' },
  { id: 'cookies', label: '6. Cookies y almacenamiento local' },
  { id: 'retencion', label: '7. Retención' },
  { id: 'derechos', label: '8. Derechos del titular' },
  { id: 'seguridad', label: '9. Seguridad' },
  { id: 'menores', label: '10. Datos de menores' },
  { id: 'transferencias', label: '11. Transferencias internacionales' },
  { id: 'cambios', label: '12. Cambios a esta política' },
  { id: 'contacto', label: '13. Contacto' },
];

// Página pública (sin login) con la política de privacidad que exige AZUL.
export default function PrivacyPolicy() {
  return (
    <LegalPageLayout
      badge="Política de privacidad"
      title="Política de Privacidad"
      description={`Qué datos personales recopila ${LEGAL_INFO.tradeName}, para qué los usa, con quién los comparte, cómo los protege y qué derechos tienes sobre tu información.`}
      effectiveDate={LEGAL_INFO.privacyPolicyEffectiveDate}
      updatedAt={LEGAL_INFO.privacyPolicyUpdatedAt}
      sections={SECTIONS}
    >
      <section id="introduccion">
        <h2>1. Introducción</h2>
        <p>
          En <strong>{LEGAL_INFO.tradeName}</strong> respetamos la privacidad de nuestros usuarios. Esta Política
          explica cómo recopilamos, usamos, almacenamos, compartimos y protegemos la información personal cuando
          creas una cuenta, reservas una cancha, realizas un pago o te comunicas con nosotros.
        </p>
        <p>
          El responsable del tratamiento de tus datos es <strong>{LEGAL_INFO.companyName}</strong> (RNC{' '}
          {LEGAL_INFO.rnc}), con domicilio en <strong>{LEGAL_INFO.address}</strong>. Tratamos tus datos conforme a
          la <strong>Ley No. 172-13</strong> sobre protección integral de los datos personales de la República
          Dominicana.
        </p>
      </section>

      <section id="informacion">
        <h2>2. Información que recopilamos</h2>
        <h3>2.1 Datos de registro</h3>
        <ul>
          <li>Nombre y apellido.</li>
          <li>Correo electrónico.</li>
          <li>Número de teléfono.</li>
          <li>Cédula de identidad, cuando decides proporcionarla.</li>
          <li>Contraseña, que se almacena cifrada y nunca en texto legible.</li>
        </ul>
        <h3>2.2 Datos de reservas</h3>
        <p>
          Club, cancha, modalidad, fecha, horario, monto, forma de pago, estado de la reserva y, si cancelas, el
          motivo que indiques.
        </p>
        <h3>2.3 Comprobantes de transferencia</h3>
        <p>
          Si pagas por transferencia bancaria, guardamos la imagen o el PDF del comprobante que subes para que el
          club pueda validar el pago.
        </p>
        <h3>2.4 Datos de pago con tarjeta</h3>
        <p>
          Los pagos con tarjeta son procesados por <strong>{LEGAL_INFO.paymentProcessor}</strong>.{' '}
          {LEGAL_INFO.tradeName} <strong>no recibe ni almacena</strong> el número completo de la tarjeta, el CVV
          ni la fecha de expiración. Solo conservamos la marca, los últimos cuatro dígitos y el código de
          autorización de la transacción para emitir tu comprobante y atender reclamaciones.
        </p>
        <h3>2.5 Datos técnicos</h3>
        <p>
          Dirección IP, tipo de navegador y dispositivo, fechas y horas de acceso, y registros técnicos necesarios
          para mantener tu sesión y la seguridad del servicio.
        </p>
      </section>

      <section id="uso">
        <h2>3. Cómo usamos la información</h2>
        <ul>
          <li>Crear y administrar tu cuenta.</li>
          <li>Procesar tus reservas y pagos.</li>
          <li>Enviarte confirmaciones, comprobantes de pago y avisos sobre tus reservas.</li>
          <li>Permitir al club validar pagos y preparar tu espacio.</li>
          <li>Atender cancelaciones, reembolsos, reclamaciones y solicitudes de soporte.</li>
          <li>Prevenir fraude, accesos no autorizados y usos indebidos.</li>
          <li>Cumplir obligaciones legales, fiscales y contables.</li>
          <li>Mejorar el funcionamiento del servicio.</li>
        </ul>
      </section>

      <section id="bases">
        <h2>4. Bases para el tratamiento</h2>
        <ul>
          <li>Tu consentimiento, otorgado al crear tu cuenta.</li>
          <li>La prestación del servicio de reservas que solicitas.</li>
          <li>El cumplimiento de obligaciones legales.</li>
          <li>Nuestro interés legítimo en mantener la seguridad del servicio y prevenir fraude.</li>
        </ul>
      </section>

      <section id="compartimos">
        <h2>5. Con quién compartimos la información</h2>
        <p>Solo compartimos los datos necesarios para prestar el servicio:</p>
        <ul>
          <li>
            <strong>El club donde reservas</strong>: tu nombre, datos de contacto y el detalle de la reserva y del
            pago.
          </li>
          <li>
            <strong>{LEGAL_INFO.paymentProcessor}</strong> (Servicios Digitales Popular): para procesar los pagos
            con tarjeta.
          </li>
          <li>
            <strong>Proveedores tecnológicos</strong>: alojamiento y base de datos (Supabase) y envío de correos
            (Resend), que tratan los datos solo por cuenta nuestra.
          </li>
          <li><strong>Autoridades competentes</strong>, cuando la ley lo exija.</li>
        </ul>
        <p><strong>No vendemos ni alquilamos</strong> tu información personal.</p>
      </section>

      <section id="cookies">
        <h2>6. Cookies y almacenamiento local</h2>
        <p>
          Usamos el almacenamiento local del navegador para mantener tu sesión iniciada y recordar preferencias.
          No usamos cookies publicitarias ni compartimos tu navegación con redes de publicidad.
        </p>
      </section>

      <section id="retencion">
        <h2>7. Retención</h2>
        <p>
          Conservamos tus datos mientras tu cuenta esté activa y, después, durante el tiempo necesario para cumplir
          obligaciones fiscales y contables o resolver reclamaciones pendientes. Luego los eliminamos o
          anonimizamos.
        </p>
      </section>

      <section id="derechos">
        <h2>8. Derechos del titular</h2>
        <p>Conforme a la Ley No. 172-13, puedes:</p>
        <ul>
          <li>Acceder a tus datos personales.</li>
          <li>Rectificar datos inexactos o desactualizados.</li>
          <li>Solicitar la cancelación o eliminación de tus datos, cuando proceda.</li>
          <li>Oponerte a determinados tratamientos.</li>
          <li>Retirar tu consentimiento.</li>
        </ul>
        <p>
          Puedes actualizar tu nombre y teléfono desde tu perfil. Para cualquier otra solicitud, escríbenos a{' '}
          <strong>{LEGAL_INFO.supportEmail}</strong>; responderemos en un plazo razonable.
        </p>
      </section>

      <section id="seguridad">
        <h2>9. Seguridad</h2>
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger tu información: cifrado en tránsito
          (SSL/TLS), contraseñas cifradas, acceso restringido según el rol de cada usuario y proveedores que cumplen
          estándares de seguridad reconocidos. Ningún sistema es completamente infalible, pero trabajamos para
          minimizar los riesgos.
        </p>
      </section>

      <section id="menores">
        <h2>10. Datos de menores</h2>
        <p>
          La creación de cuentas y las reservas están dirigidas a personas mayores de 18 años. Las reservas para
          actividades de menores deben realizarlas sus padres o tutores desde su propia cuenta.
        </p>
      </section>

      <section id="transferencias">
        <h2>11. Transferencias internacionales</h2>
        <p>
          Algunos de nuestros proveedores tecnológicos pueden alojar la información fuera de la República
          Dominicana. En esos casos exigimos medidas de protección razonables conforme a la ley aplicable.
        </p>
      </section>

      <section id="cambios">
        <h2>12. Cambios a esta política</h2>
        <p>
          Podemos actualizar esta Política cuando cambien nuestros servicios o la normativa aplicable. Publicaremos
          la versión vigente en esta página con su fecha de actualización.
        </p>
      </section>

      <section id="contacto">
        <h2>13. Contacto</h2>
        <p>Para consultas sobre privacidad o para ejercer tus derechos:</p>
        <LegalContactList />
      </section>
    </LegalPageLayout>
  );
}
