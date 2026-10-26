import { createRequire } from "node:module";

// IMPORTANTE (Vercel): este handler é auto-contido de propósito.
// Antes ele importava de "./proxyExpress" (sibling), mas a Vercel não faz bundle
// deste import estático em ESM, e o runtime quebrava com
// ERR_MODULE_NOT_FOUND: '/var/task/api/proxyExpress'. Sem import de sibling,
// api/index.js não depende de outro arquivo em /var/task/api.

const require = createRequire(import.meta.url);

let app: any = null;
let bootError: Error | null = null;

/** Encaminha a requisição Vercel para o Express completo (dist/vercelApp.cjs).
 * A Vercel entrega req/res do Node. O adapter serverless-http espera evento Lambda:
 * a resposta não fecha e a função fica até estourar o tempo. */
async function proxyToExpress(req: any, res: any) {
  try {
    if (!app) {
      if (bootError) {
        res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
        return;
      }
      const { getApp } = require("../dist/vercelApp.cjs");
      app = await getApp();
    }
    return app(req, res);
  } catch (e: any) {
    bootError = e instanceof Error ? e : new Error(String(e));
    app = null;
    console.error("[Vercel] Falha ao iniciar backend:", bootError);
    if (!res.headersSent) {
      res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
    }
  }
}

export default proxyToExpress;
export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};
