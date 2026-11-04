/** Tipo de operação Velada — único autorizado a gerar link de rastreio ao vivo. */

export function isVeladaMission(input: {
  mission_type?: string | null;
  missionType?: string | null;
  vehicleType?: string | null;
  vehicleData?: { type?: string | null } | null;
} | null | undefined): boolean {
  if (!input) return false;
  const blob = [
    input.mission_type,
    input.missionType,
    input.vehicleType,
    input.vehicleData?.type,
  ]
    .map((v) => String(v || '').toUpperCase())
    .join(' ');
  return blob.includes('VELAD');
}

export const TERMINAL_MISSION_STATUSES = ['Concluída', 'Cancelada', 'Recusada'] as const;

export function isTerminalMissionStatus(status: string | null | undefined): boolean {
  const s = String(status || '').trim();
  return (TERMINAL_MISSION_STATUSES as readonly string[]).includes(s);
}

/** Fornecedor ATIVA. "INATIVA" não entra. */
export function fornecedorAtiva(nome: string | null | undefined): boolean {
  const n = String(nome || '').toUpperCase();
  return /(^|[^A-Z])ATIVA([^A-Z]|$)/.test(n);
}

/** O link existe da criação até a conclusão. Pendente, concluída, cancelada e recusada ficam fechadas. */
export function rastreioOsAberta(status: string | null | undefined): boolean {
  const s = String(status || '').trim();
  if (!s || s === 'Pendente') return false;
  return !isTerminalMissionStatus(s);
}
