/**
 * Regras de apresentação do Gestor (Fase 2 — correção de homologação).
 * Contadores, tons de saúde e textos em português — sem alterar integrações.
 */

import { listCriticalConnections } from './catalog/index.js';
import { maskZapiInstanceIds, sanitizeDeep, sanitizeForDisplay, sanitizeLogText } from './sanitize.js';
import type {
  DerivedIncident,
  HealthCheckResult,
  HealthTone,
  IncidentSeverity,
  MonitoringStatus,
} from './types.js';

export const GESTAO_TI_SEVERITIES: IncidentSeverity[] = ['P0', 'P1', 'P2', 'P3', 'P4'];

export type IncidentSeverityCounts = Record<IncidentSeverity, number>;

/** Módulos cujo health vermelho justifica “Falha” na saúde geral. */
const CRITICAL_HEALTH_MODULE_IDS = new Set([
  'mod-infra',
  'mod-asaas',
  'mod-whatsapp',
  'mod-email',
  'mod-plugnotas',
]);

export function countIncidentsBySeverity(incidents: DerivedIncident[]): IncidentSeverityCounts {
  const counts: IncidentSeverityCounts = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const incident of incidents) {
    if (counts[incident.severity] !== undefined) {
      counts[incident.severity] += 1;
    }
  }
  return counts;
}

/** Incidentes abertos totais (mesma coleção da Central). */
export function countOpenIncidents(incidents: DerivedIncident[]): number {
  return incidents.filter((i) => i.state === 'aberto').length;
}

/** Conexões estruturais de alta criticidade (catálogo) — não confundir com severidade de incidente. */
export function countCriticalConnections(): number {
  return listCriticalConnections('p1').length;
}

export function formatSeverityDistribution(counts: IncidentSeverityCounts): string {
  return GESTAO_TI_SEVERITIES.map((s) => `${s}: ${counts[s]}`).join(' · ');
}

/** Contador exibido deve bater com a quantidade filtrada na Central. */
export function incidentCounterMatchesCollection(
  displayedTotal: number,
  incidents: DerivedIncident[],
  filter: (i: DerivedIncident) => boolean = () => true,
): boolean {
  return displayedTotal === incidents.filter(filter).length;
}

export function healthToneLabelPt(tone: HealthTone): string {
  switch (tone) {
    case 'green':
      return 'Saudável confirmado';
    case 'yellow':
      return 'Atenção / inconclusivo';
    case 'red':
      return 'Falha confirmada';
    case 'blue':
      return 'Estrutural';
    case 'gray':
    default:
      return 'Sem monitoramento';
  }
}

export function monitoringStatusLabelPt(status: MonitoringStatus | string): string {
  const map: Record<string, string> = {
    monitored: 'monitorado',
    partial: 'parcial',
    unmonitored: 'sem monitoramento',
    structural: 'estrutural',
    healthy: 'saudável',
    degraded: 'degradado',
    down: 'indisponível',
    unknown: 'desconhecido',
  };
  return map[status] || status;
}

export function incidentStateLabelPt(state: string): string {
  const map: Record<string, string> = {
    aberto: 'aberto',
    investigando: 'investigando',
    resolvido: 'resolvido',
    observado: 'observado',
  };
  return map[state] || state;
}

export function connectionTypeLabelPt(type: string): string {
  const map: Record<string, string> = {
    reads: 'leitura',
    writes: 'escrita',
    calculates: 'cálculo',
    aggregates: 'agregação',
    triggers: 'disparo',
    integrates: 'integração',
    audits: 'auditoria',
    caches: 'cache',
    notifies: 'notificação',
  };
  return map[type] || type;
}

export type OverallHealthPresentation = {
  tone: HealthTone;
  label: string;
  explanation: string;
};

function isCriticalHealthModule(moduleId: string | null | undefined): boolean {
  if (!moduleId) return false;
  return CRITICAL_HEALTH_MODULE_IDS.has(moduleId);
}

/**
 * Saúde geral:
 * - Falha somente com falha confirmada (vermelho) em componente crítico;
 * - Só timeout/inconclusivo → Atenção;
 * - Sem checks monitorados → cinza.
 */
export function deriveOverallHealthPresentation(results: HealthCheckResult[]): OverallHealthPresentation {
  const monitored = (results || []).filter((c) => c.tone !== 'gray' && c.tone !== 'blue');
  if (monitored.length === 0) {
    return {
      tone: 'gray',
      label: 'Sem monitoramento',
      explanation: 'Nenhuma verificação ativa neste ciclo.',
    };
  }

  const confirmedFailures = monitored.filter((c) => c.tone === 'red');
  const criticalFailures = confirmedFailures.filter((c) => isCriticalHealthModule(c.moduleId));
  const timeouts = monitored.filter(
    (c) =>
      c.tone === 'yellow' &&
      /timeout|inconclusiv|falha de rede|aborted|AbortError/i.test(`${c.summary || ''}`),
  );
  const yellowOther = monitored.filter((c) => c.tone === 'yellow' && !timeouts.includes(c));

  if (criticalFailures.length > 0) {
    const parts: string[] = [
      `Falha confirmada em ${criticalFailures.length} verificação${criticalFailures.length === 1 ? '' : 'ões'}.`,
    ];
    if (timeouts.length > 0) {
      parts.push(`Outras ${timeouts.length} estão inconclusivas por timeout.`);
    } else if (yellowOther.length > 0) {
      parts.push(`${yellowOther.length} verificação(ões) em atenção.`);
    }
    return {
      tone: 'red',
      label: 'Falha',
      explanation: parts.join(' '),
    };
  }

  if (confirmedFailures.length > 0) {
    const parts: string[] = [
      `Falha confirmada em ${confirmedFailures.length} verificação${confirmedFailures.length === 1 ? '' : 'ões'} (módulo não crítico para o indicador geral).`,
    ];
    if (timeouts.length > 0) {
      parts.push(`Outras ${timeouts.length} estão inconclusivas por timeout.`);
    }
    return {
      tone: 'yellow',
      label: 'Atenção',
      explanation: parts.join(' '),
    };
  }

  if (timeouts.length > 0 || yellowOther.length > 0) {
    const parts: string[] = [];
    if (timeouts.length > 0) {
      parts.push(
        `Nenhuma falha confirmada em componente crítico. ${timeouts.length} verificação${timeouts.length === 1 ? '' : 'ões'} inconclusiva${timeouts.length === 1 ? '' : 's'} por timeout.`,
      );
    }
    if (yellowOther.length > 0) {
      parts.push(`${yellowOther.length} verificação(ões) em atenção.`);
    }
    return {
      tone: 'yellow',
      label: 'Atenção',
      explanation: parts.join(' '),
    };
  }

  return {
    tone: 'green',
    label: 'Saudável',
    explanation: 'Todas as verificações monitoradas responderam sem falha confirmada.',
  };
}

export type HealthCheckSummaryView = {
  estado: string;
  endpoint: string;
  http: string;
  tempoMs: number | null;
  retryCount: number;
  mensagemPrincipal: string;
  diagnosticoResumido: string;
  ultimaVerificacao: string;
  detalhesTecnicos: string;
};

function buildDiagnosticoFromSummary(summary: string): string {
  const cleaned = maskZapiInstanceIds(sanitizeForDisplay(summary || ''));
  try {
    const parsed = JSON.parse(summary) as Record<string, unknown>;
    const bits: string[] = [];
    if (parsed.reachable === true) bits.push('API alcançável');
    if (parsed.reachable === false) bits.push('API não alcançável');
    if (parsed.connected === false) bits.push('instância desconectada');
    if (parsed.connected === true) bits.push('instância conectada');
    if (parsed.timedOut === true || parsed.timeout === true) bits.push('timeout após retry');
    if (parsed.ok === false && typeof parsed.error === 'string') {
      bits.push(maskZapiInstanceIds(sanitizeForDisplay(String(parsed.error))).slice(0, 120));
    }
    if (typeof parsed.message === 'string' && parsed.message) {
      bits.push(maskZapiInstanceIds(sanitizeForDisplay(String(parsed.message))).slice(0, 120));
    }
    if (bits.length) return bits.join('; ');
  } catch {
    // texto livre
  }
  if (/timeout|aborted|AbortError|falha de rede/i.test(cleaned)) {
    return 'timeout após retry — resultado inconclusivo';
  }
  if (/desconect|disconnected/i.test(cleaned)) {
    return 'instância desconectada';
  }
  if (/supabaseConfig|Cannot find module/i.test(cleaned)) {
    return 'módulo ausente no bundle serverless';
  }
  return cleaned.slice(0, 160) || 'sem detalhes adicionais';
}

function sanitizeTechnicalDetail(raw: string): string {
  const trimmed = String(raw || '').slice(0, 2000);
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const cleaned = sanitizeDeep(parsed, 1200);
    return maskZapiInstanceIds(sanitizeLogText(JSON.stringify(cleaned), 1200));
  } catch {
    return maskZapiInstanceIds(sanitizeLogText(trimmed, 1200));
  }
}

export function summarizeHealthCheck(check: HealthCheckResult): HealthCheckSummaryView {
  const detailSource = check.detail || check.summary || '';
  const detalhes = sanitizeTechnicalDetail(detailSource);
  const mensagem = maskZapiInstanceIds(sanitizeForDisplay(check.summary || '—'));

  return {
    estado: healthToneLabelPt(check.tone),
    endpoint: check.path || '—',
    http: check.statusCode != null ? String(check.statusCode) : '—',
    tempoMs: check.latencyMs,
    retryCount: check.retries,
    mensagemPrincipal: mensagem.slice(0, 220),
    diagnosticoResumido: buildDiagnosticoFromSummary(check.summary || ''),
    ultimaVerificacao: check.checkedAt
      ? new Date(check.checkedAt).toLocaleString('pt-BR')
      : '—',
    detalhesTecnicos: detalhes,
  };
}
