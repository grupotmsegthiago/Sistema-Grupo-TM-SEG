import "../server/loadEnv";
import serverless from "serverless-http";
import { getApp } from "../server/createApp";

let handler: ReturnType<typeof serverless> | null = null;

export default async function vercelHandler(req: unknown, res: unknown) {
  if (!handler) {
    const app = await getApp();
    handler = serverless(app, { binary: true });
  }
  return handler(req as any, res as any);
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};
