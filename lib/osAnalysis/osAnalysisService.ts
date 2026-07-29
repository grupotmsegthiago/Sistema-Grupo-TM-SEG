/**
 * Serviço de Pedido de Análise de OS (SSOT).
 * Usado pelo handler serverless /api/os-analysis (Express catch-all está instável na Vercel).
 */

import { requireOsAnalysisAdmin, type OsAnalysisPrincipal } from './apiAuth.js';
import { sendOsAnalysisAlertEmail } from './sendAlertEmail.js';
import type { OsAnalysisRecipient } from '../osAnalysisTypes.js';

const SYSTEM_URL = (process.env.SYSTEM_URL || 'https://sistema.grupotmseg.com.br').replace(/\/$/, '');

export function buildAuditLink(missionId: string): string {
  return `${SYSTEM_URL}/?page=missions&openMission=${encodeURIComponent(missionId)}`;
}

let schemaReady = false;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS os_analysis_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id TEXT NOT NULL,
  client_name TEXT,
  provider_name TEXT,
  requested_by TEXT NOT NULL,
  request_note TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'audit',
  status TEXT NOT NULL DEFAULT 'pending',
  revenue_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  result_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjusted_by TEXT,
  adjusted_at TIMESTAMPTZ,
  adjustment_reason TEXT,
  revenue_after NUMERIC(14,2),
  cost_after NUMERIC(14,2),
  result_after NUMERIC(14,2),
  result_delta NUMERIC(14,2),
  changes_summary TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  recipient_ids TEXT[] NOT NULL DEFAULT '{}',
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  claimed_by_id TEXT,
  claimed_by_name TEXT,
  claimed_at TIMESTAMPTZ,
  message_opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE os_analysis_requests ADD COLUMN IF NOT EXISTS recipient_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE os_analysis_requests ADD COLUMN IF NOT EXISTS recipients JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE os_analysis_requests ADD COLUMN IF NOT EXISTS claimed_by_id TEXT;
ALTER TABLE os_analysis_requests ADD COLUMN IF NOT EXISTS claimed_by_name TEXT;
ALTER TABLE os_analysis_requests ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE os_analysis_requests ADD COLUMN IF NOT EXISTS message_opened_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_os_analysis_mission ON os_analysis_requests (mission_id);
CREATE INDEX IF NOT EXISTS idx_os_analysis_status ON os_analysis_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_analysis_recipient_ids ON os_analysis_requests USING GIN (recipient_ids);
`;

export async function ensureOsAnalysisSchema(): Promise<void> {
  if (schemaReady) return;
  let sb;
  try {
    sb = requireOsAnalysisAdmin();
  } catch {
    return;
  }
  for (const statement of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      await sb.rpc('exec_sql', { sql: statement + ';' });
    } catch {
      // idempotente
    }
  }
  schemaReady = true;
}

function normalizeRecipients(raw: unknown): OsAnalysisRecipient[] {
  if (!Array.isArray(raw)) return [];
  const out: OsAnalysisRecipient[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String((item as any)?.id || '').trim();
    const name = String((item as any)?.name || '').trim();
    const email = String((item as any)?.email || '').trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: name || 'Usuário', email });
  }
  return out;
}

async function sendAlert(to: string[], subject: string, html: string): Promise<boolean> {
  try {
    return await sendOsAnalysisAlertEmail(to, subject, html);
  } catch (e: any) {
    console.error('[os-analysis] e-mail falhou:', e?.message);
    return false;
  }
}

export type RequestAnalysisInput = {
  missionId: string;
  note: string;
  source?: string;
  revenueBefore?: number;
  costBefore?: number;
  resultBefore?: number;
  client?: string | null;
  provider?: string | null;
  recipients?: OsAnalysisRecipient[];
};

export async function requestOsAnalysis(principal: OsAnalysisPrincipal, input: RequestAnalysisInput) {
  await ensureOsAnalysisSchema();
  const sb = requireOsAnalysisAdmin();

  const missionId = String(input.missionId || '').trim();
  const note = String(input.note || '').trim();
  if (!missionId || !note) throw new Error('Informe a OS e a observação.');

  const recipients = normalizeRecipients(input.recipients);
  if (recipients.length === 0) throw new Error('Selecione ao menos um destinatário.');

  const revenueBefore = Number(input.revenueBefore ?? 0) || 0;
  const costBefore = Number(input.costBefore ?? 0) || 0;
  const resultBefore = Number(input.resultBefore ?? (revenueBefore - costBefore)) || 0;
  const clientName = input.client || null;
  const providerName = input.provider || null;
  const requestedBy = principal.name;
  const source = String(input.source || 'audit');
  const recipientIds = recipients.map((r) => r.id);

  const { data, error } = await sb
    .from('os_analysis_requests')
    .insert([{
      mission_id: missionId,
      client_name: clientName,
      provider_name: providerName,
      requested_by: requestedBy,
      request_note: note,
      source,
      status: 'pending',
      revenue_before: revenueBefore,
      cost_before: costBefore,
      result_before: resultBefore,
      recipient_ids: recipientIds,
      recipients,
    }])
    .select('*')
    .single();

  if (error) {
    throw new Error(
      error.message.includes('does not exist') || error.message.includes('recipient')
        ? 'Tabela/colunas de análise desatualizadas. Execute a migration no Supabase.'
        : error.message,
    );
  }

  const link = buildAuditLink(missionId);
  const names = recipients.map((r) => r.name).join(', ');
  const html = `
    <p><strong>${requestedBy}</strong> pediu para analisar essa OS.</p>
    <p style="margin:16px 0;padding:12px 16px;background:#fff7ed;border-left:4px solid #d97706;border-radius:6px;">
      <strong>Observação da Diretoria:</strong><br/>${note.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">OS</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${missionId}</strong></td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Cliente</td><td style="padding:8px;border-bottom:1px solid #eee;">${clientName || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Fornecedor</td><td style="padding:8px;border-bottom:1px solid #eee;">${providerName || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Resultado atual</td><td style="padding:8px;border-bottom:1px solid #eee;">R$ ${resultBefore.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Destinatários</td><td style="padding:8px;border-bottom:1px solid #eee;">${names}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">
        Abrir Auditoria da OS
      </a>
    </p>
    <p style="font-size:12px;color:#666;">No sistema aparecerá <strong>“Um recado da Diretoria”</strong>. Ao ajustar, informe o <strong>motivo</strong>.</p>
  `;

  const emails = recipients.map((r) => r.email).filter((e) => e.includes('@'));
  const emailSent = emails.length
    ? await sendAlert(emails, `${requestedBy} pediu para analisar essa OS — ${missionId}`, html)
    : false;

  return { request: data, emailSent, link, recipients };
}

/** Pedidos pendentes que bloqueiam o usuário (destinatário sem claim de outra pessoa). */
export async function listInboxForUser(userId: string) {
  await ensureOsAnalysisSchema();
  const sb = requireOsAnalysisAdmin();
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const { data, error } = await sb
    .from('os_analysis_requests')
    .select('*')
    .eq('status', 'pending')
    .contains('recipient_ids', [uid])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (data || []).filter((row: any) => {
    const claimedBy = String(row.claimed_by_id || '').trim();
    // Sem claim → bloqueia todos os destinatários
    if (!claimedBy) return true;
    // Com claim → só o responsável continua bloqueado (sticky)
    return claimedBy === uid;
  });
}

/** Um destinatário abre a mensagem e assume — libera os demais. */
export async function claimOsAnalysis(principal: OsAnalysisPrincipal, requestId: string) {
  await ensureOsAnalysisSchema();
  const sb = requireOsAnalysisAdmin();
  const id = String(requestId || '').trim();
  if (!id) throw new Error('Informe o id do pedido.');

  const { data: row, error: loadErr } = await sb
    .from('os_analysis_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!row) throw new Error('Pedido não encontrado.');
  if (row.status !== 'pending') throw new Error('Este pedido já foi resolvido.');

  const ids: string[] = Array.isArray(row.recipient_ids) ? row.recipient_ids.map(String) : [];
  if (!ids.includes(principal.id)) {
    throw new Error('Você não é destinatário deste recado.');
  }

  const claimedBy = String(row.claimed_by_id || '').trim();
  if (claimedBy && claimedBy !== principal.id) {
    return {
      ok: false as const,
      conflict: true as const,
      request: row,
      reason: `${row.claimed_by_name || 'Outro usuário'} já assumiu este recado.`,
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('os_analysis_requests')
    .update({
      claimed_by_id: principal.id,
      claimed_by_name: principal.name,
      claimed_at: row.claimed_at || now,
      message_opened_at: row.message_opened_at || now,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return { ok: true as const, conflict: false as const, request: data };
}

export async function listOsAnalysisRequests(status?: string) {
  await ensureOsAnalysisSchema();
  const sb = requireOsAnalysisAdmin();
  let q = sb.from('os_analysis_requests').select('*').order('created_at', { ascending: false }).limit(300);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getOpenOsAnalysisRequest(missionId: string) {
  await ensureOsAnalysisSchema();
  const sb = requireOsAnalysisAdmin();
  const { data, error } = await sb
    .from('os_analysis_requests')
    .select('*')
    .eq('mission_id', missionId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export type RespondAnalysisInput = {
  missionId: string;
  reason: string;
  revenueAfter?: number;
  costAfter?: number;
  resultAfter?: number;
  changesSummary?: string;
  requestId?: string | null;
};

export async function respondOsAnalysis(principal: OsAnalysisPrincipal, input: RespondAnalysisInput) {
  await ensureOsAnalysisSchema();
  const sb = requireOsAnalysisAdmin();

  const missionId = String(input.missionId || '').trim();
  const reason = String(input.reason || '').trim();
  if (!missionId || !reason) throw new Error('Informe o motivo do ajuste.');

  const adjustedBy = principal.name || 'Usuário';
  const revenueAfter = Number(input.revenueAfter ?? 0) || 0;
  const costAfter = Number(input.costAfter ?? 0) || 0;
  const resultAfter = Number(input.resultAfter ?? (revenueAfter - costAfter)) || 0;
  const changesSummary = String(input.changesSummary || '').trim();
  const requestId = input.requestId ? String(input.requestId) : null;

  let pending: any = null;
  if (requestId) {
    const { data } = await sb.from('os_analysis_requests').select('*').eq('id', requestId).maybeSingle();
    pending = data;
  } else {
    const { data } = await sb
      .from('os_analysis_requests')
      .select('*')
      .eq('mission_id', missionId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    pending = data;
  }

  if (!pending) {
    return { skipped: true as const, reason: 'Nenhum pedido pendente para esta OS.' };
  }

  const resultDelta = Math.round((resultAfter - Number(pending.result_before || 0)) * 100) / 100;
  const { data, error } = await sb
    .from('os_analysis_requests')
    .update({
      status: 'adjusted',
      adjusted_by: adjustedBy,
      adjusted_at: new Date().toISOString(),
      adjustment_reason: reason,
      revenue_after: revenueAfter,
      cost_after: costAfter,
      result_after: resultAfter,
      result_delta: resultDelta,
      changes_summary: changesSummary || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pending.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const impact =
    resultDelta > 0.01 ? 'RESULTADO POSITIVO (melhorou)' :
    resultDelta < -0.01 ? 'RESULTADO NEGATIVO (piorou)' :
    'RESULTADO ESTÁVEL';

  await sendAlert(
    ['thiago@grupotmseg.com.br'],
    `OS ${missionId} ajustada — ${impact}`,
    `<p><strong>${adjustedBy}</strong> respondeu ao pedido de análise da OS <strong>${missionId}</strong>.</p>
     <p><strong>Motivo:</strong> ${reason.replace(/</g, '&lt;')}</p>
     <p>Antes: R$ ${Number(pending.result_before).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} → Depois: R$ ${resultAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Δ R$ ${resultDelta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</p>
     <p>${impact}</p>
     <p><a href="${SYSTEM_URL}/?page=os-analysis-pending">Abrir Pendências de OS</a></p>`,
  );

  return { skipped: false as const, request: data };
}

export async function reviewOsAnalysis(principal: OsAnalysisPrincipal, id: string, notes?: string) {
  await ensureOsAnalysisSchema();
  const sb = requireOsAnalysisAdmin();
  const { data, error } = await sb
    .from('os_analysis_requests')
    .update({
      status: 'reviewed',
      reviewed_by: principal.name,
      reviewed_at: new Date().toISOString(),
      review_notes: String(notes || '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
