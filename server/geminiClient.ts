import { GoogleGenAI } from '@google/genai';
import {
  GEMINI_FALLBACK_MODELS,
  GEMINI_TEXT_MODEL,
  isRetriableGeminiModelError,
  resolveGeminiModel,
} from '../lib/geminiModels';

export function getGeminiApiKey(): string | undefined {
  const key = (
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();
  return key || undefined;
}

export function getGeminiBaseUrl(): string | undefined {
  const url = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || '').trim();
  return url || undefined;
}

export function isGeminiConfigured(): boolean {
  return !!getGeminiApiKey();
}

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Chave Gemini não configurada. Defina GEMINI_API_KEY ou AI_INTEGRATIONS_GEMINI_API_KEY nas variáveis de ambiente.',
    );
  }

  const baseUrl = getGeminiBaseUrl();
  cachedClient = new GoogleGenAI({
    apiKey,
    ...(baseUrl ? { httpOptions: { apiVersion: '', baseUrl } } : {}),
  });

  return cachedClient;
}

export async function generateGeminiContent(options: {
  model?: string;
  contents: unknown;
  config?: Record<string, unknown>;
}) {
  const ai = getGeminiClient();
  const primary = resolveGeminiModel(options.model);
  const candidates = [
    primary,
    ...GEMINI_FALLBACK_MODELS.filter((m) => m !== primary),
  ];

  let lastError: unknown;
  for (const model of candidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents as never,
        config: options.config as never,
      });
      void logGeminiBillingUsage(model, response).catch(() => {});
      return response;
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isRetriableGeminiModelError(message)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Nenhum modelo Gemini disponível respondeu à requisição.');
}

/** Estimativa conservadora de custo Gemini (USD) por 1k tokens — ajustável via env. */
function estimateGeminiUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rateIn = Number(process.env.GEMINI_COST_PER_1K_INPUT_USD || 0.0001);
  const rateOut = Number(process.env.GEMINI_COST_PER_1K_OUTPUT_USD || 0.0004);
  const flash = model.includes('flash');
  const mult = flash ? 0.5 : 1;
  return ((inputTokens / 1000) * rateIn + (outputTokens / 1000) * rateOut) * mult;
}

async function logGeminiBillingUsage(model: string, response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; text?: string }) {
  const meta = response.usageMetadata;
  const inTok = Number(meta?.promptTokenCount || 0);
  const outTok = Number(meta?.candidatesTokenCount || 0);
  if (inTok === 0 && outTok === 0) return;
  const { recordBillingUsage } = await import('./billingService.js');
  const usd = estimateGeminiUsd(model, inTok, outTok);
  await recordBillingUsage({
    source: 'gemini',
    token_id: `gemini-${model}`,
    summary: `Gemini ${model} · ${inTok + outTok} tokens`,
    amount_usd: usd,
    metadata: { model, inputTokens: inTok, outputTokens: outTok },
  });
}

export async function generateGeminiContentStream(options: {
  model?: string;
  contents: unknown;
  config?: Record<string, unknown>;
}) {
  const ai = getGeminiClient();
  const model = resolveGeminiModel(options.model);
  return ai.models.generateContentStream({
    model,
    contents: options.contents as never,
    config: options.config as never,
  });
}

export async function pingGeminiHealth(): Promise<{ model: string; text: string }> {
  const response = await generateGeminiContent({
    model: GEMINI_TEXT_MODEL,
    contents: 'Responda apenas: OK',
    config: { maxOutputTokens: 10, temperature: 0 },
  });
  return {
    model: GEMINI_TEXT_MODEL,
    text: (response.text || '').trim(),
  };
}
