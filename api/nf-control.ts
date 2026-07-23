/**
 * Handler leve para Controle de Faturas / NF.
 * Evita o catch-all Express (api/index) que trava no cold-start da Vercel.
 *
 * Rotas (via rewrite em vercel.json):
 *   GET  /api/nf/summary                  → ?op=summary
 *   GET  /api/nf/provider-preferences     → ?op=preferences
 *   PUT  /api/nf/provider-preferences     → ?op=preferences
 *   POST /api/nf/ensure-clean-slate       → ?op=clean-slate
 *
 * POST /api/nf/retry-now fica no Express (api/index / vercelApp.cjs):
 * importar server/nfRetryWorker neste handler leve quebra na Vercel
 * (Cannot find module '/var/task/server/nfRetryWorker').
 */
import {
  assertFinanceNfAccess,
  readBearer,
  resolveLitePrincipal,
} from '../lib/tmsegAuth.js';
import {
  buildNfIssuerSummary,
  isPlugNotasConfiguredLite,
  listPlugNotasCompaniesLite,
  loadNfProviderPreferences,
  saveNfProviderPreferences,
  wipeOpenInvoicesCleanSlate,
} from '../lib/nfInvoiceControlApi.js';

type LiteReq = {
  method?: string;
  headers?: Record<string, unknown>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type LiteRes = {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
};

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

function readOp(req: LiteReq): string {
  const q = req.query?.op ?? req.query?.action;
  return String(Array.isArray(q) ? q[0] : q || '').toLowerCase();
}

export default async function handler(req: LiteReq, res: LiteRes) {
  const method = String(req.method || 'GET').toUpperCase();
  res.setHeader('Cache-Control', 'no-store');

  const token = readBearer(req);
  const denied = await assertFinanceNfAccess(token, req);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }

  const op = readOp(req);

  try {
    if (method === 'GET' && op === 'summary') {
      res.status(200).json(await buildNfIssuerSummary());
      return;
    }

    if (method === 'GET' && op === 'preferences') {
      const prefs = await loadNfProviderPreferences();
      res.status(200).json({
        success: true,
        preferences: prefs,
        companies: listPlugNotasCompaniesLite(),
        plugnotasConfigured: isPlugNotasConfiguredLite(),
      });
      return;
    }

    if (method === 'PUT' && op === 'preferences') {
      const principal = await resolveLitePrincipal(token, req);
      const actor = principal?.email || principal?.name || principal?.id || 'system';
      const body = parseBody(req.body);
      const preferences = body.preferences;
      if (!preferences || typeof preferences !== 'object') {
        res.status(400).json({ ok: false, error: 'preferences é obrigatório' });
        return;
      }
      const saved = await saveNfProviderPreferences(
        preferences as Record<string, unknown>,
        String(actor),
      );
      res.status(200).json({ success: true, preferences: saved });
      return;
    }

    // Limpeza da fila antiga — handler LEVE (não Express). Sempre arquiva Em Aberto/Vencidas.
    if (method === 'POST' && (op === 'clean-slate' || op === 'ensure-clean-slate')) {
      const result = await wipeOpenInvoicesCleanSlate();
      res.status(200).json(result);
      return;
    }

    res.status(405).json({ ok: false, error: 'method_not_allowed', op, method });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[nf-control]', message);
    res.status(500).json({
      ok: false,
      error: message || 'Falha no controle de NF',
    });
  }
}

export const config = { maxDuration: 60 };
