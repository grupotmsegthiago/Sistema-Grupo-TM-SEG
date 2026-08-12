/**
 * Cache do painel Gestão Investimento.
 * - Cron a cada 30 min pré-calcula o summary (pesquisa “off”).
 * - A tela lê 1 linha em system_settings — sem 5 queries a cada abertura.
 */
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { createDraftInvestorProfile, evaluateProfileCompleteness } from './profileValidation.js';
import { buildProvision30dEstimate, describeMonthlyTargetBand } from './targetReturn.js';
import { buildAllocationScenario, isScenarioStale, type AllocationScenario } from './allocationEngine.js';
import { fetchMacroRates } from './marketRates.js';
import { buildTradingDesk, type TradingDeskSnapshot } from './tradingDesk.js';
import type {
  InvestorProfile,
  InvestmentPosition,
  InvestmentWatchlistItem,
  ProfileCompleteness,
  Provision30dEstimate,
  MonthlyTargetAnnualized,
} from './types.js';

export const GESTAO_CACHE_TTL_MS = 30 * 60 * 1000;
/** v5: parecer + projeção de performance 30d→1a por linha. */
const CACHE_KEY_PREFIX = 'gestao_investimento_cache_v5_';
const OWNERS_KEY = 'gestao_investimento_cache_owners_v5';

export type AllocationRow = { type: string; value: number; pct: number };

export type DashboardBriefing = {
  allocationByType: AllocationRow[];
  topPositions: Array<{ name: string; type: string; value: number; broker: string }>;
  gaps: string[];
  nextActions: string[];
  positionsCount: number;
  watchlistCount: number;
  profileComplete: boolean;
  /** Cenário sugerido pela IA (R$ + %) — sem executar ordens */
  scenario: AllocationScenario | null;
  /** Mesa semi-manual do dia (alertas comprar/vender + rotação) */
  tradingDesk: TradingDeskSnapshot | null;
};

export type DashboardSnapshot = {
  ok: true;
  schemaReady: true;
  fromCache: boolean;
  refreshedAt: string;
  nextRefreshAt: string;
  cacheAgeSec: number;
  profile: InvestorProfile | null;
  draftDefaults: InvestorProfile;
  completeness: ProfileCompleteness;
  canRecommend: boolean;
  positions: InvestmentPosition[];
  watchlist: InvestmentWatchlistItem[];
  riskLimits: unknown;
  dataSources: unknown[];
  portfolioValue: number;
  capitalBase: number;
  targetBand: MonthlyTargetAnnualized;
  provision30d: Provision30dEstimate;
  recommendationsBlockedReason: string | null;
  automation: { canTrade: boolean; note: string };
  briefing: DashboardBriefing;
};

function cacheKey(ownerUserId: string): string {
  return `${CACHE_KEY_PREFIX}${ownerUserId}`;
}

function isMissingTableError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  const code = String((err as any)?.code || '');
  return code === '42P01' || /does not exist|schema cache|Could not find the table/i.test(msg);
}

function buildBriefing(
  profile: InvestorProfile | null,
  positions: InvestmentPosition[],
  watchlist: InvestmentWatchlistItem[],
  completeness: ProfileCompleteness,
  portfolioValue: number,
): DashboardBriefing {
  const byType = new Map<string, number>();
  for (const p of positions) {
    const t = String(p.instrument_type || 'outros');
    byType.set(t, (byType.get(t) || 0) + Number(p.current_value || 0));
  }
  const allocationByType: AllocationRow[] = [...byType.entries()]
    .map(([type, value]) => ({
      type,
      value,
      pct: portfolioValue > 0 ? (value / portfolioValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const topPositions = [...positions]
    .sort((a, b) => Number(b.current_value || 0) - Number(a.current_value || 0))
    .slice(0, 5)
    .map((p) => ({
      name: String(p.instrument_name || ''),
      type: String(p.instrument_type || 'outros'),
      value: Number(p.current_value || 0),
      broker: String(p.broker || 'XP'),
    }));

  const gaps: string[] = [];
  if (!completeness.complete) {
    gaps.push(...completeness.missing.slice(0, 6));
  }
  if (positions.length === 0) {
    gaps.push(
      completeness.complete
        ? 'Ainda sem posições na carteira XP — execute o cenário na corretora e registre depois'
        : 'Nenhuma posição XP cadastrada na carteira',
    );
  }
  // Watchlist só é lacuna crítica quando ainda não há cenário (perfil incompleto)
  if (watchlist.length === 0 && !completeness.complete) {
    gaps.push('Watchlist vazia — sem candidatos em observação');
  }
  const maxPct = allocationByType[0]?.pct ?? 0;
  if (maxPct >= 60) {
    gaps.push(`Concentração alta em ${allocationByType[0].type} (${maxPct.toFixed(0)}%)`);
  }

  // buildBriefing sincroniza; taxas entram em buildBriefingAsync / revive
  const scenario = completeness.complete ? buildAllocationScenario(profile, positions, null) : null;

  const nextActions: string[] = [];
  if (!completeness.complete) {
    nextActions.push('Completar perfil do investidor (bloqueia recomendações)');
  } else if (scenario?.topActions?.length) {
    nextActions.push(
      ...scenario.topActions.slice(0, 4).map(
        (a) =>
          `${a.rank}. ${a.signal || 'COMPRAR'} ${a.ticker || a.title}: ${a.amountBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — ${a.categoryKind} · ${a.institution}`,
      ),
    );
    nextActions.push('Siga o passo a passo na instituição — a IA não envia ordem');
  }
  if (positions.length === 0 && completeness.complete) {
    nextActions.push('Depois de aplicar, registre as posições reais na aba Carteira');
  } else if (positions.length > 0) {
    nextActions.push('Revisar valores atuais se houve aporte/resgate');
  }
  if (profile?.emergency_reserve != null && Number(profile.emergency_reserve) <= 0) {
    nextActions.push('Definir reserva de emergência > 0');
  }

  const tradingDesk = completeness.complete ? buildTradingDesk(profile, positions, watchlist) : null;

  return {
    allocationByType,
    topPositions,
    gaps,
    nextActions: nextActions.slice(0, 6),
    positionsCount: positions.length,
    watchlistCount: watchlist.length,
    profileComplete: completeness.complete,
    scenario,
    tradingDesk,
  };
}

async function buildBriefingWithRates(
  profile: InvestorProfile | null,
  positions: InvestmentPosition[],
  watchlist: InvestmentWatchlistItem[],
  completeness: ProfileCompleteness,
  portfolioValue: number,
): Promise<DashboardBriefing> {
  const base = buildBriefing(profile, positions, watchlist, completeness, portfolioValue);
  if (!completeness.complete || !profile) return base;
  const rates = await fetchMacroRates();
  const scenario = buildAllocationScenario(profile, positions, rates);
  if (!scenario) return base;
  const tradingDesk = buildTradingDesk(profile, positions, watchlist);
  return {
    ...base,
    scenario,
    tradingDesk,
    nextActions: [
      ...(tradingDesk.top10.slice(0, 3).map(
        (a) => `${a.rank}. ${a.side} ${a.ticker}: ${a.reason.slice(0, 80)}`,
      )),
      ...scenario.topActions.slice(0, 2).map(
        (a) =>
          `${a.signal} ${a.ticker}: ${a.amountBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — ${a.institution}`,
      ),
      'Siga o passo a passo na instituição — a IA não envia ordem',
    ].slice(0, 6),
  };
}

/** Regenera parecer se cache antigo (ATIVO / sem Selic / sem howToBuy). */
export async function reviveStaleScenario(snap: DashboardSnapshot): Promise<DashboardSnapshot> {
  if (!snap.canRecommend || !snap.profile) return snap;
  if (!isScenarioStale(snap.briefing?.scenario)) return snap;
  const rates = await fetchMacroRates();
  const scenario = buildAllocationScenario(snap.profile, snap.positions || [], rates);
  if (!scenario) return snap;
  const tradingDesk = buildTradingDesk(snap.profile, snap.positions || [], snap.watchlist || []);
  return {
    ...snap,
    briefing: {
      ...snap.briefing,
      scenario,
      tradingDesk,
      nextActions: [
        ...tradingDesk.top10.slice(0, 3).map((a) => `${a.rank}. ${a.side} ${a.ticker}`),
        ...scenario.topActions.slice(0, 2).map(
          (a) =>
            `${a.signal} ${a.ticker}: ${a.amountBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — ${a.institution}`,
        ),
        'Siga o passo a passo na instituição — a IA não envia ordem',
      ].slice(0, 6),
    },
    fromCache: false,
  };
}

/** Monta o snapshot completo a partir do banco (usado pelo cron e fallback). */
export async function buildDashboardSnapshot(ownerUserId: string): Promise<DashboardSnapshot | { ok: false; error: string; schema_missing?: boolean }> {
  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: 'Supabase admin indisponível' };

  const [{ data: profile, error: pErr }, { data: positions, error: posErr }, { data: watchlist }, { data: limits }, { data: sources }] =
    await Promise.all([
      sb.from('investor_profiles').select('*').eq('owner_user_id', ownerUserId).maybeSingle(),
      sb.from('investment_positions').select('*').eq('owner_user_id', ownerUserId).eq('is_active', true).order('created_at', { ascending: false }),
      sb.from('investment_watchlists').select('*').eq('owner_user_id', ownerUserId).order('priority', { ascending: true }),
      sb.from('investment_risk_limits').select('*').eq('owner_user_id', ownerUserId).maybeSingle(),
      sb.from('investment_data_sources').select('code, name, url, reliability, is_active, last_collected_at').eq('is_active', true),
    ]);

  if (pErr && isMissingTableError(pErr)) {
    return { ok: false, error: 'schema_missing', schema_missing: true };
  }
  if (pErr) return { ok: false, error: pErr.message };
  if (posErr && !isMissingTableError(posErr)) return { ok: false, error: posErr.message };

  const draft = profile
    ? ({ ...createDraftInvestorProfile(), ...profile } as InvestorProfile)
    : createDraftInvestorProfile();
  const completeness = evaluateProfileCompleteness(profile ? (profile as InvestorProfile) : null);
  const targetBand = describeMonthlyTargetBand(
    Number(draft.monthly_target_pct_min ?? 1.5),
    Number(draft.monthly_target_pct_max ?? 2.0),
  );
  const positionsList = (positions || []) as InvestmentPosition[];
  const portfolioValue = positionsList.reduce((s, p) => s + Number(p.current_value || 0), 0);
  const capitalBase = Number(draft.capital_available || portfolioValue || 100_000);
  const provision30d = buildProvision30dEstimate(capitalBase, targetBand.monthlyMinPct, targetBand.monthlyMaxPct);
  const briefing = await buildBriefingWithRates(
    profile ? (profile as InvestorProfile) : null,
    positionsList,
    (watchlist || []) as InvestmentWatchlistItem[],
    completeness,
    portfolioValue,
  );

  const refreshedAt = new Date().toISOString();
  const nextRefreshAt = new Date(Date.now() + GESTAO_CACHE_TTL_MS).toISOString();

  return {
    ok: true,
    schemaReady: true,
    fromCache: false,
    refreshedAt,
    nextRefreshAt,
    cacheAgeSec: 0,
    profile: profile || null,
    draftDefaults: createDraftInvestorProfile(),
    completeness,
    canRecommend: completeness.complete,
    positions: positionsList,
    watchlist: (watchlist || []) as InvestmentWatchlistItem[],
    riskLimits: limits || null,
    dataSources: sources || [],
    portfolioValue,
    capitalBase,
    targetBand,
    provision30d,
    recommendationsBlockedReason: completeness.complete ? null : completeness.message,
    automation: {
      canTrade: false,
      note: 'A IA não está autorizada a comprar, vender, resgatar, transferir ou movimentar dinheiro automaticamente.',
    },
    briefing,
  };
}

export async function readCachedSnapshot(ownerUserId: string): Promise<DashboardSnapshot | null> {
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('system_settings')
      .select('value')
      .eq('key', cacheKey(ownerUserId))
      .maybeSingle();
    if (error || !data?.value) return null;
    const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!raw || raw.ok !== true || !raw.refreshedAt) return null;
    const age = Date.now() - new Date(raw.refreshedAt).getTime();
    if (!Number.isFinite(age) || age < 0) return null;
    if (age > GESTAO_CACHE_TTL_MS + 5 * 60 * 1000) return null; // margem 5 min
    return {
      ...raw,
      fromCache: true,
      cacheAgeSec: Math.round(age / 1000),
      nextRefreshAt: raw.nextRefreshAt || new Date(new Date(raw.refreshedAt).getTime() + GESTAO_CACHE_TTL_MS).toISOString(),
    } as DashboardSnapshot;
  } catch {
    return null;
  }
}

export async function writeCachedSnapshot(ownerUserId: string, snapshot: DashboardSnapshot): Promise<void> {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const toStore = {
    ...snapshot,
    fromCache: true,
    ownerUserId,
  };
  await sb.from('system_settings').upsert(
    [{ key: cacheKey(ownerUserId), value: toStore, updated_at: new Date().toISOString() }],
    { onConflict: 'key' },
  );

  // Mantém lista de owners para o cron (1 linha).
  try {
    const { data } = await sb.from('system_settings').select('value').eq('key', OWNERS_KEY).maybeSingle();
    let owners: string[] = [];
    if (data?.value) {
      const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      owners = Array.isArray(raw?.owners) ? raw.owners.map(String) : [];
    }
    if (!owners.includes(ownerUserId)) {
      owners.push(ownerUserId);
      await sb.from('system_settings').upsert(
        [{ key: OWNERS_KEY, value: { owners }, updated_at: new Date().toISOString() }],
        { onConflict: 'key' },
      );
    }
  } catch {
    /* não bloqueia */
  }
}

/** Lista owners conhecidos (cache + perfis) para o cron de 30 min. */
export async function listCacheOwnerIds(): Promise<string[]> {
  const sb = createSupabaseAdminClient();
  if (!sb) return [];
  const ids = new Set<string>();
  try {
    const { data } = await sb.from('system_settings').select('value').eq('key', OWNERS_KEY).maybeSingle();
    if (data?.value) {
      const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      for (const id of raw?.owners || []) ids.add(String(id));
    }
  } catch { /* */ }
  try {
    const { data } = await sb.from('investor_profiles').select('owner_user_id').limit(50);
    for (const row of data || []) {
      if (row?.owner_user_id) ids.add(String(row.owner_user_id));
    }
  } catch { /* schema ainda não existe */ }
  return [...ids];
}

/** Recalcula e grava cache para um owner. */
export async function refreshOwnerCache(ownerUserId: string): Promise<{ ok: boolean; error?: string; refreshedAt?: string }> {
  const snap = await buildDashboardSnapshot(ownerUserId);
  if (!snap.ok) return { ok: false, error: snap.error };
  await writeCachedSnapshot(ownerUserId, snap);
  return { ok: true, refreshedAt: snap.refreshedAt };
}

/** Cron: refresh de todos os owners conhecidos (leve — poucos usuários Diretoria). */
export async function refreshAllOwnerCaches(): Promise<{ ok: boolean; refreshed: number; errors: string[] }> {
  const owners = await listCacheOwnerIds();
  if (owners.length === 0) {
    return { ok: true, refreshed: 0, errors: [] };
  }
  const errors: string[] = [];
  let refreshed = 0;
  for (const id of owners) {
    const r = await refreshOwnerCache(id);
    if (r.ok) refreshed++;
    else if (r.error) errors.push(`${id}: ${r.error}`);
  }
  return { ok: errors.length === 0, refreshed, errors };
}
