/**
 * Sync clientes ativos → Asaas (3 empresas).
 * Rewrite: /api/asaas/sync-customers → /api/asaas-sync-customers
 *
 * Body opcional:
 *  - clientId: sync de um cliente
 *  - limit / offset: lote (padrão 20)
 *  - dryRun: true = só valida elegibilidade
 */
import { assertAsaasApiAccess, extractAuthToken } from '../lib/asaasApiAuth.js';
import { runAsaasSyncCustomers } from '../lib/asaasSyncCustomersCore.js';

export const config = { maxDuration: 300 };

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

function hasCronSecret(req: any): boolean {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const auth = String(req.headers?.authorization || req.headers?.Authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const header = String(req.headers?.['x-cron-secret'] || '').trim();
  return auth === expected || header === expected;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'OPTIONS') {
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');

    if (!hasCronSecret(req)) {
      const token = extractAuthToken(req);
      const denied = await assertAsaasApiAccess(token, req);
      if (denied) {
        res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
        return;
      }
    }

    const body = parseBody(req.body);
    const result = await runAsaasSyncCustomers({
      clientId: body.clientId != null ? String(body.clientId) : undefined,
      limit: body.limit != null ? Number(body.limit) : 20,
      offset: body.offset != null ? Number(body.offset) : 0,
      dryRun: body.dryRun === true,
    });

    res.status(result.errors > 0 ? 207 : 200).json({ ok: result.errors === 0, ...result });
  } catch (e: any) {
    console.error('[asaas-sync-customers]', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || 'Erro ao sincronizar clientes no Asaas' });
  }
}
