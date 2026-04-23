import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { MissionStatus, type Mission, type ClientPriceTable, type ProviderCostTable, type Client } from '../types';

const RECIPIENT = 'thiago@grupotmseg.com.br';
const EMAIL_USER = process.env.EMAIL_USER || 'adm@grupotmseg.com.br';
const EMAIL_PASS = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
const SMTP_FROM = `"Grupo TM SEG" <adm@grupotmseg.com.br>`;
const TZ = 'America/Sao_Paulo';

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
  requireTLS: true,
});

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new Error('Supabase env vars não configuradas');
  return createClient(url, key);
}

function brl(n: number): string {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function nowSP(): Date {
  const s = new Date().toLocaleString('en-US', { timeZone: TZ });
  return new Date(s);
}

function startOfDaySP(d: Date): Date { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeekSP(d: Date): Date {
  const x = startOfDaySP(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonthSP(d: Date): Date { const x = startOfDaySP(d); x.setDate(1); return x; }
function startOfYearSP(d: Date): Date { const x = startOfDaySP(d); x.setMonth(0,1); return x; }

function fmtDateBR(d: Date): string { return d.toLocaleDateString('pt-BR', { timeZone: TZ }); }
function fmtDateTimeBR(d: Date): string { return d.toLocaleString('pt-BR', { timeZone: TZ }); }
function fmtDueDate(s: string | null | undefined): string {
  if (!s) return '-';
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return d.toLocaleDateString('pt-BR', { timeZone: TZ });
}

function htmlTemplate(title: string, inner: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f7;margin:0;padding:24px;color:#222;">
  <div style="max-width:760px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">
    <div style="background:#0f172a;color:#fff;padding:20px 24px;">
      <h1 style="margin:0;font-size:20px;">Grupo TM SEG</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:.85;">${title}</p>
    </div>
    <div style="padding:24px;">${inner}</div>
    <div style="padding:14px 24px;background:#f8fafc;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;">
      Relatório automático — ${fmtDateTimeBR(new Date())} (Brasília). Mesma regra de cálculo do dashboard "Monitoramento de Missões".
    </div>
  </div>
</body></html>`;
}

interface PeriodSummary {
  label: string;
  count: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

interface MissionRevenue {
  client: string;
  ts: number;
  revenue: number;
  cost: number;
  source: 'saved' | 'estimated';
}

function tsSP(s: string | null | undefined): number {
  if (!s) return 0;
  return new Date(new Date(s).toLocaleString('en-US', { timeZone: TZ })).getTime();
}

function computeMissionRevenue(
  m: any,
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
  clientsData: Client[],
  currentTime: Date
): MissionRevenue | null {
  if (m.status === MissionStatus.REFUSED) return null;

  const dateRef = m.start_time || m.created_at;
  if (!dateRef) return null;
  const ts = tsSP(dateRef);
  const client = (m.client || 'SEM CLIENTE').toString();

  const hasStoredRevenue = (m.revenue_value != null && m.revenue_value > 0);
  const hasStoredCost = (m.cost_value != null && m.cost_value > 0);
  const isVerified = !!(m.billing_approved || m.billing_verified_by);
  const hasSavedValues = isVerified && (hasStoredRevenue || hasStoredCost || m.revenue_value === 0 || m.cost_value === 0);

  if (hasSavedValues) {
    const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
    return {
      client, ts,
      revenue: (m.revenue_value || 0) + Math.max(0, m.toll_value || 0),
      cost: (m.cost_value || 0) + tollProv,
      source: 'saved',
    };
  }
  if (hasStoredRevenue && hasStoredCost) {
    const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
    return {
      client, ts,
      revenue: (m.revenue_value || 0) + Math.max(0, m.toll_value || 0),
      cost: (m.cost_value || 0) + tollProv,
      source: 'saved',
    };
  }

  let revenue = 0, cost = 0;
  if (hasStoredRevenue) revenue = (m.revenue_value || 0) + Math.max(0, m.toll_value || 0);
  if (hasStoredCost) {
    const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
    cost = (m.cost_value || 0) + tollProv;
  }

  if (!hasStoredRevenue || !hasStoredCost) {
    const isCancelled = m.status === MissionStatus.CANCELLED;
    const missionObj: Mission = {
      ...m,
      startKm: m.start_km, endKm: m.end_km,
      startTime: m.start_time, endTime: m.end_time,
      createdAt: m.created_at,
      lastUpdate: m.last_update,
      totalDistance: m.total_distance,
      ...(isCancelled ? { status: MissionStatus.COMPLETED } : {}),
    } as any;
    const matchedClient = clientsData.find(c => c.name === client.trim());
    try {
      const fin = calculateMissionFinancials(missionObj, clientTables, providerTables, matchedClient, currentTime);
      if (!hasStoredRevenue) revenue = fin.client.total || 0;
      if (!hasStoredCost) cost = fin.provider.total || 0;
    } catch (e) {
      // ignore individual mission calc errors
    }
  }

  return { client, ts, revenue, cost, source: hasStoredRevenue ? 'saved' : 'estimated' };
}

async function fetchAllReferenceData() {
  const sb = getSupabase();
  const [{ data: ct }, { data: pt }, { data: cl }] = await Promise.all([
    sb.from('client_price_tables').select('*'),
    sb.from('provider_cost_tables').select('*'),
    sb.from('clients').select('*'),
  ]);
  return {
    clientTables: (ct || []) as ClientPriceTable[],
    providerTables: (pt || []) as ProviderCostTable[],
    clients: (cl || []) as Client[],
  };
}

async function fetchRevenueSummary() {
  const sb = getSupabase();
  const now = nowSP();
  const startYear = startOfYearSP(now);
  const startYearMs = startYear.getTime();
  const startMonthMs = startOfMonthSP(now).getTime();
  const startWeekMs = startOfWeekSP(now).getTime();
  const startDayMs = startOfDaySP(now).getTime();

  const startYearIso = new Date(startYear.getTime() - new Date().getTimezoneOffset() * 60000).toISOString();

  const [{ data: missions, error }, refs] = await Promise.all([
    sb.from('missions').select('*')
      .or(`start_time.gte.${startYearIso},and(start_time.is.null,created_at.gte.${startYearIso})`),
    fetchAllReferenceData(),
  ]);
  if (error) throw error;

  const buckets = {
    day: { count: 0, revenue: 0, cost: 0 },
    week: { count: 0, revenue: 0, cost: 0 },
    month: { count: 0, revenue: 0, cost: 0 },
    year: { count: 0, revenue: 0, cost: 0 },
  };
  const dayByClient = new Map<string, { revenue: number; count: number }>();
  const yearByClient = new Map<string, { revenue: number; count: number }>();

  const currentTime = new Date();
  for (const m of (missions || [])) {
    const r = computeMissionRevenue(m, refs.clientTables, refs.providerTables, refs.clients, currentTime);
    if (!r) continue;
    if (r.ts >= startYearMs) {
      buckets.year.count++; buckets.year.revenue += r.revenue; buckets.year.cost += r.cost;
      const k = r.client.toUpperCase();
      const cur = yearByClient.get(k) || { revenue: 0, count: 0 };
      cur.revenue += r.revenue; cur.count++;
      yearByClient.set(k, cur);
    }
    if (r.ts >= startMonthMs) { buckets.month.count++; buckets.month.revenue += r.revenue; buckets.month.cost += r.cost; }
    if (r.ts >= startWeekMs)  { buckets.week.count++;  buckets.week.revenue += r.revenue;  buckets.week.cost += r.cost; }
    if (r.ts >= startDayMs) {
      buckets.day.count++; buckets.day.revenue += r.revenue; buckets.day.cost += r.cost;
      const k = r.client.toUpperCase();
      const cur = dayByClient.get(k) || { revenue: 0, count: 0 };
      cur.revenue += r.revenue; cur.count++;
      dayByClient.set(k, cur);
    }
  }

  const mk = (label: string, b: { count: number; revenue: number; cost: number }): PeriodSummary => {
    const profit = b.revenue - b.cost;
    const margin = b.revenue > 0 ? (profit / b.revenue) * 100 : 0;
    return { label, count: b.count, revenue: b.revenue, cost: b.cost, profit, margin };
  };

  return {
    periods: [
      mk('Hoje', buckets.day),
      mk('Esta Semana', buckets.week),
      mk('Este Mês', buckets.month),
      mk('Este Ano', buckets.year),
    ],
    dayByClient: Array.from(dayByClient.entries())
      .map(([client, v]) => ({ client, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    yearByClient: Array.from(yearByClient.entries())
      .map(([client, v]) => ({ client, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
  };
}

async function sendRevenueReport() {
  try {
    const { periods, dayByClient, yearByClient } = await fetchRevenueSummary();
    const rows = periods.map(p => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${p.label}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.count}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#0369a1;font-weight:600;">${brl(p.revenue)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c;">${brl(p.cost)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:${p.profit >= 0 ? '#15803d' : '#b91c1c'};font-weight:600;">${brl(p.profit)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.margin.toFixed(1)}%</td>
      </tr>`).join('');

    const dayRows = dayByClient.length
      ? dayByClient.map((c, i) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${i + 1}. ${c.client}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${c.count} OS</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${brl(c.revenue)}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" style="padding:14px;text-align:center;color:#64748b;">Nenhuma OS hoje.</td></tr>`;

    const yearRows = yearByClient.length
      ? yearByClient.map((c, i) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${i + 1}. ${c.client}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${c.count} OS</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${brl(c.revenue)}</td>
        </tr>`).join('')
      : '';

    const totalDay = dayByClient.reduce((s, c) => s + c.revenue, 0);
    const inner = `
      <h2 style="margin:0 0 12px;font-size:18px;color:#0f172a;">Faturamento por Período</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#475569;">Inclui valores salvos + estimativa via tabelas de preço (mesma regra do dashboard). Pedágio incluso. Status REFUSED ignorado.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="padding:10px 12px;text-align:left;">Período</th>
          <th style="padding:10px 12px;text-align:right;">OS</th>
          <th style="padding:10px 12px;text-align:right;">Faturamento</th>
          <th style="padding:10px 12px;text-align:right;">Custo</th>
          <th style="padding:10px 12px;text-align:right;">Lucro</th>
          <th style="padding:10px 12px;text-align:right;">Margem</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a;">Faturamento de Hoje por Cliente — ${brl(totalDay)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>${dayRows}</tbody>
      </table>

      ${yearRows ? `<h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a;">Top 10 Clientes (Ano)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>${yearRows}</tbody>
      </table>` : ''}`;

    const subject = `Faturamento — ${fmtDateBR(new Date())} ${new Date().toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
    await transporter.sendMail({ from: SMTP_FROM, to: RECIPIENT, subject, html: htmlTemplate('Relatório de Faturamento (6h)', inner) });
    console.log(`[FinReport] Faturamento enviado → ${RECIPIENT}`);
  } catch (err: any) {
    console.error('[FinReport] Erro faturamento:', err.message);
  }
}

interface TxRow {
  id: string;
  description: string | null;
  amount: number | null;
  due_date: string | null;
  entity_name: string | null;
  category_name: string | null;
  status: string | null;
  type: string | null;
}

function renderTxTable(rows: TxRow[], emptyMsg: string): string {
  if (!rows.length) return `<p style="padding:12px;background:#f1f5f9;border-radius:8px;color:#475569;font-size:13px;margin:0;">${emptyMsg}</p>`;
  const trs = rows.map(t => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${fmtDueDate(t.due_date)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${(t.entity_name || '-').toString().slice(0, 50)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${(t.description || '-').toString().slice(0, 60)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${t.category_name || '-'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${brl(Number(t.amount) || 0)}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#f1f5f9;">
      <th style="padding:8px 10px;text-align:left;">Vencimento</th>
      <th style="padding:8px 10px;text-align:left;">Cliente/Fornecedor</th>
      <th style="padding:8px 10px;text-align:left;">Descrição</th>
      <th style="padding:8px 10px;text-align:left;">Categoria</th>
      <th style="padding:8px 10px;text-align:right;">Valor</th>
    </tr></thead><tbody>${trs}</tbody></table>`;
}

async function sendDailyAccountsReport() {
  try {
    const sb = getSupabase();
    const now = nowSP();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [{ data: payToday }, { data: recToday }, { data: payOver }, { data: recOver }] = await Promise.all([
      sb.from('financial_transactions').select('id,description,amount,due_date,entity_name,category_name,status,type')
        .eq('type','EXPENSE').eq('status','PENDING').eq('due_date',todayStr).order('amount',{ ascending:false }),
      sb.from('financial_transactions').select('id,description,amount,due_date,entity_name,category_name,status,type')
        .eq('type','INCOME').eq('status','PENDING').eq('due_date',todayStr).order('amount',{ ascending:false }),
      sb.from('financial_transactions').select('id,description,amount,due_date,entity_name,category_name,status,type')
        .eq('type','EXPENSE').eq('status','PENDING').lt('due_date',todayStr).order('due_date',{ ascending:true }),
      sb.from('financial_transactions').select('id,description,amount,due_date,entity_name,category_name,status,type')
        .eq('type','INCOME').eq('status','PENDING').lt('due_date',todayStr).order('due_date',{ ascending:true }),
    ]);

    const sum = (arr: TxRow[] | null | undefined) => (arr || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const totPay = sum(payToday); const totRec = sum(recToday);
    const totPayOver = sum(payOver); const totRecOver = sum(recOver);

    const inner = `
      <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a;">Resumo do Dia — ${fmtDateBR(now)}</h2>
      <p style="margin:0 0 18px;font-size:13px;color:#475569;">Contas com vencimento hoje + títulos em atraso.</p>

      <div style="display:flex;gap:12px;margin-bottom:20px;">
        <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;">
          <div style="font-size:11px;color:#991b1b;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">A Pagar Hoje</div>
          <div style="font-size:22px;color:#b91c1c;font-weight:800;margin-top:4px;">${brl(totPay)}</div>
          <div style="font-size:11px;color:#7f1d1d;margin-top:2px;">${(payToday || []).length} título(s)</div>
        </div>
        <div style="flex:1;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;padding:14px;">
          <div style="font-size:11px;color:#065f46;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">A Receber Hoje</div>
          <div style="font-size:22px;color:#15803d;font-weight:800;margin-top:4px;">${brl(totRec)}</div>
          <div style="font-size:11px;color:#064e3b;margin-top:2px;">${(recToday || []).length} título(s)</div>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">
          <div style="font-size:11px;color:#334155;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Saldo do Dia</div>
          <div style="font-size:22px;color:${(totRec - totPay) >= 0 ? '#15803d' : '#b91c1c'};font-weight:800;margin-top:4px;">${brl(totRec - totPay)}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">Receber − Pagar</div>
        </div>
      </div>

      <h3 style="margin:0 0 8px;font-size:15px;color:#b91c1c;">A Pagar Hoje (${brl(totPay)})</h3>
      ${renderTxTable(payToday || [], 'Nenhum pagamento com vencimento hoje.')}

      <h3 style="margin:22px 0 8px;font-size:15px;color:#15803d;">A Receber Hoje (${brl(totRec)})</h3>
      ${renderTxTable(recToday || [], 'Nenhum recebimento com vencimento hoje.')}

      ${(payOver || []).length ? `<h3 style="margin:22px 0 8px;font-size:15px;color:#b45309;">⚠ Pagamentos em Atraso (${brl(totPayOver)} — ${(payOver || []).length})</h3>${renderTxTable((payOver || []).slice(0, 30), '')}` : ''}
      ${(recOver || []).length ? `<h3 style="margin:22px 0 8px;font-size:15px;color:#b45309;">⚠ Recebimentos em Atraso (${brl(totRecOver)} — ${(recOver || []).length})</h3>${renderTxTable((recOver || []).slice(0, 30), '')}` : ''}
    `;

    const subject = `Resumo Diário — ${fmtDateBR(now)} | A Pagar ${brl(totPay)} · A Receber ${brl(totRec)}`;
    await transporter.sendMail({ from: SMTP_FROM, to: RECIPIENT, subject, html: htmlTemplate('Resumo Diário Financeiro (07:00)', inner) });
    console.log(`[FinReport] Resumo diário → ${RECIPIENT} (pagar=${brl(totPay)} receber=${brl(totRec)})`);
  } catch (err: any) {
    console.error('[FinReport] Erro resumo diário:', err.message);
  }
}

let lastRevenueSlot = '';
let lastDailyDate = '';

function tick() {
  try {
    const now = nowSP();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    if (hour === 7 && minute < 5 && lastDailyDate !== dateKey) {
      lastDailyDate = dateKey;
      void sendDailyAccountsReport();
    }

    if ([0, 6, 12, 18].includes(hour) && minute < 5) {
      const slot = `${dateKey}-${hour}`;
      if (lastRevenueSlot !== slot) {
        lastRevenueSlot = slot;
        void sendRevenueReport();
      }
    }
  } catch (e: any) {
    console.error('[FinReport] tick erro:', e.message);
  }
}

export function startFinancialReportWorker() {
  console.log(`[FinReport] Worker ativo — ${RECIPIENT} (faturamento 6/6h, resumo diário 07:00 BRT)`);
  setInterval(tick, 60_000);
  tick();
}

export const __test = { sendRevenueReport, sendDailyAccountsReport };
