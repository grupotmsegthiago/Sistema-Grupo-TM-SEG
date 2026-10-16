/**
 * Colunas de missions que a chave anônima não pode ler nem gravar direto.
 * O restante da OS continua operacional (status, rota, KM, hora, fornecedor).
 */

export const COLUNAS_VALOR_OS = [
  'revenue_value',
  'cost_value',
  'toll_value',
  'toll_value_provider',
  'displacement_value',
  'displacement_value_provider',
] as const;

export const COLUNAS_AUDITORIA_OS = [
  'snapshot_data',
  'parametros_edicao_total',
  'revenue_edit_reason',
  'cost_edit_reason',
  'billing_verified_by',
  'snapshot_approved_by',
  'snapshot_approved_at',
] as const;

export const COLUNAS_PROTEGIDAS_OS = [...COLUNAS_VALOR_OS, ...COLUNAS_AUDITORIA_OS] as const;

export const COLUNAS_OPERACIONAIS_OS = [
  'id', 'client', 'provider', 'origin', 'destination', 'vehicle_type', 'client_vehicle',
  'status', 'last_update', 'updated_by', 'created_at', 'agent1', 'agent2',
  'total_distance', 'traveled_distance', 'progress', 'current_location', 'map_link',
  'start_km', 'start_time', 'end_km', 'end_time', 'estimated_time',
  'driver_name', 'driver_phone', 'mission_type', 'vehicle_id', 'client_vehicle_id',
  'gr_espelhamento', 'special_operation_type', 'is_same_os', 'billing_approved',
  'client_vehicle_2', 'driver_name_2', 'driver_phone_2',
  'provider_start_km', 'provider_end_km', 'provider_start_time', 'provider_end_time',
  'provider_ops_edited', 'vendor_os_number', 'invoice_number', 'payment_date',
  'verified_by', 'verified_at', 'release_date', 'mirroring_evidence_url',
  'parent_mission_id', 'email_pending_client', 'email_pending_provider', 'email_message_id',
  'valor_zero_motivo', 'reference_number', 'billing_release', 'billing_period_override',
  'exclude_from_billing', 'dhl_se_number', 'dhl_sm_number', 'dhl_deslocamento_km',
  'dhl_deslocamento_approval_url', 'negative_margin_locked', 'negative_margin_locked_by',
  'negative_margin_locked_at', 'velada_closure_operator', 'velada_closure_opened_at',
  'velada_closure_notified_at', 'velada_closure_escalated_at', 'velada_toll_confirmed',
  'occurrence_count', 'end_trip_evidence_url', 'end_km_evidence_url',
  'end_photo_time_confirmed', 'end_evidence_pending', 'end_evidence_operator',
] as const;

const PROTEGIDAS = new Set<string>(COLUNAS_PROTEGIDAS_OS);

export function reescreverSelectOs(colunas: string | undefined): { sql: string; hidratar: boolean } {
  const texto = String(colunas ?? '*').trim() || '*';
  const partes = texto.split(',').map((parte) => parte.trim()).filter(Boolean);
  if (partes.length === 0 || partes.includes('*')) {
    return { sql: COLUNAS_OPERACIONAIS_OS.join(','), hidratar: true };
  }
  const operacionais = partes.filter((parte) => !ehColunaProtegidaOs(parte));
  const pediuProtegida = partes.some((parte) => ehColunaProtegidaOs(parte));
  if (operacionais.length === 0) operacionais.push('id');
  return { sql: operacionais.join(','), hidratar: pediuProtegida };
}

export function ehColunaProtegidaOs(coluna: string): boolean {
  const nome = String(coluna || '').trim().split(/[!(:]/)[0]?.trim() || '';
  return PROTEGIDAS.has(nome);
}

/** Lado cliente que o Controller não grava. O pedágio do cliente fica de fora desta lista de propósito. */
export const COLUNAS_VALOR_CLIENTE_BLOQUEADAS_CONTROLLER = [
  'revenue_value',
  'displacement_value',
] as const;
