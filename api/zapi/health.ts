import { getDefaultWhatsappInstance, instanceConfigured, runWhatsappInstanceMigrations } from '../server/whatsapp/instanceStore.js';
import { credsFromInstance, zapiFetchWith } from '../server/whatsapp/zapiHttp.js';

/** Smoke test público da Z-API (sem expor tokens). */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    await runWhatsappInstanceMigrations();
    const row = await getDefaultWhatsappInstance(true);
    if (!row || !instanceConfigured(row)) {
      res.status(503).json({ ok: false, configured: false, error: 'Instância WhatsApp não configurada' });
      return;
    }

    const creds = credsFromInstance(row);
    if (!creds) {
      res.status(503).json({ ok: false, configured: false, error: 'Credenciais Z-API incompletas' });
      return;
    }

    const { ok, status, data } = await zapiFetchWith(creds, 'status', { method: 'GET' });
    const connected = data?.connected === true && data?.smartphoneConnected !== false;
    const error = data?.error || data?.message || (!ok ? `HTTP ${status}` : null);

    res.status(ok ? 200 : 502).json({
      ok: ok && connected,
      configured: true,
      apiReachable: status > 0,
      httpStatus: status,
      connected: data?.connected ?? null,
      smartphoneConnected: data?.smartphoneConnected ?? null,
      session: data?.session ?? null,
      instanceType: creds.type,
      label: row.label,
      hasClientToken: !!creds.clientToken,
      error: connected ? null : error,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message || 'Falha ao consultar Z-API' });
  }
}

export const config = { maxDuration: 30 };
