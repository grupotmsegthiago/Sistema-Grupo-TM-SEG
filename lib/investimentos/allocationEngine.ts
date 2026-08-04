/**
 * Motor de cenários de alocação (Fase 3 — recomendação, sem execução).
 * A IA sugere quanto (%) e em R$ colocar em cada classe/instrumento.
 * A decisão e a ordem na XP são sempre humanas.
 */
import type { InvestorProfile, InvestmentPosition, RiskProfile } from './types.js';

export type AllocationLine = {
  /** Classe / bucket */
  classKey: string;
  classLabel: string;
  /** Exemplo de instrumento na XP (sugestão, não ordem) */
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
  /** Até 5 sugestões objetivas (o “aposte X em Y”) */
  topActions: Array<{
    rank: number;
    title: string;
    amountBrl: number;
    pct: number;
    detail: string;
  }>;
  warnings: string[];
  disclaimer: string;
  generatedAt: string;
  source: 'rules_v1';
};

const DISCLAIMER =
  'Cenário sugerido pela IA com base no seu perfil. Não é ordem de compra, nem garantia de retorno. Você decide e executa na XP. A IA não movimenta dinheiro.';

type Weights = Record<string, number>;

const CLASS_META: Record<
  string,
  { label: string; instrumentHint: string; instrumentType: string; liquidity: string; rationale: string }
> = {
  emergencia: {
    label: 'Reserva de emergência',
    instrumentHint: 'Tesouro Selic / CDB liquidez diária',
    instrumentType: 'tesouro',
    liquidity: 'D+0 / D+1',
    rationale: 'Colchão fora do risco de mercado — não conta como “aposta”.',
  },
  caixa: {
    label: 'Caixa / liquidez',
    instrumentHint: 'Tesouro Selic 2029+ ou fundo DI XP',
    instrumentType: 'tesouro',
    liquidity: 'D+0',
    rationale: 'Base líquida para oportunidades e meta de curto prazo.',
  },
  renda_fix_pos: {
    label: 'Renda fixa pós-fixada',
    instrumentHint: 'CDB / LCI / LCA de banco sólido (CDI+)',
    instrumentType: 'cdb',
    liquidity: 'D+30 a D+90 (conforme título)',
    rationale: 'Carrega o portfólio com cupom próximo ao CDI, risco de crédito controlado.',
  },
  renda_fix_ipca: {
    label: 'Renda fixa atrelada à inflação',
    instrumentHint: 'Tesouro IPCA+ (venc. alinhado ao horizonte)',
    instrumentType: 'tesouro',
    liquidity: 'Marcação a mercado',
    rationale: 'Protege poder de compra no horizonte médio/longo.',
  },
  fii: {
    label: 'Fundos imobiliários',
    instrumentHint: 'FIIs de tijolo/papel diversificados (cesta 3–5 tickers)',
    instrumentType: 'fii',
    liquidity: 'D+2 Bolsa',
    rationale: 'Renda periódica e diversificação; respeita teto por ativo.',
  },
  acoes_etf: {
    label: 'Ações / ETF Brasil',
    instrumentHint: 'ETF BOVA11 ou carteira 4–6 blue chips',
    instrumentType: 'etf',
    liquidity: 'D+2 Bolsa',
    rationale: 'Motor de retorno de longo prazo; volatilidade elevada.',
  },
  internacional: {
    label: 'Exterior (ETF/BDR)',
    instrumentHint: 'IVVB11 / BDR de índice global',
    instrumentType: 'bdr',
    liquidity: 'D+2 Bolsa',
    rationale: 'Diversificação cambial e geográfica.',
  },
  credito_privado: {
    label: 'Crédito privado',
    instrumentHint: 'Debênture incentivada / CRF (rating alto)',
    instrumentType: 'debenture',
    liquidity: 'Baixa / secundário',
    rationale: 'Prêmio sobre o CDI; só com experiência e teto rígido.',
  },
  cripto: {
    label: 'Cripto (teto baixo)',
    instrumentHint: 'BTC via ETF/exchange regulada (fatia mínima)',
    instrumentType: 'cripto',
    liquidity: 'Alta / volátil',
    rationale: 'Somente se autorizado no perfil; nunca acima do teto.',
  },
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

  // Liquidez alta → mais caixa
  if (profile.liquidity_need === 'D0' || profile.liquidity_need === 'D1') {
    weights.caixa = (weights.caixa || 0) + 10;
    weights.acoes_etf = Math.max(0, (weights.acoes_etf || 0) - 5);
    weights.internacional = Math.max(0, (weights.internacional || 0) - 3);
  }

  // Sem experiência → corta classes
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

  // Renda mensal → reforça FII + RF
  if (profile.needs_monthly_income) {
    weights.fii = (weights.fii || 0) + 8;
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + 5;
    weights.acoes_etf = Math.max(0, (weights.acoes_etf || 0) - 8);
  }

  // Perda máxima baixa → reduz RV
  if (profile.max_loss_pct != null && profile.max_loss_pct < 10) {
    const cut = Math.min(weights.acoes_etf || 0, 10);
    weights.acoes_etf = (weights.acoes_etf || 0) - cut;
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + cut;
  }

  weights = normalize(weights);

  const warnings: string[] = [];
  const lines: AllocationLine[] = [];

  if (emergencyHeld > 0) {
    const meta = CLASS_META.emergencia;
    const pctOfTotal = capital > 0 ? (emergencyHeld / capital) * 100 : 0;
    lines.push({
      classKey: 'emergencia',
      classLabel: meta.label,
      instrumentHint: meta.instrumentHint,
      instrumentType: meta.instrumentType,
      pct: round2(pctOfTotal),
      amountBrl: round2(emergencyHeld),
      rationale: meta.rationale,
      liquidity: meta.liquidity,
    });
  }

  for (const [key, pct] of Object.entries(weights)) {
    const meta = CLASS_META[key];
    if (!meta || pct <= 0 || investable <= 0) continue;
    let amount = round2((investable * pct) / 100);
    // Respeita teto por investimento: se a linha > maxPer, parte e avisa
    if (amount > maxPer) {
      warnings.push(
        `${meta.label}: sugestão ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} acima do seu teto por ativo (${maxPer.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Divida em 2+ instrumentos.`,
      );
    }
    const pctOfTotal = capital > 0 ? (amount / capital) * 100 : pct;
    lines.push({
      classKey: key,
      classLabel: meta.label,
      instrumentHint: meta.instrumentHint,
      instrumentType: meta.instrumentType,
      pct: round2(pctOfTotal),
      amountBrl: amount,
      rationale: meta.rationale,
      liquidity: meta.liquidity,
    });
  }

  // Ajuste fino de arredondamento nas linhas investíveis
  const investedSum = lines.filter((l) => l.classKey !== 'emergencia').reduce((s, l) => s + l.amountBrl, 0);
  const drift = round2(investable - investedSum);
  if (Math.abs(drift) >= 0.01 && lines.length > 1) {
    const idx = lines.findIndex((l) => l.classKey !== 'emergencia');
    if (idx >= 0) {
      lines[idx] = {
        ...lines[idx],
        amountBrl: round2(lines[idx].amountBrl + drift),
        pct: capital > 0 ? round2(((lines[idx].amountBrl + drift) / capital) * 100) : lines[idx].pct,
      };
    }
  }

  if (positions.length === 0) {
    warnings.push('Carteira ainda sem posições cadastradas — este cenário é para montar do zero na XP.');
  } else {
    warnings.push('Há posições cadastradas: use o cenário como alvo; rebalanceie só o que fizer sentido (custos/IR).');
  }

  const riskLabel =
    profile.risk_profile === 'conservador' ? 'Conservador'
      : profile.risk_profile === 'moderado' ? 'Moderado'
        : profile.risk_profile === 'arrojado' ? 'Arrojado'
          : profile.risk_profile === 'agressivo' ? 'Agressivo'
            : 'Indefinido';

  const investableLines = lines
    .filter((l) => l.classKey !== 'emergencia')
    .sort((a, b) => b.amountBrl - a.amountBrl);

  const topActions = investableLines.slice(0, 5).map((l, i) => ({
    rank: i + 1,
    title: `Alocar em ${l.classLabel}`,
    amountBrl: l.amountBrl,
    pct: l.pct,
    detail: `${l.instrumentHint} · ${l.liquidity}`,
  }));

  return {
    id: `scenario_${profile.risk_profile}_v1`,
    name: `Cenário ${riskLabel}`,
    tagline: `Como equilibrar R$ ${capital.toLocaleString('pt-BR')} na XP (sugestão da IA)`,
    riskLabel,
    investableCapital: round2(investable),
    emergencyHeld: round2(emergencyHeld),
    lines,
    topActions,
    warnings,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
    source: 'rules_v1',
  };
}
