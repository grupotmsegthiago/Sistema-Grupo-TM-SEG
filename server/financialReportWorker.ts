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
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f4f4f7;margin:0;padding:8px;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:auto;background:#fff;border-radius:10px;border-collapse:separate;border-spacing:0;">
    <tr><td style="background:#0f172a;color:#fff;padding:16px 16px;border-radius:10px 10px 0 0;">
      <div style="font-size:18px;font-weight:700;">Grupo TM SEG</div>
      <div style="font-size:12px;opacity:.85;margin-top:2px;">${title}</div>
    </td></tr>
    <tr><td style="padding:14px 12px;">${inner}</td></tr>
    <tr><td style="padding:10px 12px;background:#f8fafc;font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;border-radius:0 0 10px 10px;">
      ${fmtDateTimeBR(new Date())} (Brasília) — mesma regra do dashboard.
    </td></tr>
  </table>
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

  const refs = await fetchAllReferenceData();
  const PAGE = 1000;
  let missions: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.from('missions').select('*')
      .or(`start_time.gte.${startYearIso},and(start_time.is.null,created_at.gte.${startYearIso})`)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    missions = missions.concat(data);
    if (data.length < PAGE) break;
  }

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

function renderTxList(rows: any[], emptyMsg: string, accentColor: string): string {
  if (!rows.length) return `<div style="padding:12px;background:#f1f5f9;border-radius:8px;color:#475569;font-size:13px;">${emptyMsg}</div>`;
  return rows.map(t => {
    const isPaid = t.status === 'PAID';
    const bg = isPaid ? '#f0fdf4' : '#fafafa';
    const border = isPaid ? '#16a34a' : accentColor;
    const badge = isPaid
      ? `<span style="display:inline-block;background:#16a34a;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:10px;letter-spacing:.5px;">PAGO${t.payment_date ? ' ' + fmtDueDate(t.payment_date) : ''}</span>`
      : `<span style="display:inline-block;background:#f59e0b;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:10px;letter-spacing:.5px;">PENDENTE</span>`;
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:6px;background:${bg};border-left:3px solid ${border};border-radius:6px;">
      <tr><td style="padding:8px 10px;">
        <div style="margin-bottom:4px;">${badge}</div>
        <div style="font-size:14px;font-weight:700;color:${isPaid ? '#16a34a' : accentColor};margin-bottom:2px;${isPaid ? 'text-decoration:line-through;opacity:.85;' : ''}">${brl(Number(t.amount) || 0)}</div>
        <div style="font-size:12px;color:#0f172a;font-weight:600;">${(t.entity_name || '—').toString().slice(0, 60)}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">${(t.description || '—').toString().slice(0, 80)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">Vence ${fmtDueDate(t.due_date)} · ${t.category_name || 'sem categoria'}</div>
      </td></tr>
    </table>`;
  }).join('');
}

async function sendDailyAccountsReport() {
  try {
    const sb = getSupabase();
    const now = nowSP();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { getAllBalances } = await import('./asaasService');
    const [{ data: payAll }, { data: recAll }, asaasBalances] = await Promise.all([
      sb.from('financial_transactions').select('id,description,amount,due_date,payment_date,entity_name,category_name,status,type')
        .eq('type','EXPENSE').in('status',['PENDING','PAID']).eq('due_date',todayStr).order('status',{ ascending:true }).order('amount',{ ascending:false }),
      sb.from('financial_transactions').select('id,description,amount,due_date,payment_date,entity_name,category_name,status,type')
        .eq('type','INCOME').in('status',['PENDING','PAID']).eq('due_date',todayStr).order('status',{ ascending:true }).order('amount',{ ascending:false }),
      getAllBalances().catch((e: any) => { console.error('[FinReport] Asaas balances erro:', e?.message); return []; }),
    ]);

    const isInternalAdjustment = (t: any) => {
      const cat = String(t?.category_name || '').toUpperCase();
      const desc = String(t?.description || '').toUpperCase();
      return cat.includes('AJUSTE DE SALDO')
        || cat.includes('RENDIMENTO')
        || desc.includes('RENDIMENTO DE INVESTIMENTO')
        || desc.includes('DESVALORIZA');
    };
    const payToday = (payAll || []).filter(t => !isInternalAdjustment(t));
    const recToday = (recAll || []).filter(t => !isInternalAdjustment(t));
    const payPending = payToday.filter(t => t.status === 'PENDING');
    const payPaid    = payToday.filter(t => t.status === 'PAID');
    const recPending = recToday.filter(t => t.status === 'PENDING');
    const recPaid    = recToday.filter(t => t.status === 'PAID');

    const sum = (arr: any[]) => arr.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const totPay = sum(payPending); const totRec = sum(recPending);
    const totPayPaid = sum(payPaid); const totRecPaid = sum(recPaid);

    const saldo = totRec - totPay;

    const totAsaas = (asaasBalances || []).reduce((s: number, b: any) => s + (Number(b.balance) || 0), 0);
    const totAsaasPending = (asaasBalances || []).reduce((s: number, b: any) => s + (Number(b.pendingBalance) || 0), 0);
    const asaasRows = (asaasBalances || []).map((b: any) => {
      if (b.error) {
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:6px;background:#fef2f2;border-left:3px solid #b91c1c;border-radius:6px;">
          <tr><td style="padding:8px 10px;">
            <div style="font-size:12px;font-weight:700;color:#0f172a;">${b.name}</div>
            <div style="font-size:11px;color:#b91c1c;margin-top:2px;">⚠ ${b.error}</div>
          </td></tr></table>`;
      }
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:6px;background:#eff6ff;border-left:3px solid #2563eb;border-radius:6px;">
        <tr><td style="padding:8px 10px;">
          <div style="font-size:12px;font-weight:700;color:#0f172a;">${b.name}</div>
          <div style="font-size:18px;font-weight:800;color:#1d4ed8;margin-top:2px;">${brl(Number(b.balance) || 0)}</div>
          ${Number(b.pendingBalance) > 0 ? `<div style="font-size:10px;color:#475569;margin-top:2px;">+ ${brl(Number(b.pendingBalance))} a liberar</div>` : ''}
        </td></tr></table>`;
    }).join('');

    const inner = `
      <div style="font-size:17px;font-weight:700;color:#0f172a;margin-bottom:2px;">Resumo do Dia — ${fmtDateBR(now)}</div>
      <div style="font-size:12px;color:#475569;margin-bottom:14px;">Contas com vencimento hoje (pagas e pendentes).</div>

      <div style="font-size:14px;font-weight:700;color:#1d4ed8;margin:0 0 8px;">💳 Saldo nas Contas Asaas · ${brl(totAsaas)}${totAsaasPending > 0 ? ` <span style="font-size:11px;color:#475569;font-weight:500;">(+${brl(totAsaasPending)} a liberar)</span>` : ''}</div>
      ${asaasRows || '<div style="padding:10px;background:#f1f5f9;border-radius:6px;color:#475569;font-size:12px;">Não foi possível consultar os saldos do Asaas agora.</div>'}

      <div style="height:18px;"></div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 6px;margin-bottom:14px;">
        <tr><td style="background:#fef2f2;border-left:4px solid #b91c1c;border-radius:6px;padding:10px 12px;">
          <div style="font-size:10px;color:#991b1b;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">A Pagar Hoje (Pendentes)</div>
          <div style="font-size:22px;color:#b91c1c;font-weight:800;margin-top:2px;">${brl(totPay)}</div>
          <div style="font-size:10px;color:#7f1d1d;">${payPending.length} pendente(s) · <span style="color:#16a34a;">${payPaid.length} já pago(s) (${brl(totPayPaid)})</span></div>
        </td></tr>
        <tr><td style="background:#ecfdf5;border-left:4px solid #15803d;border-radius:6px;padding:10px 12px;">
          <div style="font-size:10px;color:#065f46;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">A Receber Hoje (Pendentes)</div>
          <div style="font-size:22px;color:#15803d;font-weight:800;margin-top:2px;">${brl(totRec)}</div>
          <div style="font-size:10px;color:#064e3b;">${recPending.length} pendente(s) · <span style="color:#16a34a;">${recPaid.length} já recebido(s) (${brl(totRecPaid)})</span></div>
        </td></tr>
        <tr><td style="background:#f8fafc;border-left:4px solid #334155;border-radius:6px;padding:10px 12px;">
          <div style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Saldo Pendente (Receber − Pagar)</div>
          <div style="font-size:22px;color:${saldo >= 0 ? '#15803d' : '#b91c1c'};font-weight:800;margin-top:2px;">${brl(saldo)}</div>
        </td></tr>
      </table>

      <div style="font-size:14px;font-weight:700;color:#b91c1c;margin:16px 0 8px;">A Pagar Hoje · ${payToday.length} título(s)</div>
      ${renderTxList(payToday, 'Nenhum pagamento com vencimento hoje.', '#b91c1c')}

      <div style="font-size:14px;font-weight:700;color:#15803d;margin:18px 0 8px;">A Receber Hoje · ${recToday.length} título(s)</div>
      ${renderTxList(recToday, 'Nenhum recebimento com vencimento hoje.', '#15803d')}
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
