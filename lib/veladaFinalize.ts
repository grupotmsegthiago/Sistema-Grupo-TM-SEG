/**
 * Regras de encerramento operacional para velada (ATIVA / TM SEG):
 * concluir ou cancelar com hora + evidência; hodômetro (KM) entra depois.
 * O alerta fixo do operador (KM final, hora final e pedágio) fica em veladaClosureAlert.
 */

/** Fornecedores ATIVA e TM SEG enviam o KM final só depois da missão. */
export function isOdometerExemptProvider(providerName?: string | null): boolean {
  const raw = String(providerName || '').toUpperCase();
  const tokens = raw.split(/[^A-Z0-9]+/).filter(Boolean);
  const collapsed = raw.replace(/\s+/g, '');
  return tokens.includes('ATIVA') || collapsed.includes('TMSEG') || collapsed.includes('TMSECURITY');
}

export function isVeladaPassThroughTerminal(opts: {
  odometerExempt: boolean;
  kind: 'completed' | 'cancelled' | 'refused';
}): boolean {
  const { odometerExempt, kind } = opts;
  return odometerExempt && (kind === 'completed' || kind === 'cancelled');
}

/** Conclusão velada confirmada no checklist não cai em Pendente por falta de KM. */
export function shouldDowngradeCompletedToPending(opts: {
  exemptOdo: boolean;
  finalizeConfirmed: boolean;
  hasStart: boolean;
  hasEnd: boolean;
}): boolean {
  const { exemptOdo, finalizeConfirmed, hasStart, hasEnd } = opts;
  if (hasStart && hasEnd) return false;
  if (exemptOdo && finalizeConfirmed) {
    // Só hora final é obrigatória no encerramento; KM depois no financeiro.
    return !hasEnd;
  }
  return true;
}
