const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Responda apenas: OK" }] }],
        generationConfig: { maxOutputTokens: 10, temperature: 0 },
      }),
    });
    const data: any = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ ok: false, error: data?.error?.message || "Falha ao contactar Gemini" });
      return;
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("").trim() || "";
    res.status(200).json({ ok: true, model: GEMINI_TEXT_MODEL, text });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Falha ao contactar Gemini" });
  }
}

