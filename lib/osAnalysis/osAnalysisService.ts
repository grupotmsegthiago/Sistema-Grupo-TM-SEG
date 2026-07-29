/**
 * Serviço de Pedido de Análise de OS (SSOT).
 * Usado pelo handler serverless /api/os-analysis (Express catch-all está instável na Vercel).
 */

import { OS_ANALYSIS_RECIPIENT_EMAILS } from '../osAnalysisAccess.js';
import { adminSupabase, type OsAnalysisPrincipal } from './apiAuth.js';
import { sendOsAnalysisAlertEmail } from './sendAlertEmail.js';

const SYSTEM_URL = (process.env.SYSTEM_URL || 'https://sistema.grupotmseg.com.br').replace(/\/$/, '');

export function buildAuditLink(missionId: string): string {
  return `${SYSTEM_URL}/?page=missions&openMission=${encodeURIComponent(missionId)}`;
}

let schemaReady = false;

export async function ensureOsAnalysisSchema(): Promise<void> {
  if (schemaReady) return;
  const sb = adminSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from('os_analysis_requests').select('id').limit(1);
    if (!error) {
      schemaReady = true;
      return;
    }
  } catch {
    // tenta criar via RPC
  }
  const sql = `
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_os_analysis_mission ON os_analysis_requests (mission_id);
CREATE INDEX IF NOT EXISTS idx_os_analysis_status ON os_analysis_requests (status, created_at DESC);
`;
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      await sb.rpc('exec_sql', { sql: statement + ';' });
    } catch {
      // idempotente
    }
  }
  schemaReady = true;
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
};

export async function requestOsAnalysis(principal: OsAnalysisPrincipal, input: RequestAnalysisInput) {
  await ensureOsAnalysisSchema();
  const sb = adminSupabase();
  if (!sb) throw new Error('Supabase admin indisponível — configure SUPABASE_SERVICE_ROLE_KEY na Vercel');

  const missionId = String(input.missionId || '').trim();
  const note = String(input.note || '').trim();
  if (!missionId || !note) throw new Error('Informe a OS e a observação.');

  const revenueBefore = Number(input.revenueBefore ?? 0) || 0;
  const costBefore = Number(input.costBefore ?? 0) || 0;
  const resultBefore = Number(input.resultBefore ?? (revenueBefore - costBefore)) || 0;
  const clientName = input.client || null;
  const providerName = input.provider || null;
  const requestedBy = principal.name;
  const source = String(input.source || 'audit');

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
    }])
    .select('*')
    .single();

  if (error) {
    throw new Error(
      error.message.includes('does not exist')
        ? 'Tabela os_analysis_requests não existe. Execute a migration no Supabase.'
        : error.message,
    );
  }

  const link = buildAuditLink(missionId);
  const html = `
    <p><strong>${requestedBy}</strong> pediu para analisar essa OS.</p>
    <p style="margin:16px 0;padding:12px 16px;background:#fff7ed;border-left:4px solid #d97706;border-radius:6px;">
      <strong>Observação:</strong><br/>${note.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">OS</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${missionId}</strong></td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Cliente</td><td style="padding:8px;border-bottom:1px solid #eee;">${clientName || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Fornecedor</td><td style="padding:8px;border-bottom:1px solid #eee;">${providerName || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Resultado atual</td><td style="padding:8px;border-bottom:1px solid #eee;">R$ ${resultBefore.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">
        Abrir Auditoria da OS
      </a>
    </p>
    <p style="font-size:12px;color:#666;">Ao ajustar, informe o <strong>motivo</strong> — a Diretoria verá o delta de valores na tela de Pendências de OS.</p>
  `;

  let recipients = [...OS_ANALYSIS_RECIPIENT_EMAILS];
  try {
    const { data: users } = await sb
      .from('system_users')
      .select('name, email')
      .or('name.ilike.%barbara%,name.ilike.%giovanna%');
    const found = (users || [])
      .map((u: any) => String(u.email || '').trim().toLowerCase())
      .filter((e: string) => e.includes('@'));
    if (found.length) recipients = [...new Set([...found, ...OS_ANALYSIS_RECIPIENT_EMAILS])];
  } catch {
    // defaults
  }

  const emailSent = await sendAlert(
    recipients,
    `Thiago pediu para analisar essa OS — ${missionId}`,
    html,
  );

  return { request: data, emailSent, link };
}

export async function listOsAnalysisRequests(status?: string) {
  await ensureOsAnalysisSchema();
  const sb = adminSupabase();
  if (!sb) throw new Error('Supabase admin indisponível — configure SUPABASE_SERVICE_ROLE_KEY na Vercel');
  let q = sb.from('os_analysis_requests').select('*').order('created_at', { ascending: false }).limit(300);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getOpenOsAnalysisRequest(missionId: string) {
  await ensureOsAnalysisSchema();
  const sb = adminSupabase();
  if (!sb) throw new Error('Supabase admin indisponível — configure SUPABASE_SERVICE_ROLE_KEY na Vercel');
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
  const sb = adminSupabase();
  if (!sb) throw new Error('Supabase admin indisponível — configure SUPABASE_SERVICE_ROLE_KEY na Vercel');

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
  const sb = adminSupabase();
  if (!sb) throw new Error('Supabase admin indisponível — configure SUPABASE_SERVICE_ROLE_KEY na Vercel');
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
