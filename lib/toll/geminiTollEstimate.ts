import { normalizeRouteAddress } from '../routeDistance.js';
import { GEMINI_TEXT_MODEL } from '../geminiModels.js';

export type GeminiTollResult = {
  success: boolean;
  tollValue?: number;
  tollCount?: number;
  tolls?: Array<{ name: string; value: number; road: string; sentido?: string; cobrancaUnica?: boolean }>;
  observacoes?: string;
  confianca?: string;
  provider: 'gemini-ai';
  error?: string;
  raw?: string;
};

function getGeminiApiKey(): string {
  return String(
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    '',
  ).trim();
}

const TOLL_ESTIMATE_PROMPT = (origin: string, destination: string) => `Você é um engenheiro de tráfego rodoviário brasileiro com conhecimento detalhado de TODAS as praças de pedágio do Brasil.

TAREFA: Identificar as praças de pedágio no trajeto de "${origin}" até "${destination}" para veículo LEVE (carro/SUV - 2 eixos).

REGRAS CRÍTICAS DE ANÁLISE:

1. ROTA REAL: Identifique a rota REAL mais provável entre os dois pontos. Use vias urbanas quando os pontos estão na mesma região metropolitana. NÃO assuma que o veículo pegará rodovias pedagiadas se a rota urbana é mais curta e direta.

2. ROTAS METROPOLITANAS SEM PEDÁGIO: Muitas rotas dentro de regiões metropolitanas NÃO passam por pedágio. Exemplos:
   - Guarulhos → Pinheiros (SP): Via Marginal Tietê/Pinheiros, SEM pedágio
   - Zona Leste SP → Zona Oeste SP: Via vias urbanas, SEM pedágio
   - Osasco → Santo André: Via vias urbanas, SEM pedágio
   - Galeão → Zona Sul RJ (rotas urbanas): geralmente SEM pedágio
   - Trajetos dentro da mesma cidade ou região metropolitana próxima geralmente NÃO têm pedágio
   Se a rota mais provável é urbana e sem pedágio, retorne "pracas": [] e "totalEstimado": 0

3. PRAÇAS CORRETAS POR RODOVIA: Só inclua praças que REALMENTE existem na rodovia e trecho percorrido.

4. SENTIDO CORRETO: Verifique se a praça cobra no sentido em que o veículo está trafegando.

5. VALORES: Use tarifas atualizadas julho/2026, categoria 1 (2 eixos, rodagem simples).

6. CONFIANÇA: "alta" = certeza absoluta; "media" = valores podem variar ±10%; "baixa" = incerteza.

RESPONDA EXCLUSIVAMENTE no JSON abaixo, sem markdown:

{
  "totalEstimado": 0.00,
  "pracas": [
    { "nome": "Nome da praça", "rodovia": "SP-XXX ou BR-XXX", "valor": 0.00, "sentido": "sentido da cobrança", "cobrancaUnica": true }
  ],
  "observacoes": "Justificativa da rota escolhida",
  "confianca": "alta/media/baixa"
}`;

/** Estimativa de pedágio via Gemini. Usado pelo handler Vercel dedicado. */
export async function estimateTollWithGemini(originRaw: string, destinationRaw: string): Promise<GeminiTollResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { success: false, provider: 'gemini-ai', error: 'Chave Gemini não configurada' };
  }

  const origin = normalizeRouteAddress(originRaw);
  const destination = normalizeRouteAddress(destinationRaw);
  if (!origin || !destination) {
    return { success: false, provider: 'gemini-ai', error: 'Origem e destino são obrigatórios' };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://sistema.grupo-tm-seg.vercel.app/' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: TOLL_ESTIMATE_PROMPT(origin, destination) }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
      }),
    },
  );

  const data: any = await response.json();
  if (!response.ok) {
    return { success: false, provider: 'gemini-ai', error: data?.error?.message || `Gemini HTTP ${response.status}` };
  }

  const rawText = (data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '').trim();

  let parsed: any = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error('[geminiTollEstimate] parse error:', parseErr, rawText.slice(0, 300));
  }

  if (parsed && typeof parsed.totalEstimado === 'number') {
    return {
      success: true,
      tollValue: parseFloat(parsed.totalEstimado.toFixed(2)),
      tollCount: Array.isArray(parsed.pracas) ? parsed.pracas.length : 0,
      tolls: (parsed.pracas || []).map((p: any) => ({
        name: p.nome || 'Praça',
        value: parseFloat(p.valor) || 0,
        road: p.rodovia || '',
        sentido: p.sentido || '',
        cobrancaUnica: p.cobrancaUnica || false,
      })),
      observacoes: parsed.observacoes || '',
      confianca: parsed.confianca || 'baixa',
      provider: 'gemini-ai',
    };
  }

  return { success: false, provider: 'gemini-ai', error: 'Não foi possível extrair dados da resposta da IA', raw: rawText.substring(0, 500) };
}
