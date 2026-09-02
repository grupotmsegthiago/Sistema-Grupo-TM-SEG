/**
 * Handler leve para Controle de Faturas / NF.
 * Evita o catch-all Express (api/index) que trava no cold-start da Vercel.
 *
 * Rotas (via rewrite em vercel.json):
 *   GET  /api/nf/summary                  → ?op=summary
 *   GET  /api/nf/invoices                 → ?op=list
 *   GET  /api/nf/provider-preferences     → ?op=preferences
 *   PUT  /api/nf/provider-preferences     → ?op=preferences
 *   POST /api/nf/ensure-clean-slate       → ?op=clean-slate
 *   POST /api/nf/retry-now                → ?op=retry-now
 *   POST /api/nf/retry/:invoiceId         → ?op=retry-invoice&invoiceId=:invoiceId
 *
 * retry-now / retry-invoice usam bundle CJS gerado no build (`api/_nf-retry-core.cjs`).
 * Não importar server/nfRetryWorker direto — a Vercel não empacota esse path.
 */
import { createRequire } from 'node:module';
import {
  assertFinanceNfAccess,
  readBearer,
  resolveLitePrincipal,
} from '../lib/tmsegAuth.js';
import {
  buildNfIssuerSummary,
  isPlugNotasConfiguredLite,
  listFinancialInvoicesForControl,
  listPlugNotasCompaniesLite,
  loadNfProviderPreferences,
  saveNfProviderPreferences,
  wipeOpenInvoicesCleanSlate,
} from '../lib/nfInvoiceControlApi.js';
import { syncPendingAsaasNfStatuses } from '../lib/asaasNfStatusSync.js';
import { executeManualInvoiceRetry } from '../lib/nfRetryInvoiceApiCore.js';

const require = createRequire(import.meta.url);

// Require ESTÁTICO — file tracer da Vercel precisa do caminho literal.
const nfRetryCore = require('./_nf-retry-core.cjs') as {
  runRetryCycle: (opts?: { limit?: number }) => Promise<{
    processed: number;
    ok: number;
    paused: number;
    errors: number;
    stuck: number;
  }>;
  reopenPausedNfs: (limit?: number) => Promise<{ reopened: number }>;
  listPendingNfs: () => Promise<import('../lib/nfRetryInvoiceApiCore.js').ManualRetryInvoiceRow[]>;
  retryOne: (
    inv: import('../lib/nfRetryInvoiceApiCore.js').ManualRetryInvoiceRow,
  ) => Promise<import('../lib/nfRetryInvoiceApiCore.js').RetryOneResult>;
};

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

    if (method === 'GET' && (op === 'list' || op === 'invoices')) {
      res.status(200).json(await listFinancialInvoicesForControl());
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

    // Retry manual individual — handler leve (evita catch-all Express).
    if (method === 'POST' && op === 'retry-invoice') {
      const invoiceId = String(req.query?.invoiceId || parseBody(req.body).invoiceId || '').trim();
      if (!invoiceId) {
        res.status(400).json({ ok: false, success: false, error: 'invoiceId é obrigatório' });
        return;
      }
      const outcome = await executeManualInvoiceRetry(invoiceId, nfRetryCore.retryOne, {
        listPendingNfs: nfRetryCore.listPendingNfs,
      });
      res.status(outcome.httpStatus).json({ ...outcome.body, liteHandler: true });
      return;
    }

    // Reemitir NFs pendentes — bundle CJS (não Express / não import server/).
    if (method === 'POST' && op === 'retry-now') {
      const qLimit = Number(req.query?.limit);
      const body = parseBody(req.body);
      const bodyLimit = Number(body.limit);
      const limitRaw = Number.isFinite(qLimit) && qLimit > 0 ? qLimit : bodyLimit;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 40) : 10;
      const reopen =
        String(req.query?.reopen || '') === '1' ||
        body.reopen === true ||
        body.reopen === 1 ||
        body.reopen === '1';

      // 1) Espelho leve Asaas→Supabase (limpa 401 stale quando a NF já existe).
      const synced = await syncPendingAsaasNfStatuses({ limit });

      let reopened = 0;
      if (reopen) {
        const r = await nfRetryCore.reopenPausedNfs(limit);
        reopened = r.reopened;
      }
      const result = await nfRetryCore.runRetryCycle({ limit });
      // 2) Sync de novo após o ciclo (pega NFs acabadas de agendar).
      const syncedAfter = await syncPendingAsaasNfStatuses({ limit });
      res.status(200).json({
        success: true,
        reopened,
        ...result,
        synced: {
          before: { updated: synced.updated, clearedErrors: synced.clearedErrors },
          after: { updated: syncedAfter.updated, clearedErrors: syncedAfter.clearedErrors },
        },
        liteHandler: true,
      });
      return;
    }

    // Só espelha status NF (sem reemitir) — útil no botão Atualizar.
    if (method === 'POST' && (op === 'sync-nf' || op === 'sync')) {
      const qLimit = Number(req.query?.limit);
      const body = parseBody(req.body);
      const limitRaw = Number.isFinite(qLimit) && qLimit > 0 ? qLimit : Number(body.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 40) : 20;
      const paymentId = String(body.paymentId || req.query?.paymentId || '').trim() || undefined;
      const synced = await syncPendingAsaasNfStatuses({ limit, paymentId });
      res.status(200).json({ success: true, ...synced, liteHandler: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'method_not_allowed', op, method });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[nf-control]', message);
    const isAsaasKey =
      /chave de API fornecida é inválida|Asaas API Error \(401\)|Asaas API Error \(403\)/i.test(
        message,
      );
    res.status(isAsaasKey ? 502 : 500).json({
      ok: false,
      error: isAsaasKey
        ? `${message} — confira ASAAS_TMGESTAO_API na Vercel e faça redeploy. Diagnóstico: GET /api/asaas/status?probe=1`
        : message || 'Falha no controle de NF',
    });
  }
}

export const config = { maxDuration: 120 };
