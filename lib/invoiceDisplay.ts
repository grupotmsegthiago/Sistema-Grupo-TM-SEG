/**
 * Helpers de exibição da tela Controle de Faturas / NF.
 * Status de cobrança (Em Aberto / VENCIDO N dias / PAGO) e status da NF
 * (Emitida / Aguardando / Falha) — sem alterar regras fiscais.
 */

/** Dias de calendário vencidos (fuso America/Sao_Paulo), independente do UTC do servidor. */
export function overdueDays(dueDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  const dueStr = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueStr)) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = fmt.format(now); // YYYY-MM-DD
  const dueMs = Date.parse(`${dueStr}T12:00:00Z`);
  const todayMs = Date.parse(`${todayStr}T12:00:00Z`);
  if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) return null;
  const diff = Math.floor((todayMs - dueMs) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/** Rótulo do status de cobrança na linha da tabela. */
export function paymentStatusLabel(
  status: string,
  dueDate?: string | null,
  now: Date = new Date(),
): string {
  const s = (status || '').toUpperCase();
  if (s === 'PAGA') return 'PAGO';
  if (s === 'CANCELADA') return 'Cancelada';
  const days = overdueDays(dueDate, now);
  const isOverdue = s === 'VENCIDA' || (s === 'EMITIDA' && days !== null && days > 0);
  if (isOverdue) {
    const n = days && days > 0 ? days : 0;
    if (n <= 0) return 'VENCIDO';
    return `VENCIDO (${n} ${n === 1 ? 'dia' : 'dias'})`;
  }
  if (s === 'EMITIDA') return 'Em Aberto';
  return status || '—';
}

export type NfBucket = 'emitida' | 'aguardando' | 'falha' | 'cancelada' | 'nenhuma';

export function nfStatusBucket(
  nfStatus?: string | null,
  opts?: { stuckByAge?: boolean },
): NfBucket {
  const ns = (nfStatus || '').toUpperCase();
  if (opts?.stuckByAge || ns === 'STUCK' || ns === 'ERROR' || ns === 'FAILED') return 'falha';
  if (ns === 'AUTHORIZED') return 'emitida';
  if (ns === 'CANCELED' || ns === 'CANCELLED') return 'cancelada';
  if (!ns) return 'nenhuma';
  // SCHEDULED, SYNCHRONIZED, PROCESSING, PENDING, RETRY, WAITING_*, etc.
  return 'aguardando';
}

/** Rótulo curto do status da NF (Emitida / Aguardando / Falha). */
export function nfBucketLabel(bucket: NfBucket): string {
  switch (bucket) {
    case 'emitida':
      return 'Emitida';
    case 'aguardando':
      return 'Aguardando';
    case 'falha':
      return 'Falha';
    case 'cancelada':
      return 'Cancelada';
    default:
      return '—';
  }
}

/** Detalhe opcional sob o rótulo curto (ex.: "Em fila Prefeitura", "TRAVADA — Asaas"). */
export function nfBucketDetail(
  nfStatus?: string | null,
  opts?: { stuckByAge?: boolean; provider?: string | null; ageHours?: number | null },
): string | null {
  const ns = (nfStatus || '').toUpperCase();
  const provider = String(opts?.provider || '').toUpperCase() === 'PLUGNOTAS' ? 'PlugNotas' : 'Asaas';
  if (opts?.stuckByAge || ns === 'STUCK') {
    const age = opts?.ageHours != null && opts.ageHours >= 1 ? ` há ${opts.ageHours}h` : '';
    return `TRAVADA — verificar ${provider}${age}`;
  }
  if (ns === 'ERROR' || ns === 'FAILED') return 'Erro na emissão';
  if (ns === 'AUTHORIZED') return null;
  if (ns === 'SYNCHRONIZED') return 'Em fila Prefeitura';
  if (ns === 'SCHEDULED') return 'Agendada';
  if (ns === 'PROCESSING') return 'Processando';
  if (ns === 'WAITING_CUSTOMER_ACCEPTANCE') return 'Aguardando aceite';
  if (ns === 'PENDING' || ns === 'RETRY') return 'Pendente';
  return ns || null;
}
