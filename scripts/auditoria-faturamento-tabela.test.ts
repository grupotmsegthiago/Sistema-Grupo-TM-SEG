import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  montarEmailAuditoriaFaturamento,
  rotaDaTabelaOperacao,
} from '../lib/comercial/auditoriaFaturamentoTabela';

describe('auditoria de faturamento pela tabela', () => {
  it('lê origem e destino da operação CIDADE X CIDADE', () => {
    assert.deepEqual(rotaDaTabelaOperacao('SUDESTE - SÃO PAULO X CANOAS'), {
      origem: 'SÃO PAULO',
      destino: 'CANOAS',
    });
    assert.deepEqual(rotaDaTabelaOperacao('SUL - LONDRINA/PR X GUARULHOS/SP'), {
      origem: 'LONDRINA/PR',
      destino: 'GUARULHOS/SP',
    });
    assert.deepEqual(rotaDaTabelaOperacao('VILA HAMBUSGUESIA X PQ NOVO MUNDO - SUDESTE'), {
      origem: 'VILA HAMBUSGUESIA',
      destino: 'PQ NOVO MUNDO',
    });
    assert.deepEqual(rotaDaTabelaOperacao('SUDESTE - GUARULHOS - SP X VITORIA - ES'), {
      origem: 'GUARULHOS - SP',
      destino: 'VITORIA - ES',
    });
    assert.equal(rotaDaTabelaOperacao('NORDESTE - NORDESTE VELADO - PREXTEX'), null);
  });

  it('e-mail não mostra valor em reais', () => {
    const email = montarEmailAuditoriaFaturamento({
      cliente: 'Techtrans',
      tabela: 'SUDESTE - SÃO PAULO X CANOAS R$ 1.500,00',
      origem: 'SÃO PAULO',
      destino: 'CANOAS',
      comercial: 'Ana',
    });
    assert.match(email.subject, /Techtrans/);
    assert.match(email.html, /SÃO PAULO/);
    assert.match(email.html, /CANOAS/);
    assert.match(email.html, /CIDADE X CIDADE/);
    assert.doesNotMatch(email.html, /R\$/);
    assert.doesNotMatch(email.subject, /R\$/);
    assert.doesNotMatch(email.html, /1\.500/);
  });

  it('a tela de cotação audita pela tabela e não manda valor no e-mail', () => {
    const form = fs.readFileSync('components/QuoteForm.tsx', 'utf8');
    const rota = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(form, /Auditar Faturamento/);
    assert.match(form, /rotaDaTabelaOperacao/);
    assert.match(form, /operationType: tabela\.operation_type/);
    assert.doesNotMatch(form, /totalValue[\s\S]{0,80}auditar-faturamento|auditar-faturamento[\s\S]{0,200}totalValue/);
    assert.match(rota, /\/api\/email\/auditar-faturamento/);
    assert.match(rota, /montarEmailAuditoriaFaturamento/);
  });
});
