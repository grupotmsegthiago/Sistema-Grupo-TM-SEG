function verifyCronRequest(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[Cron] CRON_SECRET não configurado — rejeitando chamada.');
    return false;
  }
  return String(req.headers?.authorization || '') === `Bearer ${secret}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!verifyCronRequest(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { runClientEmailQueueCycle } = await import('../server/clientEmailQueueWorker.js');
    await runClientEmailQueueCycle();
    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('[cron/email-queue]', e?.message);
    res.status(500).json({ error: e?.message || 'Cron failed' });
  }
}
