// Datos del comercio exigidos por AZUL. Se muestran en la página de
// políticas de pago y en los avisos de pago (login, checkout, reservas).
// Si cambia la razón social o el contacto, se actualiza solo aquí.
export const LEGAL_INFO = {
  tradeName: 'RealPlay',
  companyName: 'Mango POS S.R.L.',
  supportEmail: 'soporte@mangopos.do',
  phone: '+1 849-267-8985',
  address: 'Jardines Universitarios II, Villa Olímpica, Santiago, República Dominicana 51000',
  country: 'República Dominicana',
  currency: 'Peso dominicano (DOP / RD$)',
  paymentProcessor: 'AZUL',
  paymentPolicyEffectiveDate: '19 de octubre de 2026',
  paymentPolicyUpdatedAt: '19 de octubre de 2026',
};

export const CANCELLATION_POLICY_HOURS = 24;

export const PAYMENT_POLICY_PATH = '/politicas-de-pago';
export const REFUND_POLICY_PATH = `${PAYMENT_POLICY_PATH}#devoluciones`;
