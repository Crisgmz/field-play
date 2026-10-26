// Comprobante de pago que recibe el cliente cuando su reserva se confirma.
// AZUL exige que muestre los datos del comercio, moneda, detalle y forma de
// pago. Mantener MERCHANT sincronizado con `src/lib/legal.ts` del frontend.
export const MERCHANT = {
  tradeName: 'RealPlay',
  companyName: 'Club Real Deportivo ADR Santiago, S.R.L.',
  rnc: '132-77209-1',
  supportEmail: 'cclubrealdeportivo@gmail.com',
  phone: '+1 809-714-3567',
  address: 'Calle Los Garcia No. 1, Reparto Imperial, Santiago de los Caballeros, República Dominicana 51000',
};

export interface ReceiptData {
  bookingId?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  clubName?: string;
  clubLocation?: string;
  fieldName?: string;
  unitName?: string;
  fieldType?: string;
  formattedDate?: string;
  startTime?: string;
  endTime?: string;
  totalPrice?: number;
  policyHours?: number;
  paymentMethod?: 'bank_transfer' | 'cash' | 'card';
  // Solo para cobros con tarjeta procesados por AZUL.
  cardBrand?: string;
  cardLast4?: string;
  authorizationCode?: string;
  azulOrderId?: string;
  // ISO; si no viene se usa la hora en que se genera el comprobante.
  paidAt?: string;
  // Origen público de la app para enlazar las políticas.
  appUrl?: string;
}

const PAYMENT_METHOD_LABELS: Record<NonNullable<ReceiptData['paymentMethod']>, string> = {
  bank_transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
  card: 'Tarjeta',
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatPrice = (value: number) =>
  `RD$ ${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPaidAt = (iso?: string) => {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Santo_Domingo',
  }).format(date);
};

export const receiptNumber = (bookingId?: string) =>
  bookingId ? `RP-${bookingId.replace(/-/g, '').slice(0, 8).toUpperCase()}` : null;

const row = (label: string, value?: string | null) =>
  value
    ? `<tr>
        <td style="padding: 6px 0; color: #64748b; font-size: 14px; vertical-align: top;">${label}</td>
        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; text-align: right; vertical-align: top;">${escapeHtml(value)}</td>
      </tr>`
    : '';

const sectionTitle = (title: string) =>
  `<p style="margin: 24px 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; font-weight: bold;">${title}</p>`;

export const receiptSubject = (data: ReceiptData) => {
  const number = receiptNumber(data.bookingId);
  return `Comprobante de pago${number ? ` ${number}` : ''} · Reserva confirmada · ${data.clubName ?? MERCHANT.tradeName}`;
};

export function renderReceiptHtml(data: ReceiptData) {
  const number = receiptNumber(data.bookingId);
  const policyHours = data.policyHours ?? 24;
  const customerName = [data.firstName, data.lastName].filter(Boolean).join(' ');
  const method = data.paymentMethod ? PAYMENT_METHOD_LABELS[data.paymentMethod] : null;
  const card = data.cardLast4 ? `${data.cardBrand ?? 'Tarjeta'} •••• ${data.cardLast4}` : null;
  const schedule = data.startTime && data.endTime ? `${data.startTime} – ${data.endTime}` : null;
  const space = [data.fieldName, data.unitName].filter(Boolean).join(' · ') || null;
  const total = typeof data.totalPrice === 'number' ? formatPrice(data.totalPrice) : null;
  const policyUrl = data.appUrl ? `${data.appUrl.replace(/\/$/, '')}/politicas-de-pago` : null;
  const privacyUrl = data.appUrl ? `${data.appUrl.replace(/\/$/, '')}/politica-de-privacidad` : null;

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto; padding: 24px; background: #f8fafc;">
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align: top;">
              <p style="margin: 0; font-size: 20px; font-weight: bold; color: #0f172a;">${MERCHANT.tradeName}</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #475569;">
                ${escapeHtml(MERCHANT.companyName)}<br />
                RNC ${MERCHANT.rnc}<br />
                ${escapeHtml(MERCHANT.address)}<br />
                ${MERCHANT.phone} · ${MERCHANT.supportEmail}
              </p>
            </td>
            <td style="vertical-align: top; text-align: right; white-space: nowrap; padding-left: 16px;">
              <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: bold;">Comprobante de pago</p>
              ${number ? `<p style="margin: 4px 0 0; font-size: 16px; font-weight: bold; color: #0f172a;">${number}</p>` : ''}
              <p style="margin: 4px 0 0; font-size: 12px; color: #475569;">${formatPaidAt(data.paidAt)}</p>
            </td>
          </tr>
        </table>

        <div style="margin: 24px 0 0; padding: 14px 16px; border-radius: 14px; background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; font-size: 14px;">
          <strong>Pago recibido · Reserva confirmada.</strong> El espacio está reservado a tu nombre.
        </div>

        ${sectionTitle('Cliente')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Nombre', customerName || null)}
          ${row('Correo', data.email)}
        </table>

        ${sectionTitle('Detalle de la reserva')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Club', data.clubName)}
          ${row('Ubicación', data.clubLocation)}
          ${row('Cancha / espacio', space)}
          ${row('Modalidad', data.fieldType)}
          ${row('Fecha', data.formattedDate)}
          ${row('Horario', schedule)}
        </table>

        ${sectionTitle('Pago')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Forma de pago', method)}
          ${row('Tarjeta', card)}
          ${row('Código de autorización', data.authorizationCode)}
          ${row('Referencia AZUL', data.azulOrderId)}
          ${row('Procesado por', data.authorizationCode ? 'AZUL' : null)}
          ${row('Moneda', 'Peso dominicano (DOP / RD$)')}
        </table>
        ${total ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px; border-top: 2px solid #0f172a;">
          <tr>
            <td style="padding: 12px 0 0; font-size: 16px; font-weight: bold; color: #0f172a;">Total pagado</td>
            <td style="padding: 12px 0 0; font-size: 20px; font-weight: bold; color: #0f172a; text-align: right;">${total}</td>
          </tr>
        </table>` : ''}

        <div style="margin: 24px 0 0; padding: 14px 16px; border-radius: 14px; background: #f1f5f9; color: #334155; font-size: 13px;">
          <strong>Política de cancelación y reembolso:</strong> si cancelas con ${policyHours} horas o más de anticipación, recibes el reembolso total.
          Cancelaciones con menos de ${policyHours}h o no-shows no son reembolsables.
          Los reembolsos con tarjeta se acreditan a la misma tarjeta en hasta 15 días hábiles.
          ${policyUrl ? `<br /><a href="${policyUrl}" style="color: #047857;">Políticas de pago y devoluciones</a>` : ''}
          ${privacyUrl ? ` · <a href="${privacyUrl}" style="color: #047857;">Política de privacidad</a>` : ''}
        </div>

        <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
          ¿Preguntas sobre este cobro? Escríbenos a ${MERCHANT.supportEmail} o llama al ${MERCHANT.phone}.
          Conserva este comprobante para cualquier reclamación.
        </p>
      </div>
    </div>
  `;
}
