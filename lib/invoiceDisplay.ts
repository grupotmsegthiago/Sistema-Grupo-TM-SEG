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

export function nfStatusBucket(
  nfStatus?: string | null,
  opts?: { stuckByAge?: boolean; paused?: boolean },
): NfBucket {
  const ns = (nfStatus || '').toUpperCase();
  // Falha só quando pausado de verdade (erro permanente). Enquanto o worker
  // ainda tenta, STUCK/ERROR aparecem como Processando.
  const hardFail = opts?.paused && (opts?.stuckByAge || ns === 'STUCK' || ns === 'ERROR' || ns === 'FAILED');
  if (hardFail) return 'falha';
  if (ns === 'AUTHORIZED') return 'emitida';
  if (ns === 'CANCELED' || ns === 'CANCELLED') return 'cancelada';
  if (!ns) return 'nenhuma';
  // SCHEDULED, SYNCHRONIZED, PROCESSING, PENDING, RETRY, ERROR em retry, etc.
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

export type NfErrorGuidance = {
  shortLabel: string;
  howToFix: string;
};

/** Classifica o erro gravado em nf_last_error e devolve rótulo curto + caminho de correção. */
export function nfErrorGuidance(
  lastError?: string | null,
  opts?: { issuerCompany?: string | null },
): NfErrorGuidance | null {
  const err = String(lastError || '').trim();
  if (!err) return null;
  const issuer = String(opts?.issuerCompany || '').trim() || 'empresa emissora';
  if (/falha na autentica|verifique suas credenciais|informa[cç][oõ]es fiscais/i.test(err)) {
    return {
      shortLabel: 'Credencial Prefeitura',
      howToFix: `No Asaas da ${issuer}, abra Notas Fiscais → Informações Fiscais e atualize o login/senha (CCM) da Prefeitura. Depois volte nesta tela e clique em Reemitir NF.`,
    };
  }
  if (/inscri[cç][aã]o municipal/i.test(err)) {
    return {
      shortLabel: 'Inscrição municipal',
      howToFix: `Confira a Inscrição Municipal da ${issuer} no Asaas (Notas Fiscais → Informações Fiscais) e o CCM/IM do tomador no cadastro do cliente. Depois clique em Reemitir NF.`,
    };
  }
  if (/NFe003|descri[cç][aã]o (do servi[cç]o|municipal)/i.test(err)) {
    return {
      shortLabel: 'Descrição municipal',
      howToFix: 'Ajuste a descrição municipal / CNAE do serviço no cadastro do cliente (aba fiscal) para o texto aceito pela Prefeitura. Depois clique em Reemitir NF.',
    };
  }
  if (/CNPJ inv[aá]lido/i.test(err)) {
    return {
      shortLabel: 'CNPJ inválido',
      howToFix: 'Corrija o CNPJ do cliente no cadastro e sincronize o cliente no Asaas. Depois clique em Reemitir NF.',
    };
  }
  if (/endere[cç]o.*incompleto|CEP.*inv[aá]lido/i.test(err)) {
    return {
      shortLabel: 'Endereço incompleto',
      howToFix: 'Complete CEP, logradouro, número, cidade e UF no cadastro do cliente. Depois clique em Reemitir NF.',
    };
  }
  if (/tomador.*n[aã]o.*habilitad/i.test(err)) {
    return {
      shortLabel: 'Tomador não habilitado',
      howToFix: 'O tomador precisa estar habilitado na Prefeitura para receber NFS-e. Confira o cadastro municipal do cliente e depois clique em Reemitir NF.',
    };
  }
  return {
    shortLabel: 'Erro na emissão',
    howToFix: 'Corrija a pendência informada pelo Asaas/Prefeitura e clique em Reemitir NF (Asaas) ou Reemitir via PlugNotas.',
  };
}

/** Detalhe opcional sob o rótulo curto (ex.: "Em fila Prefeitura", "TRAVADA — Asaas"). */
export function nfBucketDetail(
  nfStatus?: string | null,
  opts?: {
    stuckByAge?: boolean;
    provider?: string | null;
    ageHours?: number | null;
    paused?: boolean;
    lastError?: string | null;
    issuerCompany?: string | null;
  },
): string | null {
  const ns = (nfStatus || '').toUpperCase();
  const provider = String(opts?.provider || '').toUpperCase() === 'PLUGNOTAS' ? 'PlugNotas' : 'Asaas';
  if (opts?.paused && (opts?.stuckByAge || ns === 'STUCK')) {
    const age = opts?.ageHours != null && opts.ageHours >= 1 ? ` há ${opts.ageHours}h` : '';
    return `TRAVADA — verificar ${provider}${age}`;
  }
  if (opts?.paused && (ns === 'ERROR' || ns === 'FAILED')) {
    return nfErrorGuidance(opts.lastError, { issuerCompany: opts.issuerCompany })?.shortLabel || 'Erro na emissão';
  }
  if (ns === 'AUTHORIZED') return null;
  if (ns === 'SYNCHRONIZED') return 'Em fila Prefeitura';
  if (ns === 'SCHEDULED') return 'Agendada no Asaas';
  if (ns === 'PROCESSING' || ns === 'PENDING' || ns === 'RETRY' || ns === 'STUCK' || ns === 'ERROR' || ns === 'FAILED') {
    return 'Aguardando autorização';
  }
  if (ns === 'WAITING_CUSTOMER_ACCEPTANCE') return 'Aguardando aceite';
  return ns || null;
}

/**
 * Tooltip do badge de status NF — distingue erro ATUAL (falha) de erro histórico
 * (tentativa anterior) quando a NF está em fila/processamento.
 */
export function nfStatusTooltip(opts: {
  bucket: NfBucket;
  lastError?: string | null;
  detail?: string | null;
  guidance?: NfErrorGuidance | null;
}): string {
  const err = String(opts.lastError || '').trim();
  const detail = String(opts.detail || '').trim();

  if (opts.bucket === 'falha') {
    return [err, opts.guidance?.howToFix].filter(Boolean).join('\n\n') || detail || 'Falha na emissão da NF.';
  }
  if (opts.bucket === 'emitida') {
    return detail || 'NF autorizada.';
  }
  if (opts.bucket === 'cancelada') {
    return detail || 'NF cancelada.';
  }

  const waiting =
    detail ||
    'NF enviada. Aguardando autorização da Prefeitura.';
  if (err) {
    return `${waiting}\n\nErro da tentativa anterior:\n${err}`;
  }
  return waiting;
}

/** Exibe bloco de erro como rejeição ATUAL (somente falha confirmada). */
export function shouldShowCurrentNfError(bucket: NfBucket, lastError?: string | null): boolean {
  return bucket === 'falha' && !!String(lastError || '').trim();
}
