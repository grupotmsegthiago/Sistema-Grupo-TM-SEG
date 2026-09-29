/**
 * Liga o Controle de NF ao Contas a Receber.
 * Fatura PAGA marca o título correspondente como pago.
 * O valor (amount) do título não é alterado.
 */
import { createSupabaseAdminClient } from './supabaseAdmin.js';
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Filtro PostgREST: número na observação, no Asaas ou na descrição. */
export function receivableMatchFilter(number: string, asaasPaymentId?: string | null): string {
  const n = String(number || '').replace(/[,()]/g, '').trim();
  const parts = [`notes.ilike.%Fatura ${n}%`, `description.ilike.%${n}%`];
  const pay = String(asaasPaymentId || '').replace(/[,()]/g, '').trim();
  if (pay) parts.push(`notes.ilike.%${pay}%`);
  return parts.join(',');
}

export async function syncPaidInvoicesToReceivables(sb: RpcClient): Promise<number> {
  const { data, error } = await sb.rpc('sincronizar_faturas_pagas_contas_receber');
  if (error) throw new Error(error.message);
  const n = Number(data);
  return Number.isFinite(n) ? n : 0;
}

export async function syncPaidInvoicesToReceivablesNow(): Promise<{ success: true; updated: number }> {
  const sb = createSupabaseAdminClient();
  if (!sb) return { success: true, updated: 0 };
  const updated = await syncPaidInvoicesToReceivables(sb);
  return { success: true, updated };
}
