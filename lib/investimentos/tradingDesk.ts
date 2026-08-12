/**
 * Mesa de trading semi-manual (sem token de corretora).
 * Cotação = última marcação que o usuário lançou do banco (last_mark_*).
 * Alertas COMPRAR/VENDER + rotação: se vende, sugere a próxima compra.
 */
import type { InvestorProfile, InvestmentPosition, InvestmentWatchlistItem } from './types.js';

export type DeskSide = 'COMPRAR' | 'VENDER' | 'MANTER';

export type DeskAlert = {
  id: string;
  side: DeskSide;
  rank: number;
  ticker: string;
  name: string;
  instrumentType: string;
  sleeve: 'trading' | 'investimento';
  broker: string;
  /** Preço de referência (marcação ou médio) */
  refPrice: number | null;
  lastMarkAt: string | null;
  quantity: number;
  amountBrl: number;
  pnlPct: number | null;
  reason: string;
  /** Se VENDER, a oportunidade de compra sugerida no lugar */
  rotateBuy?: { ticker: string; name: string; reason: string } | null;
  positionId?: string | null;
};

export type TradingDeskSnapshot = {
  tradingSleevePct: number;
  investSleevePct: number;
  capitalTotal: number;
  tradingBudget: number;
  investBudget: number;
  tradingMarketValue: number;
  investMarketValue: number;
  lastMarkAt: string | null;
  markSource: 'manual_banco';
  note: string;
  alerts: DeskAlert[];
  top10: DeskAlert[];
};

const TRADING_TYPES = new Set(['acao', 'etf', 'bdr', 'fii', 'fiagro']);

/** Candidatos padrão de rotação (RV) quando a watchlist está vazia. */
const DEFAULT_BUY_POOL: Array<{ ticker: string; name: string; type: string }> = [
  { ticker: 'BOVA11', name: 'BOVA11 — iShares Ibovespa', type: 'etf' },
  { ticker: 'IVVB11', name: 'IVVB11 — iShares S&P 500', type: 'etf' },
  { ticker: 'PETR4', name: 'PETR4 — Petrobras PN', type: 'acao' },
  { ticker: 'VALE3', name: 'VALE3 — Vale ON', type: 'acao' },
  { ticker: 'ITUB4', name: 'ITUB4 — Itaú Unibanco PN', type: 'acao' },
  { ticker: 'HGLG11', name: 'HGLG11 — CSHG Logística (FII tijolo)', type: 'fii' },
  { ticker: 'XPLG11', name: 'XPLG11 — XP Log (FII tijolo)', type: 'fii' },
  { ticker: 'MXRF11', name: 'MXRF11 — Maxi Renda (FII papel)', type: 'fii' },
];

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function positionSleeve(p: InvestmentPosition): 'trading' | 'investimento' {
  const raw = String((p as any).sleeve || '').toLowerCase();
  if (raw === 'trading') return 'trading';
  if (raw === 'investimento') return 'investimento';
  // Heurística: ações/ETF/FII com marcação → trading; resto investimento
  return TRADING_TYPES.has(String(p.instrument_type || '').toLowerCase()) ? 'trading' : 'investimento';
}

function markPrice(p: InvestmentPosition): number | null {
  const m = num((p as any).last_mark_price, NaN);
  if (Number.isFinite(m) && m > 0) return m;
  const avg = num(p.avg_price, NaN);
  if (Number.isFinite(avg) && avg > 0) return avg;
  const qty = num(p.quantity, 0);
  const val = num(p.current_value, 0);
  if (qty > 0 && val > 0) return val / qty;
  return null;
}

function marketValue(p: InvestmentPosition): number {
  const qty = num(p.quantity, 0);
  const px = markPrice(p);
  if (qty > 0 && px != null) return qty * px;
  return num(p.current_value, 0);
}

function pnlPct(p: InvestmentPosition): number | null {
  const avg = num(p.avg_price, NaN);
  const px = markPrice(p);
  if (!Number.isFinite(avg) || avg <= 0 || px == null) return null;
  return ((px - avg) / avg) * 100;
}

function heldCodes(positions: InvestmentPosition[]): Set<string> {
  const s = new Set<string>();
  for (const p of positions) {
    const c = String(p.instrument_code || p.instrument_name || '').trim().toUpperCase();
    if (c) s.add(c);
  }
  return s;
}

function buyPool(
  watchlist: InvestmentWatchlistItem[],
  held: Set<string>,
): Array<{ ticker: string; name: string; type: string; reason: string }> {
  const out: Array<{ ticker: string; name: string; type: string; reason: string }> = [];
  for (const w of watchlist) {
    if (w.status === 'evitar') continue;
    const ticker = String(w.instrument_code || w.instrument_name || '').trim().toUpperCase();
    if (!ticker || held.has(ticker)) continue;
    out.push({
      ticker,
      name: w.instrument_name || ticker,
      type: w.instrument_type || 'acao',
      reason: w.status === 'candidato' ? 'Na sua watchlist como candidato' : 'Na sua watchlist',
    });
  }
  for (const d of DEFAULT_BUY_POOL) {
    if (held.has(d.ticker)) continue;
    if (out.some((x) => x.ticker === d.ticker)) continue;
    out.push({ ...d, reason: 'Candidato do consultor para sleeve de trading' });
  }
  return out;
}

/**
 * Monta a mesa do dia: alertas + top 10 com rotação compra↔venda.
 */
export function buildTradingDesk(
  profile: InvestorProfile | null | undefined,
  positions: InvestmentPosition[] = [],
  watchlist: InvestmentWatchlistItem[] = [],
): TradingDeskSnapshot {
  const capitalTotal = Math.max(0, num(profile?.capital_available, 0));
  const tradingSleevePct = Math.min(100, Math.max(0, num((profile as any)?.trading_sleeve_pct, 20)));
  const investSleevePct = 100 - tradingSleevePct;
  const tradingBudget = (capitalTotal * tradingSleevePct) / 100;
  const investBudget = capitalTotal - tradingBudget;

  const active = positions.filter((p) => p.is_active !== false);
  let tradingMarketValue = 0;
  let investMarketValue = 0;
  let lastMarkAt: string | null = null;

  for (const p of active) {
    const sleeve = positionSleeve(p);
    const mv = marketValue(p);
    if (sleeve === 'trading') tradingMarketValue += mv;
    else investMarketValue += mv;
    const at = (p as any).last_mark_at ? String((p as any).last_mark_at) : null;
    if (at && (!lastMarkAt || at > lastMarkAt)) lastMarkAt = at;
  }

  const held = heldCodes(active);
  const pool = buyPool(watchlist, held);
  let buyIdx = 0;
  const nextBuy = () => {
    if (!pool.length) return null;
    const b = pool[buyIdx % pool.length];
    buyIdx += 1;
    return b;
  };

  const sellAlerts: DeskAlert[] = [];
  const holdNotes: DeskAlert[] = [];

  for (const p of active.filter((x) => positionSleeve(x) === 'trading')) {
    const ticker = String(p.instrument_code || p.instrument_name || '').trim().toUpperCase() || 'ATIVO';
    const pnl = pnlPct(p);
    const target = num((p as any).target_sell_pct, 3);
    const stop = num((p as any).stop_loss_pct, 2);
    const qty = num(p.quantity, 0);
    const px = markPrice(p);
    const mv = marketValue(p);
    const markAt = (p as any).last_mark_at ? String((p as any).last_mark_at) : null;

    let side: DeskSide = 'MANTER';
    let reason = 'Sem gatilho ainda — atualize a cotação do banco e acompanhe.';
    if (pnl != null && pnl >= target) {
      side = 'VENDER';
      reason = `Alvo de realização: +${pnl.toFixed(2)}% (meta +${target}%). Realize no banco e registre a venda.`;
    } else if (pnl != null && pnl <= -Math.abs(stop)) {
      side = 'VENDER';
      reason = `Stop de proteção: ${pnl.toFixed(2)}% (limite -${Math.abs(stop)}%). Avalie saída no banco.`;
    } else if (px == null) {
      reason = 'Sem preço marcado — abra o banco, veja a cotação e lance aqui (última atualização).';
    } else if (pnl != null) {
      reason = `P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% vs preço médio. Meta venda +${target}% / stop -${Math.abs(stop)}%.`;
    }

    const rotate = side === 'VENDER' ? nextBuy() : null;
    const alert: DeskAlert = {
      id: `pos-${p.id || ticker}`,
      side,
      rank: 0,
      ticker,
      name: p.instrument_name || ticker,
      instrumentType: p.instrument_type || 'acao',
      sleeve: 'trading',
      broker: p.broker || 'XP',
      refPrice: px,
      lastMarkAt: markAt,
      quantity: qty,
      amountBrl: mv,
      pnlPct: pnl,
      reason,
      rotateBuy: rotate
        ? { ticker: rotate.ticker, name: rotate.name, reason: `Ao vender ${ticker}, estude comprar: ${rotate.reason}` }
        : null,
      positionId: p.id || null,
    };
    if (side === 'VENDER') sellAlerts.push(alert);
    else holdNotes.push(alert);
  }

  // Compras: se há venda, garante ao menos 1 compra rotacionada; senão preenche com pool
  const buyAlerts: DeskAlert[] = [];
  const buysNeeded = Math.max(sellAlerts.length, tradingMarketValue < tradingBudget * 0.85 ? 3 : 2);
  for (let i = 0; i < buysNeeded; i++) {
    const b = nextBuy();
    if (!b) break;
    const suggested = Math.max(500, Math.min(tradingBudget * 0.15, (tradingBudget - tradingMarketValue) / Math.max(1, buysNeeded)));
    buyAlerts.push({
      id: `buy-${b.ticker}`,
      side: 'COMPRAR',
      rank: 0,
      ticker: b.ticker,
      name: b.name,
      instrumentType: b.type,
      sleeve: 'trading',
      broker: profile?.broker_default || 'XP',
      refPrice: null,
      lastMarkAt: null,
      quantity: 0,
      amountBrl: Math.round(suggested * 100) / 100,
      pnlPct: null,
      reason: b.reason + ' — veja o preço no banco e registre a compra aqui.',
      rotateBuy: null,
      positionId: null,
    });
  }

  // Ordena: VENDER primeiro (maior P&L), depois COMPRAR, depois MANTER
  const merged = [
    ...sellAlerts.sort((a, b) => (b.pnlPct ?? -999) - (a.pnlPct ?? -999)),
    ...buyAlerts,
    ...holdNotes.sort((a, b) => (b.pnlPct ?? -999) - (a.pnlPct ?? -999)),
  ];
  const top10 = merged.slice(0, 10).map((a, i) => ({ ...a, rank: i + 1 }));

  return {
    tradingSleevePct,
    investSleevePct,
    capitalTotal,
    tradingBudget: Math.round(tradingBudget * 100) / 100,
    investBudget: Math.round(investBudget * 100) / 100,
    tradingMarketValue: Math.round(tradingMarketValue * 100) / 100,
    investMarketValue: Math.round(investMarketValue * 100) / 100,
    lastMarkAt,
    markSource: 'manual_banco',
    note:
      'Modo semi-manual: você compra/vende no banco. Aqui entram alertas, registro da operação e a próxima oportunidade de compra quando houver venda. Cotação = última marcação que você lançou (com data/hora).',
    alerts: merged,
    top10,
  };
}
