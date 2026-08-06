const secret = String(process.env.CRON_SECRET || '').trim();
const base = 'https://sistema.grupotmseg.com.br';

async function call(label: string, body: Record<string, unknown>, withAuth = true) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withAuth && secret) {
      headers.Authorization = `Bearer ${secret}`;
      headers['x-cron-secret'] = secret;
    }
    const res = await fetch(`${base}/api/asaas/sync-customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    console.log(`${label} status=${res.status} ms=${Date.now() - t0}`);
    console.log(text.slice(0, 800));
  } catch (e: any) {
    console.log(`${label} ERR ${e?.message || e} ms=${Date.now() - t0}`);
  } finally {
    clearTimeout(timer);
  }
}

await call('ping-noauth', { ping: true }, false);
await call('ping-auth', { ping: true }, true);
if (secret) {
  await call('dry', { dryRun: true, limit: 2, offset: 0 }, true);
}
