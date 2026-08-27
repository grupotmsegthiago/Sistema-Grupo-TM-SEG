import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  overdueDays,
  paymentStatusLabel,
  nfStatusBucket,
  nfBucketLabel,
  nfBucketDetail,
  nfErrorGuidance,
} from '../lib/invoiceDisplay';
import { isNonRetryable } from '../lib/nfRetryGuards';

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
    assert.match(src, /nfStatusBucket/);
    assert.match(src, /nfErrorGuidance/);
    assert.match(src, /nf-error-guidance/);
    assert.match(src, /Como corrigir/);
    assert.match(src, /VENCIDO/);
  });
});
