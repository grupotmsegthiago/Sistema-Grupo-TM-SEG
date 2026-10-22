import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { billableClientToll, tollPersistencePair } from '../lib/toll/clientTollBilling';

describe('informar pedágio na auditoria', () => {
  const tela = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');

  it('os dois campos ficam bloqueados e o valor entra pelo botão', () => {
    assert.match(tela, /data-testid="button-informar-pedagio"/);
    assert.match(tela, /data-testid="input-informar-pedagio"/);
    assert.match(tela, /tollPersistencePair\(parseNumber\(pedagioInformado\)/);
    const cliente = tela.slice(tela.indexOf('data-testid="input-toll-client"') - 200, tela.indexOf('data-testid="input-toll-client"'));
    const fornecedor = tela.slice(tela.indexOf('data-testid="input-toll-provider"') - 500, tela.indexOf('data-testid="input-toll-provider"'));
    assert.match(cliente, /readOnly/);
    assert.match(fornecedor, /readOnly/);
    assert.doesNotMatch(tela, /handleTollChange\(/);
    assert.doesNotMatch(tela, /handleTollProviderChange\(/);
  });

  it('o valor informado vira o do fornecedor e o cliente segue a faixa, sem acréscimo na DHL', () => {
    const ceva = tollPersistencePair(100, false, 'CEVA LOGISTICS LTDA');
    assert.equal(ceva.toll_value_provider, 100);
    assert.equal(ceva.toll_value, 120);
    assert.equal(billableClientToll(100, 'DHL'), 100);
    const dhl = tollPersistencePair(100, false, 'DHL EXPRESS');
    assert.equal(dhl.toll_value, 100);
    assert.equal(dhl.toll_value_provider, 100);
  });
});
