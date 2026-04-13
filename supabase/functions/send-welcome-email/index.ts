const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WelcomeEmailRequest {
  email: string;
  firstName?: string;
  lastName?: string;
}

const htmlTemplate = ({ firstName, lastName }: WelcomeEmailRequest) => {
  const name = [firstName, lastName].filter(Boolean).join(' ');

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 28px; font-weight: 800; color: #16a34a; margin: 0;">RealPlay</h1>
        <p style="font-size: 14px; color: #6b7280; margin-top: 4px;">Tu plataforma deportiva</p>
      </div>

      <h2 style="margin-bottom: 16px; font-size: 22px;">Bienvenido a RealPlay${name ? `, ${name}` : ''}</h2>

      <p>Tu cuenta ha sido creada exitosamente. Ahora puedes:</p>

      <ul style="padding-left: 20px; margin: 16px 0; line-height: 2;">
        <li>Explorar los clubes deportivos disponibles</li>
        <li>Reservar canchas de <strong>Futbol 5</strong>, <strong>Futbol 7</strong> y <strong>Futbol 11</strong></li>
        <li>Gestionar tus reservas desde tu perfil</li>
      </ul>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0; font-size: 14px; color: #15803d;">
          <strong>Siguiente paso:</strong> Explora los clubes disponibles y realiza tu primera reserva.
          El pago se realiza por transferencia bancaria y nuestro equipo confirmara tu reserva en menos de 24 horas.
        </p>
      </div>

      <p style="margin-top: 24px;">Si tienes alguna pregunta, no dudes en contactarnos.</p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />

      <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        Este correo fue enviado automaticamente por RealPlay.<br />
        Por favor no respondas a este mensaje.
      </p>
    </div>
  `;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('BOOKING_EMAIL_FROM') ?? 'RealPlay <onboarding@resend.dev>';

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as WelcomeEmailRequest;

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
        subject: 'Bienvenido a RealPlay',
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
