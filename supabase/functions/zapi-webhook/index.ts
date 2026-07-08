// Supabase Edge Function — recebe webhook Z-API (on-message-received)
// Deploy: supabase functions deploy zapi-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseKey)

const VERCEL_APP_URL = 'https://sistema-grupo-tm-seg.vercel.app'

function resolveAppUrl(): string {
  const configured = (Deno.env.get('APP_PUBLIC_URL') || Deno.env.get('SYSTEM_URL') || '').trim().replace(/\/$/, '')
  if (!configured) return VERCEL_APP_URL

  // Enquanto o DNS do domínio oficial aponta para Replit/Apache, o webhook deve
  // falar direto com a Vercel para usar o backend publicado e testado.
  if (configured.includes('sistema.grupotmseg.com.br')) return VERCEL_APP_URL

  return configured
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const payload = await req.json()

    if (payload.fromMe) {
      return new Response(JSON.stringify({ status: 'ignored_self' }), { status: 200 });
    }

    const phone = payload.phone || payload.from;
    const messageBody = payload.message?.text || payload.text?.message || payload.body;

    if (phone && messageBody) {
      const isGroup = payload.isGroup || String(phone).includes('@g.us');
      let finalChatId = phone;
      if (!isGroup) {
        finalChatId = String(phone).replace(/\D/g, '');
      }

      await supabase.from('whatsapp_messages').insert({
        phone: finalChatId,
        text: messageBody,
        sender: 'agent',
        status: 'delivered',
      });
    }

    // Comando "resumo" → TM SEG responde no PV (nunca no grupo)
    const appUrl = resolveAppUrl();
    if (appUrl) {
      const secret = Deno.env.get('ZAPI_WEBHOOK_SECRET') || Deno.env.get('SUPABASE_WEBHOOK_SECRET') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secret) headers['x-webhook-secret'] = secret;
      try {
        await fetch(`${appUrl.replace(/\/$/, '')}/api/whatsapp/webhook/inbound`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.warn('Forward inbound webhook failed:', e);
      }
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400 });
  }
})
