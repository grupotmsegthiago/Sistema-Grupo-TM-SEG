/**
 * Resumo de caixa (Contas a Pagar / Receber): o que entra e sai
 * no dia, na semana e no mês + saldos das contas operacionais/XP
 * de uso corrente. Não inclui XP Investimentos nem outras contas
 * do Painel de Investimentos.
 */
import { normalizeFinancialText } from '../financialInternalTransfer';
import { resolverPeriodoVencimento } from './transactionPeriod';
import { getTransactionOpenAmount } from './partialPayments';
import type { FinancialTransaction } from '../../types';

const CASH_AVAILABLE_NAMES = new Set(
  [
    'TM GESTAO',
    'TM GESTÃO',
    'TM SECURITY',
    'TM SEGURANCA',
    'TM SEGURANÇA',
    'XP COMPROMISSADA',
    'XP CONTA DIGITAL',
    'XP CONTA DIGIAL',
  ].map(normalizeFinancialText),
);

export type CashFlowHorizon = 'DAY' | 'WEEK' | 'MONTH';

export type CashAvailableAccount = {
  id: string;
  name: string;
  bankName: string;
  balance: number;
};

export function isCashAvailableAccountName(name: string): boolean {
  return CASH_AVAILABLE_NAMES.has(normalizeFinancialText(name));
}

export function listCashAvailableAccounts(
  accounts: Array<{ id: string; name?: string; bank_name?: string; status?: string; initial_balance?: number }>,
  latestBalances: Record<string, number> = {},
): { accounts: CashAvailableAccount[]; total: number } {
  const rows: CashAvailableAccount[] = [];
  for (const acc of accounts || []) {
    if (acc.status && acc.status !== 'Ativo') continue;
    if (!isCashAvailableAccountName(String(acc.name || ''))) continue;
    const snap = latestBalances[String(acc.id)];
    const balance = Number.isFinite(snap) ? Number(snap) : Number(acc.initial_balance || 0);
    rows.push({
      id: String(acc.id),
      name: String(acc.name || '').trim() || 'Conta',
      bankName: String(acc.bank_name || '').trim(),
      balance: Math.round(balance * 100) / 100,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const total = Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100;
  return { accounts: rows, total };
}

export function cashFlowCoverRange(today: string): { start: string; end: string } {
  const month = resolverPeriodoVencimento({ viewPeriod: 'MONTH', today });
  const week = resolverPeriodoVencimento({ viewPeriod: 'WEEK', today });
  const start = [month?.start, week?.start, today].filter(Boolean).sort()[0] as string;
  const end = [month?.end, week?.end, today].filter(Boolean).sort().slice(-1)[0] as string;
  return { start, end };
}

export function dueInHorizon(dueDate: string, horizon: CashFlowHorizon, today: string): boolean {
  const due = String(dueDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  const range = resolverPeriodoVencimento({ viewPeriod: horizon, today });
  if (!range) return false;
  return due >= range.start && due <= range.end;
}

const OPEN_STATUSES = new Set(['PENDING', 'SCHEDULED', 'PARTIALLY_PAID', 'OVERDUE']);

export function isOpenCashTitle(t: Pick<FinancialTransaction, 'status'>): boolean {
  return OPEN_STATUSES.has(String(t.status || ''));
}

export function statusLabelFinanceiro(status: string | null | undefined): string {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID') return 'Pago';
  if (s === 'PENDING') return 'Pendente';
  if (s === 'SCHEDULED') return 'Agendado';
  if (s === 'PARTIALLY_PAID') return 'Parcial';
  if (s === 'OVERDUE') return 'Vencido';
  if (s === 'CANCELLED') return 'Cancelado';
  return s || '—';
}

export function periodoCompetencia(dueDate: string): string {
  const d = String(dueDate || '').slice(0, 10);
  const [y, m] = d.split('-');
  if (!y || !m) return '—';
  return `${m}/${y}`;
}

export function dataPagamentoPreview(t: Pick<FinancialTransaction, 'payment_date' | 'due_date'>): string {
  const paid = String(t.payment_date || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(paid)) return paid;
  return String(t.due_date || '').slice(0, 10);
}

export function splitCashFlowTitles(
  transactions: FinancialTransaction[],
  horizon: CashFlowHorizon,
  today: string,
): { pagar: FinancialTransaction[]; receber: FinancialTransaction[] } {
  const inHorizon = transactions.filter((t) => dueInHorizon(t.due_date, horizon, today) && isOpenCashTitle(t));
  return {
    pagar: inHorizon.filter((t) => t.type === 'EXPENSE'),
    receber: inHorizon.filter((t) => t.type === 'INCOME'),
  };
}

export function amountPagarPreview(t: FinancialTransaction): number {
  return Math.round(Number(t.amount || 0) * 100) / 100;
}

export function amountReceberPreview(t: FinancialTransaction): number {
  return Math.round(getTransactionOpenAmount(t) * 100) / 100;
}
