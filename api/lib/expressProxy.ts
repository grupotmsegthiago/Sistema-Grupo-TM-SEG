import serverless from "serverless-http";
import { getApp } from "../../server/createApp";

let handler: ReturnType<typeof serverless> | null = null;
let bootError: Error | null = null;

export async function proxyExpress(req: any, res: any, targetPath: string) {
  try {
    if (!handler) {
      if (bootError) {
        res.status(503).json({ error: "Backend indisponível", detail: bootError.message });
        return;
      }
      const app = await getApp();
      handler = serverless(app, { binary: true });
    }
    const qs = typeof req.url === "string" && req.url.includes("?")
      ? req.url.slice(req.url.indexOf("?"))
      : "";
    req.url = targetPath + qs;
    return handler(req, res);
  } catch (e: unknown) {
    bootError = e instanceof Error ? e : new Error(String(e));
    console.error("[Vercel] Falha ao iniciar backend:", bootError);
    res.status(503).json({ error: "Backend indisponível", detail: bootError.message });
  }
}

export const expressProxyConfig = {
  api: { bodyParser: false as const },
  maxDuration: 300,
};
