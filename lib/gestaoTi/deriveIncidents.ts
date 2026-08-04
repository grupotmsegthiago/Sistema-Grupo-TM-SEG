import type { CatalogSnapshot, DerivedIncident, HealthCheckResult, SsotEntry } from './types.js';
import { sanitizeForDisplay } from './sanitize.js';

/**
 * Incidentes derivados em memória (Fase 2) — sem persistência em tabelas inadequadas.
 */
export function deriveIncidentsFromCatalogAndHealth(
  catalog: CatalogSnapshot,
  health: HealthCheckResult[],
): DerivedIncident[] {
  const now = new Date().toISOString();
  const incidents: DerivedIncident[] = [];

  for (const h of health) {
    if (h.tone === 'red') {
      incidents.push({
        code: `INC-HC-${h.id.toUpperCase()}`,
        title: `Health check com falha: ${h.label}`,
        severity: h.moduleId === 'mod-asaas' || h.moduleId === 'mod-infra' ? 'P1' : 'P2',
        moduleId: h.moduleId,
        evidence: sanitizeForDisplay(`${h.path} → HTTP ${h.statusCode ?? 'n/a'} | ${h.summary}`),
        firstSeenAt: h.checkedAt,
        lastSeenAt: h.checkedAt,
        count: 1,
        state: 'aberto',
        impact: 'Integração ou disponibilidade degradada conforme health check existente.',
      });
    } else if (h.tone === 'yellow') {
      incidents.push({
        code: `INC-HC-WARN-${h.id.toUpperCase()}`,
        title: `Health check inconclusivo: ${h.label}`,
        severity: 'P3',
        moduleId: h.moduleId,
        evidence: sanitizeForDisplay(`${h.path} | retries=${h.retries} | ${h.summary}`),
        firstSeenAt: h.checkedAt,
        lastSeenAt: h.checkedAt,
        count: 1,
        state: 'observado',
        impact: 'Não classificado como falha definitiva; requer nova verificação.',
      });
    }
  }

  for (const s of catalog.ssot.filter((x: SsotEntry) => x.state === 'duplicado')) {
    incidents.push({
      code: `INC-SSOT-${s.id.toUpperCase()}`,
      title: `Possível violação de fonte única da verdade: ${s.dataLabel}`,
      severity: s.divergenceRisk === 'alto' ? 'P1' : 'P2',
      moduleId: 'mod-faturamento',
      evidence: sanitizeForDisplay(s.evidence.join(' | ')),
      firstSeenAt: catalog.generatedAt,
      lastSeenAt: now,
      count: 1,
      state: 'observado',
      impact:
        'Telas/escritores distintos podem divergir nos totais. Fase 2 apenas documenta — sem correção automática.',
    });
  }

  for (const m of catalog.modules.filter((x) => x.monitoringStatus === 'unmonitored')) {
    incidents.push({
      code: `INC-MON-${m.id.toUpperCase()}`,
      title: `Módulo sem monitoramento contínuo: ${m.name}`,
      severity: 'P4',
      moduleId: m.id,
      evidence: sanitizeForDisplay(m.evidence.join(' | ')),
      firstSeenAt: catalog.generatedAt,
      lastSeenAt: now,
      count: 1,
      state: 'observado',
      impact: 'Falhas podem passar despercebidas até relato manual.',
    });
  }

  return incidents;
}
