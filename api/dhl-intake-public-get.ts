import { publicIntakeGet } from "../lib/dhlIntakePublicApi";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const token = String(req.query?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "token é obrigatório" });
    return;
  }
  const result = await publicIntakeGet(token);
  res.status(result.status).json(result.body);
}
