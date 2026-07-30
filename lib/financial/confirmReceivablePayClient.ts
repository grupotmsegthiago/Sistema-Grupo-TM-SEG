import { supabase } from '../supabase';
import type { FinancialTransaction } from '../../types';
import {
  buildConfirmReceivablePayPlan,
  buildPaidNotes,
  buildResidualDescription,
  buildResidualNotes,
  roundMoney,
  type ConfirmReceivablePayPlan,
} from './confirmReceivablePay';
import { addPaymentToTransaction } from './receivablePaymentsClient';

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === '42703' || /amount_paid|amount_open|column/i.test(msg);
}

export type ConfirmReceivablePayParams = {
  transaction: FinancialTransaction;
  principalPaid: number;
  interest?: number;
  fine?: number;
  paymentDate: string;
  today: string;
  createdBy: string;
};

export type ConfirmReceivablePayOutcome = {
  plan: ConfirmReceivablePayPlan;
  updated: Partial<FinancialTransaction>;
  residual?: FinancialTransaction | null;
};

/**
 * Confirma pagamento do título:
 * - marca PAID com o principal informado (reduz amount se parcial)
 * - anexa pagamento
 * - cria linha residual PENDENTE/VENCIDO quando houver saldo
 */
export async function confirmReceivablePayment(
  params: ConfirmReceivablePayParams,
): Promise<ConfirmReceivablePayOutcome> {
  const t = params.transaction;
  const titleAmount = roundMoney(Number(t.amount || 0));
  const plan = buildConfirmReceivablePayPlan({
    titleAmount,
    principalPaid: params.principalPaid,
    interest: params.interest,
    fine: params.fine,
    dueDate: String(t.due_date || '').slice(0, 10),
    today: params.today,
  });

  if (plan.principalApplied <= 0.009) {
    throw new Error('Informe o valor pago do principal do título.');
  }

  const notes = buildPaidNotes({
    existingNotes: t.notes,
    plan,
    paymentDate: params.paymentDate,
  });

  const paidUpdate: Record<string, unknown> = {
    status: 'PAID',
    payment_date: params.paymentDate,
    amount: plan.principalApplied > 0.009 ? plan.principalApplied : titleAmount,
    amount_paid: plan.principalApplied,
    amount_open: 0,
    notes,
    updated_by: params.createdBy,
  };

  let { error } = await supabase.from('financial_transactions').update(paidUpdate).eq('id', t.id);
  if (error && isMissingColumnError(error)) {
    const slim = { ...paidUpdate };
    delete slim.amount_paid;
    delete slim.amount_open;
    const retry = await supabase.from('financial_transactions').update(slim).eq('id', t.id);
    error = retry.error;
  }
  if (error) throw error;

  // Registra o pagamento (principal) na trilha de pagamentos, se existir
  if (plan.principalApplied > 0.009) {
    try {
      const payNotes = [
        plan.isPartial ? 'Pago incompleto' : 'Quitação',
        plan.interest > 0.009 ? `Juros ${plan.interest.toFixed(2)}` : '',
        plan.fine > 0.009 ? `Multa ${plan.fine.toFixed(2)}` : '',
        `Total recebido ${plan.totalReceived.toFixed(2)}`,
      ]
        .filter(Boolean)
        .join(' | ');
      await addPaymentToTransaction({
        transactionId: t.id,
        titleAmount: plan.principalApplied,
        titleNotes: notes,
        amount: plan.principalApplied,
        paymentDate: params.paymentDate,
        notes: payNotes,
        createdBy: params.createdBy,
        previousStatus: 'PAID',
      });
    } catch (e) {
      console.warn('[confirmReceivablePayment] trilha de pagamentos:', e);
    }
  }

  let residual: FinancialTransaction | null = null;
  if (plan.isPartial && plan.residual > 0.009) {
    const residualRow: Record<string, unknown> = {
      description: buildResidualDescription(t.description),
      amount: plan.residual,
      type: 'INCOME',
      status: plan.residualStatus,
      due_date: String(t.due_date || '').slice(0, 10),
      category_id: t.category_id || null,
      account_id: t.account_id || null,
      entity_type: t.entity_type || 'Client',
      entity_id: t.entity_id || null,
      entity_name: t.entity_name || null,
      payment_method: t.payment_method || null,
      notes: buildResidualNotes({
        parentId: t.id,
        parentDescription: t.description,
        residual: plan.residual,
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
  }

  return {
    plan,
    updated: {
      status: 'PAID',
      payment_date: params.paymentDate,
      amount: plan.principalApplied > 0.009 ? plan.principalApplied : titleAmount,
      amount_paid: plan.principalApplied,
      amount_open: 0,
      notes,
      updated_by: params.createdBy,
    },
    residual,
  };
}
