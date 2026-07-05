import "./loadEnv";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import serverless from "serverless-http";
import { getApp } from "../server/createApp";

let handler: ReturnType<typeof serverless> | null = null;

export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  if (!handler) {
    const app = await getApp();
    handler = serverless(app, { binary: true });
  }
  return handler(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
