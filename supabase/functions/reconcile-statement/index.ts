
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenAI } from "https://esm.sh/@google/genai@^1.34.0"

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  // Tratar Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const { fileBase64, mimeType, accountId } = body;

    if (!fileBase64 || !accountId) {
      throw new Error("Parâmetros ausentes (fileBase64 ou accountId).");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiKey = Deno.env.get('API_KEY') || Deno.env.get('GEMINI_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey)
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    console.log(`Iniciando análise para conta: ${accountId}`);

    // 1. Extração via IA com prompt mais rígido
    const prompt = `Analise este extrato bancário. Extraia TODAS as transações individuais (entradas e saídas). Ignore saldos e taxas de manutenção se possível.
    
    OBRIGATÓRIO: Retorne APENAS um JSON Array puro no formato:
    [
      {
        "date": "YYYY-MM-DD",
        "description": "NOME DO FAVORECIDO OU HISTORICO",
        "amount": 0.00,
        "type": "INCOME" ou "EXPENSE"
      }
    ]
    Não use markdown, não adicione explicações.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { 
        parts: [
          { inlineData: { mimeType: mimeType, data: fileBase64 } }, 
          { text: prompt }
        ] 
      },
      config: { 
        responseMimeType: "application/json"
      }
    });

    let rawText = response.text || "[]";
    // Limpeza de Markdown caso o modelo ignore o config
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsed;
    try {
        parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
        console.error("Erro ao parsear resposta da IA:", cleanJson);
        throw new Error("A IA retornou um formato de dados inválido.");
    }

    if (!Array.isArray(parsed)) {
        throw new Error("A IA não retornou uma lista de transações válida.");
    }

    console.log(`IA extraiu ${parsed.length} transações. Iniciando cruzamento com banco de dados...`);

    // 2. Busca transações recentes no DB para cruzamento (Janela de 90 dias para segurança)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: dbTrans, error: dbError } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('account_id', accountId)
      .gte('due_date', ninetyDaysAgo);

    if (dbError) {
        console.error("Erro ao buscar transações no DB:", dbError);
    }

    // 3. Lógica de Matching (Servidor)
    const reconciliation = parsed.map((item: any) => {
      // Tenta encontrar uma transação já paga no banco com valor aproximado e mesmo tipo
      const match = dbTrans?.find(db => 
        Math.abs(db.amount - Math.abs(item.amount)) < 0.05 && 
        db.type === item.type &&
        db.status === 'PAID'
      );

      return {
        id: crypto.randomUUID().split('-')[0],
        date: item.date,
        description: item.description,
        amount: Math.abs(item.amount), // Garante valor positivo para exibição
        type: item.type,
        status: match ? 'MATCHED' : 'MISSING',
        status_conciliacao: match ? 'CONCILIADO' : 'DIVERGENTE',
        category_id: match ? match.category_id : '',
        category_name: match ? match.category_name : '',
        linked_transaction_id: match ? match.id : undefined
      };
    });

    console.log("Processamento concluído com sucesso.");

    return new Response(JSON.stringify(reconciliation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("ERRO CRÍTICO NA FUNÇÃO:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
