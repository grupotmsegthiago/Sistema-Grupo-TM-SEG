/**
 * Persiste antecipação: baixa os títulos vinculados, cria ressalva (+15 dias)
 * e dispara e-mail ao financeiro quando houver saldo a receber.
 */

import { supabase } from '../supabase';
import { authFetch } from '../authFetch';
import type { FinancialTransaction } from '../../types';
import { fetchAllPages } from '../supabasePaging';
import { getTransactionOpenAmount } from './partialPayments';
import { addPaymentToTransaction } from './receivablePaymentsClient';
import {
  ANTICIPATION_MARKER,
  buildAnticipationNotes,
  buildAnticipationPlan,
  buildResidualAnticipationDescription,
  buildResidualAnticipationNotes,
  extractInvoiceRefs,
  formatBrl,
  type AnticipationManualFields,
  type AnticipationPlan,
} from './paymentAnticipation';

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === '42703' || /column/i.test(msg);
}

function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === '42P01' || /does not exist|PGRST205/i.test(msg);
}

export type AnticipationLinkable = {
  id: string;
  description: string;
  amount: number;
  amount_open?: number | null;
  amount_paid?: number | null;
  status?: string | null;
  notes?: string | null;
  entity_name?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  payment_method?: string | null;
  due_date?: string | null;
};

export type SaveAnticipationParams = {
  fields: AnticipationManualFields;
  titles: AnticipationLinkable[];
  createdBy: string;
};

export type SaveAnticipationResult = {
  anticipationId: string;
  plan: AnticipationPlan;
  updatedIds: string[];
  residual: FinancialTransaction | null;
  invoiceIds: string[];
  emailSent: boolean;
  emailError?: string;
};

function linkedSummary(titles: AnticipationLinkable[]): string {
  return titles
    .map((t) => {
      const refs = extractInvoiceRefs(`${t.description} ${t.notes || ''}`);
      const nf = refs[0] ? `NF ${refs[0]}` : t.description.slice(0, 80);
      return `${nf} (${formatBrl(getTransactionOpenAmount(t))})`;
    })
    .join(' · ');
}

async function findMatchingInvoices(title: AnticipationLinkable): Promise<string[]> {
  const refs = extractInvoiceRefs(`${title.description} ${title.notes || ''}`);
  const ids = new Set<string>();

  if (refs.length > 0) {
    const orFilter = refs
      .slice(0, 8)
      .map((r) => `number.eq.${r},nf_number.eq.${r}`)
      .join(',');
    const { rows } = await fetchAllPages<{ id: string }>(async (from, size) => {
      const q = supabase
        .from('financial_invoices')
        .select('id')
        .or(orFilter)
        .neq('status', 'CANCELADA')
        .range(from, from + size - 1);
      const { data, error } = await q;
      return { data: data as { id: string }[] | null, error };
    }, 200, 2000);
    for (const row of rows) ids.add(row.id);
  }

  if (ids.size === 0 && title.entity_name && title.amount) {
    const { data } = await supabase
      .from('financial_invoices')
      .select('id')
      .ilike('client', `%${title.entity_name}%`)
      .eq('amount', title.amount)
      .eq('status', 'EMITIDA');
    for (const row of data || []) ids.add(row.id);
  }

  return Array.from(ids);
}

export async function savePaymentAnticipation(
  params: SaveAnticipationParams,
): Promise<SaveAnticipationResult> {
  const openTitles = params.titles.filter((t) => getTransactionOpenAmount(t) > 0.009);
  if (openTitles.length === 0) {
    throw new Error('Selecione ao menos um título em aberto para vincular à antecipação.');
  }

  const plan = buildAnticipationPlan({
    ...params.fields,
    linkedAmounts: openTitles.map((t) => getTransactionOpenAmount(t)),
  });
  if (plan.saldoTotal <= 0.009) {
    throw new Error('O saldo total das notas vinculadas precisa ser maior que zero.');
  }

  const summary = linkedSummary(openTitles);
  const entityName =
    openTitles.find((t) => t.entity_name)?.entity_name ||
    openTitles[0]?.entity_name ||
    'Cliente';

  const anticipationInsert = {
    nf_number: params.fields.nfNumber || '',
    operation_date: params.fields.operationDate,
    average_rate_pct: params.fields.averageRatePct,
    net_anticipated: params.fields.netAnticipated,
    offered_amount: params.fields.offeredAmount,
    title_id: params.fields.titleId || '',
    item_id: params.fields.itemId || '',
    payment_date: params.fields.paymentDate,
    saldo_total: plan.saldoTotal,
    juros: plan.juros,
    valor_liquido: plan.valorLiquido,
    residual: plan.residual,
    residual_due_date: plan.residualDueDate || null,
    settlement: plan.settlement,
    entity_name: entityName,
    notes: summary,
    created_by: params.createdBy,
  };

  const { data: antRow, error: antErr } = await supabase
    .from('payment_anticipations')
    .insert(anticipationInsert)
    .select('id')
    .single();

  if (antErr) {
    if (isMissingTableError(antErr)) {
      throw new Error(
        'Tabela de antecipação ainda não existe no banco. Recarregue a tela (o sistema tenta criar) ou publique o sistema.',
      );
    }
    throw antErr;
  }

  const anticipationId = String(antRow.id);
  const updatedIds: string[] = [];
  const invoiceIds: string[] = [];

  let residual: FinancialTransaction | null = null;
  if (plan.settlement === 'SALDO_A_RECEBER' && plan.residual > 0.009) {
    const template = openTitles[0];
    const residualRow: Record<string, unknown> = {
      description: buildResidualAnticipationDescription(entityName),
      amount: plan.residual,
      type: 'INCOME',
      status: 'PENDING',
      due_date: plan.residualDueDate,
      category_id: template.category_id || null,
      account_id: template.account_id || null,
      entity_type: template.entity_type || 'Client',
      entity_id: template.entity_id || null,
      entity_name: entityName,
      payment_method: template.payment_method || null,
      notes: buildResidualAnticipationNotes({
        anticipationId,
        residual: plan.residual,
        dueDate: plan.residualDueDate,
        linkedSummary: summary,
      }),
      created_by: params.createdBy,
      amount_paid: 0,
      amount_open: plan.residual,
    };
    let ins = await supabase.from('financial_transactions').insert(residualRow).select('*').single();
    if (ins.error && isMissingColumnError(ins.error)) {
      const slim = { ...residualRow };
      delete slim.amount_paid;
      delete slim.amount_open;
      ins = await supabase.from('financial_transactions').insert(slim).select('*').single();
    }
    if (ins.error) throw ins.error;
    residual = ins.data as FinancialTransaction;

    await supabase
      .from('payment_anticipations')
      .update({ residual_transaction_id: residual.id })
      .eq('id', anticipationId);

    await supabase.from('payment_anticipation_links').insert({
      anticipation_id: anticipationId,
      transaction_id: residual.id,
      role: 'RESIDUAL',
      amount: plan.residual,
      description: residual.description,
      nf_ref: params.fields.nfNumber || '',
    });
  }

  for (const title of openTitles) {
    const notes = buildAnticipationNotes({
      existingNotes: title.notes,
      anticipationId,
      fields: params.fields,
      plan,
      linkedSummary: summary,
    });
    const paidUpdate: Record<string, unknown> = {
      status: 'PAID',
      payment_date: params.fields.paymentDate,
      amount_paid: title.amount,
      amount_open: 0,
      notes,
      updated_by: params.createdBy,
    };
    let { error } = await supabase.from('financial_transactions').update(paidUpdate).eq('id', title.id);
    if (error && isMissingColumnError(error)) {
      const slim = { ...paidUpdate };
      delete slim.amount_paid;
      delete slim.amount_open;
      const retry = await supabase.from('financial_transactions').update(slim).eq('id', title.id);
      error = retry.error;
    }
    if (error) throw error;
    updatedIds.push(title.id);

    try {
      await addPaymentToTransaction({
        transactionId: title.id,
        titleAmount: Number(title.amount || 0),
        titleNotes: notes,
        amount: getTransactionOpenAmount(title),
        paymentDate: params.fields.paymentDate,
        notes: `Antecipação ${ANTICIPATION_MARKER}${anticipationId} | ${settlementNote(plan)}`,
        createdBy: params.createdBy,
        previousStatus: 'PAID',
      });
    } catch (e) {
      console.warn('[antecipação] trilha de pagamentos:', e);
    }

    const matched = await findMatchingInvoices(title).catch((e) => {
      console.warn('[antecipação] busca de NF:', e);
      return [] as string[];
    });
    for (const invoiceId of matched) {
      const { error: invErr } = await supabase
        .from('financial_invoices')
        .update({ status: 'PAGA' })
        .eq('id', invoiceId)
        .neq('status', 'CANCELADA');
      if (!invErr) invoiceIds.push(invoiceId);
    }

    const refs = extractInvoiceRefs(`${title.description} ${title.notes || ''}`);
    await supabase.from('payment_anticipation_links').insert({
      anticipation_id: anticipationId,
      transaction_id: title.id,
      invoice_id: matched[0] || null,
      role: 'SOURCE',
      amount: getTransactionOpenAmount(title),
      description: title.description,
      nf_ref: refs[0] || params.fields.nfNumber || '',
    });
  }

  let emailSent = false;
  let emailError: string | undefined;
  if (plan.settlement === 'SALDO_A_RECEBER' && plan.residual > 0.009) {
    try {
      const res = await authFetch('/api/email/payment-anticipation', {
        method: 'POST',
        body: JSON.stringify({
          anticipationId,
          entityName,
          fields: params.fields,
          plan,
          linkedSummary: summary,
          titles: openTitles.map((t) => ({
            id: t.id,
            description: t.description,
            amount: getTransactionOpenAmount(t),
            entity_name: t.entity_name,
          })),
          residualDueDate: plan.residualDueDate,
          createdBy: params.createdBy,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        emailError = String(body?.error || `Falha ao enviar e-mail (${res.status})`);
      } else {
        emailSent = true;
      }
    } catch (e: any) {
      emailError = e?.message || 'Falha ao enviar e-mail ao financeiro';
    }
    await supabase
      .from('payment_anticipations')
      .update({ email_sent: emailSent, email_error: emailError || '' })
      .eq('id', anticipationId);
  }

  return {
    anticipationId,
    plan,
    updatedIds,
    residual,
    invoiceIds: Array.from(new Set(invoiceIds)),
    emailSent,
    emailError,
  };
}

function settlementNote(plan: AnticipationPlan): string {
  return plan.settlement === 'PAGO'
    ? 'PAGO (R$ 0,00)'
    : `Saldo a Receber ${formatBrl(plan.residual)}`;
}

export async function searchOpenReceivables(term: string): Promise<AnticipationLinkable[]> {
  const q = String(term || '')
    .trim()
    .replace(/[%(),]/g, ' ')
    .slice(0, 80);
  const { rows } = await fetchAllPages<AnticipationLinkable>(async (from, size) => {
    let query = supabase
      .from('financial_transactions')
      .select('id, description, amount, amount_open, amount_paid, status, notes, entity_name, entity_id, entity_type, category_id, account_id, payment_method, due_date')
      .eq('type', 'INCOME')
      .in('status', ['PENDING', 'PARTIALLY_PAID', 'SCHEDULED', 'OVERDUE'])
      .order('due_date', { ascending: false })
      .range(from, from + size - 1);
    if (q) {
      query = query.or(
        `entity_name.ilike.%${q}%,description.ilike.%${q}%,notes.ilike.%${q}%`,
      );
    }
    const { data, error } = await query;
    return { data: data as AnticipationLinkable[] | null, error };
  }, 200, 3000);
  return rows.filter((t) => getTransactionOpenAmount(t) > 0.009);
}
