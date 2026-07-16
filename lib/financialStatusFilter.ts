import type { TransactionStatus } from '../types';

export type FinancialStatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'OVERDUE' | 'SCHEDULED';

function normalizeStatus(status: unknown): string {
  return String(status || '').trim().toUpperCase();
}

/**
 * Filtro de status da tela Contas a Pagar / Receber.
 * - Pendente = PENDING (ainda não liquidado, sem agendamento bancário)
 * - Agendado = SCHEDULED
 * - Pago = PAID
 * - Vencido = OVERDUE ou PENDING/SCHEDULED com vencimento &lt; hoje
 */
export function matchesFinancialStatusFilter(
  status: TransactionStatus | string | null | undefined,
  dueDate: string | null | undefined,
  filter: FinancialStatusFilter,
  todayStr: string,
): boolean {
  if (filter === 'ALL') return true;

  const s = normalizeStatus(status);
  const due = String(dueDate || '').split('T')[0];

  if (filter === 'PAID') return s === 'PAID';
  if (filter === 'PENDING') return s === 'PENDING';
  if (filter === 'SCHEDULED') return s === 'SCHEDULED';

  if (filter === 'OVERDUE') {
    if (s === 'PAID' || s === 'CANCELLED' || s === 'CANCELED') return false;
    if (s === 'OVERDUE') return true;
    // Pendente ou agendado com vencimento passado conta como vencido na UI
    if ((s === 'PENDING' || s === 'SCHEDULED') && due && due < todayStr) return true;
    return false;
  }

  return true;
}
