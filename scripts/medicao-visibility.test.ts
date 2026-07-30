import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPureMedicaoInvoice,
  isPureMedicaoReceivable,
} from '../lib/billing/medicaoVisibility';

describe('isPureMedicaoInvoice', () => {
  it('oculta espelho MED- sem Asaas/boleto/PlugNotas', () => {
    assert.equal(
      isPureMedicaoInvoice({ number: 'MED-20260729_20260729-19' }),
      true,
    );
  });

  it('não oculta TMSEG- nem fatura sem prefixo MED-', () => {
    assert.equal(isPureMedicaoInvoice({ number: 'TMSEG-123' }), false);
    assert.equal(isPureMedicaoInvoice({ number: '12345' }), false);
  });

  it('não oculta MED- depois de boleto/Asaas/PlugNotas', () => {
    assert.equal(
      isPureMedicaoInvoice({
        number: 'MED-20260729-1',
        asaas_payment_id: 'pay_abc',
      }),
      false,
    );
    assert.equal(
      isPureMedicaoInvoice({
        number: 'MED-20260729-1',
        asaas_bankslip_url: 'https://asaas.com/boleto',
      }),
      false,
    );
    assert.equal(
      isPureMedicaoInvoice({
        number: 'MED-20260729-1',
        boleto_image_url: 'https://cdn/boleto.png',
      }),
      false,
    );
    assert.equal(
      isPureMedicaoInvoice({
        number: 'MED-20260729-1',
        plugnotas_invoice_id: 'pn_1',
      }),
      false,
    );
  });
});

describe('isPureMedicaoReceivable', () => {
  it('oculta título criado pelo envio da medição', () => {
    assert.equal(
      isPureMedicaoReceivable({
        description: 'Medição 01/07 a 29/07 — LOGO SOLUCOES',
        notes: 'Boletim de Medição enviado ao cliente | Vencimento 30 dias | Ref MED-20260701_20260729-6',
      }),
      true,
    );
    assert.equal(
      isPureMedicaoReceivable({
        description: 'Receita avulsa',
        notes: 'Ref MED-20260729-1',
      }),
      true,
    );
  });

  it('não oculta quando já há Fatura TMSEG-/Asaas ou método de cobrança', () => {
    assert.equal(
      isPureMedicaoReceivable({
        description: 'Medição período X',
        notes: 'Boletim de Medição enviado | Asaas: pay_123',
      }),
      false,
    );
    assert.equal(
      isPureMedicaoReceivable({
        description: 'Medição período X',
        notes: 'Fatura TMSEG-ABC gerada',
      }),
      false,
    );
    assert.equal(
      isPureMedicaoReceivable({
        description: 'Medição período X',
        notes: 'Boletim de Medição enviado ao cliente',
        payment_method: 'BOLETO',
      }),
      false,
    );
  });

  it('não oculta receita comum', () => {
    assert.equal(
      isPureMedicaoReceivable({
        description: 'Serviço de escolta',
        notes: 'OS 1234',
      }),
      false,
    );
  });
});
