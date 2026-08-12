/**
 * Motor de cenários — consultor (recomendação, sem execução).
 * Classifica o ativo (governo / FII tijolo|papel / ação / ETF), indica instituição,
 * passo a passo de compra e tese. A ordem na corretora é sempre humana.
 */
import type { InvestorProfile, InvestmentPosition, RiskProfile } from './types.js';
import { formatPct, type MacroRates } from './marketRates.js';
import {
  buildAssetPerformanceOutlook,
  buildPortfolioPerformanceOutlook,
  type AssetPerformanceOutlook,
  type PortfolioPerformanceOutlook,
} from './performanceProjection.js';

/** Instituições onde o usuário pode aplicar (escolha fechada do produto). */
export type AllowedInstitution = 'Nubank' | 'XP' | 'Itaú' | 'BTG';

export const ALLOWED_INSTITUTIONS: AllowedInstitution[] = ['Nubank', 'XP', 'Itaú', 'BTG'];

export type SignalKind = 'COMPRAR' | 'MANTER' | 'AVERBAR' | 'REDUZIR' | 'RESERVA';

export type AllocationLine = {
  classKey: string;
  classLabel: string;
  ticker: string;
  xpName: string;
  instrumentHint: string;
  instrumentType: string;
  categoryKind: string;
  categoryLabel: string;
  /** Ex.: Governo Federal, FII tijolo, Ação blue chip */
  assetNature: string;
  issuer: string;
  subtype: string;
  institution: AllowedInstitution;
  searchHint: string;
  searchAliases: string[];
  howToBuy: string[];
  thesis: string;
  signal: SignalKind;
  signalNote: string;
  marketContext: string;
  pct: number;
  amountBrl: number;
  rationale: string;
  liquidity: string;
  /** Projeção 30d→1a (cenário-objetivo; RF por taxa, RV bear/base/bull). */
  performanceOutlook: AssetPerformanceOutlook;
};

export type AllocationScenario = {
  id: string;
  name: string;
  tagline: string;
  riskLabel: string;
  investableCapital: number;
  emergencyHeld: number;
  macro: {
    selicPct: number | null;
    cdiPct: number | null;
    ipcaPct: number | null;
    fetchedAt: string;
    source: string;
  };
  consultantBrief: string;
  lines: AllocationLine[];
  topActions: Array<{
    rank: number;
    title: string;
    amountBrl: number;
    pct: number;
    detail: string;
    ticker: string;
    xpName: string;
    categoryKind: string;
    categoryLabel: string;
    assetNature: string;
    issuer: string;
    subtype: string;
    institution: AllowedInstitution;
    searchHint: string;
    searchAliases: string[];
    howToBuy: string[];
    thesis: string;
    signal: SignalKind;
    signalNote: string;
    marketContext: string;
    liquidity: string;
    performanceOutlook: AssetPerformanceOutlook;
  }>;
  /** Projeção do valor total da carteira (ex.: R$ 100 mil) nos mesmos horizontes. */
  portfolioOutlook: PortfolioPerformanceOutlook | null;
  warnings: string[];
  disclaimer: string;
  generatedAt: string;
  source: 'rules_v6';
};

const DISCLAIMER =
  'Parecer de alocação do consultor TM SEG com base no seu perfil e nas taxas públicas (Selic/CDI/IPCA). Não é ordem de compra/venda. A IA não executa, não transfere e não garante retorno. Você confirma e aplica na corretora.';

const INSTITUTION_PREFERENCE: Record<string, AllowedInstitution[]> = {
  tesouro: ['Nubank', 'XP', 'Itaú', 'BTG'],
  cdb: ['Nubank', 'Itaú', 'XP', 'BTG'],
  lci: ['Itaú', 'XP', 'BTG'],
  fii: ['XP', 'BTG', 'Itaú'],
  acao: ['XP', 'BTG', 'Itaú', 'Nubank'],
  etf: ['XP', 'BTG', 'Itaú'],
  debenture: ['XP', 'BTG', 'Itaú'],
};

export function categorizeInstrument(
  instrumentType: string,
  ticker = '',
  subtype = '',
): { kind: string; label: string } {
  switch (instrumentType) {
    case 'tesouro':
      return { kind: 'Tesouro', label: 'Título público (Governo Federal)' };
    case 'cdb':
    case 'lci':
      return { kind: 'RF', label: 'Renda Fixa bancária' };
    case 'debenture':
      return { kind: 'RF', label: 'Crédito Privado (RF)' };
    case 'fii':
      if (/papel/i.test(subtype)) return { kind: 'FII', label: 'Fundo Imobiliário — papel (CRI)' };
      if (/tijolo/i.test(subtype)) return { kind: 'FII', label: 'Fundo Imobiliário — tijolo' };
      return { kind: 'FII', label: 'Fundo Imobiliário (FII)' };
    case 'acao':
      return { kind: 'Ação', label: 'Renda Variável — ação (B3)' };
    case 'etf':
      if (/HASH|CRIPTO|CRYPTO/i.test(ticker)) return { kind: 'ETF', label: 'ETF de Cripto (B3)' };
      if (/IVVB|S&P|exterior|eua/i.test(`${ticker} ${subtype}`)) {
        return { kind: 'ETF', label: 'ETF exterior (B3)' };
      }
      return { kind: 'ETF', label: 'ETF — fundo de índice (B3)' };
    default:
      return { kind: 'Ativo', label: 'Ativo' };
  }
}

function parseRestrictedInstitutions(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of String(raw || '').split(/[,;/|]+/)) {
    const t = part.trim().toLowerCase();
    if (!t) continue;
    set.add(t);
    if (t.includes('itau') || t.includes('itaú')) set.add('itaú');
  }
  return set;
}

function normalizeInstitutionName(raw: string | null | undefined): AllowedInstitution | null {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'xp' || t.includes('xp investimentos')) return 'XP';
  if (t.includes('nubank') || t === 'nu') return 'Nubank';
  if (t.includes('itaú') || t.includes('itau')) return 'Itaú';
  if (t.includes('btg') || t.includes('pactual')) return 'BTG';
  return null;
}

export function pickInstitution(
  instrumentType: string,
  profile?: Pick<InvestorProfile, 'broker_default' | 'restricted_institutions'> | null,
): AllowedInstitution {
  const restricted = parseRestrictedInstitutions(profile?.restricted_institutions);
  const preferredDefault = normalizeInstitutionName(profile?.broker_default);
  const base = INSTITUTION_PREFERENCE[instrumentType] || [...ALLOWED_INSTITUTIONS];
  const ordered: AllowedInstitution[] = [];
  if (preferredDefault) ordered.push(preferredDefault);
  for (const inst of base) if (!ordered.includes(inst)) ordered.push(inst);
  for (const inst of ALLOWED_INSTITUTIONS) if (!ordered.includes(inst)) ordered.push(inst);
  const available = ordered.filter((inst) => !restricted.has(inst.toLowerCase()));
  return available[0] || 'XP';
}

export function buildSearchHint(
  institution: AllowedInstitution,
  ticker: string,
  instrumentType: string,
): string {
  const q = ticker;
  switch (institution) {
    case 'Nubank':
      if (instrumentType === 'tesouro') return `Nubank → Investimentos → Tesouro Direto → busque “Tesouro Selic” (não o ano)`;
      if (instrumentType === 'cdb') return `Nubank → Caixinhas / RDB liquidez diária`;
      return `Nubank → Investimentos / NuInvest → “${q}”`;
    case 'Itaú':
      if (instrumentType === 'tesouro' || instrumentType === 'cdb' || instrumentType === 'lci') {
        return `Itaú → Investimentos → Renda Fixa / Tesouro Direto → “${q}”`;
      }
      return `Itaú Corretora → Home Broker → “${q}”`;
    case 'BTG':
      return `BTG → Investimentos / Trading → busque “${q}”`;
    case 'XP':
    default:
      if (instrumentType === 'tesouro') {
        return `XP → Investir → Tesouro Direto → busque “Tesouro Selic” ou “LFT”`;
      }
      return `XP → busca → “${q}”`;
  }
}

type Weights = Record<string, number>;

type ExpertProduct = {
  ticker: string;
  xpName: string;
  instrumentType: string;
  liquidity: string;
  rationale: string;
  weight?: number;
  issuer: string;
  subtype: string;
  assetNature: string;
  searchAliases: string[];
  thesis: string;
  signal: SignalKind;
  howToBuyByInstitution: Partial<Record<AllowedInstitution, string[]>>;
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

const TESOURO_SELIC_HOW: Partial<Record<AllowedInstitution, string[]>> = {
  XP: [
    'Abra a XP → menu Investir → Tesouro Direto',
    'Na busca digite “Tesouro Selic” ou “LFT” (não force o ano 2029 — a prateleira muda)',
    'Prefira o vencimento Selic mais longo disponível (ex.: 2031) se quiser spread um pouco maior',
    'Confira taxa (Selic + ágio/deságio), aplique o valor e confirme — a IA não envia a ordem',
  ],
  Nubank: [
    'App Nubank → Investimentos → Tesouro Direto',
    'Busque “Tesouro Selic” (às vezes aparece como LFT)',
    'Escolha o título Selic listado no dia e aplique o valor da reserva',
  ],
  Itaú: [
    'App Itaú → Investimentos → Tesouro Direto',
    'Busque “Tesouro Selic” / LFT e selecione o vencimento disponível',
    'Aplique o valor e confirme no app',
  ],
  BTG: [
    'BTG → Investimentos → Renda Fixa / Tesouro Direto',
    'Busque “Tesouro Selic” ou “LFT”',
    'Selecione o vencimento líquido do dia e confirme a aplicação',
  ],
};

/** Catálogo do consultor — nomes pesquisáveis e natureza do ativo. */
const XP_CATALOG: Record<string, ExpertProduct[]> = {
  emergencia: [
    {
      ticker: 'Tesouro Selic',
      xpName: 'Tesouro Selic (LFT) — título público pós-Selic',
      instrumentType: 'tesouro',
      liquidity: 'D+1',
      rationale: 'Reserva de emergência no Governo Federal, liquidez diária.',
      issuer: 'Tesouro Nacional (Governo Federal)',
      subtype: 'LFT — pós-fixado à Selic',
      assetNature: 'Título público federal · não é ação nem fundo',
      searchAliases: ['Tesouro Selic', 'LFT', 'Tesouro Direto', 'Selic'],
      thesis: 'Colchão de liquidez: prioridade é segurança e resgate, não maximizar retorno.',
      signal: 'RESERVA',
      howToBuyByInstitution: TESOURO_SELIC_HOW,
    },
  ],
  caixa: [
    {
      ticker: 'Tesouro Selic',
      xpName: 'Tesouro Selic (LFT) — caixa tático',
      instrumentType: 'tesouro',
      liquidity: 'D+1',
      rationale: 'Caixa tático no Tesouro Direto.',
      issuer: 'Tesouro Nacional (Governo Federal)',
      subtype: 'LFT — pós-fixado à Selic',
      assetNature: 'Título público federal · não é ação nem fundo',
      searchAliases: ['Tesouro Selic', 'LFT', 'Tesouro Direto'],
      thesis: 'Parcela líquida do capital investível enquanto espera oportunidades.',
      signal: 'MANTER',
      howToBuyByInstitution: TESOURO_SELIC_HOW,
    },
  ],
  renda_fix_pos: [
    {
      ticker: 'CDB liquidez diária',
      xpName: 'CDB / RDB liquidez diária (banco sólido)',
      instrumentType: 'cdb',
      liquidity: 'D+0',
      rationale: 'Renda fixa pós-CDI com resgate rápido; escolha emissor AAA/FGC.',
      weight: 2,
      issuer: 'Banco emissor (coberta pelo FGC até o limite)',
      subtype: 'CDB/RDB pós-CDI',
      assetNature: 'Renda fixa bancária',
      searchAliases: ['CDB liquidez diária', 'CDB', 'RDB', 'Caixinhas'],
      thesis: 'Complemento líquido ao Tesouro; compare % do CDI e liquidez.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → Renda Fixa → CDB', 'Filtre liquidez diária + banco sólido', 'Aplique o valor sugerido'],
        Nubank: ['Nubank → Caixinhas / RDB', 'Escolha liquidez imediata', 'Aplique o valor sugerido'],
        Itaú: ['Itaú → Investimentos → CDB', 'Liquidez diária / curto prazo', 'Confirme a aplicação'],
        BTG: ['BTG → Renda Fixa → CDB', 'Liquidez diária', 'Confirme a aplicação'],
      },
    },
    {
      ticker: 'LCI',
      xpName: 'LCI isenta de IR (prazo ~90–180 dias)',
      instrumentType: 'lci',
      liquidity: 'No vencimento',
      rationale: 'Complemento isento para PF.',
      weight: 1,
      issuer: 'Banco emissor (FGC)',
      subtype: 'LCI — isenta de IR para PF',
      assetNature: 'Renda fixa bancária isenta',
      searchAliases: ['LCI', 'LCI liquidez', 'Letras de Crédito Imobiliário'],
      thesis: 'Use só o excedente que pode ficar até o vencimento.',
      signal: 'AVERBAR',
      howToBuyByInstitution: {
        XP: ['XP → Renda Fixa → LCI', 'Compare % CDI e prazo', 'Aplique só o que não precisa antes do vencimento'],
        Itaú: ['Itaú → Investimentos → LCI', 'Confira prazo e taxa', 'Confirme'],
        BTG: ['BTG → Renda Fixa → LCI', 'Confira prazo e taxa', 'Confirme'],
      },
    },
  ],
  renda_fix_ipca: [
    {
      ticker: 'Tesouro IPCA+',
      xpName: 'Tesouro IPCA+ (NTN-B Principal) — horizonte médio',
      instrumentType: 'tesouro',
      liquidity: 'Marcação a mercado',
      rationale: 'Proteção real contra inflação no Governo Federal.',
      issuer: 'Tesouro Nacional (Governo Federal)',
      subtype: 'NTN-B Principal — IPCA + taxa',
      assetNature: 'Título público federal indexado à inflação',
      searchAliases: ['Tesouro IPCA+', 'NTN-B', 'Tesouro IPCA', '2035', '2032'],
      thesis: 'Trava juro real; preço oscila se a taxa de mercado subir — horizonte médio/longo.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: [
          'XP → Tesouro Direto → busque “Tesouro IPCA+” (não só o ano)',
          'Escolha vencimento médio (ex.: 2032–2040) alinhado ao seu horizonte',
          'Confira taxa IPCA+ do dia e aplique',
        ],
        Nubank: ['Nubank → Tesouro Direto → “IPCA+”', 'Escolha vencimento e confirme'],
        Itaú: ['Itaú → Tesouro Direto → “IPCA+”', 'Escolha vencimento e confirme'],
        BTG: ['BTG → Tesouro Direto → “IPCA+”', 'Escolha vencimento e confirme'],
      },
    },
  ],
  fii: [
    {
      ticker: 'HGLG11',
      xpName: 'HGLG11 — CSHG Logística',
      instrumentType: 'fii',
      liquidity: 'D+2 Bolsa',
      rationale: 'FII de logística (tijolo).',
      weight: 1,
      issuer: 'CSHG (gestora) · cotas na B3',
      subtype: 'FII tijolo — galpões/logística',
      assetNature: 'Fundo imobiliário de tijolo (imóveis)',
      searchAliases: ['HGLG11', 'CSHG Logística'],
      thesis: 'Exposição a galpões; renda via aluguel. Não é papel de CRI.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → busca “HGLG11”', 'Mercado à vista (Bolsa)', 'Ordem limitada perto do último preço'],
        BTG: ['BTG → “HGLG11”', 'Home broker → compra'],
        Itaú: ['Itaú Corretora → “HGLG11”', 'Compra à vista'],
      },
    },
    {
      ticker: 'XPLG11',
      xpName: 'XPLG11 — XP Log',
      instrumentType: 'fii',
      liquidity: 'D+2 Bolsa',
      rationale: 'FII de galpões (tijolo).',
      weight: 1,
      issuer: 'XP Asset · cotas na B3',
      subtype: 'FII tijolo — logística',
      assetNature: 'Fundo imobiliário de tijolo (imóveis)',
      searchAliases: ['XPLG11', 'XP Log'],
      thesis: 'Diversifica tijolo logístico junto com HGLG11.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → “XPLG11”', 'Compra à vista'],
        BTG: ['BTG → “XPLG11”', 'Compra à vista'],
        Itaú: ['Itaú Corretora → “XPLG11”', 'Compra à vista'],
      },
    },
    {
      ticker: 'MXRF11',
      xpName: 'MXRF11 — Maxi Renda',
      instrumentType: 'fii',
      liquidity: 'D+2 Bolsa',
      rationale: 'FII de papel (CRI), distribuição frequente.',
      weight: 1,
      issuer: 'Maxi Renda · cotas na B3',
      subtype: 'FII papel — CRI / recebíveis',
      assetNature: 'Fundo imobiliário de papel (crédito imobiliário)',
      searchAliases: ['MXRF11', 'Maxi Renda'],
      thesis: 'Renda via CRI — perfil diferente do tijolo; use como complemento, não como único FII.',
      signal: 'AVERBAR',
      howToBuyByInstitution: {
        XP: ['XP → “MXRF11”', 'Compra à vista'],
        BTG: ['BTG → “MXRF11”', 'Compra à vista'],
        Itaú: ['Itaú Corretora → “MXRF11”', 'Compra à vista'],
      },
    },
  ],
  acoes_etf: [
    {
      ticker: 'BOVA11',
      xpName: 'BOVA11 — iShares Ibovespa',
      instrumentType: 'etf',
      liquidity: 'D+2 Bolsa',
      rationale: 'ETF do Ibovespa.',
      weight: 2,
      issuer: 'BlackRock iShares · cotas na B3',
      subtype: 'ETF de ações Brasil (índice)',
      assetNature: 'ETF — fundo de índice (não é ação isolada)',
      searchAliases: ['BOVA11', 'Ibovespa', 'iShares'],
      thesis: 'Núcleo de RV Brasil: uma ordem cobre o índice. Prefira acumular em quedas do índice.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → “BOVA11”', 'Ordem limitada (evite mercado a qualquer preço em horário turbulento)'],
        BTG: ['BTG → “BOVA11”', 'Compra limitada'],
        Itaú: ['Itaú Corretora → “BOVA11”', 'Compra limitada'],
      },
    },
    {
      ticker: 'PETR4',
      xpName: 'PETR4 — Petrobras PN',
      instrumentType: 'acao',
      liquidity: 'D+2 Bolsa',
      rationale: 'Blue chip líquida.',
      weight: 1,
      issuer: 'Petrobras · ação PN na B3',
      subtype: 'Ação ordinaria preferencial (PN)',
      assetNature: 'Renda variável — ação individual',
      searchAliases: ['PETR4', 'Petrobras'],
      thesis: 'Satélite de commodities/energia; tamanho da posição deve respeitar seu teto por ativo.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → “PETR4”', 'Ordem limitada', 'Não concentre acima do teto do perfil'],
        BTG: ['BTG → “PETR4”', 'Ordem limitada'],
        Itaú: ['Itaú → “PETR4”', 'Ordem limitada'],
        Nubank: ['NuInvest → “PETR4”', 'Ordem limitada'],
      },
    },
    {
      ticker: 'VALE3',
      xpName: 'VALE3 — Vale ON',
      instrumentType: 'acao',
      liquidity: 'D+2 Bolsa',
      rationale: 'Blue chip mineração.',
      weight: 1,
      issuer: 'Vale · ação ON na B3',
      subtype: 'Ação ordinária (ON)',
      assetNature: 'Renda variável — ação individual',
      searchAliases: ['VALE3', 'Vale'],
      thesis: 'Exposição a minério; complementar a BOVA11, não substituir o índice.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → “VALE3”', 'Ordem limitada'],
        BTG: ['BTG → “VALE3”', 'Ordem limitada'],
        Itaú: ['Itaú → “VALE3”', 'Ordem limitada'],
        Nubank: ['NuInvest → “VALE3”', 'Ordem limitada'],
      },
    },
    {
      ticker: 'ITUB4',
      xpName: 'ITUB4 — Itaú Unibanco PN',
      instrumentType: 'acao',
      liquidity: 'D+2 Bolsa',
      rationale: 'Banco blue chip.',
      weight: 1,
      issuer: 'Itaú Unibanco · ação PN na B3',
      subtype: 'Ação preferencial (PN)',
      assetNature: 'Renda variável — ação individual',
      searchAliases: ['ITUB4', 'Itaú'],
      thesis: 'Setor financeiro líquido; use como satélite do núcleo BOVA11.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → “ITUB4”', 'Ordem limitada'],
        BTG: ['BTG → “ITUB4”', 'Ordem limitada'],
        Itaú: ['Itaú → “ITUB4”', 'Ordem limitada'],
        Nubank: ['NuInvest → “ITUB4”', 'Ordem limitada'],
      },
    },
  ],
  internacional: [
    {
      ticker: 'IVVB11',
      xpName: 'IVVB11 — iShares S&P 500',
      instrumentType: 'etf',
      liquidity: 'D+2 Bolsa',
      rationale: 'ETF do S&P 500 na B3.',
      issuer: 'BlackRock iShares · cotas na B3',
      subtype: 'ETF exterior (S&P 500)',
      assetNature: 'ETF de ações EUA negociado no Brasil',
      searchAliases: ['IVVB11', 'S&P 500', 'iShares'],
      thesis: 'Diversificação cambial/geográfica sem conta lá fora.',
      signal: 'COMPRAR',
      howToBuyByInstitution: {
        XP: ['XP → “IVVB11”', 'Compra à vista na B3'],
        BTG: ['BTG → “IVVB11”', 'Compra à vista'],
        Itaú: ['Itaú → “IVVB11”', 'Compra à vista'],
      },
    },
  ],
  credito_privado: [
    {
      ticker: 'Debênture incentivada',
      xpName: 'Debênture incentivada (isenta) — rating alto',
      instrumentType: 'debenture',
      liquidity: 'Baixa / secundário',
      rationale: 'Crédito privado isento; escolha rating elevado.',
      issuer: 'Empresa emissora (sem FGC)',
      subtype: 'Debênture incentivada (infra)',
      assetNature: 'Crédito privado — não é título do governo',
      searchAliases: ['Debênture incentivada', 'Debênture', 'Incentivada'],
      thesis: 'Só após reserva e RF soberana/bancária; leia rating e duration.',
      signal: 'AVERBAR',
      howToBuyByInstitution: {
        XP: ['XP → Renda Fixa → Debêntures', 'Filtre incentivada + rating alto', 'Leia o prospecto antes'],
        BTG: ['BTG → Debêntures', 'Rating alto / incentivada'],
        Itaú: ['Itaú → Debêntures', 'Rating alto / incentivada'],
      },
    },
  ],
  cripto: [
    {
      ticker: 'HASH11',
      xpName: 'HASH11 — Hashdex Nasdaq Crypto Index',
      instrumentType: 'etf',
      liquidity: 'D+2 Bolsa',
      rationale: 'ETF de cripto na B3.',
      issuer: 'Hashdex · cotas na B3',
      subtype: 'ETF de criptoativos',
      assetNature: 'ETF de cripto — alta volatilidade',
      searchAliases: ['HASH11', 'Hashdex', 'Cripto'],
      thesis: 'Satélite especulativo; tamanho pequeno. A IA não compra sozinha.',
      signal: 'AVERBAR',
      howToBuyByInstitution: {
        XP: ['XP → “HASH11”', 'Só com % pequena do capital'],
        BTG: ['BTG → “HASH11”', 'Posição tática'],
      },
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

function marketContextFor(p: ExpertProduct, rates?: MacroRates | null): string {
  const selic = formatPct(rates?.selicPct ?? null);
  const cdi = formatPct(rates?.cdiPct ?? null);
  const ipca = formatPct(rates?.ipcaPct ?? null);
  if (p.instrumentType === 'tesouro' && /Selic|LFT/i.test(p.subtype + p.ticker)) {
    return `Selic meta ${selic} a.a. · CDI ${cdi} · o título acompanha a Selic (líquido D+1)`;
  }
  if (p.instrumentType === 'tesouro' && /IPCA|NTN-B/i.test(p.subtype + p.ticker)) {
    return `IPCA 12m ${ipca} · Selic ${selic} — juro real = taxa do título − inflação esperada`;
  }
  if (p.instrumentType === 'cdb' || p.instrumentType === 'lci') {
    return `CDI ${cdi} a.a. — compare o % do CDI ofertado pelo banco`;
  }
  if (p.instrumentType === 'fii' || p.instrumentType === 'acao' || p.instrumentType === 'etf') {
    return `Contexto: Selic ${selic} / CDI ${cdi}. Em RV use ordem limitada; sem preço-alvo automático nesta versão.`;
  }
  return `Selic ${selic} · CDI ${cdi} · IPCA ${ipca}`;
}

function signalNoteFor(p: ExpertProduct, amountBrl: number): string {
  const money = amountBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  switch (p.signal) {
    case 'RESERVA':
      return `Sinal: RESERVA — aplicar ${money} e não mexer salvo emergência real.`;
    case 'COMPRAR':
      return `Sinal: COMPRAR — montar posição de ${money} (ordem limitada em Bolsa; RF a mercado na corretora).`;
    case 'AVERBAR':
      return `Sinal: AVERBAR — entrar com ${money} de forma parcelada se o ativo oscilar.`;
    case 'REDUZIR':
      return `Sinal: REDUZIR — avaliar venda parcial se estiver acima do alvo da carteira.`;
    case 'MANTER':
    default:
      return `Sinal: MANTER — manter liquidez; reaplique só o excedente.`;
  }
}

function expandClassToLines(
  classKey: string,
  classAmount: number,
  capital: number,
  maxPer: number,
  warnings: string[],
  profile: InvestorProfile,
  rates?: MacroRates | null,
): AllocationLine[] {
  const products = XP_CATALOG[classKey];
  if (!products?.length || classAmount <= 0) return [];

  const classLabel = CLASS_LABELS[classKey] || classKey;
  const totalW = products.reduce((s, p) => s + (p.weight ?? 1), 0) || 1;

  let selected = products;
  if (classAmount <= maxPer && products.length > 1 && classAmount < 8_000) {
    selected = [products[0]];
  }

  const selW = selected.reduce((s, p) => s + (p.weight ?? 1), 0) || totalW;
  const raw = selected.map((p) => {
    const share = (p.weight ?? 1) / selW;
    return { p, amount: round2(classAmount * share) };
  });

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
        `${p.ticker}: sugestão ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} acima do teto por ativo (${maxPer.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Parcele.`,
      );
    }
    const institution = pickInstitution(p.instrumentType, profile);
    const cat = categorizeInstrument(p.instrumentType, p.ticker, p.subtype);
    const howToBuy = p.howToBuyByInstitution[institution]
      || p.howToBuyByInstitution.XP
      || [`Busque “${p.ticker}” em ${institution} e aplique o valor.`];
    const searchHint = buildSearchHint(institution, p.searchAliases[0] || p.ticker, p.instrumentType);
    const pctOfTotal = capital > 0 ? (amount / capital) * 100 : 0;
    lines.push({
      classKey,
      classLabel,
      ticker: p.ticker,
      xpName: p.xpName,
      instrumentHint: p.xpName,
      instrumentType: p.instrumentType,
      categoryKind: cat.kind,
      categoryLabel: cat.label,
      assetNature: p.assetNature,
      issuer: p.issuer,
      subtype: p.subtype,
      institution,
      searchHint,
      searchAliases: p.searchAliases,
      howToBuy,
      thesis: p.thesis,
      signal: p.signal,
      signalNote: signalNoteFor(p, amount),
      marketContext: marketContextFor(p, rates),
      pct: round2(pctOfTotal),
      amountBrl: amount,
      rationale: p.rationale,
      liquidity: p.liquidity,
      performanceOutlook: buildAssetPerformanceOutlook(
        amount,
        { instrumentType: p.instrumentType, ticker: p.ticker, subtype: p.subtype },
        rates,
      ),
    });
  }
  return lines;
}

/**
 * Gera o cenário sugerido a partir do perfil (+ taxas macro opcionais).
 */
export function buildAllocationScenario(
  profile: InvestorProfile | null | undefined,
  positions: InvestmentPosition[] = [],
  rates?: MacroRates | null,
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
    lines.push(...expandClassToLines('emergencia', emergencyHeld, capital, maxPer, warnings, profile, rates));
  }

  for (const [key, pct] of Object.entries(weights)) {
    if (pct <= 0 || investable <= 0) continue;
    const classAmount = round2((investable * pct) / 100);
    lines.push(...expandClassToLines(key, classAmount, capital, maxPer, warnings, profile, rates));
  }

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
        signalNote: signalNoteFor(
          {
            ...XP_CATALOG[lines[idx].classKey]?.[0],
            ticker: lines[idx].ticker,
            signal: lines[idx].signal,
          } as ExpertProduct,
          next,
        ),
        performanceOutlook: buildAssetPerformanceOutlook(
          next,
          {
            instrumentType: lines[idx].instrumentType,
            ticker: lines[idx].ticker,
            subtype: lines[idx].subtype,
          },
          rates,
        ),
      };
    }
  }

  if (positions.length === 0) {
    warnings.push('Carteira sem posições registradas — execute na corretora e depois lance os saldos reais na aba Carteira.');
  } else {
    warnings.push('Há posições cadastradas: use os sinais para rebalancear; a IA não envia ordem.');
  }
  warnings.push('Ordens automáticas de compra/venda estão desligadas por segurança — o consultor orienta; você confirma.');

  const riskLabel =
    profile.risk_profile === 'conservador' ? 'Conservador'
      : profile.risk_profile === 'moderado' ? 'Moderado'
        : profile.risk_profile === 'arrojado' ? 'Arrojado'
          : profile.risk_profile === 'agressivo' ? 'Agressivo'
            : 'Indefinido';

  const ordered = [
    ...lines.filter((l) => l.classKey === 'emergencia'),
    ...lines.filter((l) => l.classKey !== 'emergencia').sort((a, b) => b.amountBrl - a.amountBrl),
  ];

  const topActions = ordered.slice(0, 10).map((l, i) => ({
    rank: i + 1,
    title: l.signal === 'RESERVA'
      ? `Reservar em ${l.ticker}`
      : l.signal === 'REDUZIR'
        ? `Reduzir ${l.ticker}`
        : `Comprar ${l.ticker}`,
    amountBrl: l.amountBrl,
    pct: l.pct,
    detail: `${l.categoryLabel} · ${l.institution} · ${l.searchHint}`,
    ticker: l.ticker,
    xpName: l.xpName,
    categoryKind: l.categoryKind,
    categoryLabel: l.categoryLabel,
    assetNature: l.assetNature,
    issuer: l.issuer,
    subtype: l.subtype,
    institution: l.institution,
    searchHint: l.searchHint,
    searchAliases: l.searchAliases,
    howToBuy: l.howToBuy,
    thesis: l.thesis,
    signal: l.signal,
    signalNote: l.signalNote,
    marketContext: l.marketContext,
    liquidity: l.liquidity,
    performanceOutlook: l.performanceOutlook,
  }));

  const selic = formatPct(rates?.selicPct ?? null);
  const cdi = formatPct(rates?.cdiPct ?? null);
  const ipca = formatPct(rates?.ipcaPct ?? null);

  const portfolioOutlook = buildPortfolioPerformanceOutlook(ordered);

  const consultantBrief =
    `Leitura de consultor (${riskLabel}): Selic ${selic}, CDI ${cdi}, IPCA 12m ${ipca}. `
    + `Primeiro trave a reserva no Tesouro Selic (Governo). Depois monte o núcleo (ETF/ações ou RF conforme o perfil) `
    + `e satélites (FII tijolo/papel, exterior). Em Bolsa use ordem limitada. `
    + `Há projeção do total da carteira e de cada linha (30d→1a, cenário-objetivo). A IA não executa ordens.`;

  return {
    id: `scenario_${profile.risk_profile}_v6`,
    name: `Parecer ${riskLabel}`,
    tagline: `Consultor TM SEG · R$ ${capital.toLocaleString('pt-BR')} · Selic ${selic} · retorno total 30d→1a · onde aplicar`,
    riskLabel,
    investableCapital: round2(investable),
    emergencyHeld: round2(emergencyHeld),
    macro: {
      selicPct: rates?.selicPct ?? null,
      cdiPct: rates?.cdiPct ?? null,
      ipcaPct: rates?.ipcaPct ?? null,
      fetchedAt: rates?.fetchedAt || new Date().toISOString(),
      source: rates?.source || 'fallback',
    },
    consultantBrief,
    lines: ordered,
    topActions,
    portfolioOutlook,
    warnings,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
    source: 'rules_v6',
  };
}

/** Cache antigo (v2–v5) sem projeção total da carteira → precisa regenerar. */
export function isScenarioStale(scenario: AllocationScenario | null | undefined): boolean {
  if (!scenario) return true;
  if (scenario.source !== 'rules_v6') return true;
  const a = scenario.topActions?.[0];
  if (!a?.categoryKind || a.categoryKind === 'Ativo') return true;
  if (!a.howToBuy?.length || !a.assetNature) return true;
  if (!a.performanceOutlook?.horizons?.length) return true;
  if (!scenario.portfolioOutlook?.horizons?.length) return true;
  return false;
}
