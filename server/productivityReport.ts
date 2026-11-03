/**
 * Relatório de produtividade / sessão (09:00 e 21:00 BRT → thiago@grupotmseg.com.br).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aggregateProductivityLogs,
  type ProductivityLogRow,
  type UserProductivityRow,
} from '../lib/productivity/aggregateProductivity';
import {
  dinnerBreakLabel,
  getCurrentBrasiliaDayBounds,
  getEveningNightSliceBounds,
  getNightWatchWindowBounds,
  getPreviousBrasiliaDayBounds,
  NIGHT_IDLE_MINUTES,
} from '../lib/productivity/nightWatch';
import { SESSION_IDLE_LOGOUT_MINUTES } from '../lib/productivity/sessionIdleLogout';
import { sendSystemAlertEmail } from './emailService';
import { registerScheduledTick } from './scheduledRegistry';
import { isLongRunningHost } from './runtime';

export { aggregateProductivityLogs };
export type { UserProductivityRow };

export const PRODUCTIVITY_REPORT_SETTINGS_KEY = 'productivity_report';

export type ProductivityReportPeriod = 'previous_day' | 'today_so_far';

export type ProductivityReportSchedule = {
  hour: number;
  minute: number;
  period: ProductivityReportPeriod;
};

export type ProductivityReportSettings = {
  emails: string;
  /** @deprecated Prefer schedules[]. Mantido para compat com system_settings antigo. */
  hour?: number;
  minute?: number;
  schedules: ProductivityReportSchedule[];
};

export const PRODUCTIVITY_REPORT_DEFAULTS: ProductivityReportSettings = {
  // Somente Thiago / diretoria (pedido explícito)
  emails: 'thiago@grupotmseg.com.br',
  schedules: [
    { hour: 9, minute: 0, period: 'previous_day' },
    { hour: 21, minute: 0, period: 'today_so_far' },
  ],
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

function periodTitle(period: ProductivityReportPeriod): string {
  return period === 'today_so_far'
    ? 'Parcial do dia (até agora)'
    : 'Dia civil completo (ontem)';
}

export function buildProductivityReportHtml(opts: {
  dateLabel: string;
  nightLabel: string;
  rows: UserProductivityRow[];
  period?: ProductivityReportPeriod;
  slotLabel?: string;
}): string {
  const period = opts.period || 'previous_day';
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

  const slot = opts.slotLabel || (period === 'today_so_far' ? '21:00' : '09:00');

  return `
    <h2>📊 Log de produtividade / sessão</h2>
    <p>Tipo: <strong>${escapeHtml(periodTitle(period))}</strong> · disparo <strong>${escapeHtml(slot)} BRT</strong></p>
    <p>Dia civil: <strong>${escapeHtml(opts.dateLabel)}</strong></p>
    <p>Janela noturna: <strong>${escapeHtml(opts.nightLabel)}</strong></p>
    <p style="font-size:13px;color:#555;">
      Colunas principais: <strong>tempo ativo (logado/usando)</strong>, <strong>interações</strong> e <strong>quantas vezes logou</strong>.
      Tempo ativo estimado por sequências de logs com pausa ≤ 30 min.
      Logout automático após <strong>${SESSION_IDLE_LOGOUT_MINUTES} min</strong> sem interação (funcionários).
      Desafio de presença noturna após <strong>${NIGHT_IDLE_MINUTES} min</strong> (20h–08h; janta ${dinnerBreakLabel()} isenta).
      Linhas em amarelo: baixo uso (&lt; 1h) ou desafio sem confirmação/timeout.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:12px;">
      <thead>
        <tr style="background:#1e293b;color:#fff;">
          <th style="padding:8px;border:1px solid #334155;text-align:left;">Funcionário</th>
          <th style="padding:8px;border:1px solid #334155;">Tempo ativo</th>
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
      Destinatário: thiago@grupotmseg.com.br. Envios automáticos às 09:00 (dia anterior) e 21:00 (parcial do dia).
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

function normalizeSchedules(raw: unknown, fallbackHour?: number, fallbackMinute?: number): ProductivityReportSchedule[] {
  if (Array.isArray(raw) && raw.length) {
    const parsed = raw
      .map((item) => {
        const hour = Math.max(0, Math.min(23, Number((item as any)?.hour)));
        const minute = Math.max(0, Math.min(59, Number((item as any)?.minute ?? 0)));
        const periodRaw = String((item as any)?.period || 'previous_day');
        const period: ProductivityReportPeriod =
          periodRaw === 'today_so_far' ? 'today_so_far' : 'previous_day';
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
        return { hour, minute, period };
      })
      .filter(Boolean) as ProductivityReportSchedule[];
    if (parsed.length) return parsed;
  }
  if (fallbackHour != null) {
    return [
      {
        hour: Math.max(0, Math.min(23, Number(fallbackHour))),
        minute: Math.max(0, Math.min(59, Number(fallbackMinute ?? 0))),
        period: 'previous_day',
      },
      { hour: 21, minute: 0, period: 'today_so_far' },
    ];
  }
  return [...PRODUCTIVITY_REPORT_DEFAULTS.schedules];
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
      schedules: normalizeSchedules(raw?.schedules, raw?.hour, raw?.minute),
    };
  } catch {
    return { ...PRODUCTIVITY_REPORT_DEFAULTS };
  }
}

export function resolveReportWindows(
  period: ProductivityReportPeriod,
  reference: Date = new Date(),
): {
  day: { startIso: string; endIso: string; dateLabel: string };
  night: { startIso: string; endIso: string; label: string };
} {
  if (period === 'today_so_far') {
    return {
      day: getCurrentBrasiliaDayBounds(reference),
      night: getEveningNightSliceBounds(reference),
    };
  }
  return {
    day: getPreviousBrasiliaDayBounds(reference),
    night: getNightWatchWindowBounds(reference),
  };
}

export async function executeProductivityDailyReport(
  supabase: SupabaseClient,
  opts?: {
    overrideEmails?: string | null;
    reference?: Date;
    period?: ProductivityReportPeriod;
    slotLabel?: string;
  },
): Promise<{ sent: boolean; emails: string[]; rows: number; dateLabel: string; period: ProductivityReportPeriod }> {
  const reference = opts?.reference || new Date();
  const period = opts?.period || 'previous_day';
  const cfg = await loadSettings(supabase);
  const emails = parseEmails(opts?.overrideEmails || cfg.emails);
  const { day, night } = resolveReportWindows(period, reference);
  const slotLabel = opts?.slotLabel || (period === 'today_so_far' ? '21:00' : '09:00');

  console.log(
    `[ProductivityReport] Gerando log ${period} ${day.dateLabel} | noite ${night.label} | slot ${slotLabel}`,
  );

  const [dayLogs, nightLogs] = await Promise.all([
    fetchLogs(supabase, day.startIso, day.endIso),
    night.startIso === night.endIso
      ? Promise.resolve([] as LogRow[])
      : fetchLogs(supabase, night.startIso, night.endIso),
  ]);

  const rows = aggregateProductivityLogs(dayLogs, nightLogs);
  const html = buildProductivityReportHtml({
    dateLabel: day.dateLabel,
    nightLabel: night.label,
    rows,
    period,
    slotLabel,
  });

  const subject =
    period === 'today_so_far'
      ? `Log parcial de produtividade (21h) — ${day.dateLabel}`
      : `Log diário de produtividade (09h) — ${day.dateLabel}`;

  let sent = false;
  if (emails.length) {
    sent = await sendSystemAlertEmail(emails, subject, html);
  }

  try {
    await supabase.from('system_logs').insert([
      {
        user_name: 'Sistema',
        action_type: 'DAILY_REPORT',
        entity: 'ProductivityReport',
        entity_id: `${day.dateLabel}:${period}:${slotLabel}`,
        details: JSON.stringify({
          emails,
          sent,
          users: rows.length,
          dateLabel: day.dateLabel,
          nightLabel: night.label,
          period,
          slotLabel,
        }),
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e: any) {
    console.warn('[ProductivityReport] Falha ao auditar envio:', e?.message);
  }

  return { sent, emails, rows: rows.length, dateLabel: day.dateLabel, period };
}

export function registerProductivityReportSchedule(supabase: SupabaseClient): void {
  const lastRunKeys = new Set<string>();

  async function tick() {
    const cfg = await loadSettings(supabase);
    const brasiliaTime = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
    );
    const hour = brasiliaTime.getHours();
    const minute = brasiliaTime.getMinutes();
    const dayKey = brasiliaTime.toDateString();

    for (const schedule of cfg.schedules) {
      if (hour !== schedule.hour || minute !== schedule.minute) continue;
      const key = `${dayKey}-${schedule.hour}:${schedule.minute}-${schedule.period}`;
      if (lastRunKeys.has(key)) continue;
      lastRunKeys.add(key);
      // Evita crescer indefinidamente
      if (lastRunKeys.size > 32) {
        const first = lastRunKeys.values().next().value;
        if (first) lastRunKeys.delete(first);
      }
      try {
        await executeProductivityDailyReport(supabase, {
          period: schedule.period,
          slotLabel: `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`,
        });
      } catch (e: any) {
        console.error('[ProductivityReport] Erro no tick:', e?.message || e);
      }
    }
  }

  registerScheduledTick(tick);
  if (isLongRunningHost) {
    setInterval(() => {
      tick().catch(() => {});
    }, 60 * 1000);
    console.log(
      '[ProductivityReport] Agendamento ativo — 09:00 e 21:00 BRT → thiago@grupotmseg.com.br',
    );
  }
}
