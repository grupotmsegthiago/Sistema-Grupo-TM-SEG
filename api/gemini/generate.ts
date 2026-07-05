const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const GEMINI_PRO_MODEL = "gemini-2.5-pro";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const GEMINI_FALLBACK_MODELS = [GEMINI_TEXT_MODEL, "gemini-2.0-flash", GEMINI_PRO_MODEL];
const LEGACY_MODEL_MAP: Record<string, string> = {
  "gemini-3-flash-preview": GEMINI_TEXT_MODEL,
  "gemini-1.5-flash": GEMINI_TEXT_MODEL,
  "gemini-1.5-flash-latest": GEMINI_TEXT_MODEL,
  "gemini-1.5-flash-8b": GEMINI_TEXT_MODEL,
  "gemini-1.5-pro": GEMINI_PRO_MODEL,
  "gemini-1.5-pro-latest": GEMINI_PRO_MODEL,
  "gemini-2.0-flash-exp": GEMINI_TEXT_MODEL,
  "gemini-3-pro-image-preview": GEMINI_IMAGE_MODEL,
};

function getGeminiApiKey(): string {
  return String(
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    "",
  ).trim();
}

function resolveGeminiModel(model?: string | null): string {
  const normalized = String(model || "").trim();
  if (!normalized) return GEMINI_TEXT_MODEL;
  return LEGACY_MODEL_MAP[normalized] || normalized;
}

function isRetriableGeminiModelError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("not found") || msg.includes("404") || msg.includes("invalid model") || msg.includes("is not supported") || (msg.includes("model") && msg.includes("unavailable"));
}

function normalizeContents(contents: unknown) {
  if (typeof contents === "string") return [{ role: "user", parts: [{ text: contents }] }];
  if (Array.isArray(contents)) return contents;
  if (contents && typeof contents === "object" && Array.isArray((contents as any).parts)) {
    return [{ role: "user", parts: (contents as any).parts }];
  }
  return contents;
}

function extractText(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
}

async function generateWithFallback(apiKey: string, model: string, contents: unknown, config: Record<string, unknown>) {
  const primary = resolveGeminiModel(model);
  const candidates = [
    primary,
    ...GEMINI_FALLBACK_MODELS.filter((candidate) => candidate !== primary),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: normalizeContents(contents),
          generationConfig: config,
        }),
      });
      const data: any = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
      }
      return { text: extractText(data), model: candidate };
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
    const { text } = await generateWithFallback(apiKey, model, contents, finalConfig);

    if (!stream) {
      res.status(200).json({ text });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e: any) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: e?.message || "Erro interno" })}\n\n`);
      res.end();
      return;
    }
    res.status(500).json({ error: e?.message || "Erro interno do servidor" });
  }
}

