import { expressProxyConfig, proxyExpress } from "./lib/expressProxy";

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
  return proxyExpress(req, res, `/api/dhl/intake/public/${encodeURIComponent(token)}/submit`);
}

export const config = expressProxyConfig;
