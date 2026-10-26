import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ReceiptData, receiptSubject, renderReceiptHtml } from '../_shared/receipt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resuelve el remitente: si el club tiene `notification_email` configurado
// (migración 017), construye "Nombre <correo>" con esos valores. Si no,
// cae al default del entorno. Cualquier error en la lookup → fallback.
async function resolveFromEmail(clubId: string | undefined, fallback: string): Promise<string> {
  if (!clubId) return fallback;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return fallback;
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin
      .from('clubs')
      .select('notification_email, notification_sender_name, name')
      .eq('id', clubId)
      .maybeSingle();
    if (error || !data?.notification_email) return fallback;
    const senderName = data.notification_sender_name?.trim() || data.name?.trim() || 'Field Play';
    return `${senderName} <${data.notification_email}>`;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fallbackFrom = Deno.env.get('BOOKING_EMAIL_FROM') ?? 'Field Play <onboarding@resend.dev>';

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ReceiptData & { clubId?: string };

    if (!body.email) {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromEmail = await resolveFromEmail(body.clubId, fallbackFrom);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [body.email],
        subject: receiptSubject(body),
        html: renderReceiptHtml(body),
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
