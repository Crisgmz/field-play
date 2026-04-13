const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegistrationEmailRequest {
  email: string;
  firstName?: string;
  lastName?: string;
}

const htmlTemplate = ({ firstName }: RegistrationEmailRequest) => `
  <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7; max-width: 640px; margin: 0 auto; padding: 24px; background: #f8fafc;">
    <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 32px;">
      <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b;">Field Play</p>
      <h1 style="margin: 0 0 16px; font-size: 28px; line-height: 1.2; color: #0f172a;">Bienvenido a Field Play</h1>
      <p>Hola${firstName ? ` ${firstName}` : ''},</p>
      <p>Tu cuenta fue creada correctamente. Para completar el acceso, utiliza el correo de verificación de Supabase que acabamos de enviarte.</p>
      <p>Una vez confirmes tu correo podrás:</p>
      <ul style="padding-left: 20px; margin: 16px 0; color: #334155;">
        <li>Reservar canchas en línea</li>
        <li>Enviar tu comprobante de pago por transferencia o depósito</li>
        <li>Dar seguimiento al estado de tus reservas</li>
      </ul>
      <div style="margin: 24px 0; padding: 16px; border-radius: 14px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a;">
        <strong>Importante:</strong> este correo complementa el flujo de autenticación. La confirmación final de tu cuenta se realiza desde el correo de verificación automático.
      </div>
      <p>Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p>
      <p style="margin-top: 24px;">Saludos,<br /><strong>Equipo Field Play</strong></p>
    </div>
  </div>
`;

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

    const body = (await req.json()) as RegistrationEmailRequest;

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
        subject: 'Bienvenido a Field Play',
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
