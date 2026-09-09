/**
 * Recalcula a SOMA das OS vinculadas em faturas abertas (EMITIDA / VENCIDA).
 * Nunca grava o valor de uma OS isolada na fatura.
 * PAGA / CANCELADA: não altera nada. Asaas/boleto/NF: não toca.
 */
import { supabase } from '../supabase';
import { calcularComissao, roundMoney } from '../comissao/comissaoCalc';
import { resolveStoredClientToll } from '../toll/clientTollBilling';

export type InvoiceSyncClient = {
  from: (table: string) => any;
};

export const FATURA_STATUS_ABERTA = ['EMITIDA', 'VENCIDA'] as const;
export const FATURA_STATUS_CONGELADA = ['PAGA', 'CANCELADA'] as const;

export type ReceitaOsFaturaInput = {
  id?: string | number | null;
  revenue_value?: number | null;
  toll_value?: number | null;
  toll_value_provider?: number | null;
  displacement_value?: number | null;
};

export type SyncFaturaAcao =
  | 'updated'
  | 'skipped_frozen'
  | 'skipped_unchanged'
  | 'skipped_incomplete'
  | 'skipped_unknown_status';

export type SyncFaturaItem = {
  invoiceId: string;
  status: string;
  action: SyncFaturaAcao;
  valorAntigo?: number;
  valorNovo?: number;
};

export type SyncFaturaPorOSResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  invoices?: SyncFaturaItem[];
  error?: string;
};

const MISSION_SELECT =
  'id, revenue_value, toll_value, toll_value_provider, displacement_value';

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === '42703' || /does not exist/i.test(String(error.message || ''));
}

function normStatus(status: string | null | undefined): string {
  return String(status || '').trim().toUpperCase();
}

export function deveSincronizarStatusFatura(status: string | null | undefined): boolean {
  const s = normStatus(status);
  return s === 'EMITIDA' || s === 'VENCIDA';
}

export function statusFaturaCongelado(status: string | null | undefined): boolean {
  const s = normStatus(status);
  return s === 'PAGA' || s === 'CANCELADA';
}

/** Receita faturável persistida da OS: serviço + pedágio cliente + DESL cliente. */
export function receitaOsParaFatura(m: ReceitaOsFaturaInput | null | undefined): number {
  if (!m) return 0;
  const rev = Number(m.revenue_value) || 0;
  const toll = resolveStoredClientToll(m.toll_value, m.toll_value_provider);
  const disp = Math.max(0, Number(m.displacement_value) || 0);
  return roundMoney(rev + toll + disp);
}

export function somarReceitasOs(missions: Array<ReceitaOsFaturaInput | null | undefined> | null | undefined): number {
  return roundMoney((missions || []).reduce((s, m) => s + receitaOsParaFatura(m), 0));
}

export function valoresFaturaEquivalentes(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.009;
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function receivableLooksPaid(status: string | null | undefined): boolean {
  const s = normStatus(status);
  return s === 'PAID' || s === 'PAGO' || s === 'RECEBIDO' || s === 'SETTLED' || s === 'RECEIVED';
}

async function fetchMissionsByIds(
  sb: InvoiceSyncClient,
  ids: string[],
): Promise<{ data: ReceitaOsFaturaInput[]; error: { message?: string; code?: string } | null }> {
  const out: ReceitaOsFaturaInput[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await sb
      .from('missions')
      .select(MISSION_SELECT)
      .in('id', chunk);
    if (error) return { data: [], error };
    out.push(...((data || []) as ReceitaOsFaturaInput[]));
  }
  return { data: out, error: null };
}

async function atualizarContasAReceber(
  sb: InvoiceSyncClient,
  invoice: { number?: string | null; asaas_payment_id?: string | null },
  novoTotal: number,
): Promise<void> {
  const number = String(invoice.number || '').trim();
  const payId = String(invoice.asaas_payment_id || '').trim();
  const parts: string[] = [];
  if (number) parts.push(`notes.ilike.%Fatura ${escapeIlike(number)}%`);
  if (payId) parts.push(`notes.ilike.%${escapeIlike(payId)}%`);
  if (parts.length === 0) return;

  const { data, error } = await sb
    .from('financial_transactions')
    .select('id, amount, amount_open, amount_paid, status, notes, type')
    .eq('type', 'INCOME')
    .or(parts.join(','));

  if (error) {
    if (isMissingRelation(error)) return;
    console.warn('[BILLING_SYNC_OPEN_INVOICE] Contas a Receber não atualizado:', error.message);
    return;
  }

  for (const tx of data || []) {
    if (receivableLooksPaid(tx.status)) continue;
    const paid = Number(tx.amount_paid) || 0;
    const patch: Record<string, number> = { amount: novoTotal };
    patch.amount_open = paid <= 0 ? novoTotal : roundMoney(Math.max(0, novoTotal - paid));
    const { error: upErr } = await sb.from('financial_transactions').update(patch).eq('id', tx.id);
    if (upErr && isMissingRelation(upErr)) {
      const { error: retryErr } = await sb
        .from('financial_transactions')
        .update({ amount: novoTotal })
        .eq('id', tx.id);
      if (retryErr) {
        console.warn('[BILLING_SYNC_OPEN_INVOICE] CR amount falhou:', retryErr.message);
      }
    } else if (upErr) {
      console.warn('[BILLING_SYNC_OPEN_INVOICE] CR update falhou:', upErr.message);
    }
  }
}

async function atualizarComissaoAberta(
  sb: InvoiceSyncClient,
  invoiceId: string,
  novoTotal: number,
): Promise<void> {
  const { data, error } = await sb
    .from('comissoes')
    .select('id, percentual_imposto_aplicado, percentual_comissao_aplicado, status')
    .or(`fatura_id.eq.${invoiceId},origem_fatura_id.eq.${invoiceId}`)
    .eq('status', 'AGUARDANDO_PAGAMENTO_CLIENTE');

  if (error) {
    if (isMissingRelation(error)) return;
    console.warn('[BILLING_SYNC_OPEN_INVOICE] comissão não atualizada:', error.message);
    return;
  }

  for (const row of data || []) {
    const calc = calcularComissao(
      novoTotal,
      Number(row.percentual_imposto_aplicado),
      Number(row.percentual_comissao_aplicado),
    );
    const { error: upErr } = await sb
      .from('comissoes')
      .update({
        valor_faturamento: calc.valorFaturamento,
        valor_base_liquida: calc.valorBaseLiquida,
        valor_comissao: calc.valorComissao,
      })
      .eq('id', row.id)
      .eq('status', 'AGUARDANDO_PAGAMENTO_CLIENTE');
    if (upErr) {
      console.warn('[BILLING_SYNC_OPEN_INVOICE] comissão update falhou:', upErr.message);
    }
  }
}

async function registrarLogSync(
  sb: InvoiceSyncClient,
  args: {
    invoiceId: string;
    missionId: string;
    valorAntigo: number;
    valorNovo: number;
    missionIds: string[];
    userName?: string;
  },
): Promise<void> {
  try {
    const { error } = await sb.from('system_logs').insert([{
      user_name: args.userName || 'Sistema',
      action_type: 'BILLING_SYNC_OPEN_INVOICE',
      entity: 'Invoice',
      entity_id: args.invoiceId,
      details: JSON.stringify({
        invoiceId: args.invoiceId,
        missionId: args.missionId,
        missionIds: args.missionIds,
        valorAntigo: args.valorAntigo,
        valorNovo: args.valorNovo,
      }),
    }]);
    if (error) {
      console.warn('[BILLING_SYNC_OPEN_INVOICE] log falhou:', error.message);
    }
  } catch (e) {
    console.warn('[BILLING_SYNC_OPEN_INVOICE] log falhou:', e);
  }
}

async function sincronizarUmaFatura(
  sb: InvoiceSyncClient,
  invoice: { id: string; status?: string | null; amount?: number | null; number?: string | null; asaas_payment_id?: string | null },
  triggerMissionId: string,
  userName?: string,
): Promise<SyncFaturaItem> {
  const invoiceId = String(invoice.id);
  const status = normStatus(invoice.status);

  if (statusFaturaCongelado(status)) {
    return { invoiceId, status, action: 'skipped_frozen' };
  }
  if (!deveSincronizarStatusFatura(status)) {
    return { invoiceId, status, action: 'skipped_unknown_status' };
  }

  const { data: vinculos, error: vinculoErr } = await sb
    .from('financial_invoice_missions')
    .select('mission_id')
    .eq('invoice_id', invoiceId);

  if (vinculoErr) {
    throw new Error(vinculoErr.message || 'Falha ao listar OS da fatura');
  }

  const missionIds = [...new Set((vinculos || [])
    .map((v: { mission_id?: string }) => String(v.mission_id || '').trim())
    .filter(Boolean))];

  if (missionIds.length === 0) {
    return { invoiceId, status, action: 'skipped_incomplete', valorAntigo: Number(invoice.amount) || 0 };
  }

  const { data: missions, error: missErr } = await fetchMissionsByIds(sb, missionIds);
  if (missErr) {
    throw new Error(missErr.message || 'Falha ao consultar OS da fatura');
  }

  const foundIds = new Set(missions.map((m) => String(m.id || '').trim()).filter(Boolean));
  if (foundIds.size !== missionIds.length) {
    console.warn('[BILLING_SYNC_OPEN_INVOICE] consulta incompleta — fatura não atualizada', {
      invoiceId,
      esperadas: missionIds.length,
      encontradas: foundIds.size,
    });
    return {
      invoiceId,
      status,
      action: 'skipped_incomplete',
      valorAntigo: Number(invoice.amount) || 0,
    };
  }

  const valorAntigo = roundMoney(Number(invoice.amount) || 0);
  const valorNovo = somarReceitasOs(missions);
  if (valoresFaturaEquivalentes(valorAntigo, valorNovo)) {
    return { invoiceId, status, action: 'skipped_unchanged', valorAntigo, valorNovo };
  }

  const { data: updated, error: invErr } = await sb
    .from('financial_invoices')
    .update({ amount: valorNovo })
    .eq('id', invoiceId)
    .in('status', [...FATURA_STATUS_ABERTA])
    .select('id');

  if (invErr) {
    throw new Error(invErr.message || 'Falha ao atualizar valor da fatura');
  }
  if (!updated?.length) {
    return { invoiceId, status, action: 'skipped_frozen', valorAntigo, valorNovo };
  }

  await atualizarContasAReceber(sb, invoice, valorNovo);
  await atualizarComissaoAberta(sb, invoiceId, valorNovo);
  await registrarLogSync(sb, {
    invoiceId,
    missionId: triggerMissionId,
    valorAntigo,
    valorNovo,
    missionIds,
    userName,
  });

  return { invoiceId, status, action: 'updated', valorAntigo, valorNovo };
}

export async function sincronizarFaturaPorOS(
  missionId: string,
  opts?: { sb?: InvoiceSyncClient; userName?: string },
): Promise<SyncFaturaPorOSResult> {
  const id = String(missionId || '').trim();
  if (!id) return { ok: true, skipped: true, reason: 'missionId vazio' };

  const sb = opts?.sb || supabase;

  try {
    const { data: vinculos, error } = await sb
      .from('financial_invoice_missions')
      .select('invoice_id')
      .eq('mission_id', id);

    if (error) {
      if (isMissingRelation(error)) {
        return { ok: true, skipped: true, reason: 'tabela_vinculo_ausente' };
      }
      return { ok: false, error: error.message };
    }

    const invoiceIds = [...new Set((vinculos || [])
      .map((v: { invoice_id?: string }) => String(v.invoice_id || '').trim())
      .filter(Boolean))];

    if (invoiceIds.length === 0) {
      return { ok: true, skipped: true, reason: 'sem_vinculo' };
    }

    const { data: faturas, error: fatErr } = await sb
      .from('financial_invoices')
      .select('id, status, amount, number, asaas_payment_id')
      .in('id', invoiceIds);

    if (fatErr) {
      return { ok: false, error: fatErr.message };
    }

    const invoices: SyncFaturaItem[] = [];
    for (const fatura of faturas || []) {
      invoices.push(await sincronizarUmaFatura(sb, fatura, id, opts?.userName));
    }

    return { ok: true, invoices };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[BILLING_SYNC_OPEN_INVOICE]', message);
    return { ok: false, error: message };
  }
}

/** Fail-soft para a UI: a OS já foi gravada; falha de rede só vai ao console. */
export function dispararSyncFaturaPorOS(missionId: string, userName?: string): void {
  const id = String(missionId || '').trim();
  if (!id) return;
  void sincronizarFaturaPorOS(id, { userName }).catch((err) => {
    console.warn('[BILLING_SYNC_OPEN_INVOICE] falha fail-soft (OS já gravada):', err);
  });
}
