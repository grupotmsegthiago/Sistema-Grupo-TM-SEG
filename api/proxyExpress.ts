import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let handler: any = null;
let bootError: Error | null = null;

/** Encaminha a requisição Vercel para o Express completo (dist/vercelApp.cjs). */
export async function proxyToExpress(req: any, res: any) {
  try {
    if (!handler) {
      if (bootError) {
        res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
        return;
      }
      const serverless = require("serverless-http");
      const { getApp } = require("../dist/vercelApp.cjs");
      const app = await getApp();
      handler = serverless(app, { binary: true });
    }
    return handler(req, res);
  } catch (e: any) {
    bootError = e instanceof Error ? e : new Error(String(e));
    console.error("[Vercel] Falha ao iniciar backend:", bootError);
    res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
  }
}

export const expressProxyConfig = {
  api: { bodyParser: false as const },
  maxDuration: 300,
};
