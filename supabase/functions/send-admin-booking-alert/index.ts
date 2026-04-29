const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminAlertRequest {
  adminEmail: string;
  adminName?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clubName?: string;
  fieldName?: string;
  unitName?: string;
  fieldType?: string;
  date?: string;
  formattedDate?: string;
  startTime?: string;
  endTime?: string;
  totalPrice?: number;
  proofUrl?: string;
  panelUrl?: string;
}

const formatPrice = (value?: number) => {
  if (typeof value !== 'number') return null;
  return `RD$ ${value.toLocaleString('es-DO')}`;
};

const htmlTemplate = (body: AdminAlertRequest) => {
  const price = formatPrice(body.totalPrice);
  const items = [
    body.clientName ? `<li><strong>Cliente:</strong> ${body.clientName}</li>` : '',
    body.clientEmail ? `<li><strong>Correo:</strong> ${body.clientEmail}</li>` : '',
    body.clientPhone ? `<li><strong>Teléfono:</strong> ${body.clientPhone}</li>` : '',
    body.clubName ? `<li><strong>Club:</strong> ${body.clubName}</li>` : '',
    body.fieldName ? `<li><strong>Cancha:</strong> ${body.fieldName}</li>` : '',
    body.unitName ? `<li><strong>Espacio:</strong> ${body.unitName}</li>` : '',
    body.fieldType ? `<li><strong>Modalidad:</strong> ${body.fieldType}</li>` : '',
    body.formattedDate ? `<li><strong>Fecha:</strong> ${body.formattedDate}</li>` : '',
    body.startTime && body.endTime ? `<li><strong>Horario:</strong> ${body.startTime} – ${body.endTime}</li>` : '',
    price ? `<li><strong>Total:</strong> ${price}</li>` : '',
  ].filter(Boolean).join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto; padding: 24px; background: #f8fafc;">
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 32px;">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #b45309;">Field Play · Acción requerida</p>
        <h2 style="margin: 0 0 12px; font-size: 26px; line-height: 1.2; color: #0f172a;">Tienes una reserva por validar</h2>
        <p style="margin: 0 0 16px;">Hola${body.adminName ? ` ${body.adminName}` : ''}, un cliente acaba de enviar una reserva con su comprobante de transferencia.</p>
        ${items ? `<ul style="padding-left: 20px; margin: 16px 0; color: #334155;">${items}</ul>` : ''}
        ${body.proofUrl ? `
          <p style="margin: 16px 0;">
            <a href="${body.proofUrl}" style="display: inline-block; padding: 10px 16px; background: #1d4ed8; color: #ffffff; border-radius: 10px; text-decoration: none; font-weight: 600;">Ver comprobante</a>
          </p>
        ` : ''}
        ${body.panelUrl ? `
          <p style="margin: 16px 0;">
            <a href="${body.panelUrl}" style="display: inline-block; padding: 10px 16px; background: #0f172a; color: #ffffff; border-radius: 10px; text-decoration: none; font-weight: 600;">Abrir panel de reservas</a>
          </p>
        ` : ''}
        <div style="margin: 24px 0; padding: 16px; border-radius: 14px; background: #fef3c7; border: 1px solid #fcd34d; color: #92400e;">
          <strong>Recordatorio:</strong> los clientes esperan tu validación. Mientras la reserva está pendiente, el horario sigue ocupado.
        </div>
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

    const body = (await req.json()) as AdminAlertRequest;

    if (!body.adminEmail) {
      return new Response(JSON.stringify({ error: 'adminEmail is required' }), {
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
        to: [body.adminEmail],
        subject: `Reserva pendiente · ${body.clubName ?? 'Tu club'}`,
        html: htmlTemplate(body),
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({ error: 'Could not send admin alert', details: resendData }), {
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
