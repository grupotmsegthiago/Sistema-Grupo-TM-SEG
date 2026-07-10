/**
 * Registro de transferências pendentes — usado apenas em rotas pesadas (transfer-pix).
 * O webhook NÃO importa este módulo (evita FUNCTION_INVOCATION_FAILED na Vercel).
 */

import {
  isPendingTransferInMemory,
  rememberPendingTransferInMemory,
} from '../asaasPendingTransferMemory.js';

const ACTION_TYPE = 'asaas_pending_transfer';
const MEMORY_TTL_MS = 20 * 60 * 1000;

export { isPendingTransferInMemory, rememberPendingTransferInMemory };

export async function registerAsaasPendingTransfer(params: {
  transferId: string;
  company: string;
  value: number;
  mode: 'INTERNAL' | 'PIX';
  externalReference: string;
}): Promise<void> {
  const transferId = String(params.transferId || '').trim();
  if (!transferId) return;

  rememberPendingTransferInMemory(transferId);

  try {
    const { createSupabaseAdminClient } = await import('../supabaseAdmin.js');
    const sb = createSupabaseAdminClient();
    if (!sb) return;

    const { error } = await sb.from('system_logs').insert({
      user_name: 'Sistema',
      action_type: ACTION_TYPE,
      entity: 'AsaasTransfer',
      entity_id: transferId,
      details: JSON.stringify({
        company: params.company,
        value: params.value,
        mode: params.mode,
        externalReference: params.externalReference,
        registeredAt: new Date().toISOString(),
      }),
    });

    if (error) {
      console.warn('[asaasPendingTransfer] insert falhou:', error.message);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[asaasPendingTransfer] falha ao registrar:', message);
  }
}

export async function isRegisteredAsaasPendingTransfer(transferId: string): Promise<boolean> {
  const id = String(transferId || '').trim();
  if (!id) return false;

  if (isPendingTransferInMemory(id)) return true;

  try {
    const { createSupabaseAdminClient } = await import('../supabaseAdmin.js');
    const sb = createSupabaseAdminClient();
    if (!sb) return false;

    const since = new Date(Date.now() - MEMORY_TTL_MS).toISOString();
    const { data, error } = await sb
      .from('system_logs')
      .select('id')
      .eq('action_type', ACTION_TYPE)
      .eq('entity_id', id)
      .gte('created_at', since)
      .limit(1);

    if (error) {
      console.warn('[asaasPendingTransfer] consulta falhou:', error.message);
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[asaasPendingTransfer] consulta exceção:', message);
    return false;
  }
}
