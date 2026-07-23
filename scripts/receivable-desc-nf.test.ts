import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveNfServiceDescription } from '../lib/persistAsaasChargeInvoice.ts';

describe('Contas a Receber — descrição = texto da NF', () => {
  it('resolveNfServiceDescription usa discriminação, não prefixo NF TMSEG', () => {
    const text =
      'Referente aos Serviços de Rastreamento e Monitoramento de Carga - Referente ao 1ª Quinzena de Julho/2026';
    const got = resolveNfServiceDescription({
      serviceDescription: text,
      notes: `${text}\nRef. rastreio: TMSEG-20260723-184625-ZY7H\nCNAE/Serviço municipal: 06298`,
      clientName: 'AMAZON TRANSPORTES LTDA.',
      trackingNumber: 'TMSEG-20260723-184625-ZY7H',
    });
    assert.equal(got, text);
    assert.doesNotMatch(got, /^NF TMSEG-/);
  });

  it('persist e frontend usam serviceDescription / notes da NF', () => {
    const persist = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(persist, /resolveNfServiceDescription/);
    assert.match(persist, /serviceDescription\?:/);
    const core = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(core, /serviceDescription: nfServiceText/);
    const ui = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(ui, /nfDescSplit|nfDescSave|nfDesc/);
    assert.match(ui, /invoiceForm\.notes \|\| asaasDescription/);
    assert.match(ui, /from 'react'/);
  });

  it('nfRetryWorker passa notes/CNAE no scheduleInvoice', () => {
    const worker = fs.readFileSync('server/nfRetryWorker.ts', 'utf8');
    assert.match(worker, /parseInvoiceNfMeta/);
    assert.match(worker, /scheduleOpts/);
    assert.match(worker, /municipalServiceCode/);
    assert.match(worker, /Saldo Asaas.*POST \/invoices/s);
  });
});
