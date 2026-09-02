import { GESTAO_TI_CATALOG_UPDATED_AT, GESTAO_TI_CATALOG_VERSION } from '../catalogVersion.js';
import type { CatalogSnapshot } from '../types.js';
import { CATALOG_CONNECTIONS } from './connections.js';
import { EXISTING_HEALTH_ENDPOINTS } from './healthEndpoints.js';
import { CATALOG_MODULES } from './modules.js';
import { CATALOG_SSOT } from './ssot.js';

export function getCatalogSnapshot(): CatalogSnapshot {
  return {
    version: GESTAO_TI_CATALOG_VERSION,
    generatedAt: GESTAO_TI_CATALOG_UPDATED_AT,
    modules: CATALOG_MODULES,
    connections: CATALOG_CONNECTIONS,
    ssot: CATALOG_SSOT,
    healthEndpoints: EXISTING_HEALTH_ENDPOINTS,
  };
}

export function listCriticalConnections(min: 'p0' | 'p1' = 'p1') {
  const order = { p0: 0, p1: 1, p2: 2, p3: 3, p4: 4 } as const;
  const max = order[min];
  return CATALOG_CONNECTIONS.filter((c) => order[c.criticality] <= max);
}

export function listDuplicatedSsot() {
  return CATALOG_SSOT.filter((s) => s.state === 'duplicado' || s.state === 'parcial');
}

export function listUnmonitoredModules() {
  return CATALOG_MODULES.filter((m) => m.monitoringStatus === 'unmonitored');
}

export {
  CATALOG_MODULES,
  CATALOG_CONNECTIONS,
  CATALOG_SSOT,
  EXISTING_HEALTH_ENDPOINTS,
};
