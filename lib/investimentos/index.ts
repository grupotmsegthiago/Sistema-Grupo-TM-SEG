export * from './types';
export * from './profileValidation';
export * from './targetReturn';
export { isGestaoInvestimentoSchemaReady, runGestaoInvestimentoMigrations } from './schemaMigrations';
export {
  GESTAO_CACHE_TTL_MS,
  buildDashboardSnapshot,
  readCachedSnapshot,
  refreshAllOwnerCaches,
  refreshOwnerCache,
  type DashboardBriefing,
  type DashboardSnapshot,
} from './dashboardCache';
export {
  buildAllocationScenario,
  type AllocationLine,
  type AllocationScenario,
} from './allocationEngine';
