import { GoogleGenAI } from '@google/genai';
import {
  GEMINI_FALLBACK_MODELS,
  GEMINI_TEXT_MODEL,
  isRetriableGeminiModelError,
  resolveGeminiModel,
} from '../lib/geminiModels';
import { classifyGeminiError } from '../lib/geminiUnavailable';

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
      return await ai.models.generateContent({
        model,
        contents: options.contents as never,
        config: options.config as never,
      });
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
