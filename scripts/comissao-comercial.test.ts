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
    assert.match(page, /filter-empresa-comissao/);
    assert.match(page, /filter-quinzena-comissao/);
    assert.match(page, /btn-exportar-relatorio-comissao/);
    assert.match(page, /apuracao-escala-comercial/);
    assert.match(page, /btn-sync-usuarios-comercial/);
    assert.match(page, /btn-sync-comissoes-faturas/);
    assert.match(page, /comissao-pendencias-banner/);
    assert.match(page, /tabela-comissao-padrao/);
    assert.match(form, /sincronizarComerciaisDeUsuarios/);
    const userForm = fs.readFileSync('components/UserForm.tsx', 'utf8');
    assert.match(userForm, /upsertComercialDoUsuario/);
    assert.match(userForm, /from 'react'/);
    assert.match(page, /from 'react'/);
    assert.match(page, /import React,/);
    assert.match(app, /comissoes-comerciais/);
    assert.match(nav, /Comissões Comerciais/);
  });
});

describe('comissao comercial — TORRES ingest', () => {
  it('parseia evento de faturamento TORRES', async () => {
    const { parseComissaoIngestPayload } = await import('../lib/comissao/comissaoIngest');
    const parsed = parseComissaoIngestPayload({
      empresa: 'TORRES',
      evento: 'FATURADO',
      origemFaturaId: 44,
      clienteOrigemId: 12,
      clienteNome: 'CLIENTE TORRES',
      comercialId: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32',
      valorFaturamento: 10000,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.empresa, 'TORRES');
    assert.equal(parsed.data.origemFaturaId, '44');
    assert.equal(parsed.data.valorFaturamento, 10000);
  });

  it('recusa evento inválido', async () => {
    const { parseComissaoIngestPayload } = await import('../lib/comissao/comissaoIngest');
    const parsed = parseComissaoIngestPayload({ evento: 'X', origemFaturaId: '1' });
    assert.equal(parsed.ok, false);
  });

  it('endpoint de ingest e rewrite existem', () => {
    const ingest = fs.readFileSync('api/comissoes-ingest.ts', 'utf8');
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    const core = fs.readFileSync('lib/comissao/comissaoCore.ts', 'utf8');
    assert.match(ingest, /handleComissoesIngest/);
    assert.match(ingest, /listarComerciaisParaIngest/);
    assert.match(ingest, /req.method === 'GET'/);
    assert.match(vercel, /\/api\/comissoes\/ingest/);
    assert.match(core, /empresaOrigem/);
    assert.match(core, /atualizarStatusAposBaixaPorOrigem/);
  });

  it('lista só comerciais ativos para o select da TORRES', async () => {
    const { listarComerciaisParaIngest } = await import('../lib/comissao/comissaoIngest');
    const res = await listarComerciaisParaIngest({
      from() {
        return {
          select() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                { id: 'a', nome: 'Cassiane Garcia', ativo: true },
                { id: 'b', nome: 'Inativo', ativo: false },
                { id: 'c', nome: 'MIGUEL MOTA', ativo: null },
              ],
              error: null,
            });
          },
        };
      },
    } as any);
    assert.equal(res.ok, true);
    assert.deepEqual(res.comerciais.map((c) => c.nome), ['Cassiane Garcia', 'MIGUEL MOTA']);
  });
});

describe('comissao comercial — escala da planilha', () => {
  it('espelha o print: 50k / 500k / 1M', async () => {
    const { calcularApuracaoComissao, gerarLinhasTabelaReferencia } = await import('../lib/comissao/tabelaComissaoPadrao');
    const p50 = calcularApuracaoComissao({ valorBruto: 50_000 });
    assert.equal(p50.notaFiscal, 8000);
    assert.equal(p50.resultadoLiquido, 42_000);
    assert.equal(p50.resultadoLiquido, p50.valorBruto - p50.notaFiscal);
    assert.equal(p50.comissaoPercentual, 1260);
    assert.equal(p50.bonusAcumulado, 0);
    assert.equal(p50.totalAPagar, 1260);
    assert.notEqual(p50.totalAPagar, p50.valorBruto + p50.notaFiscal);

    const abaixo = calcularApuracaoComissao({ valorBruto: 49_999, valorFixo: 2000 });
    assert.equal(abaixo.abaixoDoPiso, true);
    assert.equal(abaixo.comissaoPercentual, 0);
    assert.equal(abaixo.bonusAcumulado, 0);
    assert.equal(abaixo.totalAPagar, 2000);

    const p500 = calcularApuracaoComissao({ valorBruto: 500_000, valorFixo: 0 });
    assert.equal(p500.comissaoPercentual, 12_600);
    assert.equal(p500.bonusAcumulado, 5_000);
    assert.equal(p500.totalAPagar, 17_600);

    const p1m = calcularApuracaoComissao({ valorBruto: 1_000_000 });
    assert.equal(p1m.comissaoPercentual, 25_200);
    assert.equal(p1m.bonusAcumulado, 10_000);
    assert.equal(p1m.totalAPagar, 35_200);

    const linhas = gerarLinhasTabelaReferencia();
    assert.equal(linhas.length, 20);
    assert.equal(linhas[0].totalAPagar, 1260);
    assert.equal(linhas[linhas.length - 1].totalAPagar, 35_200);
  });

  it('reconhece perfil COMERCIAL pelo nome', async () => {
    const { perfilEhComercial } = await import('../lib/comissao/tabelaComissaoPadrao');
    assert.equal(perfilEhComercial('COMERCIAL'), true);
    assert.equal(perfilEhComercial('Diretoria'), false);
  });
});

describe('comissao comercial — faturas históricas', () => {
  it('casa fatura pelo nome, não por client_id (coluna inexistente)', async () => {
    const { casarClienteDaFatura, montarPendenciasComissao } = await import('../lib/comissao/sincronizarComissoesFaturas');
    const clients = [
      { id: 1, name: 'CEVA LOGISTICS LTDA', trading_name: 'CEVA', responsavel_comercial_id: null },
      { id: 37, name: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', trading_name: 'TECHTRANS TRANSPORTES', responsavel_comercial_id: 'abc' },
      { id: 86, name: 'LUFT LOGISTICS LTDA', trading_name: 'LUFT', responsavel_comercial_id: null },
      { id: 91, name: 'LUFT LOGISTICS LTDA', trading_name: 'LUFT LOGISTICS LTDA', responsavel_comercial_id: null },
    ];
    assert.equal(casarClienteDaFatura('CEVA', clients).status, 'ok');
    assert.equal(casarClienteDaFatura('CEVA', clients).client?.id, 1);
    assert.equal(casarClienteDaFatura('TECHTRANS TRANSPORTES', clients).status, 'ok');
    assert.equal(casarClienteDaFatura('LUFT LOGISTICS LTDA', clients).status, 'ambiguous');
    const pend = montarPendenciasComissao(
      [
        { id: '1', client: 'CEVA', amount: 100, status: 'EMITIDA' },
        { id: '2', client: 'TECHTRANS TRANSPORTES', amount: 50, status: 'EMITIDA' },
        { id: '3', client: 'DESCONHECIDO', amount: 10, status: 'EMITIDA' },
      ],
      clients,
    );
    assert.ok(pend.some((p) => p.motivo === 'sem_comercial' && p.cliente === 'CEVA'));
    assert.equal(pend.some((p) => p.cliente === 'TECHTRANS TRANSPORTES'), false);
    const helper = fs.readFileSync('lib/comissao/sincronizarComissoesFaturas.ts', 'utf8');
    assert.match(helper, /Não usa client_id na fatura/);
    const persist = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(persist, /if \(invoiceId\)/);
    assert.doesNotMatch(persist, /if \(created && invoiceId\)/);
    const asaas = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(asaas, /entityId: bodyClientId/);
  });
});
