import { publicIntakeProgress } from "../lib/dhlIntakePublicApi";

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
  const token = String(req.query?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "token é obrigatório" });
    return;
  }
  const body = parseBody(req.body);
  const result = await publicIntakeProgress(token, body);
  res.status(result.status).json(result.body);
}
