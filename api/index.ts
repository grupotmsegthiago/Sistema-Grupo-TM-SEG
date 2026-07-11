import { createRequire } from "node:module";

// IMPORTANTE (Vercel): este handler é auto-contido de propósito.
// Antes ele importava de "./proxyExpress" (sibling), mas a Vercel não faz bundle
// deste import estático em ESM, e o runtime quebrava com
// ERR_MODULE_NOT_FOUND: '/var/task/api/proxyExpress'. Sem import de sibling,
// api/index.js não depende de outro arquivo em /var/task/api.

const require = createRequire(import.meta.url);

let handler: any = null;
let bootError: Error | null = null;

/** Encaminha a requisição Vercel para o Express completo (dist/vercelApp.cjs). */
async function proxyToExpress(req: any, res: any) {
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

export default proxyToExpress;
export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};
