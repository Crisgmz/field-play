const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingEmailRequest {
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
}

const htmlTemplate = ({
  firstName,
  clubName,
  fieldName,
  unitName,
  fieldType,
  formattedDate,
  startTime,
  endTime,
}: BookingEmailRequest) => {
  const bookingMeta = [
    clubName ? `<li><strong>Club:</strong> ${clubName}</li>` : '',
    fieldName ? `<li><strong>Cancha:</strong> ${fieldName}</li>` : '',
    unitName ? `<li><strong>Espacio:</strong> ${unitName}</li>` : '',
    fieldType ? `<li><strong>Modalidad:</strong> ${fieldType}</li>` : '',
    formattedDate ? `<li><strong>Fecha:</strong> ${formattedDate}</li>` : '',
    startTime && endTime ? `<li><strong>Horario:</strong> ${startTime} - ${endTime}</li>` : '',
  ].filter(Boolean).join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-bottom: 16px;">Tu reserva fue enviada</h2>
      <p>Hola${firstName ? ` ${firstName}` : ''},</p>
      <p>Recibimos tu solicitud de reserva correctamente.</p>
      <p>Tu reserva ha sido enviada para validación. Por favor, permítenos entre <strong>1 y 24 horas</strong> para confirmarla.</p>
      ${bookingMeta ? `<ul style="padding-left: 20px; margin: 16px 0;">${bookingMeta}</ul>` : ''}
      <p>Te notificaremos por este medio una vez quede confirmada o si necesitamos información adicional.</p>
      <p>Gracias.</p>
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

    const body = (await req.json()) as BookingEmailRequest;

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
        subject: 'Tu reserva fue recibida',
        html: htmlTemplate(body),
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({ error: 'Could not send email', details: resendData }), {
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
