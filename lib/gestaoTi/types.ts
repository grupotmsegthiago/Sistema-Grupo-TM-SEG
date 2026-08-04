/** Tipos do Gestor de Desenvolvimento — Fase 2 (somente leitura / catálogo). */

export type CatalogCriticality = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

export type MonitoringStatus =
  | 'monitored'
  | 'partial'
  | 'unmonitored'
  | 'structural';

export type ConnectionType =
  | 'reads'
  | 'writes'
  | 'calculates'
  | 'aggregates'
  | 'triggers'
  | 'integrates'
  | 'audits'
  | 'caches'
  | 'notifies';

export type SsotState = 'confirmado' | 'parcial' | 'duplicado' | 'desconhecido';

export type HealthTone = 'green' | 'yellow' | 'red' | 'gray' | 'blue';

export type IncidentSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface CatalogModule {
  id: string;
  name: string;
  domain: string;
  screens: string[];
  tables: string[];
  endpoints: string[];
  integrations: string[];
  jobs: string[];
  monitoringStatus: MonitoringStatus;
  evidence: string[];
  notes?: string;
}

export interface CatalogConnection {
  id: string;
  origin: string;
  destination: string;
  type: ConnectionType;
  rule: string;
  officialSource: string;
  criticality: CatalogCriticality;
  monitoringStatus: MonitoringStatus;
  evidence: string[];
  writers?: string[];
  readers?: string[];
  cache?: string | null;
  updatedAt: string;
}

export interface SsotEntry {
  id: string;
  dataLabel: string;
  officialSource: string;
  writers: string[];
  readers: string[];
  recalculators: string[];
  fallbacks: string[];
  divergenceRisk: 'alto' | 'medio' | 'baixo';
  state: SsotState;
  evidence: string[];
}

export interface HealthEndpointDef {
  id: string;
  label: string;
  path: string;
  moduleId: string;
  /** Auth necessária? (Bearer) */
  requiresAuth?: boolean;
}

export interface HealthCheckResult {
  id: string;
  label: string;
  path: string;
  moduleId: string;
  tone: HealthTone;
  ok: boolean | null;
  statusCode: number | null;
  latencyMs: number | null;
  summary: string;
  checkedAt: string;
  retries: number;
}

export interface DerivedIncident {
  code: string;
  title: string;
  severity: IncidentSeverity;
  moduleId: string;
  evidence: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  state: 'aberto' | 'observado';
  impact: string;
}

export interface CatalogSnapshot {
  version: string;
  generatedAt: string;
  modules: CatalogModule[];
  connections: CatalogConnection[];
  ssot: SsotEntry[];
  healthEndpoints: HealthEndpointDef[];
}
