import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_FALLBACK_MODELS,
  isRetriableGeminiModelError,
  resolveGeminiModel,
} from "../../lib/geminiModels";

function getGeminiApiKey(): string {
  return String(
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    "",
  ).trim();
}

async function generateWithFallback(ai: GoogleGenAI, model: string, contents: unknown, config: Record<string, unknown>) {
  const primary = resolveGeminiModel(model);
  const candidates = [
    primary,
    ...GEMINI_FALLBACK_MODELS.filter((candidate) => candidate !== primary),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const response = await ai.models.generateContent({
        model: candidate,
        contents: contents as never,
        config: config as never,
      });
      return { response, model: candidate };
    } catch (e: any) {
      lastError = e;
      if (!isRetriableGeminiModelError(e?.message || String(e))) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Nenhum modelo Gemini disponível respondeu à requisição.");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    res.status(503).json({
      error: "Chave Gemini não configurada. Defina GEMINI_API_KEY nas variáveis de ambiente da Vercel.",
    });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { contents, config, stream } = body;
    const model = resolveGeminiModel(body.model);
    const finalConfig = { ...(config || {}), maxOutputTokens: config?.maxOutputTokens || 8192 };
    const ai = new GoogleGenAI({ apiKey });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const streamResult = await ai.models.generateContentStream({
        model,
        contents: contents as never,
        config: finalConfig as never,
      });
      for await (const chunk of streamResult) {
        const text = chunk.text || "";
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    const { response } = await generateWithFallback(ai, model, contents, finalConfig);
    res.status(200).json({ text: response.text || "" });
  } catch (e: any) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: e?.message || "Erro interno" })}\n\n`);
      res.end();
      return;
    }
    res.status(500).json({ error: e?.message || "Erro interno do servidor" });
  }
}

