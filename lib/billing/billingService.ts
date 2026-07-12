/**
 * Serviço de monitoramento de custos de IA (Cursor/Stripe + uso interno).
 * Conversão: USD × câmbio comercial × (1 + IOF%).
 */
import { createSupabaseAdminClient } from '../supabaseAdmin.js';

import type { BillingSource, BillingUsageRow, BillingMonthSummary, TokenEfficiencyReport } from '../dashboardDiretoria/billingTypes.js';

export type { BillingSource, BillingUsageRow, BillingMonthSummary, TokenEfficiencyReport };

export interface BillingUsageInput {
  source: BillingSource;
  summary: string;
  amount_usd?: number;
  amount_brl?: number;
  token_id?: string;
  external_id?: string;
  recorded_at?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncBillingResult {
  ok: boolean;
  inserted: number;
  skipped: number;
  errors: string[];
  message: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function getBillingExchangeRate(): number {
  const v = Number(process.env.BILLING_USD_RATE || process.env.BILLING_EXCHANGE_RATE || 5.5);
  return Number.isFinite(v) && v > 0 ? v : 5.5;
}

export function getBillingIofPct(): number {
  const v = Number(process.env.BILLING_IOF_PCT || 4.38);
  return Number.isFinite(v) && v >= 0 ? v : 4.38;
}

export function getPlanMonthlyUsd(): number {
  const v = Number(process.env.CURSOR_PLAN_MONTHLY_USD || process.env.BILLING_PLAN_MONTHLY_USD || 20);
  return Number.isFinite(v) && v > 0 ? v : 20;
}

export function getPlanName(): string {
  return String(process.env.CURSOR_PLAN_NAME || process.env.BILLING_PLAN_NAME || 'Cursor Pro').trim();
}

export function getOperationalSavingsBrl(): number {
  const v = Number(process.env.OPERATIONAL_SAVINGS_BRL || 715);
  return Number.isFinite(v) ? v : 715;
}

/** USD → BRL com câmbio comercial + IOF. */
export function usdToBrl(usd: number, exchangeRate = getBillingExchangeRate(), iofPct = getBillingIofPct()): number {
  const base = Math.max(0, Number(usd) || 0);
  return round2(base * exchangeRate * (1 + iofPct / 100));
}

export function brlToUsd(brl: number, exchangeRate = getBillingExchangeRate(), iofPct = getBillingIofPct()): number {
  const factor = exchangeRate * (1 + iofPct / 100);
  if (factor <= 0) return 0;
  return round4(Math.max(0, Number(brl) || 0) / factor);
}

export function referenceMonthFromDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function sb() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error('Supabase admin indisponível — configure SUPABASE_SERVICE_ROLE_KEY');
  return client;
}

export function getPlanLimitBrl(): number {
  const explicit = Number(process.env.CURSOR_PLAN_MONTHLY_BRL || process.env.BILLING_PLAN_MONTHLY_BRL || 0);
  if (explicit > 0) return round2(explicit);
  return usdToBrl(getPlanMonthlyUsd());
}

function resolveAmountBrl(input: BillingUsageInput): { amountUsd: number; amountBrl: number } {
  const exchangeRate = getBillingExchangeRate();
  const iofPct = getBillingIofPct();
  if (input.amount_brl != null && input.amount_brl > 0) {
    return {
      amountBrl: round2(input.amount_brl),
      amountUsd: input.amount_usd != null ? round4(input.amount_usd) : brlToUsd(input.amount_brl, exchangeRate, iofPct),
    };
  }
  const amountUsd = round4(Math.max(0, input.amount_usd || 0));
  return { amountUsd, amountBrl: usdToBrl(amountUsd, exchangeRate, iofPct) };
}

/** Calcula saldo restante do plano após inserir um custo no mês. */
export async function computePlanBalanceAfter(month: string, newCostBrl: number): Promise<number> {
  const summary = await getBillingMonthSummary(month);
  return round2(summary.planLimitBrl - summary.spentBrl - newCostBrl);
}

/** Registra uma linha de uso (token, Gemini, manual). */
export async function recordBillingUsage(input: BillingUsageInput): Promise<BillingUsageRow | null> {
  try {
    const client = sb();
    const recordedAt = input.recorded_at || new Date().toISOString();
    const month = referenceMonthFromDate(new Date(recordedAt));
    const { amountUsd, amountBrl } = resolveAmountBrl(input);
    const exchangeRate = getBillingExchangeRate();
    const iofPct = getBillingIofPct();

    const spentBefore = await sumMonthSpentBrl(month);
    const planLimit = getPlanLimitBrl();
    const planBalance = round2(planLimit - spentBefore - amountBrl);

    const payload = {
      recorded_at: recordedAt,
      reference_month: month,
      source: input.source,
      external_id: input.external_id || null,
      token_id: input.token_id || null,
      summary: String(input.summary || '').slice(0, 500),
      amount_usd: amountUsd,
      exchange_rate: exchangeRate,
      iof_pct: iofPct,
      amount_brl: amountBrl,
      plan_balance_brl: planBalance,
      metadata: input.metadata || {},
    };

    if (input.external_id) {
      const { data: existing } = await client
        .from('billing_usage')
        .select('id')
        .eq('source', input.source)
        .eq('external_id', input.external_id)
        .maybeSingle();
      if (existing?.id) return null;
    }

    const { data, error } = await client.from('billing_usage').insert([payload]).select('*').single();
    if (error) throw error;
    return data as BillingUsageRow;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[billingService] recordBillingUsage:', msg);
    return null;
  }
}

async function sumMonthSpentBrl(month: string): Promise<number> {
  try {
    const client = sb();
    const { data } = await client
      .from('billing_usage')
      .select('amount_brl')
      .eq('reference_month', month);
    return round2((data || []).reduce((s, r) => s + Number(r.amount_brl || 0), 0));
  } catch {
    return 0;
  }
}

export async function getBillingUsageLog(limit = 100, month?: string): Promise<BillingUsageRow[]> {
  try {
    const client = sb();
    let q = client.from('billing_usage').select('*').order('recorded_at', { ascending: false }).limit(limit);
    if (month) q = q.eq('reference_month', month);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as BillingUsageRow[];
  } catch (e: unknown) {
    console.warn('[billingService] getBillingUsageLog:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getBillingMonthSummary(month = referenceMonthFromDate()): Promise<BillingMonthSummary> {
  const planLimitBrl = getPlanLimitBrl();
  const planLimitUsd = getPlanMonthlyUsd();
  const spentBrl = await sumMonthSpentBrl(month);
  const exchangeRate = getBillingExchangeRate();
  const iofPct = getBillingIofPct();
  const spentUsd = brlToUsd(spentBrl, exchangeRate, iofPct);
  const extraBrl = round2(Math.max(0, spentBrl - planLimitBrl));
  const usagePct = planLimitBrl > 0 ? round2((spentBrl / planLimitBrl) * 100) : 0;
  const planBalanceBrl = round2(Math.max(0, planLimitBrl - spentBrl));
  const entries = await getBillingUsageLog(500, month);

  let thermometer: BillingMonthSummary['thermometer'] = 'ok';
  if (usagePct >= 100) thermometer = 'critical';
  else if (usagePct >= 75) thermometer = 'warning';

  return {
    referenceMonth: month,
    planName: getPlanName(),
    planLimitBrl,
    planLimitUsd,
    spentBrl,
    spentUsd,
    extraBrl,
    usagePct,
    planBalanceBrl,
    operationalSavingsBrl: getOperationalSavingsBrl(),
    exchangeRate,
    iofPct,
    entryCount: entries.length,
    thermometer,
  };
}

interface StripeInvoiceLine {
  id: string;
  summary: string;
  amountUsd: number;
  recordedAt: string;
}

async function fetchStripeInvoiceLines(): Promise<StripeInvoiceLine[]> {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return [];

  const customerId = String(process.env.STRIPE_CURSOR_CUSTOMER_ID || process.env.STRIPE_CUSTOMER_ID || '').trim();
  const params = new URLSearchParams({ limit: '24', status: 'paid' });
  if (customerId) params.set('customer', customerId);

  try {
    const resp = await fetch(`https://api.stripe.com/v1/invoices?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.error?.message || `Stripe HTTP ${resp.status}`);
    }

    const lines: StripeInvoiceLine[] = [];
    for (const inv of json.data || []) {
      const amountUsd = round4((Number(inv.amount_paid || inv.total || 0)) / 100);
      if (amountUsd <= 0) continue;
      const desc = String(inv.description || inv.lines?.data?.[0]?.description || 'Fatura Cursor/Stripe').trim();
      lines.push({
        id: String(inv.id),
        summary: desc.slice(0, 200),
        amountUsd,
        recordedAt: new Date((inv.status_transitions?.paid_at || inv.created) * 1000).toISOString(),
      });
    }
    return lines;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[billingService] Stripe:', msg);
    return [];
  }
}

/**
 * Sincroniza faturas Stripe (Cursor) e grava em billing_usage.
 * Idempotente via external_id (invoice id).
 */
export async function syncBillingUsage(): Promise<SyncBillingResult> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  try {
    const lines = await fetchStripeInvoiceLines();
    if (lines.length === 0 && !process.env.STRIPE_SECRET_KEY) {
      return {
        ok: true,
        inserted: 0,
        skipped: 0,
        errors: [],
        message: 'STRIPE_SECRET_KEY não configurada — sync ignorado (use log manual ou agent_token).',
      };
    }

    for (const line of lines) {
      const month = referenceMonthFromDate(new Date(line.recordedAt));
      const row = await recordBillingUsage({
        source: 'cursor_stripe',
        external_id: line.id,
        summary: line.summary,
        amount_usd: line.amountUsd,
        recorded_at: line.recordedAt,
        metadata: { stripe_invoice_id: line.id, reference_month: month },
      });
      if (row) inserted += 1;
      else skipped += 1;
    }

    await recordBillingUsage({
      source: 'sync',
      summary: `Sync Stripe: ${inserted} novos, ${skipped} já existentes`,
      amount_brl: 0,
      token_id: 'system-sync',
      metadata: { inserted, skipped, at: new Date().toISOString() },
    }).catch(() => {});

    return {
      ok: true,
      inserted,
      skipped,
      errors,
      message: `Sync concluído — ${inserted} lançamentos novos.`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    return { ok: false, inserted, skipped, errors, message: msg };
  }
}

/** Analisa tokens/logs e sugere melhorias para AGENTS.md e prompts. */
export function buildTokenEfficiencyReport(rows: BillingUsageRow[]): TokenEfficiencyReport {
  const map = new Map<string, { totalBrl: number; count: number }>();
  for (const r of rows) {
    const key = r.summary.slice(0, 80);
    const prev = map.get(key) || { totalBrl: 0, count: 0 };
    prev.totalBrl += Number(r.amount_brl || 0);
    prev.count += 1;
    map.set(key, prev);
  }

  const topCostDrivers = Array.from(map.entries())
    .map(([summary, v]) => ({ summary, totalBrl: round2(v.totalBrl), count: v.count }))
    .sort((a, b) => b.totalBrl - a.totalBrl)
    .slice(0, 8);

  const recommendations: string[] = [];
  const agentsMdSnippets: string[] = [];

  const highRepeat = topCostDrivers.filter(d => d.count >= 3 && d.totalBrl > 5);
  if (highRepeat.length > 0) {
    recommendations.push(
      `Há ${highRepeat.length} tipo(s) de tarefa repetida com custo elevado — consolide em um único prompt com contexto fixo.`,
    );
    agentsMdSnippets.push('- Evitar reprocessar o mesmo escopo em múltiplos tokens; reutilizar branch/PR existente.');
  }

  const geminiRows = rows.filter(r => r.source === 'gemini');
  if (geminiRows.length > 10) {
    recommendations.push('Volume alto de chamadas Gemini — prefira gemini-2.5-flash para tarefas simples e cache de resultados.');
    agentsMdSnippets.push('- Gemini: usar Flash para extração/classificação; Pro apenas para relatórios longos.');
  }

  const overPlan = rows.some(r => (r.plan_balance_brl ?? 0) < 0);
  if (overPlan) {
    recommendations.push('Plano mensal estourado — priorize correções assertivas (diff mínimo) e testes locais antes de novo token cloud.');
    agentsMdSnippets.push('- Antes de pedir alteração ampla: rodar `npm run build` e testes do escopo; não refatorar sem autorização.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Uso dentro do padrão — mantenha prompts objetivos, escopo fechado e referência a arquivos existentes.');
  }

  agentsMdSnippets.push(
    '- Redução de retrabalho: preservar lógica de OS, Financeiro, Asaas e eNotas; diff mínimo.',
    '- Registrar custos relevantes via POST /api/billing/log-usage quando sessões cloud forem longas.',
  );

  return { topCostDrivers, recommendations, agentsMdSnippets };
}

/** Formato para planilha SITUAÇÃO GERAL DO FATURAMENTO. */
export function formatBillingSpreadsheetRow(row: BillingUsageRow): string {
  const dt = new Date(row.recorded_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const token = row.token_id || row.external_id || '—';
  const saldo = row.plan_balance_brl != null ? `R$ ${row.plan_balance_brl.toFixed(2)}` : '—';
  return `${dt}\t${token}\t${row.summary}\tR$ ${row.amount_brl.toFixed(2)}\tR$ ${row.amount_brl.toFixed(2)}\t${saldo}`;
}
