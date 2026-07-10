/**
 * Registro de transferências Asaas aguardando aprovação via webhook.
 * Memória (mesma instância) + system_logs (entre funções Vercel).
 */

import { createSupabaseAdminClient } from '../supabaseAdmin.js';

const MEMORY_TTL_MS = 20 * 60 * 1000;
const ACTION_TYPE = 'asaas_pending_transfer';

type GlobalPending = Map<string, number>;

function memoryStore(): GlobalPending {
  const g = globalThis as typeof globalThis & { __asaasPendingTransfers?: GlobalPending };
  if (!g.__asaasPendingTransfers) g.__asaasPendingTransfers = new Map();
  return g.__asaasPendingTransfers;
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [id, expiresAt] of memoryStore()) {
    if (expiresAt <= now) memoryStore().delete(id);
  }
}

export function rememberPendingTransferInMemory(transferId: string): void {
  const id = String(transferId || '').trim();
  if (!id) return;
  pruneMemory();
  memoryStore().set(id, Date.now() + MEMORY_TTL_MS);
}

export function isPendingTransferInMemory(transferId: string): boolean {
  const id = String(transferId || '').trim();
  if (!id) return false;
  pruneMemory();
  const expiresAt = memoryStore().get(id);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    memoryStore().delete(id);
    return false;
  }
  return true;
}

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
    const sb = createSupabaseAdminClient();
    if (!sb) return;

    await sb.from('system_logs').insert({
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
