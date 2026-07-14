/**
 * Serviço de monitoramento de custos de IA (Cursor/Stripe + uso interno).
 * Conversão: USD × câmbio comercial × (1 + IOF%).
 */
import { createSupabaseAdminClient } from '../supabaseAdmin.js';

import type {
  BillingSource,
  BillingUsageRow,
  BillingMonthSummary,
  TokenEfficiencyReport,
  BillingDashboardMeta,
  BillingDataSource,
} from '../dashboardDiretoria/billingTypes.js';
import {
  eventAmountUsd,
  fetchAllCursorUsageEvents,
  fetchCursorUsageSummary,
  formatCursorMembership,
  getCursorSessionToken,
  isCursorSessionConfigured,
  isIncludedPlanUsageEvent,
  defaultPlanMonthlyUsd,
} from './cursorUsageApi.js';

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

export function getPlanMonthlyUsd(membershipType?: string): number {
  const fromEnv = Number(process.env.CURSOR_PLAN_MONTHLY_USD || process.env.BILLING_PLAN_MONTHLY_USD || '');
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return defaultPlanMonthlyUsd(membershipType);
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

/** Converte valor on-demand da API Cursor (centavos ou dólares) para USD. */
export function cursorOnDemandToUsd(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Valores >= 100 costumam ser centavos (ex.: 8064 → US$ 80,64).
  if (n >= 100) return round4(n / 100);
  return round4(n);
}

/** Dias até o fim do ciclo e % de tempo decorrido (0–100). */
export function computeCycleClock(
  billingCycleStart: string | null | undefined,
  billingCycleEnd: string | null | undefined,
  now = new Date(),
): { daysUntilCycleReset: number | null; cycleTimeElapsedPct: number | null } {
  if (!billingCycleStart || !billingCycleEnd) {
    return { daysUntilCycleReset: null, cycleTimeElapsedPct: null };
  }
  const start = new Date(billingCycleStart).getTime();
  const end = new Date(billingCycleEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { daysUntilCycleReset: null, cycleTimeElapsedPct: null };
  }
  const t = now.getTime();
  const daysLeft = Math.max(0, Math.ceil((end - t) / 86400000));
  const elapsed = Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100));
  return {
    daysUntilCycleReset: daysLeft,
    cycleTimeElapsedPct: round2(elapsed),
  };
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
      if (existing?.id) {
        // Atualiza espelho Cursor (summary/eventos) em vez de ignorar — senão % do plano fica stale.
        const { data: updated, error: updErr } = await client
          .from('billing_usage')
          .update(payload)
          .eq('id', existing.id)
          .select('*')
          .single();
        if (updErr) throw updErr;
        return updated as BillingUsageRow;
      }
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

async function sumMonthSpentBrl(month: string, source?: BillingSource): Promise<number> {
  try {
    const client = sb();
    let q = client.from('billing_usage').select('amount_brl, metadata').eq('reference_month', month);
    if (source) q = q.eq('source', source);
    const { data } = await q;
    return round2(
      (data || []).reduce((s, r) => {
        const meta = r.metadata as { type?: string } | null;
        if (meta?.type === 'cursor_usage_summary') return s;
        return s + Number(r.amount_brl || 0);
      }, 0),
    );
  } catch {
    return 0;
  }
}

async function getLatestCursorSummaryRow(): Promise<BillingUsageRow | null> {
  try {
    const client = sb();
    const { data } = await client
      .from('billing_usage')
      .select('*')
      .eq('source', 'cursor_dashboard')
      .order('recorded_at', { ascending: false })
      .limit(20);
    const rows = (data || []) as BillingUsageRow[];
    return rows.find(r => (r.metadata as { type?: string } | null)?.type === 'cursor_usage_summary') || null;
  } catch {
    return null;
  }
}

async function deleteCursorDashboardMonth(month: string): Promise<void> {
  try {
    const client = sb();
    await client.from('billing_usage').delete().eq('source', 'cursor_dashboard').eq('reference_month', month);
  } catch (e: unknown) {
    console.warn('[billingService] deleteCursorDashboardMonth:', e instanceof Error ? e.message : e);
  }
}

export function getBillingDashboardMeta(): BillingDashboardMeta {
  return {
    cursorConfigured: isCursorSessionConfigured(),
    stripeConfigured: Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim()),
  };
}

/** Linhas exibíveis no log (exclui resumo interno e pings de sync). */
export function filterBillingLogRows(rows: BillingUsageRow[]): BillingUsageRow[] {
  return rows.filter((r) => {
    if (r.source === 'sync') return false;
    const meta = r.metadata as { type?: string } | null;
    if (meta?.type === 'cursor_usage_summary') return false;
    return true;
  });
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
  const exchangeRate = getBillingExchangeRate();
  const iofPct = getBillingIofPct();
  const cursorSummary = await getLatestCursorSummaryRow();
  const cursorMeta = cursorSummary?.metadata as {
    type?: string;
    billingCycleStart?: string;
    billingCycleEnd?: string;
    membershipType?: string;
    onDemandUsedCents?: number;
    onDemandLimitCents?: number | null;
    subscriptionUsd?: number;
    planIncludedPercentUsed?: number;
    syncedAt?: string;
  } | null;

  let dataSource: BillingDataSource = 'env_defaults';
  let planName = getPlanName();
  let planLimitUsd = getPlanMonthlyUsd();
  let planLimitBrl = getPlanLimitBrl();
  let billingCycleStart: string | null = null;
  let billingCycleEnd: string | null = null;
  let lastSyncedAt: string | null = null;
  let onDemandSpentUsd = 0;
  let planIncludedPercentUsed: number | null = null;

  const allCursorRows = filterBillingLogRows(await getBillingUsageLog(500, month))
    .filter((r) => r.source === 'cursor_dashboard');
  const onDemandEventUsd = round4(
    allCursorRows.reduce((s, r) => {
      const included = Boolean((r.metadata as { includedInPlan?: boolean } | null)?.includedInPlan);
      if (included) return s;
      // Eventos antigos sem flag: kind INCLUDED_* no metadata
      const kind = String((r.metadata as { kind?: string } | null)?.kind || '');
      if (/INCLUDED/i.test(kind)) return s;
      return s + Number(r.amount_usd || 0);
    }, 0),
  );
  const stripeSpentBrl = await sumMonthSpentBrl(month, 'cursor_stripe');
  let spentBrl = 0;
  const hasCursorMirror = Boolean(cursorSummary && cursorMeta?.billingCycleStart);

  if (hasCursorMirror) {
    dataSource = stripeSpentBrl > 0 ? 'mixed' : 'cursor';
    planName = formatCursorMembership(cursorMeta?.membershipType);
    billingCycleStart = cursorMeta?.billingCycleStart || null;
    billingCycleEnd = cursorMeta?.billingCycleEnd || null;
    lastSyncedAt = cursorMeta?.syncedAt || cursorSummary?.recorded_at || null;
    onDemandSpentUsd = round4(Number(cursorMeta?.onDemandUsedCents || 0) / 100);
    if (onDemandSpentUsd <= 0 && onDemandEventUsd > 0) onDemandSpentUsd = onDemandEventUsd;
    planIncludedPercentUsed =
      cursorMeta?.planIncludedPercentUsed != null ? Number(cursorMeta.planIncludedPercentUsed) : null;

    const subscriptionUsd = getPlanMonthlyUsd(cursorMeta?.membershipType);
    planLimitUsd = subscriptionUsd;
    planLimitBrl = usdToBrl(subscriptionUsd);

    // Gasto cobrado além do incluído = on-demand (não soma USAGE_EVENT_KIND_INCLUDED_*)
    spentBrl = round2(usdToBrl(onDemandSpentUsd) + stripeSpentBrl);
  } else if (stripeSpentBrl > 0) {
    dataSource = 'stripe';
    spentBrl = stripeSpentBrl;
  } else {
    spentBrl = await sumMonthSpentBrl(month);
  }

  const spentUsd = brlToUsd(spentBrl, exchangeRate, iofPct);
  const extraBrl = round2(Math.max(0, spentBrl - (hasCursorMirror ? 0 : planLimitBrl)));
  // Termômetro espelha o % do plano incluído do Cursor (não o $ dos eventos incluídos).
  let usagePct = 0;
  if (hasCursorMirror && planIncludedPercentUsed != null && Number.isFinite(planIncludedPercentUsed)) {
    usagePct = round2(planIncludedPercentUsed);
  } else if (planLimitBrl > 0) {
    usagePct = round2((spentBrl / planLimitBrl) * 100);
  }
  const planBalanceBrl = hasCursorMirror
    ? round2(usdToBrl(planLimitUsd * Math.max(0, (100 - usagePct) / 100)))
    : round2(Math.max(0, planLimitBrl - spentBrl));
  const entries = filterBillingLogRows(await getBillingUsageLog(500, month));
  const isPlaceholder = !hasCursorMirror && spentBrl <= 0 && entries.length === 0;
  const cycleClock = computeCycleClock(billingCycleStart, billingCycleEnd);

  let thermometer: BillingMonthSummary['thermometer'] = 'ok';
  if (!isPlaceholder) {
    if (usagePct >= 100 || (hasCursorMirror && onDemandSpentUsd > 0 && spentBrl > planLimitBrl)) {
      thermometer = 'critical';
    } else if (usagePct >= 75) {
      thermometer = 'warning';
    }
  }

  return {
    referenceMonth: month,
    planName: isPlaceholder ? `${planName} (estimado — sincronize)` : planName,
    planLimitBrl,
    planLimitUsd,
    spentBrl,
    spentUsd,
    extraBrl: hasCursorMirror ? round2(usdToBrl(onDemandSpentUsd)) : extraBrl,
    usagePct: isPlaceholder ? 0 : usagePct,
    planBalanceBrl: isPlaceholder ? planLimitBrl : planBalanceBrl,
    operationalSavingsBrl: getOperationalSavingsBrl(),
    exchangeRate,
    iofPct,
    entryCount: entries.length,
    thermometer: isPlaceholder ? 'ok' : thermometer,
    dataSource,
    isPlaceholder,
    billingCycleStart,
    billingCycleEnd,
    lastSyncedAt,
    onDemandSpentUsd,
    planIncludedPercentUsed,
    daysUntilCycleReset: cycleClock.daysUntilCycleReset,
    cycleTimeElapsedPct: cycleClock.cycleTimeElapsedPct,
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
 * Espelha fatura/gastos do dashboard Cursor (API não oficial).
 * Requer CURSOR_SESSION_TOKEN = cookie WorkosCursorSessionToken.
 */
export async function syncCursorBilling(): Promise<SyncBillingResult> {
  const sessionToken = getCursorSessionToken();
  if (!sessionToken) {
    return {
      ok: false,
      inserted: 0,
      skipped: 0,
      errors: ['CURSOR_SESSION_TOKEN ausente'],
      message:
        'Configure CURSOR_SESSION_TOKEN na Vercel: em cursor.com/dashboard → DevTools → Cookies → WorkosCursorSessionToken',
    };
  }

  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  try {
    const summary = await fetchCursorUsageSummary(sessionToken);
    const month = referenceMonthFromDate(new Date(summary.billingCycleStart));
    const startMs = String(new Date(summary.billingCycleStart).getTime());
    const endMs = String(new Date(summary.billingCycleEnd).getTime());

    await deleteCursorDashboardMonth(month);

    const events = await fetchAllCursorUsageEvents(sessionToken, {
      startDate: startMs,
      endDate: endMs,
      pageSize: 100,
      maxPages: 50,
    });

    const membershipType = summary.membershipType || 'unknown';
    const individualOd = Number(summary.individualUsage?.onDemand?.used || 0);
    const teamOd = Number(summary.teamUsage?.onDemand?.used || 0);
    const onDemandUsedRaw = Math.max(individualOd, teamOd);
    const onDemandUsedUsd = cursorOnDemandToUsd(onDemandUsedRaw);
    const planIncludedPercent = summary.individualUsage?.plan?.totalPercentUsed ?? null;
    const subscriptionUsd = getPlanMonthlyUsd(membershipType);

    const summaryRow = await recordBillingUsage({
      source: 'cursor_dashboard',
      external_id: `cursor-summary-${summary.billingCycleStart}`,
      summary: `Espelho Cursor — ${formatCursorMembership(membershipType)}`,
      amount_usd: 0,
      amount_brl: 0,
      recorded_at: summary.billingCycleEnd,
      metadata: {
        type: 'cursor_usage_summary',
        billingCycleStart: summary.billingCycleStart,
        billingCycleEnd: summary.billingCycleEnd,
        membershipType,
        // Guarda em centavos canônicos para leitura estável no summary.
        onDemandUsedCents: Math.round(onDemandUsedUsd * 100),
        onDemandLimitCents: (() => {
          const lim = Number(
            summary.individualUsage?.onDemand?.limit ??
              summary.teamUsage?.onDemand?.limit ??
              0,
          );
          if (!Number.isFinite(lim) || lim <= 0) return null;
          return lim >= 100 ? Math.round(lim) : Math.round(lim * 100);
        })(),
        subscriptionUsd,
        planIncludedPercentUsed: planIncludedPercent,
        planUsed: summary.individualUsage?.plan?.used,
        planLimit: summary.individualUsage?.plan?.limit,
        planRemaining: summary.individualUsage?.plan?.remaining,
        syncedAt: new Date().toISOString(),
      },
    });
    if (summaryRow) inserted += 1;

    for (const evt of events) {
      const amountUsd = eventAmountUsd(evt);
      const included = isIncludedPlanUsageEvent(evt);
      // Lista espelha todos os eventos com valor; cobrança extra = não incluído no plano
      const isChargeable = evt.isChargeable !== false && amountUsd > 0;
      if (!isChargeable) {
        skipped += 1;
        continue;
      }

      const extId = `cursor-evt-${evt.timestamp}-${String(evt.model || 'model').slice(0, 40)}`;
      const row = await recordBillingUsage({
        source: 'cursor_dashboard',
        external_id: extId.slice(0, 180),
        summary: `${evt.model || 'modelo'} · ${evt.isHeadless ? 'agent' : 'IDE'} · ${included ? 'incluído no plano' : (evt.usageBasedCosts || `$${amountUsd.toFixed(2)}`)}`,
        amount_usd: amountUsd,
        recorded_at: new Date(Number(evt.timestamp)).toISOString(),
        token_id: evt.model || null,
        metadata: {
          type: 'cursor_usage_event',
          model: evt.model,
          kind: evt.kind,
          includedInPlan: included,
          chargedCents: evt.chargedCents,
          usageBasedCosts: evt.usageBasedCosts,
          tokenUsage: evt.tokenUsage,
          isHeadless: evt.isHeadless,
          isChargeable: evt.isChargeable,
        },
      });
      if (row) inserted += 1;
      else skipped += 1;
    }

    return {
      ok: true,
      inserted,
      skipped,
      errors,
      message: `Cursor sincronizado — ${formatCursorMembership(membershipType)} · ${inserted} lançamentos no ciclo ${summary.billingCycleStart.slice(0, 10)} → ${summary.billingCycleEnd.slice(0, 10)}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    return { ok: false, inserted, skipped, errors, message: msg };
  }
}

/**
 * Sincroniza Cursor (espelho real) e, se configurado, faturas Stripe.
 */
export async function syncBillingUsage(): Promise<SyncBillingResult> {
  const cursorResult = await syncCursorBilling();
  if (cursorResult.ok && cursorResult.inserted > 0) {
    const stripeLines = await fetchStripeInvoiceLines();
    if (stripeLines.length > 0) {
      let stripeInserted = 0;
      for (const line of stripeLines) {
        const row = await recordBillingUsage({
          source: 'cursor_stripe',
          external_id: line.id,
          summary: `[Stripe] ${line.summary}`,
          amount_usd: line.amountUsd,
          recorded_at: line.recordedAt,
          metadata: { stripe_invoice_id: line.id },
        });
        if (row) stripeInserted += 1;
      }
      return {
        ...cursorResult,
        message: `${cursorResult.message} · Stripe: +${stripeInserted} fatura(s).`,
      };
    }
    return cursorResult;
  }

  if (isCursorSessionConfigured()) {
    return cursorResult;
  }

  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  try {
    const lines = await fetchStripeInvoiceLines();
    if (lines.length === 0 && !process.env.STRIPE_SECRET_KEY) {
      return {
        ok: false,
        inserted: 0,
        skipped: 0,
        errors: ['CURSOR_SESSION_TOKEN e STRIPE_SECRET_KEY ausentes'],
        message:
          'Configure CURSOR_SESSION_TOKEN (espelho Cursor) ou STRIPE_SECRET_KEY na Vercel para importar gastos reais.',
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
      message: `Stripe sincronizado — ${inserted} lançamentos novos.`,
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
