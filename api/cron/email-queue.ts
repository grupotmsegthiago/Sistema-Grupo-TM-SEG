import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let handler: any = null;
let bootError: Error | null = null;

async function proxyToExpress(req: any, res: any) {
  try {
    if (!handler) {
      if (bootError) {
        res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
        return;
      }
      const serverless = require("serverless-http");
      const { getApp } = require("../../dist/vercelApp.cjs");
      const app = await getApp();
      handler = serverless(app, { binary: true });
    }
    return handler(req, res);
  } catch (e: any) {
    bootError = e instanceof Error ? e : new Error(String(e));
    console.error("[Vercel] Falha ao iniciar cron email-queue:", bootError);
    res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
  }
}

export default proxyToExpress;
export const config = {
  api: { bodyParser: false },
  maxDuration: 120,
};
