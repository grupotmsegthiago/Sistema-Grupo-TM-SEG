/**
 * Confirmação de pagamento em Contas a Receber.
 * - Valor parcial → residual vira novo título PENDENTE/VENCIDO
 * - Juros/multa entram a mais no total recebido (alerta), sem alterar o principal do título
 */

export const RESIDUAL_PARENT_MARKER = 'TMSEG_PARENT_TX:';

export type ConfirmReceivablePayInput = {
  titleAmount: number;
  /** Valor aplicado ao principal do título (sem juros/multa). */
  principalPaid: number;
  interest?: number;
  fine?: number;
  dueDate: string;
  today: string;
};

export type ConfirmReceivablePayPlan = {
  principalApplied: number;
  residual: number;
  interest: number;
  fine: number;
  /** principalApplied + interest + fine */
  totalReceived: number;
  isPartial: boolean;
  residualStatus: 'PENDING' | 'OVERDUE';
  alerts: string[];
};

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function parseMoneyInput(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? roundMoney(raw) : 0;
  let s = String(raw || '').trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',')) {
    // Formato BR: 1.200,50
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

export function buildConfirmReceivablePayPlan(input: ConfirmReceivablePayInput): ConfirmReceivablePayPlan {
  const title = roundMoney(Math.max(0, input.titleAmount));
  const interest = roundMoney(Math.max(0, input.interest || 0));
  const fine = roundMoney(Math.max(0, input.fine || 0));
  let principalApplied = roundMoney(Math.max(0, input.principalPaid));
  if (principalApplied > title) principalApplied = title;

  const residual = roundMoney(Math.max(0, title - principalApplied));
  const isPartial = residual > 0.009;
  const due = String(input.dueDate || '').slice(0, 10);
  const today = String(input.today || '').slice(0, 10);
  const residualStatus: 'PENDING' | 'OVERDUE' = due && today && due < today ? 'OVERDUE' : 'PENDING';

  const alerts: string[] = [];
  if (interest > 0.009) {
    alerts.push(`${formatBrl(interest)} referente a juros`);
  }
  if (fine > 0.009) {
    alerts.push(`${formatBrl(fine)} referente a multa`);
  }
  if (isPartial) {
    alerts.push(
      `Pagamento incompleto: será gerado saldo residual de ${formatBrl(residual)} (${residualStatus === 'OVERDUE' ? 'VENCIDO' : 'PENDENTE'})`,
    );
  }

  return {
    principalApplied,
    residual,
    interest,
    fine,
    totalReceived: roundMoney(principalApplied + interest + fine),
    isPartial,
    residualStatus,
    alerts,
  };
}

export function formatBrl(n: number): string {
  return roundMoney(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildPaidNotes(params: {
  existingNotes?: string | null;
  plan: ConfirmReceivablePayPlan;
  paymentDate: string;
}): string {
  const parts = [
    `Confirmado pagamento em ${params.paymentDate}`,
    `Principal: ${formatBrl(params.plan.principalApplied)}`,
  ];
  if (params.plan.interest > 0.009) parts.push(`Juros: ${formatBrl(params.plan.interest)}`);
  if (params.plan.fine > 0.009) parts.push(`Multa: ${formatBrl(params.plan.fine)}`);
  parts.push(`Total recebido: ${formatBrl(params.plan.totalReceived)}`);
  if (params.plan.isPartial) {
    parts.push(`Pago incompleto — residual ${formatBrl(params.plan.residual)}`);
  }
  const block = parts.join(' | ');
  const prev = String(params.existingNotes || '').trim();
  // Remove bloco antigo de confirmação para não empilhar
  const cleaned = prev
    .split('\n')
    .filter((line) => !/^Confirmado pagamento em /i.test(line.trim()))
    .join('\n')
    .trim();
  return cleaned ? `${cleaned}\n${block}` : block;
}

export function buildResidualDescription(originalDescription: string): string {
  const base = String(originalDescription || 'Título').trim();
  const stripped = base.replace(/^↳\s*Saldo residual\s*—\s*/i, '').trim();
  return `↳ Saldo residual — ${stripped}`;
}

export function buildResidualNotes(params: {
  parentId: string;
  parentDescription: string;
  residual: number;
}): string {
  return [
    `${RESIDUAL_PARENT_MARKER}${params.parentId}`,
    `Saldo residual de ${formatBrl(params.residual)}`,
    `Origem: ${String(params.parentDescription || '').slice(0, 160)}`,
  ].join(' | ');
}

export function extractParentTransactionId(notes: string | null | undefined): string | null {
  const raw = String(notes || '');
  const idx = raw.indexOf(RESIDUAL_PARENT_MARKER);
  if (idx < 0) return null;
  const rest = raw.slice(idx + RESIDUAL_PARENT_MARKER.length);
  const id = rest.split(/[\s|,]/)[0]?.trim();
  return id || null;
}
