import { authFetch } from './authFetch';
import { resolveGeminiModel } from './geminiModels';

export async function generateContent(options: {
  contents: any;
  config?: any;
  model?: string;
}): Promise<string> {
  const response = await authFetch('/api/gemini/generate', {
    method: 'POST',
    body: JSON.stringify({
      contents: options.contents,
      config: options.config,
      model: resolveGeminiModel(options.model),
      stream: false
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erro de conexão' }));
    throw new Error(err.error || 'Erro ao gerar conteúdo');
  }
  const data = await response.json();
  return data.text || '';
}

export async function generateContentStream(options: {
  contents: any;
  config?: any;
  model?: string;
  onChunk: (text: string) => void;
}): Promise<string> {
  const response = await authFetch('/api/gemini/generate', {
    method: 'POST',
    body: JSON.stringify({
      contents: options.contents,
      config: options.config,
      model: resolveGeminiModel(options.model),
      stream: true
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erro de conexão' }));
    throw new Error(err.error || 'Erro ao gerar conteúdo');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.error) throw new Error(data.error);
            if (data.text) {
              fullText += data.text;
              options.onChunk(fullText);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('Unexpected')) throw e;
          }
        }
      }
    }
  }
  return fullText;
}

export class GeminiProxy {
  async generateContent(options: { model: string; contents: any; config?: any }) {
    const text = await generateContent({
      contents: options.contents,
      config: options.config,
      model: options.model
    });
    return { text };
  }
}

export const geminiProxy = new GeminiProxy();

export async function suggestPriceTable(options: {
  mission: {
    origin: string;
    destination: string;
    totalKm: number;
    missionType: string;
    client: string;
    provider: string;
    agentCount: number;
    originUF: string;
    region: string;
  };
  clientTables: Array<{
    id: string;
    operation_type: string;
    activation_fee: number;
    franchise_km: number;
    franchise_hours: number;
    price_per_extra_km: number;
    price_per_extra_hour: number;
  }>;
  providerTables: Array<{
    id: string;
    operation_type: string;
    activation_cost: number;
    franchise_km: number;
    franchise_hours: number;
    cost_per_extra_km: number;
    cost_per_extra_hour: number;
  }>;
}): Promise<{
  clientSuggestion: { tableId: string; tableName: string; reason: string } | null;
  providerSuggestion: { tableId: string; tableName: string; reason: string } | null;
}> {
  try {
    const m = options.mission;

    const clientTablesList = options.clientTables.map(t =>
      `${t.id} | ${t.operation_type} | R$${t.activation_fee} | ${t.franchise_km}km | ${t.franchise_hours}h | R$${t.price_per_extra_km}/km | R$${t.price_per_extra_hour}/h`
    ).join('\n');

    const providerTablesList = options.providerTables.map(t =>
      `${t.id} | ${t.operation_type} | R$${t.activation_cost} | ${t.franchise_km}km | ${t.franchise_hours}h | R$${t.cost_per_extra_km}/km | R$${t.cost_per_extra_hour}/h`
    ).join('\n');

    const prompt = `Você é um especialista em logística de escoltas de segurança no Brasil.
Analise os dados da missão e recomende a melhor tabela de preço (cliente) e a melhor tabela de custo (fornecedor).

DADOS DA MISSÃO:
- Origem: ${m.origin} (UF: ${m.originUF}, Região: ${m.region})
- Destino: ${m.destination}
- Distância: ${m.totalKm} km
- Tipo: ${m.missionType}
- Cliente: ${m.client}
- Fornecedor: ${m.provider}
- Agentes: ${m.agentCount}

TABELAS DE PREÇO DO CLIENTE (${options.clientTables.length} disponíveis):
id | operation_type | acionamento | franquia_km | franquia_h | km_extra | h_extra
${clientTablesList || '(nenhuma tabela disponível)'}

TABELAS DE CUSTO DO FORNECEDOR (${options.providerTables.length} disponíveis):
id | operation_type | acionamento | franquia_km | franquia_h | km_extra | h_extra
${providerTablesList || '(nenhuma tabela disponível)'}

REGRAS DE NEGÓCIO:
1. VELADA = escolta discreta, usa tabelas ARMADO/PRONTA RESPOSTA (sem faixa KM)
2. CARACTERIZADA = escolta visível, usa tabelas com faixa KM
3. A franquia_km deve cobrir a distância da missão (escolher a menor que cubra)
4. Se missão é MG/ES, evitar tabelas com "EXCETO MG" ou "EXCETO MG/ES"
5. Se operation_type contém cidade da origem ou destino, é match forte
6. Fornecedor MACOR = preferir tabelas com "MACOR" no nome
7. 02 ARMADOS = missão com 2+ agentes

Responda APENAS em JSON válido, sem markdown:
{"clientSuggestion":{"tableId":"...","tableName":"...","reason":"..."},"providerSuggestion":{"tableId":"...","tableName":"...","reason":"..."}}

Se não houver tabelas disponíveis para cliente ou fornecedor, use null no campo correspondente.`;

    const rawText = await generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 2048, temperature: 0.1 },
      model: 'gemini-2.5-flash'
    });

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { clientSuggestion: null, providerSuggestion: null };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      clientSuggestion: parsed.clientSuggestion || null,
      providerSuggestion: parsed.providerSuggestion || null
    };
  } catch (err) {
    console.error('suggestPriceTable error:', err);
    return { clientSuggestion: null, providerSuggestion: null };
  }
}
