/**
 * Gera uma imagem ilustrativa no backend.
 * A chave fica só no servidor. O pedido não leva preço, endereço nem logotipo.
 */
import { Modality } from '@google/genai';
import { getGeminiClient, isGeminiConfigured } from './geminiClient';
import { withTimeout } from '../lib/promiseTimeout.js';
import { GEMINI_IMAGE_MODEL } from '../lib/geminiModels.js';
import { CUSTO_ESTIMADO_USD } from '../lib/portalCliente/propostaPremium.js';

export type ImagemGerada = {
  buffer: Buffer;
  servico: 'openai' | 'gemini';
  custoUsd: number;
  estimado: boolean;
};

const MODELO_OPENAI = 'gpt-image-2.5-sunburst';

function chaveOpenAI(): string {
  return String(process.env.OPENAI_API_KEY || '').trim();
}

export function servicoDeImagemDisponivel(): 'openai' | 'gemini' | 'nenhum' {
  if (chaveOpenAI()) return 'openai';
  if (isGeminiConfigured()) return 'gemini';
  return 'nenhum';
}

function custoOpenAI(uso: unknown, formato: 'paisagem' | 'cartao'): { custoUsd: number; estimado: boolean } {
  const registro = uso && typeof uso === 'object' ? uso as Record<string, unknown> : {};
  const entrada = Number(registro.input_tokens ?? registro.prompt_tokens);
  const saida = Number(registro.output_tokens ?? registro.completion_tokens);
  if (Number.isFinite(entrada) && Number.isFinite(saida) && entrada >= 0 && saida >= 0) {
    return { custoUsd: (entrada * 5 + saida * 30) / 1_000_000, estimado: false };
  }
  return {
    custoUsd: formato === 'paisagem' ? CUSTO_ESTIMADO_USD.openaiPaisagem : CUSTO_ESTIMADO_USD.openaiCartao,
    estimado: true,
  };
}

async function gerarOpenAI(pedido: string, formato: 'paisagem' | 'cartao'): Promise<ImagemGerada | null> {
  const chave = chaveOpenAI();
  if (!chave) return null;
  const modelo = String(process.env.OPENAI_IMAGE_MODEL || MODELO_OPENAI).trim() || MODELO_OPENAI;
  const resposta = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      prompt: pedido,
      size: formato === 'paisagem' ? '1536x1024' : '1024x1024',
      quality: 'medium',
      n: 1,
    }),
    signal: AbortSignal.timeout(28_000),
  });
  const corpo = await resposta.json().catch(() => ({})) as { data?: Array<{ b64_json?: string }>; usage?: unknown; error?: { message?: string } };
  if (!resposta.ok) {
    console.error('[proposta-premium] openai', resposta.status, corpo.error?.message || 'sem imagem');
    return null;
  }
  const b64 = corpo.data?.[0]?.b64_json || '';
  if (!b64 || b64.length > 8_000_000) return null;
  const custo = custoOpenAI(corpo.usage, formato);
  return { buffer: Buffer.from(b64, 'base64'), servico: 'openai', ...custo };
}

async function gerarGemini(pedido: string): Promise<ImagemGerada | null> {
  if (!isGeminiConfigured()) return null;
  const ai = getGeminiClient();
  const resposta = await withTimeout(ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: pedido }] }],
    config: { responseModalities: [Modality.IMAGE] },
  }), 28_000, 'A imagem ilustrativa passou do tempo.');
  const partes = resposta.candidates?.[0]?.content?.parts || [];
  const imagem = partes.find((parte) => parte.inlineData?.data);
  const dados = imagem?.inlineData?.data || '';
  if (!dados || dados.length > 8_000_000) return null;
  return {
    buffer: Buffer.from(dados, 'base64'),
    servico: 'gemini',
    custoUsd: CUSTO_ESTIMADO_USD.gemini,
    estimado: true,
  };
}

/** OpenAI quando a chave existe. Sem ela, usa o Gemini já configurado no projeto. */
export async function gerarImagemIlustrativa(pedido: string, formato: 'paisagem' | 'cartao'): Promise<ImagemGerada | null> {
  try {
    if (chaveOpenAI()) {
      const openai = await gerarOpenAI(pedido, formato);
      if (openai) return openai;
    }
    return await gerarGemini(pedido);
  } catch (erro) {
    console.error('[proposta-premium] imagem', erro instanceof Error ? erro.message : erro);
    return null;
  }
}
