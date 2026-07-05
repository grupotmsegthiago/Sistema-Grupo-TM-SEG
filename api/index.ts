import serverless from "serverless-http";
import { getApp } from "../server/createApp";

let handler: any = null;
let bootError: Error | null = null;

export default async function vercelHandler(req: any, res: any) {
  try {
    if (!handler) {
      if (bootError) {
        res.status(503).json({ error: "Backend indisponivel", detail: bootError.message });
        return;
      }
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

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
