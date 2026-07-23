/**
 * Emissão Asaas (create-charge) — rota LEVE.
 * Evita cold start do Express (api/index → dist/vercelApp.cjs ~1.3MB),
 * que era a causa do Abort ~30s no browser enquanto o "sistema Torres"
 * (servidor sempre quente) emitia normalmente.
 *
 * Rewrite: /api/asaas/create-charge → /api/asaas-create-charge
 */
import { assertAsaasApiAccess, extractAuthToken, extractUserIdFromToken } from '../lib/asaasApiAuth.js';
import { runAsaasCreateCharge } from '../lib/asaasCreateChargeCore.js';
import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';

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

function headerName(req: { headers?: Record<string, unknown> }): string {
  const h = req.headers || {};
  const raw = h['x-tmseg-user-name'] ?? h['X-Tmseg-User-Name'];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

async function resolveCreatedBy(token: string, req: { headers?: Record<string, unknown> }): Promise<string> {
  const fromHeader = headerName(req);
  if (fromHeader) return fromHeader;
  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Sistema';
  try {
    const sb = createSupabaseAdminClient();
    if (!sb) return 'Sistema';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3_000);
    try {
      const { data } = await sb
        .from('system_users')
        .select('name')
        .eq('id', userId)
        .abortSignal(ctrl.signal)
        .maybeSingle();
      return String(data?.name || 'Sistema');
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return 'Sistema';
  }
}

export default async function handler(req: any, res: any) {
  const started = Date.now();
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');

    const token = extractAuthToken(req);
    const denied = await assertAsaasApiAccess(token, req);
    if (denied) {
      res.status(denied === 'Não autorizado' ? 401 : 403).json({ success: false, error: denied });
      return;
    }

    const createdBy = await resolveCreatedBy(token, req);
    const result = await runAsaasCreateCharge({
      body: parseBody(req.body),
      createdBy,
    });

    console.log(`[asaas-create-charge] HTTP ${result.status} em ${Date.now() - started}ms`);
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[asaas-create-charge]', e?.message || e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e?.message || 'Falha ao processar cobrança no servidor.',
        liteHandler: true,
      });
    }
  }
}

export const config = { maxDuration: 60 };
