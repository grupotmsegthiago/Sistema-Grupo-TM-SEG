/**
 * Relatório diário de produtividade / vigia noturna (09:00 BRT → diretoria).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aggregateProductivityLogs,
  type ProductivityLogRow,
  type UserProductivityRow,
} from '../lib/productivity/aggregateProductivity';
import {
  getNightWatchWindowBounds,
  getPreviousBrasiliaDayBounds,
  NIGHT_IDLE_MINUTES,
} from '../lib/productivity/nightWatch';
import { sendSystemAlertEmail } from './emailService';
import { registerScheduledTick } from './scheduledRegistry';
import { isLongRunningHost } from './runtime';

export { aggregateProductivityLogs };
export type { UserProductivityRow };

export const PRODUCTIVITY_REPORT_SETTINGS_KEY = 'productivity_report';

export type ProductivityReportSettings = {
  emails: string;
  hour: number;
  minute: number;
};

export const PRODUCTIVITY_REPORT_DEFAULTS: ProductivityReportSettings = {
  // Somente diretoria (pedido do Thiago)
  emails: 'thiago@grupotmseg.com.br',
  hour: 9,
  minute: 0,
};

type LogRow = ProductivityLogRow;

function parseEmails(raw: string): string[] {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, '0')}min`;
}

function fmtDt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function buildProductivityReportHtml(opts: {
  dateLabel: string;
  nightLabel: string;
  rows: UserProductivityRow[];
}): string {
  const rowsHtml = opts.rows.length
    ? opts.rows
        .map((r) => {
          const alert =
            r.activeMinutesDay < 60 || r.challengesTimeout > 0 || (r.challengesShown > 0 && r.challengesPassed === 0);
          const bg = alert ? '#fff3cd' : '#ffffff';
          return `<tr style="background:${bg}">
            <td style="padding:8px;border:1px solid #ddd;font-weight:700;">${escapeHtml(r.userName)}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${fmtMin(r.activeMinutesDay)}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${fmtMin(r.activeMinutesNight)}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.interactions || r.clicks || '—'}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.clicks || 0}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.logins}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.creates}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.updates}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.challengesShown}/${r.challengesPassed}/${r.challengesTimeout}</td>
            <td style="padding:8px;border:1px solid #ddd;font-size:11px;">${fmtDt(r.lastActivityAt)}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="10" style="padding:12px;text-align:center;color:#666;">Nenhuma atividade registrada.</td></tr>`;

  return `
    <h2>📊 Log diário de produtividade (home office)</h2>
    <p>Dia civil: <strong>${escapeHtml(opts.dateLabel)}</strong></p>
    <p>Janela noturna vigiada (20h–08h): <strong>${escapeHtml(opts.nightLabel)}</strong></p>
    <p style="font-size:13px;color:#555;">
      Tempo ativo estimado por sequências de logs com pausa ≤ 30 min.
      Desafio de presença dispara após <strong>${NIGHT_IDLE_MINUTES} min</strong> sem interação na vigia noturna.
      Linhas em amarelo: baixo uso (&lt; 1h) ou desafio sem confirmação/timeout.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:12px;">
      <thead>
        <tr style="background:#1e293b;color:#fff;">
          <th style="padding:8px;border:1px solid #334155;text-align:left;">Funcionário</th>
          <th style="padding:8px;border:1px solid #334155;">Ativo (dia)</th>
          <th style="padding:8px;border:1px solid #334155;">Ativo (noite)</th>
          <th style="padding:8px;border:1px solid #334155;">Interações</th>
          <th style="padding:8px;border:1px solid #334155;">Cliques</th>
          <th style="padding:8px;border:1px solid #334155;">Logins</th>
          <th style="padding:8px;border:1px solid #334155;">OS+</th>
          <th style="padding:8px;border:1px solid #334155;">Updates</th>
          <th style="padding:8px;border:1px solid #334155;">Desafio S/OK/TO</th>
          <th style="padding:8px;border:1px solid #334155;">Última atividade</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="font-size:11px;color:#888;margin-top:16px;">
      Destinatários: somente diretoria. Relatório automático às 09:00 (Brasília).
    </p>
  `;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchLogs(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string,
): Promise<LogRow[]> {
  const all: LogRow[] = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('system_logs')
      .select('created_at,user_name,action_type,entity,entity_id,details')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, from + page - 1);
    if (error) {
      console.error('[ProductivityReport] Erro ao ler system_logs:', error.message);
      break;
    }
    if (!data?.length) break;
    all.push(...(data as LogRow[]));
    if (data.length < page) break;
    from += page;
  }
  return all;
}

async function loadSettings(supabase: SupabaseClient): Promise<ProductivityReportSettings> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', PRODUCTIVITY_REPORT_SETTINGS_KEY)
      .maybeSingle();
    if (error || !data?.value) return { ...PRODUCTIVITY_REPORT_DEFAULTS };
    const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return {
      emails:
        typeof raw?.emails === 'string' && raw.emails.trim()
          ? raw.emails.trim()
          : PRODUCTIVITY_REPORT_DEFAULTS.emails,
      hour: Math.max(0, Math.min(23, Number(raw?.hour ?? PRODUCTIVITY_REPORT_DEFAULTS.hour))),
      minute: Math.max(0, Math.min(59, Number(raw?.minute ?? PRODUCTIVITY_REPORT_DEFAULTS.minute))),
    };
  } catch {
    return { ...PRODUCTIVITY_REPORT_DEFAULTS };
  }
}

export async function executeProductivityDailyReport(
  supabase: SupabaseClient,
  opts?: { overrideEmails?: string | null; reference?: Date },
): Promise<{ sent: boolean; emails: string[]; rows: number; dateLabel: string }> {
  const reference = opts?.reference || new Date();
  const cfg = await loadSettings(supabase);
  const emails = parseEmails(opts?.overrideEmails || cfg.emails);
  const day = getPreviousBrasiliaDayBounds(reference);
  const night = getNightWatchWindowBounds(reference);

  console.log(`[ProductivityReport] Gerando log ${day.dateLabel} | noite ${night.label}`);

  const [dayLogs, nightLogs] = await Promise.all([
    fetchLogs(supabase, day.startIso, day.endIso),
    fetchLogs(supabase, night.startIso, night.endIso),
  ]);

  const rows = aggregateProductivityLogs(dayLogs, nightLogs);
  const html = buildProductivityReportHtml({
    dateLabel: day.dateLabel,
    nightLabel: night.label,
    rows,
  });

  let sent = false;
  if (emails.length) {
    sent = await sendSystemAlertEmail(
      emails,
      `Log diário de produtividade — ${day.dateLabel}`,
      html,
    );
  }

  try {
    await supabase.from('system_logs').insert([
      {
        user_name: 'Sistema',
        action_type: 'DAILY_REPORT',
        entity: 'ProductivityReport',
        entity_id: day.dateLabel,
        details: JSON.stringify({
          emails,
          sent,
          users: rows.length,
          dateLabel: day.dateLabel,
          nightLabel: night.label,
        }),
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e: any) {
    console.warn('[ProductivityReport] Falha ao auditar envio:', e?.message);
  }

  return { sent, emails, rows: rows.length, dateLabel: day.dateLabel };
}

export function registerProductivityReportSchedule(supabase: SupabaseClient): void {
  let lastRunKey = '';

  async function tick() {
    const cfg = await loadSettings(supabase);
    const brasiliaTime = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
    );
    if (brasiliaTime.getHours() !== cfg.hour || brasiliaTime.getMinutes() !== cfg.minute) return;
    const key = `${brasiliaTime.toDateString()}-${cfg.hour}:${cfg.minute}`;
    if (lastRunKey === key) return;
    lastRunKey = key;
    try {
      await executeProductivityDailyReport(supabase);
    } catch (e: any) {
      console.error('[ProductivityReport] Erro no tick:', e?.message || e);
    }
  }

  registerScheduledTick(tick);
  if (isLongRunningHost) {
    setInterval(() => {
      tick().catch(() => {});
    }, 60 * 1000);
    console.log(
      '[ProductivityReport] Agendamento ativo — 09:00 BRT (configurável em system_settings.productivity_report), só diretoria.',
    );
  }
}
