import { isIntentionalBillingOverride } from '../financialUtils';

/**
 * O número grande só é refeito quando a tabela aplicada muda de fato.
 * Reselecionar a mesma tabela (ex.: 100 km de novo) mantém o valor salvo.
 */
export function shouldRecalcOnTableChange(
  currentId: string | null | undefined,
  nextId: string | null | undefined,
): boolean {
  return String(currentId || '') !== String(nextId || '');
}

type BillingFreezeMission = {
  revenue_value?: number | null;
  cost_value?: number | null;
  billing_verified_by?: string | null;
  billing_approved?: boolean | null;
  snapshot_approved_by?: string | null;
  revenue_edit_reason?: string | null;
  cost_edit_reason?: string | null;
} | null | undefined;

/**
 * Depois de Salvar, conferir ou aprovar, o motor não pode reescrever o valor.
 * A troca para uma tabela diferente atualiza a tela à parte; o banco só muda no Salvar.
 */
export function hasPersistedBillingFreeze(mission: BillingFreezeMission): boolean {
  if (!mission) return false;
  if (mission.billing_approved || mission.snapshot_approved_by || mission.billing_verified_by) return true;
  if (isIntentionalBillingOverride(mission.revenue_edit_reason)) return true;
  if (isIntentionalBillingOverride(mission.cost_edit_reason)) return true;
  if (Number(mission.revenue_value) > 0 || Number(mission.cost_value) > 0) return true;
  return false;
}
