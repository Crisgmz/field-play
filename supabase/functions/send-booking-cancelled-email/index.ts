const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingCancelledRequest {
  email: string;
  firstName?: string;
  clubName?: string;
  fieldName?: string;
  unitName?: string;
  fieldType?: string;
  date?: string;
  formattedDate?: string;
  startTime?: string;
  endTime?: string;
  totalPrice?: number;
  reason?: string;
  cancelledBy?: 'client' | 'admin';
  isRejection?: boolean;
}

const formatPrice = (value?: number) => {
  if (typeof value !== 'number') return null;
  return `RD$ ${value.toLocaleString('es-DO')}`;
};

const htmlTemplate = (body: BookingCancelledRequest) => {
  const price = formatPrice(body.totalPrice);
  const items = [
    body.clubName ? `<li><strong>Club:</strong> ${body.clubName}</li>` : '',
    body.fieldName ? `<li><strong>Cancha:</strong> ${body.fieldName}</li>` : '',
    body.unitName ? `<li><strong>Espacio:</strong> ${body.unitName}</li>` : '',
    body.fieldType ? `<li><strong>Modalidad:</strong> ${body.fieldType}</li>` : '',
    body.formattedDate ? `<li><strong>Fecha:</strong> ${body.formattedDate}</li>` : '',
    body.startTime && body.endTime ? `<li><strong>Horario:</strong> ${body.startTime} – ${body.endTime}</li>` : '',
    price ? `<li><strong>Monto:</strong> ${price}</li>` : '',
  ].filter(Boolean).join('');

  const heading = body.isRejection
    ? 'No pudimos validar tu pago'
    : body.cancelledBy === 'admin'
      ? 'Tu reserva fue cancelada por el club'
      : 'Tu reserva fue cancelada';

  const intro = body.isRejection
    ? 'Revisamos el comprobante que adjuntaste y no pudimos validar el pago. Tu reserva queda cancelada.'
    : body.cancelledBy === 'admin'
      ? 'El club canceló tu reserva. Si esto fue un error, ponte en contacto con ellos directamente.'
      : 'Tu reserva queda cancelada. El horario vuelve a estar disponible para otros clientes.';

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7; max-width: 640px; margin: 0 auto; padding: 24px; background: #f8fafc;">
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 32px;">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #b91c1c;">Field Play · Cancelación</p>
        <h2 style="margin: 0 0 12px; font-size: 26px; line-height: 1.2; color: #0f172a;">${heading}</h2>
        <p>Hola${body.firstName ? ` ${body.firstName}` : ''},</p>
        <p>${intro}</p>
        ${items ? `<ul style="padding-left: 20px; margin: 16px 0; color: #334155;">${items}</ul>` : ''}
        ${body.reason ? `
          <div style="margin: 16px 0; padding: 16px; border-radius: 14px; background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d;">
            <strong>Motivo:</strong> ${body.reason}
          </div>
        ` : ''}
        <p>Si crees que se trata de un error o quieres volver a reservar, escríbenos respondiendo a este correo.</p>
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

    const body = (await req.json()) as BookingCancelledRequest;

    if (!body.email) {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = body.isRejection
      ? 'No validamos tu pago'
      : `Reserva cancelada · ${body.clubName ?? 'Field Play'}`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [body.email],
        subject,
        html: htmlTemplate(body),
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({ error: 'Could not send cancellation email', details: resendData }), {
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
