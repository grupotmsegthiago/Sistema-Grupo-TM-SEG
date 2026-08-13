/**
 * Helpers de exibição da tela Controle de Faturas / NF.
 * Status de cobrança (Em Aberto / VENCIDO N dias / PAGO) e status da NF
 * (Emitida / Processando / Falha) — sem alterar regras fiscais.
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

/** Mensagens soft do pipeline (ainda não é falha real da prefeitura/Asaas). */
export function isSoftNfPendingMessage(lastError?: string | null): boolean {
  const e = String(lastError || '').trim();
  if (!e) return true;
  return /NF isolada|agendada pelo Controle|NF_SCHEDULE_PENDING|NF_TIMEOUT|aguardando autorização|em segundo plano/i.test(
    e,
  );
}

/**
 * Erro real de emissão (Asaas / prefeitura / sistema) — deve aparecer como Falha
 * com o texto completo, mesmo se o worker ainda tentar de novo.
 */
export function isHardNfEmissionError(
  lastError?: string | null,
  nfStatus?: string | null,
): boolean {
  const ns = (nfStatus || '').toUpperCase();
  if (ns === 'ERROR' || ns === 'FAILED') return true;
  const e = String(lastError || '').trim();
  if (!e || isSoftNfPendingMessage(e)) return false;
  return /chave de API|inv[aá]lida|\b401\b|\b403\b|\b422\b|Retorno da prefeitura|C[oó]digo:\s*\d+|assinatura do RPS|inscri[cç][aã]o municipal|certificado|unauthorized|forbidden|Asaas API Error/i.test(
    e,
  );
}

/** Texto claro do erro para a UI (origem Asaas/sistema). */
export function formatNfLastError(lastError?: string | null, maxLen = 180): string | null {
  const e = String(lastError || '').trim();
  if (!e || isSoftNfPendingMessage(e)) return null;
  const clean = e.replace(/\s+/g, ' ');
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

export function nfStatusBucket(
  nfStatus?: string | null,
  opts?: { stuckByAge?: boolean; paused?: boolean; lastError?: string | null },
): NfBucket {
  const ns = (nfStatus || '').toUpperCase();
  if (ns === 'AUTHORIZED') return 'emitida';
  if (ns === 'CANCELED' || ns === 'CANCELLED') return 'cancelada';
  if (!ns) return 'nenhuma';

  // Erro real Asaas/prefeitura/sistema → Falha (texto completo vem do lastError).
  if (isHardNfEmissionError(opts?.lastError, ns)) return 'falha';
  if (opts?.paused && (opts?.stuckByAge || ns === 'STUCK')) return 'falha';

  // SCHEDULED, SYNCHRONIZED, PROCESSING, PENDING, RETRY…
  return 'aguardando';
}

/** Rótulo curto do status da NF (Emitida / Processando / Falha). */
export function nfBucketLabel(bucket: NfBucket): string {
  switch (bucket) {
    case 'emitida':
      return 'Emitida';
    case 'aguardando':
      return 'Processando';
    case 'falha':
      return 'Falha';
    case 'cancelada':
      return 'Cancelada';
    default:
      return '—';
  }
}

/** Detalhe sob o rótulo curto — prioriza erro real (Asaas/sistema). */
export function nfBucketDetail(
  nfStatus?: string | null,
  opts?: {
    stuckByAge?: boolean;
    provider?: string | null;
    ageHours?: number | null;
    paused?: boolean;
    lastError?: string | null;
  },
): string | null {
  const ns = (nfStatus || '').toUpperCase();
  const provider = String(opts?.provider || '').toUpperCase() === 'PLUGNOTAS' ? 'PlugNotas' : 'Asaas';
  const hardErr = formatNfLastError(opts?.lastError, 160);
  if (hardErr) return hardErr;

  if (opts?.paused && (opts?.stuckByAge || ns === 'STUCK')) {
    const age = opts?.ageHours != null && opts.ageHours >= 1 ? ` há ${opts.ageHours}h` : '';
    return `TRAVADA — verificar ${provider}${age}`;
  }
  if (ns === 'AUTHORIZED') return null;
  if (ns === 'SYNCHRONIZED') return 'Em fila Prefeitura';
  if (ns === 'SCHEDULED') return 'Agendada no Asaas';
  if (ns === 'PROCESSING' || ns === 'PENDING' || ns === 'RETRY') {
    return 'Aguardando autorização';
  }
  if (ns === 'WAITING_CUSTOMER_ACCEPTANCE') return 'Aguardando aceite';
  return ns || null;
}
