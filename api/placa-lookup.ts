const placaProxyHits = new Map<string, number[]>();
const PLACA_PROXY_WINDOW_MS = 60_000;
const PLACA_PROXY_MAX = 20;

function authToken(req: any): string {
  return String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "") || String(req.headers?.["x-auth-token"] || "");
}

function placaProxyRateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (placaProxyHits.get(key) || []).filter((t) => now - t < PLACA_PROXY_WINDOW_MS);
  arr.push(now);
  placaProxyHits.set(key, arr);
  if (placaProxyHits.size > 500) {
    for (const [k, v] of placaProxyHits) {
      if (!v.length || now - v[v.length - 1] > PLACA_PROXY_WINDOW_MS) placaProxyHits.delete(k);
    }
  }
  return arr.length > PLACA_PROXY_MAX;
}

async function fetchPlacaApi(url: string, signal: AbortSignal): Promise<Response> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9",
  };
  let last: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await fetch(url, { signal: signal as any, headers });
    if (last.status !== 403) return last;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return last as Response;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!authToken(req)) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  try {
    const placaRaw = String(req.query?.placa || req.params?.placa || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (placaRaw.length !== 7) {
      res.status(400).json({ error: "Placa deve conter 7 caracteres." });
      return;
    }

    const ip = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const tok = authToken(req) || ip;
    if (placaProxyRateLimited(`tok:${tok}`) || placaProxyRateLimited(`ip:${ip}`)) {
      res.status(429).json({ error: "Muitas consultas em sequência — aguarde alguns segundos." });
      return;
    }

    const wdToken = String(process.env.VITE_WDAPI_TOKEN || process.env.WDAPI_TOKEN || "").trim();
    if (!wdToken) {
      res.status(503).json({ error: "Consulta de placa indisponível no momento." });
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const lookupUrl = `https://wdapi2.com.br/consulta/${encodeURIComponent(placaRaw)}/${encodeURIComponent(wdToken)}`;
      const r = await fetchPlacaApi(lookupUrl, ctrl.signal);
      clearTimeout(timer);

      if (!r.ok) {
        if (r.status === 404) {
          res.status(404).json({ error: "Placa não encontrada." });
          return;
        }
        if (r.status === 403) {
          res.status(502).json({ error: "API de Placas bloqueou a consulta (Cloudflare). Preencha manualmente." });
          return;
        }
        res.status(502).json({ error: `API de Placas indisponível (${r.status}).` });
        return;
      }

      const rawBody = await r.text();
      try {
        const j = JSON.parse(rawBody);
        res.status(200).json(j);
      } catch {
        res.status(502).json({ error: "API de Placas retornou resposta inválida (indisponível)." });
      }
    } catch (fetchErr: any) {
      clearTimeout(timer);
      if (fetchErr?.name === "AbortError") {
        res.status(504).json({ error: "Tempo esgotado ao consultar placa." });
        return;
      }
      res.status(502).json({ error: "Falha de conexão ao consultar placa." });
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}
