/**
 * Regras de retenção de system_logs.
 * Dados de negócio (patrimônio, equipamentos por usuário, etc.) NUNCA entram na rotação.
 */

/** Entidades cujo registro em system_logs é dado persistente — não apagar na limpeza. */
export const PROTECTED_SYSTEM_LOG_ENTITIES = [
  'EquipmentRegistry',
  'UserEquipment',
  'SystemSetting',
  'BillingSnapshot',
  'ClientContract',
  'CostOptimization',
  'BankStatement',
  'Quote',
  'ProviderAutoMaster',
  'ProviderCostTable',
  'Profile',
  'VendorVerification',
  'VendorControl',
  'DhlIntake',
] as const;

/** Tipos de ação que são apenas rastro de acesso/ruído — seguros para rotação. */
export const ROTATABLE_SYSTEM_LOG_ACTION_TYPES = [
  'HEARTBEAT',
  'LOGIN',
  'LOGOUT',
  'OTHER',
] as const;

export type RotatableActionType = (typeof ROTATABLE_SYSTEM_LOG_ACTION_TYPES)[number];

/** Filtro Supabase: apenas logs de rastro elegíveis para exclusão por idade. */
export function applyRotatableLogFilter<T extends { in: (col: string, vals: readonly string[]) => T }>(
  query: T,
): T {
  return query.in('action_type', [...ROTATABLE_SYSTEM_LOG_ACTION_TYPES]);
}
