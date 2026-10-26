import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let app: any = null;
let bootError: Error | null = null;

async function proxyToExpress(req: any, res: any) {
  try {
    if (!app) {
      if (bootError) {
        res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
        return;
      }
      const { getApp } = require("../../dist/vercelApp.cjs");
      app = await getApp();
    }
    return app(req, res);
  } catch (e: any) {
    bootError = e instanceof Error ? e : new Error(String(e));
    app = null;
    console.error("[Vercel] Falha ao iniciar cron email-queue:", bootError);
    if (!res.headersSent) {
      res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
    }
  }
}

export default proxyToExpress;
export const config = {
  api: { bodyParser: false },
  maxDuration: 120,
};
