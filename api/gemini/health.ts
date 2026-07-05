import { GoogleGenAI } from "@google/genai";
import { GEMINI_TEXT_MODEL } from "../../lib/geminiModels";

function getGeminiApiKey(): string {
  return String(
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    "",
  ).trim();
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    res.status(503).json({
      ok: false,
      error: "Chave Gemini não configurada",
      hint: "Configure GEMINI_API_KEY nas variáveis de ambiente da Vercel e faça redeploy.",
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: "Responda apenas: OK",
      config: { maxOutputTokens: 10, temperature: 0 },
    });
    res.status(200).json({ ok: true, model: GEMINI_TEXT_MODEL, text: (response.text || "").trim() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Falha ao contactar Gemini" });
  }
}

