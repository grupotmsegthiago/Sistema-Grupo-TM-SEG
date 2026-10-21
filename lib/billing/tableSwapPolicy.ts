import { isIntentionalBillingOverride } from '../financialUtils';
import { carimboAprovacaoHumana } from '../missionSnapshot';

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
 * Conferida, aprovada ou com motivo de edição manual: o motor não reescreve o valor.
 * Número gravado sem esse motivo acompanha a tabela que está na tela.
 * A troca para uma tabela diferente atualiza a tela à parte; o banco só muda no Salvar.
 */
export function hasPersistedBillingFreeze(mission: BillingFreezeMission): boolean {
  if (!mission) return false;
  if (mission.billing_approved || carimboAprovacaoHumana(mission.snapshot_approved_by) || mission.billing_verified_by) return true;
  if (isIntentionalBillingOverride(mission.revenue_edit_reason)) return true;
  if (isIntentionalBillingOverride(mission.cost_edit_reason)) return true;
  return false;
}
