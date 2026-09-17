/**
 * Antecipação de pagamento (contas a receber).
 * Uma operação pode vincular várias NFs/títulos; a baixa é no conjunto
 * e a ressalva (se houver) vira um único título novo com +15 dias.
 */

export const ANTICIPATION_MARKER = 'TMSEG_ANTICIPATION:';
export const ANTICIPATION_RESIDUAL_DAYS = 15;
export const FINANCE_ANTICIPATION_EMAIL = 'financeiro@grupotmseg.com.br';

export type AnticipationSettlement = 'PAGO' | 'SALDO_A_RECEBER';

export type AnticipationManualFields = {
  nfNumber: string;
  operationDate: string;
  averageRatePct: number;
  netAnticipated: number;
  offeredAmount: number;
  titleId: string;
  itemId: string;
  paymentDate: string;
};

export type AnticipationPlanInput = AnticipationManualFields & {
  linkedAmounts: number[];
};

export type AnticipationPlan = {
  saldoTotal: number;
  juros: number;
  valorLiquido: number;
  residual: number;
  settlement: AnticipationSettlement;
  residualDueDate: string;
  impliedRatePct: number;
  alerts: string[];
};

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formatBrl(n: number): string {
  return roundMoney(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Aceita 1.200,50 / 1200.50 / R$ 1.200,50. */
export function parseAnticipationMoney(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? roundMoney(raw) : 0;
  let s = String(raw || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

export function parsePctInput(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? roundMoney(raw) : 0;
  let s = String(raw || '').trim().replace(/\s/g, '').replace('%', '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

/**
 * Saldo total = soma das notas vinculadas.
 * Juros = valor ofertado − valor líquido (quando ambos existem);
 * senão juros = ofertado × taxa%.
 * Valor líquido = o informado, ou ofertado − juros.
 * Cobertura da operação = valor ofertado (ou o saldo, se ofertado vazio).
 * Ressalva = max(0, saldo total − cobertura). Juros são custo, não saldo do cliente.
 * Se a operação cobre as notas → PAGO (R$ 0,00).
 */
export function buildAnticipationPlan(input: AnticipationPlanInput): AnticipationPlan {
  const saldoTotal = roundMoney(
    (input.linkedAmounts || []).reduce((s, n) => s + (Number(n) || 0), 0),
  );
  const offered = roundMoney(Math.max(0, Number(input.offeredAmount) || 0));
  let net = roundMoney(Math.max(0, Number(input.netAnticipated) || 0));
  const rate = Number(input.averageRatePct) || 0;
  const alerts: string[] = [];

  const baseOperacao = offered > 0.009 ? offered : saldoTotal;
  let juros = 0;
  if (baseOperacao > 0.009 && net > 0.009) {
    juros = roundMoney(Math.max(0, baseOperacao - net));
  } else if (baseOperacao > 0.009 && Math.abs(rate) > 0.0001) {
    juros = roundMoney(baseOperacao * (rate / 100));
    if (net <= 0.009) net = roundMoney(Math.max(0, baseOperacao - juros));
  }

  if (net <= 0.009 && baseOperacao > 0.009) {
    net = roundMoney(Math.max(0, baseOperacao - juros));
  }

  const valorLiquido = net;
  const cobertura = offered > 0.009 ? offered : saldoTotal;
  const residual = roundMoney(Math.max(0, saldoTotal - cobertura));
  const settlement: AnticipationSettlement = residual > 0.009 ? 'SALDO_A_RECEBER' : 'PAGO';
  const impliedRatePct = baseOperacao > 0.009 ? roundMoney((juros / baseOperacao) * 100) : 0;

  if (rate > 0.0001 && impliedRatePct > 0.0001 && Math.abs(impliedRatePct - rate) > 0.01) {
    alerts.push(
      `Taxa conferida: ${impliedRatePct.toLocaleString('pt-BR')}% (juros ${formatBrl(juros)} ÷ ofertado). A taxa digitada foi ${rate.toLocaleString('pt-BR')}%.`,
    );
  }
  if (offered > 0.009 && saldoTotal > 0.009 && Math.abs(offered - saldoTotal) > 0.009) {
    alerts.push(
      `Valor ofertado (${formatBrl(offered)}) diferente do saldo das notas (${formatBrl(saldoTotal)}). A ressalva usa essa diferença, não o juros.`,
    );
  }
  if (saldoTotal <= 0.009) {
    alerts.push('Vincule ao menos uma nota/título com saldo para calcular o conjunto.');
  }

  const baseDate = String(input.paymentDate || input.operationDate || '').slice(0, 10);
  const residualDueDate = addDaysIso(baseDate, ANTICIPATION_RESIDUAL_DAYS);

  return {
    saldoTotal,
    juros,
    valorLiquido,
    residual,
    settlement,
    residualDueDate,
    impliedRatePct,
    alerts,
  };
}

export function settlementLabel(plan: Pick<AnticipationPlan, 'settlement' | 'residual'>): string {
  if (plan.settlement === 'PAGO' || plan.residual <= 0.009) return 'PAGO (R$ 0,00)';
  return `Saldo a Receber (${formatBrl(plan.residual)})`;
}

export function extractAnticipationId(notes: string | null | undefined): string | null {
  const raw = String(notes || '');
  const idx = raw.indexOf(ANTICIPATION_MARKER);
  if (idx < 0) return null;
  const rest = raw.slice(idx + ANTICIPATION_MARKER.length);
  const id = rest.split(/[\s|,]/)[0]?.trim();
  return id || null;
}

function firstIsoDate(raw: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = raw.match(re);
    const iso = String(m?.[1] || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  return null;
}

/** Datas gravadas no bloco da antecipação (notes do título). */
export function extractAnticipationDates(notes: string | null | undefined): {
  operationDate: string | null;
  paymentDate: string | null;
} {
  const raw = String(notes || '');
  return {
    operationDate: firstIsoDate(raw, [
      /Data op:\s*(\d{4}-\d{2}-\d{2})/i,
      /Data da opera[cç][aã]o:\s*(\d{4}-\d{2}-\d{2})/i,
    ]),
    paymentDate: firstIsoDate(raw, [
      /Pagamento:\s*(\d{4}-\d{2}-\d{2})/i,
      /Data do pagamento:\s*(\d{4}-\d{2}-\d{2})/i,
    ]),
  };
}

export function extractInvoiceRefs(text: string | null | undefined): string[] {
  const raw = String(text || '');
  const found = new Set<string>();
  const patterns = [
    /Fatura\s+([A-Z0-9._\-]+)/gi,
    /\bNF[\s.:-]*([A-Z0-9._\-]+)/gi,
    /\bn[ºo°]?\s*nf[\s.:-]*([A-Z0-9._\-]+)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const v = String(m[1] || '').replace(/[^A-Za-z0-9_-]/g, '').trim();
      if (v && v.length >= 2 && v.length <= 40 && !/^(TMSEG|ASAAS)$/i.test(v)) found.add(v);
    }
  }
  return Array.from(found);
}

export function buildAnticipationNotes(params: {
  existingNotes?: string | null;
  anticipationId: string;
  fields: AnticipationManualFields;
  plan: AnticipationPlan;
  linkedSummary: string;
}): string {
  const prev = String(params.existingNotes || '')
    .split('\n')
    .filter((line) => !line.includes(ANTICIPATION_MARKER) && !/^Antecipação de pagamento/i.test(line.trim()))
    .join('\n')
    .trim();
  const block = [
    `${ANTICIPATION_MARKER}${params.anticipationId}`,
    `Antecipação de pagamento | NF: ${params.fields.nfNumber || '—'} | Data op: ${params.fields.operationDate || '—'} | Taxa média: ${params.fields.averageRatePct}% | Valor ofertado: ${formatBrl(params.fields.offeredAmount)} | Valor líquido: ${formatBrl(params.plan.valorLiquido)} | Juros: ${formatBrl(params.plan.juros)} | Id título: ${params.fields.titleId || '—'} | Id item: ${params.fields.itemId || '—'} | Pagamento: ${params.fields.paymentDate || '—'} | Saldo total: ${formatBrl(params.plan.saldoTotal)} | ${settlementLabel(params.plan)} | Notas: ${params.linkedSummary}`,
  ].join('\n');
  return prev ? `${prev}\n${block}` : block;
}

export function buildResidualAnticipationDescription(entityName: string): string {
  const name = String(entityName || 'Cliente').trim() || 'Cliente';
  return `↳ Ressalva antecipação — ${name}`;
}

export function buildResidualAnticipationNotes(params: {
  anticipationId: string;
  residual: number;
  dueDate: string;
  linkedSummary: string;
}): string {
  return [
    `${ANTICIPATION_MARKER}${params.anticipationId}`,
    `Ressalva de antecipação — cobrar do cliente até ${params.dueDate}`,
    `Saldo a receber: ${formatBrl(params.residual)}`,
    `Origem (NFs/títulos): ${params.linkedSummary}`,
  ].join(' | ');
}
