// Datos del comercio exigidos por AZUL. Se muestran en la página de
// políticas de pago y en los avisos de pago (login, checkout, reservas).
// Si cambia la razón social o el contacto, se actualiza solo aquí.
export const LEGAL_INFO = {
  tradeName: 'RealPlay',
  companyName: 'Club Real Deportivo ADR Santiago, S.R.L.',
  rnc: '132-77209-1',
  supportEmail: 'cclubrealdeportivo@gmail.com',
  phone: '+1 809-714-3567',
  address: 'Calle Los Garcia No. 1, Reparto Imperial, Santiago de los Caballeros, República Dominicana 51000',
  country: 'República Dominicana',
  currency: 'Peso dominicano (DOP / RD$)',
  paymentProcessor: 'AZUL',
  paymentPolicyEffectiveDate: '19 de octubre de 2026',
  paymentPolicyUpdatedAt: '19 de octubre de 2026',
  privacyPolicyEffectiveDate: '23 de octubre de 2026',
  privacyPolicyUpdatedAt: '23 de octubre de 2026',
};

export const CANCELLATION_POLICY_HOURS = 24;

export const PAYMENT_POLICY_PATH = '/politicas-de-pago';
export const REFUND_POLICY_PATH = `${PAYMENT_POLICY_PATH}#devoluciones`;
export const PRIVACY_POLICY_PATH = '/politica-de-privacidad';
