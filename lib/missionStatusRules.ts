/** Missão de escolta velada (discreta). */
export function isVeladaMission(missionType?: string | null): boolean {
  return (missionType || '').toUpperCase().includes('VELADA');
}

/** Fornecedores ATIVA/TM SEG podem concluir sem hodômetro — exceto em VELADA. */
export function isOdometerExemptProvider(providerName?: string): boolean {
  const raw = (providerName || '').toUpperCase();
  const tokens = raw.split(/[^A-Z0-9]+/).filter(Boolean);
  const collapsed = raw.replace(/\s+/g, '');
  return tokens.includes('ATIVA') || collapsed.includes('TMSEG') || collapsed.includes('TMSECURITY');
}

/**
 * Hodômetro obrigatório para conclusão real da OS.
 * VELADA com fornecedor fica PENDENTE até o KM FINAL — mesmo ATIVA/TM SEG.
 */
export function isOdometerExemptForConclusion(
  providerName?: string,
  missionType?: string | null,
): boolean {
  if (isVeladaMission(missionType)) return false;
  return isOdometerExemptProvider(providerName);
}

/** OS aguardando KM final (status Pendente ou Concluída sem end_km). */
export function isMissionPendingKm(mission: {
  status?: string;
  endKm?: number | null;
  end_km?: number | null;
}): boolean {
  const status = (mission.status || '').toLowerCase();
  const endKm = mission.endKm ?? mission.end_km;
  const missingKm = endKm == null || endKm === 0;
  if (!missingKm) return false;
  return status === 'pendente' || status === 'concluída' || status === 'concluida';
}
