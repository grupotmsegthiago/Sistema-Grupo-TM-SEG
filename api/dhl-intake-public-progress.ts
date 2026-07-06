function parseBody(body: unknown): Record<string, any> {
  if (typeof body !== "string") return (body as Record<string, any>) || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const token = String(req.query?.token || req.params?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "token é obrigatório" });
    return;
  }
  const body = parseBody(req.body);
  try {
    const { publicIntakeProgress } = await import("./lib/dhlIntakePublicApi");
    const result = await publicIntakeProgress(token, body);
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error("[dhl-intake-public-progress]", e);
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}
