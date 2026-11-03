import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeMoneyChange,
  describeTableChange,
  formatHistoryAlteration,
} from '../lib/billing/billingHistoryText.ts';

describe('Texto do histórico financeiro', () => {
  it('descreve valor de/para e ignora diferença de centavo', () => {
    const line = describeMoneyChange('Serviço Fornecedor', 1197.85, 1244.6);
    assert.match(line || '', /Serviço Fornecedor: de R\$\s*1\.197,85 para R\$\s*1\.244,60/);
    assert.equal(describeMoneyChange('Pedágio Cliente', 54.15, 54.154), null);
  });

  it('descreve troca de tabela e ignora a mesma tabela', () => {
    assert.equal(
      describeTableChange('Tabela Fornecedor', 'a', '100KM', 'b', '200KM'),
      'Tabela Fornecedor: de 100KM para 200KM',
    );
    assert.equal(describeTableChange('Tabela Fornecedor', 'a', '100KM', 'a', '100KM'), null);
    assert.equal(describeTableChange('Tabela Cliente', '', '', 'b', 'SP'), null);
  });

  it('junta aprovação com o detalhe da alteração', () => {
    assert.equal(
      formatHistoryAlteration('Aprovado pelo Financeiro', [
        'Tabela Fornecedor: de 100KM para 200KM',
        'Serviço Fornecedor: de R$ 1.197,85 para R$ 1.244,60',
      ]),
      'Aprovado pelo Financeiro · Tabela Fornecedor: de 100KM para 200KM · Serviço Fornecedor: de R$ 1.197,85 para R$ 1.244,60',
    );
    assert.equal(formatHistoryAlteration('Aprovado pelo Financeiro', []), 'Aprovado pelo Financeiro');
  });
});
