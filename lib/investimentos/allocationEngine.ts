/**
 * Motor de cenários de alocação (Fase 3 — recomendação, sem execução).
 * Cada ação traz o nome/ticker pesquisável na XP (o que digitar na busca).
 * A decisão e a ordem na XP são sempre humanas.
 */
import type { InvestorProfile, InvestmentPosition, RiskProfile } from './types.js';

export type AllocationLine = {
  /** Classe / bucket */
  classKey: string;
  classLabel: string;
  /** Código/ticker ou termo exato para buscar na XP */
  ticker: string;
  /** Nome do produto como costuma aparecer na XP */
  xpName: string;
  /** @deprecated use xpName — mantido para cache antigo */
  instrumentHint: string;
  instrumentType: string;
  pct: number;
  amountBrl: number;
  rationale: string;
  liquidity: string;
};

export type AllocationScenario = {
  id: string;
  name: string;
  tagline: string;
  riskLabel: string;
  investableCapital: number;
  emergencyHeld: number;
  lines: AllocationLine[];
  /** Sugestões objetivas: “Comprar BOVA11 — R$ X” */
  topActions: Array<{
    rank: number;
    /** Título curto com ticker/nome XP */
    title: string;
    amountBrl: number;
    pct: number;
    /** Como buscar na XP + liquidez */
    detail: string;
    ticker: string;
    xpName: string;
  }>;
  warnings: string[];
  disclaimer: string;
  generatedAt: string;
  source: 'rules_v2';
};

const DISCLAIMER =
  'Cenário sugerido pela IA com base no seu perfil. Use o nome/ticker na busca da XP. Não é ordem de compra, nem garantia de retorno. Você decide e executa. A IA não movimenta dinheiro.';

type Weights = Record<string, number>;

type XpProduct = {
  ticker: string;
  xpName: string;
  instrumentType: string;
  liquidity: string;
  rationale: string;
  /** Peso relativo dentro da classe (default 1) */
  weight?: number;
};

const CLASS_LABELS: Record<string, string> = {
  emergencia: 'Reserva de emergência',
  caixa: 'Caixa / liquidez',
  renda_fix_pos: 'Renda fixa pós-fixada',
  renda_fix_ipca: 'Renda fixa atrelada à inflação',
  fii: 'Fundos imobiliários',
  acoes_etf: 'Ações / ETF Brasil',
  internacional: 'Exterior (ETF/BDR)',
  credito_privado: 'Crédito privado',
  cripto: 'Cripto',
};

/** Catálogo objetivo: o que digitar na busca da XP. */
const XP_CATALOG: Record<string, XpProduct[]> = {
  emergencia: [
    {
      ticker: 'Tesouro Selic 2029',
      xpName: 'Tesouro Selic 2029',
      instrumentType: 'tesouro',
      liquidity: 'D+1',
      rationale: 'Reserva com liquidez diária no Tesouro Direto via XP.',
    },
  ],
  caixa: [
    {
      ticker: 'Tesouro Selic 2029',
      xpName: 'Tesouro Selic 2029',
      instrumentType: 'tesouro',
      liquidity: 'D+1',
      rationale: 'Caixa tático líquido no Tesouro Direto.',
    },
  ],
  renda_fix_pos: [
    {
      ticker: 'CDB liquidez diária',
      xpName: 'CDB Liquidez Diária (banco sólido na XP)',
      instrumentType: 'cdb',
      liquidity: 'D+0',
      rationale: 'Renda fixa pós CDI com resgate rápido; escolha banco AAA na lista XP.',
      weight: 2,
    },
    {
      ticker: 'LCI',
      xpName: 'LCI isenta de IR (prazo ~90–180 dias)',
      instrumentType: 'lci',
      liquidity: 'No vencimento',
      rationale: 'Complemento isento para PF; busque LCI na aba Renda Fixa da XP.',
      weight: 1,
    },
  ],
  renda_fix_ipca: [
    {
      ticker: 'Tesouro IPCA+ 2035',
      xpName: 'Tesouro IPCA+ 2035',
      instrumentType: 'tesouro',
      liquidity: 'Marcação a mercado',
      rationale: 'Proteção contra inflação no horizonte médio.',
    },
  ],
  fii: [
    {
      ticker: 'HGLG11',
      xpName: 'HGLG11 — CSHG Logística',
      instrumentType: 'fii',
      liquidity: 'D+2 Bolsa',
      rationale: 'FII de logística (tijolo), líquido na B3.',
      weight: 1,
    },
    {
      ticker: 'XPLG11',
      xpName: 'XPLG11 — XP Log',
      instrumentType: 'fii',
      liquidity: 'D+2 Bolsa',
      rationale: 'FII de galpões; busque XPLG11 na XP.',
      weight: 1,
    },
    {
      ticker: 'MXRF11',
      xpName: 'MXRF11 — Maxi Renda',
      instrumentType: 'fii',
      liquidity: 'D+2 Bolsa',
      rationale: 'FII de papel (CRI), renda mensal mais frequente.',
      weight: 1,
    },
  ],
  acoes_etf: [
    {
      ticker: 'BOVA11',
      xpName: 'BOVA11 — iShares Ibovespa',
      instrumentType: 'etf',
      liquidity: 'D+2 Bolsa',
      rationale: 'ETF do Ibovespa: uma ordem cobre o índice.',
      weight: 2,
    },
    {
      ticker: 'PETR4',
      xpName: 'PETR4 — Petrobras PN',
      instrumentType: 'acao',
      liquidity: 'D+2 Bolsa',
      rationale: 'Blue chip líquida; busque PETR4 na XP.',
      weight: 1,
    },
    {
      ticker: 'VALE3',
      xpName: 'VALE3 — Vale ON',
      instrumentType: 'acao',
      liquidity: 'D+2 Bolsa',
      rationale: 'Blue chip líquida; busque VALE3 na XP.',
      weight: 1,
    },
    {
      ticker: 'ITUB4',
      xpName: 'ITUB4 — Itaú Unibanco PN',
      instrumentType: 'acao',
      liquidity: 'D+2 Bolsa',
      rationale: 'Banco blue chip; busque ITUB4 na XP.',
      weight: 1,
    },
  ],
  internacional: [
    {
      ticker: 'IVVB11',
      xpName: 'IVVB11 — iShares S&P 500',
      instrumentType: 'etf',
      liquidity: 'D+2 Bolsa',
      rationale: 'ETF do S&P 500 negociado na B3 via XP.',
    },
  ],
  credito_privado: [
    {
      ticker: 'Debênture incentivada',
      xpName: 'Debênture incentivada (isenta) — rating alto',
      instrumentType: 'debenture',
      liquidity: 'Baixa / secundário',
      rationale: 'Na XP: Renda Fixa → Debêntures; escolha emissor com bom rating.',
    },
  ],
  cripto: [
    {
      ticker: 'HASH11',
      xpName: 'HASH11 — Hashdex Nasdaq Crypto Index',
      instrumentType: 'etf',
      liquidity: 'D+2 Bolsa',
      rationale: 'ETF de cripto na B3; busque HASH11 na XP (não envia ordem sozinho).',
    },
  ],
};

function baseWeights(risk: RiskProfile | null): Weights {
  switch (risk) {
    case 'conservador':
      return { caixa: 25, renda_fix_pos: 45, renda_fix_ipca: 20, fii: 5, acoes_etf: 5 };
    case 'moderado':
      return { caixa: 15, renda_fix_pos: 30, renda_fix_ipca: 20, fii: 15, acoes_etf: 15, internacional: 5 };
    case 'arrojado':
      return { caixa: 10, renda_fix_pos: 15, renda_fix_ipca: 15, fii: 15, acoes_etf: 30, internacional: 10, credito_privado: 5 };
    case 'agressivo':
      return { caixa: 5, renda_fix_pos: 10, renda_fix_ipca: 10, fii: 10, acoes_etf: 40, internacional: 15, credito_privado: 5, cripto: 5 };
    default:
      return { caixa: 20, renda_fix_pos: 35, renda_fix_ipca: 20, fii: 10, acoes_etf: 15 };
  }
}

function normalize(weights: Weights): Weights {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const out: Weights = {};
  for (const [k, v] of Object.entries(weights)) {
    if (v > 0) out[k] = (v / sum) * 100;
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Distribui o valor da classe entre produtos XP concretos (respeita teto por ativo). */
function expandClassToLines(
  classKey: string,
  classAmount: number,
  capital: number,
  maxPer: number,
  warnings: string[],
): AllocationLine[] {
  const products = XP_CATALOG[classKey];
  if (!products?.length || classAmount <= 0) return [];

  const classLabel = CLASS_LABELS[classKey] || classKey;
  const totalW = products.reduce((s, p) => s + (p.weight ?? 1), 0) || 1;

  // Quantos produtos usar: se valor alto ou acima do teto, usa a cesta; senão 1 produto principal
  let selected = products;
  if (classAmount <= maxPer && products.length > 1 && classAmount < 8_000) {
    selected = [products[0]];
  }

  const selW = selected.reduce((s, p) => s + (p.weight ?? 1), 0) || totalW;
  const raw = selected.map((p) => {
    const share = (p.weight ?? 1) / selW;
    return { p, amount: round2(classAmount * share) };
  });

  // Corrige drift de arredondamento
  const sum = raw.reduce((s, r) => s + r.amount, 0);
  const drift = round2(classAmount - sum);
  if (raw.length > 0 && Math.abs(drift) >= 0.01) {
    raw[0].amount = round2(raw[0].amount + drift);
  }

  const lines: AllocationLine[] = [];
  for (const { p, amount } of raw) {
    if (amount <= 0) continue;
    if (amount > maxPer) {
      warnings.push(
        `${p.ticker}: sugestão ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} acima do seu teto por ativo (${maxPer.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Divida a compra em mais de um dia ou reduz o lote.`,
      );
    }
    const pctOfTotal = capital > 0 ? (amount / capital) * 100 : 0;
    lines.push({
      classKey,
      classLabel,
      ticker: p.ticker,
      xpName: p.xpName,
      instrumentHint: p.xpName,
      instrumentType: p.instrumentType,
      pct: round2(pctOfTotal),
      amountBrl: amount,
      rationale: p.rationale,
      liquidity: p.liquidity,
    });
  }
  return lines;
}

/**
 * Gera o cenário sugerido a partir do perfil.
 * Reserva de emergência é separada; o restante é “capital investível”.
 */
export function buildAllocationScenario(
  profile: InvestorProfile | null | undefined,
  positions: InvestmentPosition[] = [],
): AllocationScenario | null {
  if (!profile?.risk_profile || profile.capital_available == null || profile.capital_available <= 0) {
    return null;
  }

  const capital = Number(profile.capital_available);
  const emergency = Math.max(0, Number(profile.emergency_reserve || 0));
  const emergencyHeld = Math.min(emergency, capital);
  const investable = Math.max(0, capital - emergencyHeld);
  const maxPer = profile.max_per_investment != null && profile.max_per_investment > 0
    ? Number(profile.max_per_investment)
    : investable;

  let weights = baseWeights(profile.risk_profile);

  if (profile.liquidity_need === 'D0' || profile.liquidity_need === 'D1') {
    weights.caixa = (weights.caixa || 0) + 10;
    weights.acoes_etf = Math.max(0, (weights.acoes_etf || 0) - 5);
    weights.internacional = Math.max(0, (weights.internacional || 0) - 3);
  }

  if (profile.exp_fii === false) {
    weights.caixa = (weights.caixa || 0) + (weights.fii || 0);
    delete weights.fii;
  }
  if (profile.exp_equity === false) {
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + (weights.acoes_etf || 0);
    delete weights.acoes_etf;
  }
  if (profile.exp_private_credit === false) {
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + (weights.credito_privado || 0);
    delete weights.credito_privado;
  }
  if (!profile.allows_crypto || profile.exp_crypto === false) {
    delete weights.cripto;
  }
  if (!profile.allows_international) {
    weights.acoes_etf = (weights.acoes_etf || 0) + (weights.internacional || 0);
    delete weights.internacional;
  }

  if (profile.needs_monthly_income) {
    weights.fii = (weights.fii || 0) + 8;
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + 5;
    weights.acoes_etf = Math.max(0, (weights.acoes_etf || 0) - 8);
  }

  if (profile.max_loss_pct != null && profile.max_loss_pct < 10) {
    const cut = Math.min(weights.acoes_etf || 0, 10);
    weights.acoes_etf = (weights.acoes_etf || 0) - cut;
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + cut;
  }

  weights = normalize(weights);

  const warnings: string[] = [];
  const lines: AllocationLine[] = [];

  if (emergencyHeld > 0) {
    lines.push(...expandClassToLines('emergencia', emergencyHeld, capital, maxPer, warnings));
  }

  for (const [key, pct] of Object.entries(weights)) {
    if (pct <= 0 || investable <= 0) continue;
    const classAmount = round2((investable * pct) / 100);
    lines.push(...expandClassToLines(key, classAmount, capital, maxPer, warnings));
  }

  // Ajuste fino: soma investível (sem emergência) = investable
  const investedSum = lines.filter((l) => l.classKey !== 'emergencia').reduce((s, l) => s + l.amountBrl, 0);
  const drift = round2(investable - investedSum);
  if (Math.abs(drift) >= 0.01) {
    const idx = lines.findIndex((l) => l.classKey !== 'emergencia');
    if (idx >= 0) {
      const next = round2(lines[idx].amountBrl + drift);
      lines[idx] = {
        ...lines[idx],
        amountBrl: next,
        pct: capital > 0 ? round2((next / capital) * 100) : lines[idx].pct,
      };
    }
  }

  if (positions.length === 0) {
    warnings.push('Carteira ainda sem posições cadastradas — use os nomes/tickers abaixo na busca da XP.');
  } else {
    warnings.push('Há posições cadastradas: use os tickers como alvo; rebalanceie só o que fizer sentido (custos/IR).');
  }

  const riskLabel =
    profile.risk_profile === 'conservador' ? 'Conservador'
      : profile.risk_profile === 'moderado' ? 'Moderado'
        : profile.risk_profile === 'arrojado' ? 'Arrojado'
          : profile.risk_profile === 'agressivo' ? 'Agressivo'
            : 'Indefinido';

  // Ordena: emergência primeiro, depois maiores valores
  const ordered = [
    ...lines.filter((l) => l.classKey === 'emergencia'),
    ...lines.filter((l) => l.classKey !== 'emergencia').sort((a, b) => b.amountBrl - a.amountBrl),
  ];

  const topActions = ordered.slice(0, 10).map((l, i) => ({
    rank: i + 1,
    title: l.classKey === 'emergencia'
      ? `Aplicar em ${l.ticker}`
      : `Comprar ${l.ticker}`,
    amountBrl: l.amountBrl,
    pct: l.pct,
    detail: `${l.xpName} · busque na XP: “${l.ticker}” · ${l.liquidity}`,
    ticker: l.ticker,
    xpName: l.xpName,
  }));

  return {
    id: `scenario_${profile.risk_profile}_v2`,
    name: `Cenário ${riskLabel}`,
    tagline: `Como equilibrar R$ ${capital.toLocaleString('pt-BR')} na XP — nomes para buscar na corretora`,
    riskLabel,
    investableCapital: round2(investable),
    emergencyHeld: round2(emergencyHeld),
    lines: ordered,
    topActions,
    warnings,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
    source: 'rules_v2',
  };
}
