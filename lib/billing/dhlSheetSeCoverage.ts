/**
 * Cobertura da planilha DHL: a planilha de faturamento precisa trazer
 * TODAS as SE do período que existem no sistema, mesmo que o arquivo
 * enviado pelo cliente as tenha omitido.
 */

export function onlyDigitsSe(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** SE do universo TM SEG que não estavam na planilha enviada. */
export function listSystemSesMissingFromSheet(
  uploadedSes: Iterable<unknown>,
  systemSes: Iterable<unknown>,
): string[] {
  const uploaded = new Set(
    [...uploadedSes].map(onlyDigitsSe).filter(Boolean),
  );
  const missing = new Set<string>();
  for (const raw of systemSes) {
    const se = onlyDigitsSe(raw);
    if (se && !uploaded.has(se)) missing.add(se);
  }
  return [...missing].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

/** Ordem estável das SE do sistema para a planilha (data da OS, depois o número). */
export function sortSystemSesForDhlSheet(
  bySe: Map<string, { start_time?: string | null }>,
): string[] {
  return [...bySe.entries()]
    .sort((a, b) => {
      const da = new Date(a[1].start_time || 0).getTime() - new Date(b[1].start_time || 0).getTime();
      return da || a[0].localeCompare(b[0], 'pt-BR', { numeric: true });
    })
    .map(([se]) => se);
}

/**
 * Planilha do período DHL só pode ser gerada com OS APROVADA/APROVADO.
 * Fonte da verdade: billing_approved === true. Ausência = PENDENTE (fail-closed).
 */
export function isDhlPeriodMissionApproved(mission: {
  billing_approved?: boolean | null;
  isApproved?: boolean | null;
}): boolean {
  if (mission.billing_approved === true) return true;
  if (mission.billing_approved === false) return false;
  return mission.isApproved === true;
}

export function listUnapprovedDhlPeriodMissions<T extends {
  billing_approved?: boolean | null;
  isApproved?: boolean | null;
}>(missions: T[]): T[] {
  return missions.filter((m) => !isDhlPeriodMissionApproved(m));
}

export function formatDhlUnapprovedOsLine(m: {
  os_number?: string | null;
  id?: string | null;
  dhl_se_number?: string | null;
  seNumber?: string | null;
  status?: string | null;
  missionStatus?: string | null;
}): string {
  const rawOs = String(m.os_number || m.id || '?').trim() || '?';
  const os = rawOs.toUpperCase().startsWith('GTM-')
    ? rawOs
    : `GTM-${rawOs.replace(/^GTM-/i, '')}`;
  const se = onlyDigitsSe(m.dhl_se_number ?? m.seNumber);
  const st = String(m.status || m.missionStatus || '').trim() || '-';
  return se ? `• ${os} / SE ${se} (${st})` : `• ${os} (${st})`;
}

export function formatDhlPeriodApprovalBlockMessage(
  unapproved: Array<{
    os_number?: string | null;
    id?: string | null;
    dhl_se_number?: string | null;
    seNumber?: string | null;
    status?: string | null;
    missionStatus?: string | null;
  }>,
): string {
  const lista = unapproved.slice(0, 15).map(formatDhlUnapprovedOsLine).join('\n');
  const extra = unapproved.length > 15 ? `\n…e mais ${unapproved.length - 15} OS.` : '';
  return (
    `Não é possível gerar a planilha do período: existem ${unapproved.length} OS ainda sem APROVADA/APROVADO.\n\n` +
    `Aprove todas as OS do período no faturamento antes de gerar:\n${lista}${extra}`
  );
}
