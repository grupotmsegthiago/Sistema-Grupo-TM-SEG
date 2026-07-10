/** Stub mínimo — valida build Vercel antes de carregar módulos pesados. */
export default async function handler(_req: { method?: string }, res: {
  status: (n: number) => { json: (b: unknown) => void };
}) {
  res.status(401).json({ ok: false, error: 'Não autorizado' });
}
