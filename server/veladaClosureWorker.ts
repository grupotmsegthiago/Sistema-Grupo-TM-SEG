/**
 * E-mail da velada ATIVA/TM SEG quando o operador fecha KM, hora e pedágio,
 * e escalação para o Thiago depois de 48 horas.
 */
import { createSupabaseAdminClient } from './supabaseConfig';
import {
  VELADA_CLOSURE_ESCALATION_EMAIL,
  VELADA_CLOSURE_ESCALATION_MS,
  VELADA_CLOSURE_FINANCE_EMAILS,
  getVeladaClosureMissing,
  isVeladaClosureOverdue,
  veladaClosureApplies,
  type VeladaClosureMission,
} from '../lib/veladaClosureAlert';

const SMTP_FROM = '"Grupo TM SEG" <adm@grupotmseg.com.br>';

type MissionRow = VeladaClosureMission & {
  id: string;
  client?: string | null;
  origin?: string | null;
  destination?: string | null;
  velada_closure_notified_at?: string | null;
  velada_closure_escalated_at?: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function tollLogExists(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, missionId: string): Promise<boolean> {
  const { data, error } = await sb
    .from('system_logs')
    .select('id')
    .eq('entity', 'MissionTollConfirmation')
    .eq('entity_id', missionId)
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

async function sendHtml(to: string | string[], subject: string, html: string): Promise<void> {
  const { transporter } = await import('./emailService');
  await transporter.sendMail({
    from: SMTP_FROM,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  });
}

function closureTable(row: MissionRow, missing: string[]): string {
  const when = row.velada_closure_opened_at
    ? new Date(row.velada_closure_opened_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—';
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">OS</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.id)}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Cliente</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.client)}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Fornecedor</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.provider)}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Origem</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.origin)}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Destino</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.destination)}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Operador</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.velada_closure_operator)}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Finalizada em</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(when)}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">KM final</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.end_km ?? row.endKm ?? '—')}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Hora final</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(row.end_time ?? row.endTime ?? '—')}</td></tr>
    <tr><td style="padding:8px;font-weight:700;">Pendências</td><td style="padding:8px;">${missing.length ? escapeHtml(missing.join(', ')) : 'Nenhuma'}</td></tr>
  </table>`;
}

export async function notifyVeladaClosureComplete(missionId: string): Promise<{ sent: boolean; reason: string; missing?: string[] }> {
  const sb = createSupabaseAdminClient();
  if (!sb) return { sent: false, reason: 'supabase_unavailable' };
  const id = String(missionId || '').trim();
  if (!id) return { sent: false, reason: 'missing_id' };

  const { data, error } = await sb.from('missions').select('*').eq('id', id).maybeSingle();
  if (error || !data) return { sent: false, reason: 'not_found' };
  const row = data as MissionRow;
  if (!veladaClosureApplies(row)) return { sent: false, reason: 'not_applicable' };
  if (row.velada_closure_notified_at) return { sent: false, reason: 'already_sent' };

  const tollOk = await tollLogExists(sb, id);
  if (tollOk && row.velada_toll_confirmed !== true) {
    await sb.from('missions').update({ velada_toll_confirmed: true }).eq('id', id);
    row.velada_toll_confirmed = true;
  }
  const missing = getVeladaClosureMissing(row, tollOk);
  if (missing.length > 0) return { sent: false, reason: 'incomplete', missing };

  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#111;">
    <h2 style="color:#166534;">Velada encerrada com KM, hora e pedágio</h2>
    <p>O operador concluiu os dados finais da missão velada abaixo.</p>
    ${closureTable(row, [])}
  </div>`;
  await sendHtml(
    [...VELADA_CLOSURE_FINANCE_EMAILS],
    `Velada concluída — OS ${id} — KM, hora e pedágio informados`,
    html,
  );
  await sb.from('missions').update({ velada_closure_notified_at: new Date().toISOString() }).eq('id', id);
  return { sent: true, reason: 'sent' };
}

export async function runVeladaClosureEscalation(): Promise<{ checked: number; sent: number }> {
  const sb = createSupabaseAdminClient();
  if (!sb) return { checked: 0, sent: 0 };
  const cutoff = new Date(Date.now() - VELADA_CLOSURE_ESCALATION_MS).toISOString();
  const { data, error } = await sb
    .from('missions')
    .select('id, client, provider, origin, destination, status, mission_type, end_km, end_time, velada_toll_confirmed, velada_closure_operator, velada_closure_opened_at, velada_closure_escalated_at')
    .eq('status', 'Concluída')
    .is('velada_closure_escalated_at', null)
    .not('velada_closure_opened_at', 'is', null)
    .lt('velada_closure_opened_at', cutoff)
    .limit(40);
  if (error || !data) {
    console.warn('[VeladaClosure] consulta de escalação falhou:', error?.message);
    return { checked: 0, sent: 0 };
  }

  let sent = 0;
  for (const raw of data as MissionRow[]) {
    if (!veladaClosureApplies(raw) || !isVeladaClosureOverdue(raw.velada_closure_opened_at)) continue;
    const tollOk = raw.velada_toll_confirmed === true || await tollLogExists(sb, raw.id);
    const missing = getVeladaClosureMissing({ ...raw, velada_toll_confirmed: tollOk || raw.velada_toll_confirmed }, tollOk);
    if (missing.length === 0) continue;
    try {
      const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#111;">
        <h2 style="color:#b91c1c;">Velada sem fechamento há mais de 48 horas</h2>
        <p>O operador ainda não informou todos os dados finais. O alerta vermelho também está na tela.</p>
        ${closureTable(raw, missing)}
      </div>`;
      await sendHtml(
        VELADA_CLOSURE_ESCALATION_EMAIL,
        `URGENTE — OS ${raw.id} velada sem KM, hora ou pedágio há mais de 48h`,
        html,
      );
      await sb.from('missions').update({ velada_closure_escalated_at: new Date().toISOString() }).eq('id', raw.id);
      sent += 1;
    } catch (err: any) {
      console.warn('[VeladaClosure] e-mail de 48h falhou:', raw.id, err?.message || err);
    }
  }
  return { checked: data.length, sent };
}
