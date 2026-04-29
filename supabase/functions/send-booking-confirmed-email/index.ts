const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingConfirmedRequest {
  email: string;
  firstName?: string;
  clubName?: string;
  clubLocation?: string;
  fieldName?: string;
  unitName?: string;
  fieldType?: string;
  date?: string;
  formattedDate?: string;
  startTime?: string;
  endTime?: string;
  totalPrice?: number;
  policyHours?: number;
}

const formatPrice = (value?: number) => {
  if (typeof value !== 'number') return null;
  return `RD$ ${value.toLocaleString('es-DO')}`;
};

const htmlTemplate = (body: BookingConfirmedRequest) => {
  const price = formatPrice(body.totalPrice);
  const policyHours = body.policyHours ?? 24;
  const items = [
    body.clubName ? `<li><strong>Club:</strong> ${body.clubName}</li>` : '',
    body.clubLocation ? `<li><strong>Ubicación:</strong> ${body.clubLocation}</li>` : '',
    body.fieldName ? `<li><strong>Cancha:</strong> ${body.fieldName}</li>` : '',
    body.unitName ? `<li><strong>Espacio:</strong> ${body.unitName}</li>` : '',
    body.fieldType ? `<li><strong>Modalidad:</strong> ${body.fieldType}</li>` : '',
    body.formattedDate ? `<li><strong>Fecha:</strong> ${body.formattedDate}</li>` : '',
    body.startTime && body.endTime ? `<li><strong>Horario:</strong> ${body.startTime} – ${body.endTime}</li>` : '',
    price ? `<li><strong>Total pagado:</strong> ${price}</li>` : '',
  ].filter(Boolean).join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7; max-width: 640px; margin: 0 auto; padding: 24px; background: #f8fafc;">
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 32px;">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857;">Field Play · Confirmación</p>
        <h2 style="margin: 0 0 12px; font-size: 28px; line-height: 1.2; color: #0f172a;">Tu reserva está confirmada</h2>
        <p>Hola${body.firstName ? ` ${body.firstName}` : ''},</p>
        <p>Validamos tu pago. Tu reserva queda <strong>confirmada</strong> y el espacio está reservado a tu nombre.</p>
        ${items ? `<ul style="padding-left: 20px; margin: 16px 0; color: #334155;">${items}</ul>` : ''}
        <div style="margin: 24px 0; padding: 16px; border-radius: 14px; background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46;">
          <strong>Política de cancelación:</strong> puedes cancelar con más de ${policyHours} horas de anticipación y solicitar reembolso. Cancelaciones con menos de ${policyHours}h o no-shows no son reembolsables.
        </div>
        <p>¡Que tengan un buen partido!</p>
        <p style="margin-top: 24px;">Saludos,<br /><strong>Equipo Field Play</strong></p>
      </div>
    </div>
  `;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('BOOKING_EMAIL_FROM') ?? 'Field Play <onboarding@resend.dev>';

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as BookingConfirmedRequest;

    if (!body.email) {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [body.email],
        subject: `Reserva confirmada · ${body.clubName ?? 'Field Play'}`,
        html: htmlTemplate(body),
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({ error: 'Could not send confirmation email', details: resendData }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, data: resendData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
