/**
 * Reaprovação financeira no Express (dev e /api/index na Vercel).
 * A senha é lida, conferida e apagada do corpo. Não entra em log.
 */
import type { Express, Request, Response } from 'express';
import { extractAuthToken, resolveOsAnalysisPrincipal } from '../lib/osAnalysis/apiAuth';
import { senhasConferem } from '../lib/reaprovacaoFinanceira/capturaSenha';
import {
  classificarErroTrava,
  criarArmazenamento,
  criarRepositorio,
  osDaLinha,
} from '../lib/reaprovacaoFinanceira/gravacao';
import { tratarReaprovacaoHttp } from '../lib/reaprovacaoFinanceira/tratar';
import { createSupabaseAdminClient } from './supabaseConfig';

const COLUNAS_OS = [
  'id',
  'client',
  'status',
  'invoice_number',
  'billing_approved',
  'billing_verified_by',
  'snapshot_approved_by',
  'snapshot_approved_at',
  'snapshot_data',
  'negative_margin_locked',
  'revenue_value',
  'cost_value',
  'revenue_edit_reason',
  'cost_edit_reason',
  'toll_value',
  'toll_value_provider',
].join(', ');

async function carregarOs(sb: ReturnType<typeof createSupabaseAdminClient>, missionId: string) {
  if (!sb) return { ok: false as const, erro: 'O servidor não conseguiu ler a OS.' };
  const { data, error } = await sb.from('missions').select(COLUNAS_OS).eq('id', missionId).maybeSingle();
  if (error) return { ok: false as const, erro: 'Falha ao ler a OS. A reaprovação foi impedida.' };
  if (!data) return { ok: true as const, os: null };

  const vinculo = await sb.from('financial_invoice_missions').select('invoice_id').eq('mission_id', missionId);
  const classeVinculo = classificarErroTrava(vinculo.error);
  if (classeVinculo === 'incompleta') {
    return { ok: true as const, os: osDaLinha(data, { consultaTravaIncompleta: true }) };
  }
  const ids = classeVinculo === 'ausente'
    ? []
    : [...new Set((vinculo.data || []).map((row: { invoice_id?: string }) => String(row.invoice_id || '')).filter(Boolean))];
  if (ids.length === 0) return { ok: true as const, os: osDaLinha(data, { faturaPaga: false }) };

  const faturas = await sb.from('financial_invoices').select('id, status').in('id', ids);
  const classeFatura = classificarErroTrava(faturas.error);
  if (classeFatura === 'incompleta') {
    return { ok: true as const, os: osDaLinha(data, { consultaTravaIncompleta: true }) };
  }
  const paga = (faturas.data || []).some((row: { status?: string }) => String(row.status || '').toUpperCase() === 'PAGA');
  return { ok: true as const, os: osDaLinha(data, { faturaPaga: paga }) };
}

export function registerReaprovacaoFinanceiraRoutes(app: Express, requireAuth: any): void {
  app.use('/api/reaprovacao-financeira', requireAuth, async (req: Request, res: Response) => {
    const corpoOriginal = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    if (req.body && typeof req.body === 'object') delete req.body.senha;
    try {
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ ok: false, erro: 'O servidor não conseguiu confirmar a autenticação.', percentual: 0 });
        return;
      }
      const principal = await resolveOsAnalysisPrincipal(extractAuthToken(req), req);
      const entrada = req.method === 'GET' ? { ...(req.query as Record<string, unknown>) } : corpoOriginal;
      const op = String(req.query.op || (entrada as { op?: string }).op || '');
      const tratado = await tratarReaprovacaoHttp({
        principal: principal
          ? { id: principal.id, name: principal.name, role: principal.role }
          : null,
        method: req.method,
        op,
        corpo: entrada,
        buscaOs: (id) => carregarOs(sb, id),
        senhaConfere: async (usuarioId, senha) => {
          const { data, error } = await sb.from('system_users').select('password').eq('id', usuarioId).maybeSingle();
          if (error || !data) return false;
          return senhasConferem(String((data as { password?: string }).password || ''), senha);
        },
        repo: criarRepositorio(sb as any),
        storage: criarArmazenamento(sb as any),
      });
      res.status(tratado.status).json(tratado.body);
    } catch {
      console.error('[reaprovacao] falha inesperada');
      res.status(500).json({ ok: false, erro: 'Não foi possível concluir a reaprovação.', percentual: 0 });
    }
  });
}
