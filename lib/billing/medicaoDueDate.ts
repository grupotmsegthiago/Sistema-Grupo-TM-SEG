/**
 * Prazo de vencimento ao enviar Boletim de Medição ao cliente.
 * Padrão: 30 dias · CEVA: 70 dias.
 */

export function isCevaClientName(name: string | null | undefined): boolean {
  return String(name || '').toUpperCase().includes('CEVA');
}

export function medicaoDueDaysForClient(name: string | null | undefined): 30 | 70 {
  return isCevaClientName(name) ? 70 : 30;
}

/** Soma dias corridos a uma data ISO YYYY-MM-DD (calendário, sem timezone). */
export function addCalendarDaysIso(isoDate: string, days: number): string {
  const base = String(isoDate || '').slice(0, 10);
  const [y, m, d] = base.split('-').map(Number);
  if (!y || !m || !d) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function computeMedicaoDueDate(params: {
  clientName: string | null | undefined;
  fromDateIso?: string | null;
}): { dueDate: string; days: 30 | 70 } {
  const days = medicaoDueDaysForClient(params.clientName);
  const from = (params.fromDateIso || new Date().toISOString()).slice(0, 10);
  return { dueDate: addCalendarDaysIso(from, days), days };
}
