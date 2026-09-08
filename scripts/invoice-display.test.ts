import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  overdueDays,
  paymentStatusLabel,
  invoiceControlChargeStatus,
  nfStatusBucket,
  nfBucketLabel,
  nfBucketDetail,
  nfErrorGuidance,
} from '../lib/invoiceDisplay';
import { isNonRetryable } from '../lib/nfRetryGuards';
import {
  isAsaasGoneError,
  isAsaasPaymentCancelled,
  isAsaasPaymentPaid,
  preferLaterDueDate,
} from '../lib/asaasSyncOpenPaymentsCore';

describe('invoiceDisplay — status cobrança e NF', () => {
  const now = new Date('2026-07-23T12:00:00-03:00');

  it('overdueDays calcula dias vencidos', () => {
    assert.equal(overdueDays('2026-07-08', now), 15);
    assert.equal(overdueDays('2026-07-23', now), 0);
    assert.equal(overdueDays('2026-07-30', now), 0);
    assert.equal(overdueDays(null, now), null);
  });

  it('paymentStatusLabel mostra VENCIDO (N dias) e PAGO', () => {
    assert.equal(paymentStatusLabel('PAGA', '2026-07-01', now), 'PAGO');
    assert.equal(paymentStatusLabel('VENCIDA', '2026-07-08', now), 'VENCIDO (15 dias)');
    assert.equal(paymentStatusLabel('EMITIDA', '2026-07-22', now), 'VENCIDO (1 dia)');
    assert.equal(paymentStatusLabel('EMITIDA', '2026-07-30', now), 'Em Aberto');
    assert.equal(paymentStatusLabel('CANCELADA', null, now), 'Cancelada');
    assert.equal(paymentStatusLabel('VENCIDA', '2026-07-30', now), 'Em Aberto');
  });

  it('prorrogação: VENCIDA com vencimento futuro volta para Em Aberto', () => {
    assert.equal(invoiceControlChargeStatus('VENCIDA', 'AUTHORIZED', '2026-09-09', new Date('2026-09-08T15:00:00-03:00')), 'EMITIDA');
    assert.equal(invoiceControlChargeStatus('VENCIDA', 'AUTHORIZED', '2026-08-25', new Date('2026-09-08T15:00:00-03:00')), 'VENCIDA');
    assert.equal(invoiceControlChargeStatus('EMITIDA', 'AUTHORIZED', '2026-09-04', new Date('2026-09-08T15:00:00-03:00')), 'VENCIDA');
  });

  it('NF cancelada não aparece como VENCIDO mesmo com boleto atrasado', () => {
    assert.equal(paymentStatusLabel('EMITIDA', '2026-07-08', now, 'CANCELED'), 'Cancelada');
    assert.equal(paymentStatusLabel('VENCIDA', '2026-07-08', now, 'CANCELLED'), 'Cancelada');
    assert.equal(paymentStatusLabel('PAGA', '2026-07-08', now, 'CANCELED'), 'PAGO');
  });

  it('nfStatusBucket agrupa Emitida / Processando / Falha', () => {
    assert.equal(nfStatusBucket('AUTHORIZED'), 'emitida');
    assert.equal(nfStatusBucket('SCHEDULED'), 'aguardando');
    assert.equal(nfStatusBucket('SYNCHRONIZED'), 'aguardando');
    assert.equal(nfStatusBucket('PROCESSING'), 'aguardando');
    // ERROR/STUCK só viram Falha quando pausados; senão continuam Processando
    assert.equal(nfStatusBucket('ERROR'), 'aguardando');
    assert.equal(nfStatusBucket('STUCK', { paused: true }), 'falha');
    assert.equal(nfStatusBucket('SYNCHRONIZED', { stuckByAge: true, paused: true }), 'falha');
    assert.equal(nfBucketLabel('emitida'), 'Emitida');
    assert.equal(nfBucketLabel('aguardando'), 'Processando');
    assert.equal(nfBucketLabel('falha'), 'Falha');
    assert.match(nfBucketDetail('STUCK', { provider: 'ASAAS', ageHours: 465, paused: true }) || '', /TRAVADA/);
    assert.equal(
      nfBucketDetail('ERROR', { paused: true, lastError: 'Retorno da prefeitura de São Paulo-SP: Falha na autenticação, verifique suas credenciais em Notas Fiscais -> Informações Fiscais.' }),
      'Credencial Prefeitura',
    );
  });

  it('nfErrorGuidance aponta caminho de correção para falha de autenticação SP', () => {
    const g = nfErrorGuidance(
      'Retorno da prefeitura de São Paulo-SP: Falha na autenticação, verifique suas credenciais em Notas Fiscais -> Informações Fiscais.',
      { issuerCompany: 'TM SEGURANÇA' },
    );
    assert.ok(g);
    assert.equal(g!.shortLabel, 'Credencial Prefeitura');
    assert.match(g!.howToFix, /Informações Fiscais/);
    assert.match(g!.howToFix, /TM SEGURANÇA/);
    assert.match(g!.howToFix, /Reemitir NF/);
  });

  it('isNonRetryable trata falha de autenticação da Prefeitura como permanente', () => {
    assert.equal(
      isNonRetryable('Retorno da prefeitura de São Paulo-SP: Falha na autenticação, verifique suas credenciais em Notas Fiscais -> Informações Fiscais.'),
      true,
    );
    assert.equal(isNonRetryable('NF isolada — será agendada pelo Controle/worker'), false);
  });
});

describe('Asaas sync — cobrança cancelada / prorrogada', () => {
  it('detecta cobrança excluída ou estornada no Asaas', () => {
    assert.equal(isAsaasPaymentCancelled({ deleted: true, status: 'PENDING' }), true);
    assert.equal(isAsaasPaymentCancelled({ status: 'REFUNDED' }), true);
    assert.equal(isAsaasPaymentCancelled({ status: 'CANCELLED' }), true);
    assert.equal(isAsaasPaymentCancelled({ status: 'PENDING' }), false);
    assert.equal(preferLaterDueDate('2026-08-25', '2026-08-25', '2026-09-09'), '2026-09-09');
    assert.equal(preferLaterDueDate('2026-09-09', '2026-08-25'), '2026-09-09');
    assert.equal(isAsaasPaymentPaid({ status: 'RECEIVED' }), true);
    assert.equal(isAsaasGoneError(new Error('Asaas API Error (404): Not found')), true);
    assert.equal(isAsaasGoneError(new Error('Asaas API Error (400): vencimento inválido')), false);
  });
});

describe('FinancialInvoiceControl — auto sync e labels', () => {
  it('tela dispara sync de pagamentos e retry NF sem remover import React', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(src, /from 'react'/);
    assert.match(src, /import React,/);
    // limit dinâmico (default 15) — não string fixa ?limit=15
    assert.match(src, /sync-open-payments\?limit=\$\{limit\}/);
    assert.match(src, /syncOpen = async \(limit = 15\)/);
    assert.match(src, /\/api\/nf\/retry-now\?limit=(5|10)&reopen=1/);
    assert.match(src, /paymentStatusLabel/);
    assert.match(src, /invoiceControlChargeStatus/);
    assert.match(src, /nfStatusBucket/);
    assert.match(src, /nfErrorGuidance/);
    assert.match(src, /nf-error-guidance/);
    assert.match(src, /Como corrigir/);
    assert.match(src, /VENCIDO/);
  });
});
