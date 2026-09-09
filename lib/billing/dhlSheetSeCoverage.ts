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
