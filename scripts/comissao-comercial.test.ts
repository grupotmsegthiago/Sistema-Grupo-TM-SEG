import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calcularComissao } from '../lib/comissao/comissaoCalc';
import { extractFaturaNumeroFromNotes } from '../lib/comissao/comissaoCore';
import { canAccessComissoesComerciais } from '../lib/diretoriaAccess';

describe('comissao comercial — cálculo', () => {
  it('aplica 16% de imposto e 3% sobre o líquido', () => {
    const c = calcularComissao(10000, 16, 3);
    assert.equal(c.valorImposto, 1600);
    assert.equal(c.valorBaseLiquida, 8400);
    assert.equal(c.valorComissao, 252);
    assert.match(c.formatado.comissao, /252/);
  });

  it('aceita regra específica do comercial', () => {
    const c = calcularComissao(1000, 10, 5);
    assert.equal(c.valorBaseLiquida, 900);
    assert.equal(c.valorComissao, 45);
  });
});

describe('comissao comercial — baixa e acesso', () => {
  it('extrai número da fatura das notas do receber', () => {
    assert.equal(
      extractFaturaNumeroFromNotes('Fatura TMSEG-20260814-104502-QHDJ-S1-0557 | Asaas: pay_x'),
      'TMSEG-20260814-104502-QHDJ-S1-0557',
    );
    assert.equal(extractFaturaNumeroFromNotes(null, 'Sem fatura'), null);
  });

  it('libera tela para Thiagos, Diretoria e Administrador', () => {
    assert.equal(canAccessComissoesComerciais({ name: 'Thiago Moreira' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'Daniel Pinto', role: 'Diretoria' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'Bárbara Silva', role: 'Administrador' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'João', role: 'comercial' }), false);
  });
});

describe('comissao comercial — integração preservada', () => {
  it('emissão da NF gera comissão sem bloquear persistência', () => {
    const persist = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(persist, /gerarComissaoAoFaturar/);
    assert.match(persist, /fatura persistida/);
  });

  it('webhook e baixa do receber liberam comissão', () => {
    const webhook = fs.readFileSync('lib/asaasWebhookCore.ts', 'utf8');
    const receber = fs.readFileSync('lib/financial/confirmReceivablePayClient.ts', 'utf8');
    assert.match(webhook, /atualizarStatusAposBaixaCliente/);
    assert.match(receber, /atualizarStatusAposBaixaPorNumeroFatura/);
    assert.match(receber, /!plan\.isPartial/);
  });

  it('cadastro de cliente e tela da Diretoria existem', () => {
    const form = fs.readFileSync('components/ClientForm.tsx', 'utf8');
    const page = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
    const app = fs.readFileSync('App.tsx', 'utf8');
    const nav = fs.readFileSync('constants.ts', 'utf8');
    assert.match(form, /select-responsavel-comercial/);
    assert.match(form, /from 'react'/);
    assert.match(page, /from 'react'/);
    assert.match(page, /import React,/);
    assert.match(app, /comissoes-comerciais/);
    assert.match(nav, /Comissões Comerciais/);
  });
});
