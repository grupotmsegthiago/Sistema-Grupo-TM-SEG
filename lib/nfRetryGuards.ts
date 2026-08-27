/**
 * Mensagens gravadas no create-charge enquanto a NF ainda não foi
 * agendada no Asaas (fluxo "NF isolada"). Não são erros da API.
 */
const NF_SCHEDULE_PENDING_PATTERNS = [
  /NF isolada/i,
  /NF_SCHEDULE_PENDING/i,
  /ser[aá] agendada pelo Controle\/worker/i,
  /agendada pelo Controle\/worker/i,
];

/** Erros permanentes — worker pausa (não tenta de novo). */
const NON_RETRYABLE_PATTERNS = [
  /NFe003/i,
  /descri[cç][aã]o do servi[cç]o/i,
  /descri[cç][aã]o municipal/i,
  /CNPJ inv[aá]lido/i,
  /endere[cç]o.*incompleto/i,
  /CEP.*inv[aá]lido/i,
  /inscri[cç][aã]o municipal/i,
  /tomador.*n[aã]o.*habilitad/i,
  // Credencial da Prefeitura no Asaas (Notas Fiscais → Informações Fiscais).
  // Retry/reopen automático não resolve — precisa atualizar login/senha CCM.
  /falha na autentica/i,
  /verifique suas credenciais/i,
];

/** Erros transitórios da Prefeitura/Asaas — vale cancelar+reagendar. */
const RETRYABLE_PREFEITURA_PATTERNS = [
  /sobrecarregad/i,
  /tente novamente/i,
  /servidor.*prefeitura/i,
  /timeout/i,
  /tempo limite/i,
  /indispon[ií]vel/i,
];

/** Placeholder de fila (create-charge), não falha fiscal real. */
export function isNfSchedulePendingMessage(errorMessage: string): boolean {
  if (!errorMessage) return false;
  return NF_SCHEDULE_PENDING_PATTERNS.some((rx) => rx.test(errorMessage));
}

export function isNonRetryable(errorMessage: string): boolean {
  if (!errorMessage) return false;
  // Placeholder "NF isolada" menciona Inscrição Municipal como observação —
  // não pode pausar o worker antes do primeiro POST /invoices.
  if (isNfSchedulePendingMessage(errorMessage)) return false;
  if (RETRYABLE_PREFEITURA_PATTERNS.some((rx) => rx.test(errorMessage))) return false;
  return NON_RETRYABLE_PATTERNS.some((rx) => rx.test(errorMessage));
}
