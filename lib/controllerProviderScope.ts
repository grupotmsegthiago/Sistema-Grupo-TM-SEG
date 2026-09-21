/**
 * Escopo financeiro do perfil `controller` (ex.: Plínio):
 * - leitura/escrita no lado FORNECEDOR (custo, pedágio fornecedor, deslocamento, motivo)
 * - pedágio do CLIENTE liberado no botão laranja Confirmar Pedágio / Salvar da auditoria
 * - bloqueio de receita, deslocamento cliente e aprovação de faturamento
 */

export type ProviderOnlySaveInput = {
  costValue: number;
  tollValue?: number;
  tollValueProvider: number;
  displacementValueProvider: number;
  costEditReason?: string | null;
  lastUpdate?: string;
};

/** Pedágio do fornecedor a persistir — nunca herda o pedágio do cliente. */
export function providerTollToPersist(parsedProviderInput: number, isSameOs: boolean): number {
  if (isSameOs) return 0;
  const n = Number(parsedProviderInput);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Payload mínimo e seguro para UPDATE de missions pelo controller/Plínio. */
export function buildProviderOnlyMissionPayload(input: ProviderOnlySaveInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    cost_value: Number(input.costValue) || 0,
    toll_value_provider: Number(input.tollValueProvider) || 0,
    displacement_value_provider: Number(input.displacementValueProvider) || 0,
    last_update: input.lastUpdate || new Date().toISOString(),
  };
  if (input.tollValue != null) {
    payload.toll_value = Number(input.tollValue) || 0;
  }
  const reason = String(input.costEditReason || '').trim();
  if (reason) {
    // Nunca enviar null — constraints históricas rejeitam null em motivos.
    payload.cost_edit_reason = reason;
  }
  return payload;
}

/**
 * Em OS já aprovada, o modal exige "observação da alteração".
 * Para ajuste só de fornecedor, o motivo do custo JÁ é a justificativa oficial.
 */
export function resolveProviderSaveObservation(opts: {
  editObservation?: string | null;
  costEditReason?: string | null;
  providerOnlySave: boolean;
}): { ok: boolean; observation: string } {
  const observation = String(opts.editObservation || '').trim();
  if (observation) return { ok: true, observation };
  const costReason = String(opts.costEditReason || '').trim();
  if (opts.providerOnlySave && costReason) {
    return { ok: true, observation: costReason };
  }
  return { ok: false, observation: '' };
}

/** Campos do lado cliente que o controller/Plínio não deve mutar (pedágio cliente é exceção da auditoria). */
export const CLIENT_SIDE_MISSION_FIELDS = [
  'revenue_value',
  'displacement_value',
  'revenue_edit_reason',
  'billing_approved',
  'billing_verified_by',
  'snapshot_data',
  'snapshot_approved_by',
  'snapshot_approved_at',
] as const;

export function assertProviderOnlyPayload(payload: Record<string, unknown>): string[] {
  return CLIENT_SIDE_MISSION_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
}
