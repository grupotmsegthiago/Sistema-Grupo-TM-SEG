/** Health check leve — nao importa Express/routes (evita cold start pesado na Vercel). */
export default function handler(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  res.status(200).json({ status: 'ok', timestamp: Date.now(), source: 'api/health' });
}
