/**
 * Projeções por horizonte (30d / 60d / 90d / 6m / 1a) — cenários-objetivo.
 * RF usa Selic/CDI/IPCA públicas; RV usa faixas (bear/base/bull), nunca garantia.
 */
import { formatPct, type MacroRates } from './marketRates.js';

export type HorizonKey = 'd30' | 'd60' | 'd90' | 'm6' | 'y1';

export type HorizonProjection = {
  key: HorizonKey;
  days: number;
  label: string;
  valueBrl: number;
  profitBrl: number;
  returnPct: number;
  bearValueBrl?: number;
  bullValueBrl?: number;
  bearReturnPct?: number;
  bullReturnPct?: number;
};

export type AssetPerformanceOutlook = {
  kind: 'rf_rate' | 'rf_ipca' | 'rv_scenario';
  annualBasePct: number;
  annualBearPct?: number;
  annualBullPct?: number;
  rateLabel: string;
  horizons: HorizonProjection[];
  disclaimer: string;
  asOf: string;
};

const HORIZONS: Array<{ key: HorizonKey; days: number; label: string }> = [
  { key: 'd30', days: 30, label: '30d' },
  { key: 'd60', days: 60, label: '60d' },
  { key: 'd90', days: 90, label: '90d' },
  { key: 'm6', days: 182, label: '6m' },
  { key: 'y1', days: 365, label: '1a' },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Juros compostos: taxa a.a. → valor após N dias. */
export function compoundValue(principal: number, annualPct: number, days: number): number {
  if (!(principal > 0) || !Number.isFinite(annualPct) || days <= 0) return principal;
  const factor = Math.pow(1 + annualPct / 100, days / 365);
  return round2(principal * factor);
}

function periodReturnPct(principal: number, future: number): number {
  if (!(principal > 0)) return 0;
  return round2(((future - principal) / principal) * 100);
}

function buildHorizons(
  amountBrl: number,
  annualBasePct: number,
  annualBearPct?: number,
  annualBullPct?: number,
): HorizonProjection[] {
  return HORIZONS.map((h) => {
    const valueBrl = compoundValue(amountBrl, annualBasePct, h.days);
    const row: HorizonProjection = {
      key: h.key,
      days: h.days,
      label: h.label,
      valueBrl,
      profitBrl: round2(valueBrl - amountBrl),
      returnPct: periodReturnPct(amountBrl, valueBrl),
    };
    if (annualBearPct != null && annualBullPct != null) {
      const bear = compoundValue(amountBrl, annualBearPct, h.days);
      const bull = compoundValue(amountBrl, annualBullPct, h.days);
      row.bearValueBrl = bear;
      row.bullValueBrl = bull;
      row.bearReturnPct = periodReturnPct(amountBrl, bear);
      row.bullReturnPct = periodReturnPct(amountBrl, bull);
    }
    return row;
  });
}

type ProductRef = {
  instrumentType: string;
  ticker: string;
  subtype?: string;
};

/**
 * Estima outlook de performance para um lote sugerido.
 */
export function buildAssetPerformanceOutlook(
  amountBrl: number,
  product: ProductRef,
  rates?: MacroRates | null,
): AssetPerformanceOutlook {
  const asOf = rates?.fetchedAt || new Date().toISOString();
  const selic = rates?.selicPct ?? 14;
  const cdi = rates?.cdiPct ?? selic - 0.1;
  const ipca = rates?.ipcaPct ?? 4.5;
  const type = String(product.instrumentType || '').toLowerCase();
  const ticker = String(product.ticker || '');
  const subtype = String(product.subtype || '');

  // Tesouro Selic / caixa pós-Selic
  if (type === 'tesouro' && /Selic|LFT/i.test(`${ticker} ${subtype}`)) {
    const annualBasePct = selic;
    return {
      kind: 'rf_rate',
      annualBasePct,
      rateLabel: `Selic ${formatPct(selic)} a.a.`,
      horizons: buildHorizons(amountBrl, annualBasePct),
      disclaimer: 'Cenário-objetivo se a Selic se mantiver próxima da atual. Não é garantia.',
      asOf,
    };
  }

  // Tesouro IPCA+
  if (type === 'tesouro' && /IPCA|NTN-B/i.test(`${ticker} ${subtype}`)) {
    const realCoupon = 6.5; // taxa real ilustrativa de mercado (cenário)
    const annualBasePct = ipca + realCoupon;
    const annualBearPct = ipca + 4.5; // juro real menor / marcação adversa
    const annualBullPct = ipca + 8.0;
    return {
      kind: 'rf_ipca',
      annualBasePct: round2(annualBasePct),
      annualBearPct: round2(annualBearPct),
      annualBullPct: round2(annualBullPct),
      rateLabel: `IPCA ${formatPct(ipca)} + ~${realCoupon.toFixed(1)}% a.a. (cenário)`,
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer:
        'Cenário IPCA+ taxa real ilustrativa. Preço marca a mercado antes do vencimento — pode oscilar. Não é garantia.',
      asOf,
    };
  }

  // CDB / LCI pós-CDI (assume ~100% CDI no cenário base; LCI um pouco menos bruto mas isenta — usamos CDI)
  if (type === 'cdb' || type === 'lci') {
    const annualBasePct = type === 'lci' ? cdi * 0.92 : cdi; // LCI: proxy líquido aproximado
    return {
      kind: 'rf_rate',
      annualBasePct: round2(annualBasePct),
      rateLabel: type === 'lci' ? `~92% CDI (${formatPct(cdi)}) — proxy isento` : `CDI ${formatPct(cdi)} a.a.`,
      horizons: buildHorizons(amountBrl, annualBasePct),
      disclaimer: 'Cenário se o % do CDI ofertado se mantiver. Compare a taxa real do banco no dia. Não é garantia.',
      asOf,
    };
  }

  // Debênture — crédito privado, um pouco acima do CDI no cenário, com risco
  if (type === 'debenture') {
    const annualBasePct = cdi + 1.5;
    const annualBearPct = cdi - 2;
    const annualBullPct = cdi + 3;
    return {
      kind: 'rv_scenario',
      annualBasePct: round2(annualBasePct),
      annualBearPct: round2(annualBearPct),
      annualBullPct: round2(annualBullPct),
      rateLabel: `CDI ${formatPct(cdi)} + spread (cenário)`,
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer: 'Crédito privado: retorno e risco de crédito. Cenário ilustrativo, não garantia.',
      asOf,
    };
  }

  // FII
  if (type === 'fii') {
    const isPapel = /papel|CRI/i.test(subtype);
    const annualBasePct = isPapel ? 11 : 9;
    const annualBearPct = isPapel ? -6 : -10;
    const annualBullPct = isPapel ? 16 : 15;
    return {
      kind: 'rv_scenario',
      annualBasePct,
      annualBearPct,
      annualBullPct,
      rateLabel: isPapel ? 'FII papel — renda + marcação (cenário)' : 'FII tijolo — renda + marcação (cenário)',
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer: 'FII combina distribuição e preço da cota. Faixas bear/base/bull — não é garantia.',
      asOf,
    };
  }

  // ETF cripto
  if (type === 'etf' && /HASH|CRIPTO|CRYPTO/i.test(ticker)) {
    return {
      kind: 'rv_scenario',
      annualBasePct: 15,
      annualBearPct: -40,
      annualBullPct: 50,
      rateLabel: 'ETF cripto — alta volatilidade (cenário)',
      horizons: buildHorizons(amountBrl, 15, -40, 50),
      disclaimer: 'Cripto é especulativo. Faixas amplas — não é garantia.',
      asOf,
    };
  }

  // ETF índice Brasil / exterior
  if (type === 'etf') {
    const intl = /IVVB|S&P|exterior|EUA/i.test(`${ticker} ${subtype}`);
    const annualBasePct = intl ? 10 : 9;
    const annualBearPct = intl ? -18 : -15;
    const annualBullPct = intl ? 22 : 20;
    return {
      kind: 'rv_scenario',
      annualBasePct,
      annualBearPct,
      annualBullPct,
      rateLabel: intl ? 'ETF exterior — cenário' : 'ETF Ibovespa — cenário',
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer: 'Renda variável: cenários ilustrativos bear/base/bull. Não é garantia de retorno.',
      asOf,
    };
  }

  // Ação individual — faixa mais larga
  if (type === 'acao') {
    return {
      kind: 'rv_scenario',
      annualBasePct: 10,
      annualBearPct: -25,
      annualBullPct: 28,
      rateLabel: 'Ação individual — cenário',
      horizons: buildHorizons(amountBrl, 10, -25, 28),
      disclaimer: 'Ação isolada oscila mais que o índice. Faixas bear/base/bull — não é garantia.',
      asOf,
    };
  }

  // Fallback: CDI
  return {
    kind: 'rf_rate',
    annualBasePct: cdi,
    rateLabel: `Proxy CDI ${formatPct(cdi)} a.a.`,
    horizons: buildHorizons(amountBrl, cdi),
    disclaimer: 'Cenário-objetivo ilustrativo. Não é garantia.',
    asOf,
  };
}
