
// Supabase Edge Function para Receber Webhook da Z-API
// Deploy: supabase functions deploy zapi-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // Use Service Role para garantir escrita

const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  // 1. Responder OPTIONS para CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const payload = await req.json()
    console.log("Webhook received:", JSON.stringify(payload));

    // A Z-API manda: phone, from, isGroup, etc.
    // Estrutura comum: payload.phone (quem mandou), payload.isGroup (bool)
    // Se for grupo, o payload.phone é o ID do grupo (ex: 12036... @g.us) e payload.participant é quem enviou.
    
    const phone = payload.phone || payload.from; 
    const messageBody = payload.message?.text || payload.text?.message || payload.body;
    
    // Ignorar mensagens enviadas por mim (fromMe) se vierem no webhook
    if (payload.fromMe) {
        return new Response(JSON.stringify({ status: 'ignored_self' }), { status: 200 });
    }

    if (phone && messageBody) {
        let finalChatId = phone;

        // SE NÃO FOR GRUPO, LIMPA O NÚMERO
        // SE FOR GRUPO (tem @g.us ou isGroup=true), MANTÉM O ID COMPLETO
        const isGroup = payload.isGroup || phone.includes('@g.us');

        if (!isGroup) {
            // Limpar telefone para apenas números (padrão Brasil 55...)
            finalChatId = phone.replace(/\D/g, '');
        }
        // Se for grupo, finalChatId continua como "123...@g.us", que é o que queremos salvar no banco para indexar a conversa.

        // Inserir na tabela whatsapp_messages
        const { error } = await supabase.from('whatsapp_messages').insert({
            phone: finalChatId, // ID do Chat (User ou Grupo)
            text: messageBody,
            sender: 'agent', // 'agent' significa que veio de fora
            status: 'delivered'
        });

        if (error) {
            console.error("Database Insert Error:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ status: 'success' }), { 
            headers: { 'Content-Type': 'application/json' },
            status: 200 
        });
    }

    return new Response(JSON.stringify({ status: 'no_data_found' }), { status: 200 });

  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
})
