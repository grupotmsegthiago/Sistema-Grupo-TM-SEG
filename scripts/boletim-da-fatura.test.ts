import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { linhasDoBoletimDaFatura, planilhaBoletimDaFatura } from '../lib/billing/boletimDaFatura';

describe('Boletim automático da fatura', () => {
  it('soma só os valores já gravados na OS e ignora linha sem número', () => {
    const linhas = linhasDoBoletimDaFatura([
      {
        id: 'GTM-1',
        origin: 'Campinas/SP',
        destination: 'Santos/SP',
        start_time: '2026-10-02T12:00:00.000Z',
        revenue_value: 1000,
        toll_value: 80.5,
        displacement_value: 20,
      },
      { id: '', revenue_value: 999 },
    ]);
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].data, '02/10/2026');
    assert.equal(linhas[0].total, 1100.5);
    const fonte = fs.readFileSync('lib/billing/boletimDaFatura.ts', 'utf8');
    assert.equal(fonte.includes('calculateMissionFinancials'), false);
  });

  it('gera a planilha com a OS e o total', () => {
    const buf = planilhaBoletimDaFatura('CEVA', linhasDoBoletimDaFatura([
      { id: 'GTM-9', origin: 'A', destination: 'B', start_time: '2026-10-01', revenue_value: 10, toll_value: 1, displacement_value: 2 },
    ]));
    const livro = XLSX.read(buf);
    const grade = XLSX.utils.sheet_to_json<(string | number)[]>(livro.Sheets.Boletim, { header: 1 });
    assert.equal(String(grade[0][0]).includes('CEVA'), true);
    assert.equal(grade[3][0], 'GTM-9');
    assert.equal(Number(grade[3][7]), 13);
  });

  it('anexa NF, boleto e boletim no e-mail e copia o financeiro', () => {
    const email = fs.readFileSync('server/emailService.ts', 'utf8');
    const fatura = fs.readFileSync('server/invoiceBillingEmail.ts', 'utf8');
    const asaas = fs.readFileSync('lib/asaasChargeApi.ts', 'utf8');
    assert.equal(email.includes('mailto:adm@grupotmseg.com.br'), false);
    assert.match(email, /mailto:financeiro@grupotmseg\.com\.br/);
    assert.match(email, /boletim de medição/);
    assert.match(email, /cc: \['financeiro@grupotmseg\.com\.br', 'thiago@grupotmseg\.com\.br'\]/);
    assert.match(fatura, /planilhaBoletimDaFatura/);
    assert.match(fatura, /Boletim_Medicao_/);
    assert.match(asaas, /additionalEmails: EMAIL_FINANCEIRO_COBRANCA/);
    assert.match(asaas, /PAYMENT_CREATED/);
    assert.match(asaas, /emailEnabledForCustomer: false/);
  });
});