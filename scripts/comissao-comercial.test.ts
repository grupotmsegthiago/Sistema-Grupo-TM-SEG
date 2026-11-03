import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calcularComissao, roundMoney } from '../lib/comissao/comissaoCalc';
import { extractFaturaNumeroFromNotes } from '../lib/comissao/comissaoCore';
import { canAccessComissoesComerciais, comissaoSomentePropria } from '../lib/diretoriaAccess';

describe('comissao comercial — cálculo', () => {
  it('aplica 16% de imposto e 3% sobre o líquido', () => {
    const c = calcularComissao(10000, 16, 3);
    assert.equal(c.valorImposto, 1600);
    assert.equal(c.valorBaseLiquida, 8400);
    assert.equal(c.valorComissao, 252);
    assert.match(c.formatado.comissao, /252/);
  });

  it('arredonda 1,005 para 1,01 e mantém o centavo já exato', () => {
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(252), 252);
    assert.equal(roundMoney(Number.NaN), 0);
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

  it('libera tela para Diretoria e Comercial; Comercial só o próprio', () => {
    assert.equal(canAccessComissoesComerciais({ name: 'Daniel Pinto', role: 'Diretoria' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'Thiago Moreira', role: 'Diretoria' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'Thiago Moreira' }), false);
    assert.equal(canAccessComissoesComerciais({ name: 'Bárbara Silva', role: 'Administrador' }), false);
    assert.equal(canAccessComissoesComerciais({ name: 'João', role: 'comercial' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'João', role: 'Financeiro' }), true);
    assert.equal(comissaoSomentePropria({ name: 'João', role: 'Financeiro' }), false);
    assert.equal(comissaoSomentePropria({ name: 'Miguel Mota', role: 'Comercial' }), true);
    assert.equal(comissaoSomentePropria({ name: 'Daniel Pinto', role: 'Diretoria' }), false);
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
    const pagamento = fs.readFileSync('lib/comissao/comissaoService.ts', 'utf8');
    const app = fs.readFileSync('App.tsx', 'utf8');
    const nav = fs.readFileSync('lib/navItems.ts', 'utf8');
    assert.match(form, /select-responsavel-comercial/);
    assert.match(form, /from 'react'/);
    assert.match(page, /filter-empresa-comissao/);
    assert.match(page, /filter-quinzena-comissao/);
    assert.match(page, /btn-exportar-relatorio-comissao/);
    assert.match(page, /apuracao-escala-comercial/);
    assert.match(page, /btn-sync-usuarios-comercial/);
    assert.match(page, /btn-sync-comissoes-faturas/);
    assert.match(page, /comissoes-liberadas/);
    assert.match(page, /comissoes-pendentes/);
    assert.match(page, /comissoes-pagas/);
    assert.match(page, /comissao-pagamento-historico/);
    assert.match(pagamento, /pago_em: agora.toISOString\(\)/);
    assert.match(pagamento, /Anexe o comprovante/);
    assert.doesNotMatch(page, /comissao-pendencias-banner/);
    assert.doesNotMatch(page, /Faturamento sem comissão/);
    assert.match(page, /quadro-tm-seg/);
    assert.match(page, /quadro-torres/);
    assert.match(page, /meses-com-fatura/);
    assert.match(page, /tabela-comissao-padrao/);
    assert.match(page, /btn-expand-cliente/);
    assert.match(page, /dashboard-comissoes-kpis/);
    assert.match(page, /cobertura-os-periodo/);
    assert.match(page, /card-funcionario-/);
    assert.match(page, /card-valor-fixo/);
    assert.match(page, /card-total-pagar/);
    assert.match(page, /comissão \+ fixo/);
    assert.match(page, /quadros-funcionarios/);
    assert.match(page, /linha-tempo-cliente-/);
    assert.match(page, /OS Gerada/);
    assert.match(page, /Fatura cliente/);
    assert.match(page, /mesclarLinhasQuadro/);
    assert.match(page, /aplicarPisoComissaoQuadro/);
    assert.match(page, /montarApuracaoPorComercial/);
    assert.match(page, /filtrarLinhasAposCadastro/);
    assert.match(page, /lancamentoAposCadastro/);
    assert.match(page, /comissaoSomentePropria/);
    assert.match(page, /carregarNomesClientesDoComercial/);
    assert.match(page, /50 mil/);
    assert.match(page, /\/api\/comissoes\/quadro/);
    assert.match(page, /\/api\/comissoes\/sync-faturas/);
    assert.match(page, /authFetch/);
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
    assert.match(ingest, /op === 'quadro'/);
    assert.match(ingest, /assertComissoesQuadroAccess/);
    assert.match(ingest, /cobertura/);
    assert.match(vercel, /\/api\/comissoes\/ingest/);
    assert.match(vercel, /\/api\/comissoes\/quadro/);
    assert.match(vercel, /\/api\/comissoes\/sync-faturas/);
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

    const { valorComissaoLinhaAposPiso } = await import('../lib/comissao/tabelaComissaoPadrao');
    const tvm = valorComissaoLinhaAposPiso({ valorComissao: 83.15, brutoComercialNoPeriodo: 3299.67 });
    assert.equal(tvm.abaixoDoPiso, true);
    assert.equal(tvm.valor, 0);
    assert.equal(tvm.percentual, 0);
    const liberada = valorComissaoLinhaAposPiso({ valorComissao: 83.15, brutoComercialNoPeriodo: 50_000 });
    assert.equal(liberada.abaixoDoPiso, false);
    assert.equal(liberada.valor, 83.15);
    const { ordenarComissoesLiberadasPrimeiro, valorColunaPagamentoComissao } = await import('../lib/comissao/tabelaComissaoPadrao');
    const ordem = ordenarComissoesLiberadasPrimeiro([
      { id: 'a', status: 'AGUARDANDO_PAGAMENTO_CLIENTE' },
      { id: 'b', status: 'LIBERADO_PARA_PAGAMENTO' },
      { id: 'c', status: 'PAGO' },
      { id: 'd', status: 'LIBERADO_PARA_PAGAMENTO' },
    ]);
    assert.deepEqual(ordem.map((r) => r.id), ['b', 'd', 'a', 'c']);
    assert.equal(valorColunaPagamentoComissao('LIBERADO_PARA_PAGAMENTO', 144.04, false), 144.04);
    assert.equal(valorColunaPagamentoComissao('AGUARDANDO_PAGAMENTO_CLIENTE', 144.04, false), null);
    assert.equal(valorColunaPagamentoComissao('LIBERADO_PARA_PAGAMENTO', 0, true), null);
    assert.equal(valorColunaPagamentoComissao('PAGO', 144.04, false), 144.04);
    assert.equal(valorColunaPagamentoComissao('PAGO', 0, true), null);
    const { somarListaComissao } = await import('../lib/comissao/tabelaComissaoPadrao');
    const soma = somarListaComissao([
      { valorComissao: 288.07, aPagar: 288.07 },
      { valorComissao: 25.25, aPagar: null },
    ]);
    assert.equal(soma.comissao, 313.32);
    assert.equal(soma.aPagar, 288.07);
    assert.equal(liberada.percentual, 3);

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
    const { casarClienteDaFatura, divergenciaTemComercialSelecionado, montarPendenciasComissao } = await import('../lib/comissao/sincronizarComissoesFaturas');
    const clients = [
      { id: 1, name: 'CEVA LOGISTICS LTDA', trading_name: 'CEVA', responsavel_comercial_id: null },
      { id: 37, name: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', trading_name: 'TECHTRANS TRANSPORTES', responsavel_comercial_id: 'abc' },
      { id: 86, name: 'LUFT LOGISTICS LTDA', trading_name: 'LUFT', responsavel_comercial_id: null },
      { id: 91, name: 'LUFT LOGISTICS LTDA', trading_name: 'LUFT LOGISTICS LTDA', responsavel_comercial_id: null },
    ];
    assert.equal(casarClienteDaFatura('CEVA', clients).status, 'ok');
    assert.equal(casarClienteDaFatura('CEVA', clients).client?.id, 1);
    assert.equal(casarClienteDaFatura('TECHTRANS TRANSPORTES', clients).status, 'ok');
    assert.equal(
      casarClienteDaFatura('TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', clients).status,
      'ok',
    );
    assert.equal(casarClienteDaFatura('TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', clients).client?.id, 37);
    assert.equal(casarClienteDaFatura('LUFT LOGISTICS LTDA', clients).status, 'ambiguous');
    assert.equal(divergenciaTemComercialSelecionado('TECHTRANS TRANSPORTES', clients), true);
    assert.equal(divergenciaTemComercialSelecionado('CEVA', clients), false);
    assert.equal(divergenciaTemComercialSelecionado('LUFT LOGISTICS LTDA', clients), false);
    assert.equal(divergenciaTemComercialSelecionado('DESCONHECIDO', clients), false);
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
    assert.match(helper, /from '\.\/comissaoCore\.js'/);
    const persist = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    assert.match(persist, /if \(invoiceId\)/);
    assert.doesNotMatch(persist, /if \(created && invoiceId\)/);
    const asaas = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(asaas, /entityId: bodyClientId/);
  });
});

describe('comissao comercial — quadro por cliente', () => {
  it('lista só faturas com comercial e detalha pago/em aberto', async () => {
    const { montarQuadroClientes, anosFiltroComissao, somarQuadro, faturaNoPeriodo, faturaClienteEstaPaga } = await import('../lib/comissao/quadroFaturamentoComissao');
    const linhas = montarQuadroClientes(
      [
        { empresa: 'TM_SEG', cliente: 'CEVA', amount: 10000, date: '2026-09-08', status: 'EMITIDA' },
        { empresa: 'TM_SEG', cliente: 'TECHTRANS TRANSPORTES', amount: 5000, date: '2026-09-01', status: 'PAGA', osIds: ['GTM-1'] },
        { empresa: 'TM_SEG', cliente: 'TECHTRANS TRANSPORTES', amount: 2000, date: '2026-09-08', status: 'EMITIDA' },
        { empresa: 'TM_SEG', cliente: 'X', amount: 1000, date: '2026-09-02', status: 'CANCELADA' },
      ],
      [
        { id: 1, name: 'CEVA LOGISTICS LTDA', trading_name: 'CEVA', responsavel_comercial_id: null },
        { id: 37, name: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', trading_name: 'TECHTRANS TRANSPORTES', responsavel_comercial_id: 'abc' },
      ],
      [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      '2026-09-01',
      '2026-09-30',
    );
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].cliente, 'TECHTRANS TRANSPORTES');
    assert.equal(linhas[0].comercialNome, 'MIGUEL MOTA');
    assert.equal(linhas[0].faturas, 2);
    assert.equal(linhas[0].faturamento, 7000);
    assert.equal(linhas[0].detalhes.length, 2);
    assert.equal(linhas[0].detalhes.some((d) => d.pago && d.osIds.includes('GTM-1')), true);
    assert.equal(linhas[0].detalhes.some((d) => !d.pago), true);
    const tot = somarQuadro(linhas);
    assert.equal(tot.faturas, 2);
    assert.equal(faturaNoPeriodo('2026-09-08', '2026-09-01', '2026-09-30'), true);
    assert.equal(faturaClienteEstaPaga({ status: 'PAGA' }), true);
    assert.equal(faturaClienteEstaPaga({ receivableStatus: 'PAID' }), true);
    assert.equal(faturaClienteEstaPaga({ status: 'EMITIDA' }), false);
    assert.ok(anosFiltroComissao(2024).includes(2026));
  });

  it('não zera o quadro se a consulta de clientes falhar', async () => {
    const { carregarQuadroTmSeg } = await import('../lib/comissao/quadroFaturamentoComissao');
    const sb = {
      from(table: string) {
        const rows = table === 'financial_invoices'
          ? [{ id: '1', client: 'CEVA', number: 'NF-1', amount: 10000, date: '2026-09-08', status: 'EMITIDA' }]
          : [];
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          ilike() { return chain; },
          range() {
            if (table === 'clients') return Promise.resolve({ data: null, error: { message: 'column missing' } });
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return chain;
      },
    };
    const quadro = await carregarQuadroTmSeg(sb as any, '2026-09-01', '2026-09-30', []);
    assert.equal(quadro.linhas.length, 0);
    assert.match(String(quadro.error || ''), /column missing/);
  });

  it('monta TORRES só com comercial e mescla ingest sem duplicar', async () => {
    const {
      quadroDeComissoesTorres,
      mesclarLinhasQuadro,
      faturaClienteEstaPaga,
    } = await import('../lib/comissao/quadroFaturamentoComissao');
    const linhas = quadroDeComissoesTorres(
      [
        {
          id: '67dfcf35',
          origem_fatura_id: '1ba27c7a-8451-45c0-b274-7df40bc3495d',
          empresa_origem: 'TORRES',
          cliente_nome: 'TVM LOG',
          valor_faturamento: 3299.67,
          data_faturamento: '2026-09-09',
          status: 'AGUARDANDO_PAGAMENTO_CLIENTE',
          comercial_id: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32',
          ordem_servico_id: '1188',
        },
        {
          empresa_origem: 'TORRES',
          cliente_nome: 'SEM COMERCIAL',
          valor_faturamento: 10000,
          data_faturamento: '2026-09-09',
          comercial_id: null,
        },
      ],
      [{ id: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32', nome: 'MIGUEL MOTA' }],
    );
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].cliente, 'TVM LOG');
    assert.equal(linhas[0].comercialNome, 'MIGUEL MOTA');
    assert.equal(linhas[0].detalhes[0].osIds.includes('1188'), true);
    assert.equal(linhas[0].detalhes[0].pago, false);
    const live = quadroDeComissoesTorres(
      [{
        id: '1ba27c7a-8451-45c0-b274-7df40bc3495d',
        origem_fatura_id: '1ba27c7a-8451-45c0-b274-7df40bc3495d',
        empresa_origem: 'TORRES',
        cliente_nome: 'TVM LOG',
        valor_faturamento: 3299.67,
        data_faturamento: '2026-09-09',
        status: 'PENDING',
        comercial_id: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32',
        ordem_servico_id: '1188',
      }],
      [{ id: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32', nome: 'MIGUEL MOTA' }],
    );
    const mesclado = mesclarLinhasQuadro(live, linhas);
    assert.equal(mesclado.length, 1);
    assert.equal(mesclado[0].detalhes.length, 1);
    assert.equal(mesclado[0].faturamento, 3299.67);
    const aoVivo = [{
      ...live[0],
      faturamento: 3299.67,
      detalhes: [{ ...live[0].detalhes[0], id: 'inv:1ba27c7a-8451-45c0-b274-7df40bc3495d' }],
    }];
    const semPrefixo = mesclarLinhasQuadro(aoVivo, linhas);
    assert.equal(semPrefixo[0].detalhes.length, 1);
    assert.equal(semPrefixo[0].faturas, 1);
    assert.equal(semPrefixo[0].faturamento, 3299.67);
    assert.equal(faturaClienteEstaPaga({ status: 'RECEIVED', paymentDate: null }), true);
    assert.equal(faturaClienteEstaPaga({ status: 'PENDING' }), false);
  });

  it('só libera comissão % depois de R$ 50 mil do comercial no período', async () => {
    const { aplicarPisoComissaoQuadro, PISO_FATURAMENTO_COMISSAO } = await import('../lib/comissao/quadroFaturamentoComissao');
    const { TABELA_COMISSAO_PADRAO } = await import('../lib/comissao/tabelaComissaoPadrao');
    assert.equal(PISO_FATURAMENTO_COMISSAO, TABELA_COMISSAO_PADRAO.pisoComissao);
    const abaixo = aplicarPisoComissaoQuadro(
      [{
        empresa: 'TM SEG', cliente: 'TECHTRANS', faturas: 1, faturamento: 40_000, imposto: 6400, baseLiquida: 33600,
        comissao: 1008, comercialId: 'abc', comercialNome: 'MIGUEL',
        detalhes: [{ id: '1', numero: 'NF-1', date: '2026-09-01', faturamento: 40000, imposto: 6400, valorAPagar: 1008, pago: false, osIds: [] }],
      }],
      [{
        empresa: 'TORRES', cliente: 'TVM LOG', faturas: 1, faturamento: 3299.67, imposto: 527.95, baseLiquida: 2771.72,
        comissao: 83.15, comercialId: 'abc', comercialNome: 'MIGUEL',
        detalhes: [{ id: '2', numero: '1188', date: '2026-09-09', faturamento: 3299.67, imposto: 527.95, valorAPagar: 83.15, pago: false, osIds: ['1188'] }],
      }],
    );
    assert.equal(abaixo.linhasTm[0].comissao, 0);
    assert.equal(abaixo.linhasTorres[0].comissao, 0);
    assert.equal(abaixo.linhasTm[0].abaixoDoPiso, true);
    assert.equal(abaixo.linhasTm[0].detalhes[0].valorAPagar, 0);
    assert.equal(abaixo.linhasTm[0].faturamento, 40_000);

    const acima = aplicarPisoComissaoQuadro(
      [{
        empresa: 'TM SEG', cliente: 'TECHTRANS', faturas: 1, faturamento: 50_000, imposto: 8000, baseLiquida: 42000,
        comissao: 1260, comercialId: 'abc', comercialNome: 'MIGUEL',
        detalhes: [{ id: '1', numero: 'NF-1', date: '2026-09-01', faturamento: 50000, imposto: 8000, valorAPagar: 1260, pago: false, osIds: [] }],
      }],
      [],
    );
    assert.equal(acima.linhasTm[0].comissao, 1260);
    assert.equal(acima.linhasTm[0].abaixoDoPiso, false);

    const doisComerciais = aplicarPisoComissaoQuadro(
      [{
        empresa: 'TM SEG', cliente: 'A', faturas: 1, faturamento: 60_000, imposto: 9600, baseLiquida: 50400,
        comissao: 1512, comercialId: 'miguel', comercialNome: 'MIGUEL',
        detalhes: [{ id: 'a', numero: '1', date: '2026-09-01', faturamento: 60000, imposto: 9600, valorAPagar: 1512, pago: false, osIds: [] }],
      }],
      [{
        empresa: 'TORRES', cliente: 'B', faturas: 1, faturamento: 10_000, imposto: 1600, baseLiquida: 8400,
        comissao: 252, comercialId: 'cassi', comercialNome: 'CASSIANE',
        detalhes: [{ id: 'b', numero: '2', date: '2026-09-01', faturamento: 10000, imposto: 1600, valorAPagar: 252, pago: false, osIds: [] }],
      }],
    );
    assert.equal(doisComerciais.linhasTm[0].comissao, 1512);
    assert.equal(doisComerciais.linhasTorres[0].comissao, 0);

    const somaEmpresas = aplicarPisoComissaoQuadro(
      [{
        empresa: 'TM SEG', cliente: 'A', faturas: 1, faturamento: 40_000, imposto: 6400, baseLiquida: 33600,
        comissao: 1008, comercialId: 'abc', comercialNome: 'MIGUEL',
        detalhes: [{ id: '1', numero: 'NF-1', date: '2026-09-01', faturamento: 40000, imposto: 6400, valorAPagar: 1008, pago: false, osIds: [] }],
      }],
      [{
        empresa: 'TORRES', cliente: 'B', faturas: 1, faturamento: 15_000, imposto: 2400, baseLiquida: 12600,
        comissao: 378, comercialId: 'abc', comercialNome: 'MIGUEL',
        detalhes: [{ id: '2', numero: 'T-1', date: '2026-09-09', faturamento: 15000, imposto: 2400, valorAPagar: 378, pago: false, osIds: [] }],
      }],
    );
    assert.equal(somaEmpresas.linhasTm[0].comissao, 1008);
    assert.equal(somaEmpresas.linhasTorres[0].comissao, 378);
    assert.equal(somaEmpresas.linhasTm[0].abaixoDoPiso, false);
  });
});

describe('comissao comercial — quadro TORRES ao vivo', () => {
  it('lê receita TORRES com comercial e ignora fatura sem responsável', async () => {
    const { carregarFaturasQuadroTorresLive, carregarQuadroTorres } = await import('../lib/comissao/quadroTorres');
    const tables: Record<string, any[]> = {
      clients: [
        { id: 62, name: 'TVM LOG', nome_fantasia: 'TVM LOG', responsavel_comercial_id: 'abc' },
        { id: 63, name: 'TECHTRANS TRANSPORTES', nome_fantasia: 'TECHTRANS TRANSPORTES', razao_social: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', responsavel_comercial_id: 'abc' },
      ],
      invoices: [{
        id: 161, client_id: 6, client_name: 'TM SEGURANCA', value: 100000, status: 'PENDING', due_date: '2026-09-04',
      }],
      financial_transactions: [{
        id: '1ba27c7a-8451-45c0-b274-7df40bc3495d',
        entity_name: 'TVM LOG',
        entity_id: '62',
        amount: 3299.67,
        status: 'PENDING',
        due_date: '2026-09-09',
        origin_type: 'service_order',
        origin_id: '1188',
        type: 'INCOME',
      }],
      escort_billings: [
        {
          service_order_id: 1191,
          client_id: 63,
          client_name: 'TECHTRANS TRANSPORTES',
          fat_total: 4447.51,
          status: 'A_VERIFICAR',
          data_missao: '2026-09-09',
          invoice_id: null,
          pago_em: null,
        },
        {
          service_order_id: 1190,
          client_id: 63,
          client_name: 'TECHTRANS TRANSPORTES',
          fat_total: 0,
          status: 'CANCELADO',
          data_missao: '2026-09-08',
        },
      ],
    };
    const sb = {
      from(table: string) {
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          range() { return Promise.resolve({ data: tables[table] || [], error: null }); },
        };
        return chain;
      },
    };
    const live = await carregarFaturasQuadroTorresLive(sb as any, '2026-09-01', '2026-09-30');
    assert.equal(live.faturas.length, 2);
    assert.ok(live.faturas.some((f) => f.cliente === 'TVM LOG' && f.osIds.includes('1188')));
    assert.ok(live.faturas.some((f) => String(f.cliente || '').includes('TECHTRANS') && f.osIds.includes('1191')));
    const quadro = await carregarQuadroTorres(
      {
        from() {
          const chain: any = {
            select() { return chain; },
            eq() { return chain; },
            gte() { return chain; },
            lte() { return chain; },
            range() { return Promise.resolve({ data: [], error: null }); },
          };
          return chain;
        },
      } as any,
      '2026-09-01',
      '2026-09-30',
      [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      sb as any,
    );
    assert.equal(quadro.linhas.length, 2);
    assert.ok(quadro.linhas.some((l) => l.cliente.includes('TVM')));
    assert.ok(quadro.linhas.some((l) => l.cliente.includes('TECHTRANS')));
    assert.equal(quadro.linhas[0].comercialNome, 'MIGUEL MOTA');
  });

  it('missão cancelada entra na comissão e missão recusada fica de fora', async () => {
    const { carregarFaturasQuadroTorresLive } = await import('../lib/comissao/quadroTorres');
    const tables: Record<string, any[]> = {
      clients: [{ id: 1, name: 'NOVA MINAS LOGISTICA', responsavel_comercial_id: 'abc' }],
      invoices: [],
      financial_transactions: [],
      service_orders: [
        { id: 10, os_number: 'TOR-0010', status: 'cancelada', mission_status: 'cancelada', origin: 'GRU', destination: 'Betim', scheduled_date: '2026-09-08' },
        { id: 11, os_number: 'TOR-0011', status: 'recusada', mission_status: 'recusada', origin: 'GRU', destination: 'Cajamar', scheduled_date: '2026-09-09' },
      ],
      escort_billings: [
        { service_order_id: 10, client_id: 1, client_name: 'NOVA MINAS LOGISTICA', fat_total: 800, status: 'CANCELADO', data_missao: '2026-09-08', origem: 'GRU', destino: 'Betim' },
        { service_order_id: 11, client_id: 1, client_name: 'NOVA MINAS LOGISTICA', fat_total: 900, status: 'RECUSADA', data_missao: '2026-09-09', origem: 'GRU', destino: 'Cajamar' },
      ],
    };
    const sb = {
      from(table: string) {
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          range() { return Promise.resolve({ data: tables[table] || [], error: null }); },
        };
        return chain;
      },
    };
    const live = await carregarFaturasQuadroTorresLive(sb as any, '2026-09-01', '2026-09-30');
    assert.equal(live.faturas.length, 1);
    assert.equal(live.faturas[0].number, 'TOR-0010');
    assert.equal(live.faturas[0].rotas?.[0].destino, 'Betim');
    assert.equal(live.rotas.some((rota) => rota.osNumero === 'TOR-0011'), true);
  });
});

describe('comissao comercial — rota e quinzena da missão TORRES', () => {
  it('fatura antiga cancelada mostra a OS concluída na 1ª quinzena', async () => {
    const {
      decorarComissaoTorres,
      linhaNaQuinzenaComissao,
      comissaoDuplicadaNoPeriodo,
    } = await import('../lib/comissao/rotaMissaoComissao');
    const rotas = [
      {
        osId: '1186', osNumero: 'TOR-0792', origem: 'Aeroporto Internacional de Guarulhos (GRU)', destino: 'Betim',
        dataMissao: '2026-09-08', statusOs: 'concluida', statusMissao: 'finalizada', invoiceId: '201',
        cliente: 'NOVA MINAS LOGISTICA', valor: 3371.27,
      },
      {
        osId: '1197', osNumero: 'TOR-0803', origem: 'Aeroporto de Guarulhos (GRU)', destino: 'Betim',
        dataMissao: '2026-09-09', statusOs: 'concluida', statusMissao: 'finalizada', invoiceId: '201',
        cliente: 'NOVA MINAS LOGISTICA', valor: 3245.6,
      },
      {
        osId: '1198', osNumero: 'TOR-0804', origem: 'Palmar Modular', destino: 'Cajamar',
        dataMissao: '2026-09-10', statusOs: 'concluida', statusMissao: 'finalizada', invoiceId: '200',
        cliente: 'NIMBUS EXPRESS TRANSPORTES LTDA', valor: 550,
      },
    ];
    const antiga = decorarComissaoTorres({
      empresa_origem: 'TORRES', status: 'CANCELADO', origem_fatura_id: '184', fatura_numero: '184',
      cliente_nome: 'NOVA MINAS LOGISTICA', valor_faturamento: 6616.87,
    }, rotas);
    assert.equal(antiga.substituida, true);
    assert.equal(antiga.faturaViva, '201');
    assert.equal(antiga.concluida, true);
    assert.deepEqual(antiga.os.map((os) => os.osNumero), ['TOR-0792', 'TOR-0803']);
    assert.equal(linhaNaQuinzenaComissao(antiga.datasMissao, '2026-09-18', 'q1'), true);
    assert.equal(linhaNaQuinzenaComissao(antiga.datasMissao, '2026-09-18', 'q2'), false);
    const nimbus = decorarComissaoTorres({
      empresa_origem: 'TORRES', status: 'CANCELADO', origem_fatura_id: '185', fatura_numero: '185',
      cliente_nome: 'NIMBUS EXPRESS TRANSPORTES LTDA', valor_faturamento: 550,
    }, rotas);
    assert.equal(nimbus.os[0].osNumero, 'TOR-0804');
    assert.equal(nimbus.os[0].destino, 'Cajamar');
    const osSolta = decorarComissaoTorres({
      empresa_origem: 'TORRES', status: 'AGUARDANDO_PAGAMENTO_CLIENTE', origem_fatura_id: 'os:1186', fatura_numero: '1186',
      cliente_nome: 'NOVA MINAS LOGISTICA', valor_faturamento: 3371.27,
    }, rotas);
    assert.equal(osSolta.jaNaFatura, '201');
    const faturaViva = decorarComissaoTorres({
      empresa_origem: 'TORRES', status: 'AGUARDANDO_PAGAMENTO_CLIENTE', origem_fatura_id: '201', fatura_numero: '201',
      cliente_nome: 'NOVA MINAS LOGISTICA', valor_faturamento: 6616.87,
    }, rotas);
    assert.equal(faturaViva.substituida, false);
    assert.equal(faturaViva.jaNaFatura, null);
    assert.equal(comissaoDuplicadaNoPeriodo(antiga, new Set(['201'])), true);
    assert.equal(comissaoDuplicadaNoPeriodo(osSolta, new Set(['201'])), true);
    assert.equal(comissaoDuplicadaNoPeriodo(faturaViva, new Set(['201'])), false);
    assert.equal(comissaoDuplicadaNoPeriodo(osSolta, new Set()), false);
  });
});

describe('comissao comercial — trocar NF e puxar da TORRES', () => {
  it('recalcula a mesma regra, usa a data da missão e não duplica', async () => {
    const { montarPatchReligarFatura, normalizarNumeroFatura, executarReligarFaturaTorres } = await import('../lib/comissao/religarFaturaTorres');
    assert.equal(normalizarNumeroFatura('NF 331'), '331');
    assert.equal(normalizarNumeroFatura('torres-inv-205'), '205');
    const aberto = montarPatchReligarFatura({
      statusAtual: 'CANCELADO',
      percentualImposto: 16,
      percentualComissao: 3,
      dataAtual: '2026-09-18',
      fatura: { id: '201', nfseNumero: '332', cliente: 'NOVA MINAS LOGISTICA', valor: 6616.87, status: 'OVERDUE', paymentDate: null, dueDate: '2026-10-02' },
      missoes: [
        { osId: '1186', osNumero: 'TOR-0792', dataMissao: '2026-09-08' },
        { osId: '1197', osNumero: 'TOR-0803', dataMissao: '2026-09-09' },
      ],
    });
    assert.equal(aberto.ok, true);
    if (!aberto.ok) return;
    assert.equal(aberto.patch.origem_fatura_id, '201');
    assert.equal(aberto.patch.valor_comissao, 166.75);
    assert.equal(aberto.patch.data_faturamento, '2026-09-08');
    assert.equal(aberto.patch.status, 'AGUARDANDO_PAGAMENTO_CLIENTE');
    assert.equal(aberto.patch.ordem_servico_id, '1186');
    assert.equal(aberto.liberouAgora, false);
    const paga = montarPatchReligarFatura({
      statusAtual: 'CANCELADO',
      percentualImposto: 16,
      percentualComissao: 3,
      fatura: { id: '200', nfseNumero: '331', cliente: 'NIMBUS', valor: 550, status: 'CONFIRMED', paymentDate: '2026-10-05', dueDate: '2026-10-05' },
      missoes: [{ osId: '1198', osNumero: 'TOR-0804', dataMissao: '2026-09-10' }],
    });
    assert.equal(paga.ok && paga.patch.status, 'LIBERADO_PARA_PAGAMENTO');
    assert.equal(paga.ok && paga.liberouAgora, true);
    assert.equal(montarPatchReligarFatura({
      statusAtual: 'PAGO', percentualImposto: 16, percentualComissao: 3,
      fatura: { id: '201', nfseNumero: null, cliente: 'A', valor: 10, status: 'PENDING', paymentDate: null, dueDate: '2026-09-10' },
      missoes: [],
    }).ok, false);
    const lancada = montarPatchReligarFatura({
      statusAtual: 'AGUARDANDO_PAGAMENTO_CLIENTE', contaPagarId: 'x', percentualImposto: 16, percentualComissao: 3,
      fatura: { id: '201', nfseNumero: null, cliente: 'A', valor: 10, status: 'PENDING', paymentDate: null, dueDate: '2026-09-10' },
      missoes: [],
    });
    assert.equal(lancada.ok, false);
    if (!lancada.ok) assert.match(lancada.error, /lançada/);
    assert.equal(montarPatchReligarFatura({
      statusAtual: 'CANCELADO', percentualImposto: 16, percentualComissao: 3, outraComissaoId: 'outra',
      fatura: { id: '201', nfseNumero: null, cliente: 'A', valor: 10, status: 'PENDING', paymentDate: null, dueDate: '2026-09-10' },
      missoes: [],
    }).ok, false);

    const tm = {
      comissoes: [{
        id: 'c-184', status: 'CANCELADO', empresa_origem: 'TORRES', conta_pagar_id: null,
        percentual_imposto_aplicado: 16, percentual_comissao_aplicado: 3,
        data_faturamento: '2026-09-18', data_recebimento_cliente: null, cliente_nome: 'NOVA MINAS LOGISTICA',
        origem_fatura_id: '184',
      }],
    };
    const torres = {
      invoices: [{ id: 201, client_name: 'NOVA MINAS LOGISTICA', value: 6616.87, status: 'OVERDUE', due_date: '2026-10-02', payment_date: null, nfse_number: '332' }],
      escort_billings: [
        { invoice_id: 201, service_order_id: 1186, data_missao: '2026-09-08', os_number: null },
      ],
      service_orders: [{ id: 1186, os_number: 'TOR-0792' }],
    };
    const cliente = (tabelas: Record<string, any[]>) => ({
      from(table: string) {
        const filtros: Array<[string, string, unknown]> = [];
        const casa = (row: any) => filtros.every(([op, col, val]) => {
          if (op === 'eq') return String(row[col]) === String(val);
          if (op === 'neq') return String(row[col]) !== String(val);
          if (op === 'in') return (val as unknown[]).map(String).includes(String(row[col]));
          return true;
        });
        const chain: any = {
          select() { return chain; },
          eq(col: string, val: unknown) { filtros.push(['eq', col, val]); return chain; },
          neq(col: string, val: unknown) { filtros.push(['neq', col, val]); return chain; },
          in(col: string, val: unknown) { filtros.push(['in', col, val]); return chain; },
          limit() { return chain; },
          maybeSingle() {
            const linha = (tabelas[table] || []).find(casa) || null;
            return Promise.resolve({ data: linha, error: null });
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(col: string, val: unknown) {
                filtros.push(['eq', col, val]);
                const linha = (tabelas[table] || []).find(casa);
                if (linha) Object.assign(linha, patch);
                return { select: () => Promise.resolve({ data: linha ? [linha] : [], error: null }) };
              },
            };
          },
          then(resolve: (v: unknown) => void) {
            resolve({ data: (tabelas[table] || []).filter(casa), error: null });
          },
        };
        return chain;
      },
    });
    const res = await executarReligarFaturaTorres(cliente(tm) as any, cliente(torres) as any, { comissaoId: 'c-184', faturaNumero: 'NF 332' });
    assert.equal(res.ok, true);
    assert.equal(tm.comissoes[0].origem_fatura_id, '201');
    assert.equal(tm.comissoes[0].data_faturamento, '2026-09-08');
    assert.match(res.mensagem || '', /TOR-0792/);
    const page = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    const ingest = fs.readFileSync('api/comissoes-ingest.ts', 'utf8');
    assert.match(page, /btn-trocar-fatura-/);
    assert.match(page, /\/api\/comissoes\/religar-fatura-torres/);
    assert.match(vercel, /religar-fatura-torres/);
    assert.match(ingest, /op === 'religar-fatura-torres'/);
    assert.equal(Object.keys(JSON.parse(vercel).functions || {}).length, 50);
  });
});

describe('comissao comercial — cobertura OS e dashboard', () => {
  it('marca OS faturada por NF ou vínculo e não inventa faturada só com auditoria', async () => {
    const { osEstaFaturada, montarCoberturaOsPeriodo } = await import('../lib/comissao/coberturaOsPeriodo');
    assert.equal(osEstaFaturada({ invoiceNumber: 'NF-1', missionId: 'GTM-1', idsVinculados: new Set() }), true);
    assert.equal(osEstaFaturada({ invoiceNumber: '0', missionId: 'GTM-2', idsVinculados: new Set(['GTM-2']) }), true);
    assert.equal(osEstaFaturada({ invoiceNumber: null, missionId: 'GTM-3', idsVinculados: new Set() }), false);

    const cob = montarCoberturaOsPeriodo({
      missions: [
        { id: 'GTM-1', client: 'TECHTRANS TRANSPORTES', status: 'Concluída', end_time: '2026-09-08T12:00:00', invoice_number: 'NF-1', revenue_value: 1000, cost_value: 400, is_same_os: false },
        { id: 'GTM-2', client: 'TECHTRANS TRANSPORTES', status: 'Concluída', end_time: '2026-09-09T12:00:00', invoice_number: null, revenue_value: 500, cost_value: 200, is_same_os: false },
        { id: 'GTM-3', client: 'TECHTRANS TRANSPORTES', status: 'Em Viagem', end_time: '2026-09-09T12:00:00', invoice_number: null, revenue_value: 900, cost_value: 100 },
      ],
      clients: [{ id: 37, name: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', trading_name: 'TECHTRANS TRANSPORTES', responsavel_comercial_id: 'abc' }],
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      idsVinculados: new Set(),
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    assert.equal(cob.estado, 'ENCONTRADO');
    assert.equal(cob.totais.missoes, 2);
    assert.equal(cob.totais.faturadas, 1);
    assert.equal(cob.totais.semFatura, 1);
    assert.equal(cob.porCliente[0].comercialNome, 'MIGUEL MOTA');
    assert.equal(cob.porCliente[0].osSemFaturaIds.includes('GTM-2'), true);
    assert.equal(cob.porCliente[0].margemPct != null, true);
    assert.equal(cob.itens.some((os) => os.date === '2026-09-09'), true);
  });

  it('OS concluída sem NF com comercial vira linha do quadro', async () => {
    const { faturasDeOsParaQuadro, montarQuadroClientes } = await import('../lib/comissao/quadroFaturamentoComissao');
    const { montarCoberturaOsPeriodo } = await import('../lib/comissao/coberturaOsPeriodo');
    const cob = montarCoberturaOsPeriodo({
      missions: [
        { id: 'GTM-7704', client: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', status: 'Concluída', end_time: '2026-09-09', invoice_number: null, revenue_value: 1311.88, cost_value: 400 },
        { id: 'GTM-7705', client: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', status: 'Concluída', end_time: '2026-09-09', invoice_number: null, revenue_value: 732.24, cost_value: 200 },
        { id: 'GTM-7749', client: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', status: 'Agendada', end_time: null, revenue_value: 3389.04 },
      ],
      clients: [{ id: 37, name: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', trading_name: 'TECHTRANS TRANSPORTES', responsavel_comercial_id: 'abc' }],
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      idsVinculados: new Set(),
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    const linhas = montarQuadroClientes(
      faturasDeOsParaQuadro(cob.itens),
      [],
      [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      '2026-09-01',
      '2026-09-30',
    );
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].comercialNome, 'MIGUEL MOTA');
    assert.equal(linhas[0].faturas, 2);
    assert.ok(linhas[0].detalhes.some((d) => d.osIds.includes('GTM-7704')));
  });

  it('não declara OS sem fatura quando o vínculo não carregou', async () => {
    const { montarCoberturaOsPeriodo } = await import('../lib/comissao/coberturaOsPeriodo');
    const cob = montarCoberturaOsPeriodo({
      missions: [
        { id: 'GTM-9', client: 'TECHTRANS TRANSPORTES', status: 'Faturada', end_time: '2026-09-08', invoice_number: null, revenue_value: 100, cost_value: 40 },
      ],
      clients: [{ id: 37, name: 'TECHTRANS TRANSPORTES', trading_name: 'TECHTRANS TRANSPORTES', responsavel_comercial_id: 'abc' }],
      comerciais: [{ id: 'abc', nome: 'MIGUEL' }],
      idsVinculados: new Set(),
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      consultaIncompleta: true,
      error: 'financial_invoice_missions indisponível',
    });
    assert.equal(cob.estado, 'CONSULTA INCOMPLETA');
    assert.equal(cob.totais.missoes, 1);
    assert.equal(cob.totais.semFatura, 0);
    assert.equal(cob.porCliente[0].estado, 'CONSULTA INCOMPLETA');
  });

  it('monta quadro do funcionário com bruto, imposto, 3% e pagamento fatura×comissão', async () => {
    const { montarQuadrosFuncionarios, acharComissaoDaFatura, montarKpisDashboard } = await import('../lib/comissao/dashboardComissoes');
    const linhas = [{
      empresa: 'TM SEG' as const,
      cliente: 'TECHTRANS TRANSPORTES',
      faturas: 1,
      faturamento: 50_000,
      imposto: 8000,
      baseLiquida: 42_000,
      comissao: 1260,
      comercialId: 'abc',
      comercialNome: 'MIGUEL MOTA',
      abaixoDoPiso: false,
      detalhes: [{ id: 'inv-1', numero: 'NF-1', date: '2026-09-01', faturamento: 50000, imposto: 8000, valorAPagar: 1260, pago: true, osIds: ['GTM-1'] }],
    }];
    const cobertura = {
      estado: 'ENCONTRADO' as const,
      consultaIncompleta: false,
      itens: [],
      porCliente: [{
        cliente: 'TECHTRANS TRANSPORTES',
        comercialId: 'abc',
        comercialNome: 'MIGUEL MOTA',
        missoes: 3,
        faturadas: 3,
        semFatura: 0,
        osSemFaturaIds: [],
        receita: 50000,
        custo: 30000,
        lucro: 20000,
        margemPct: 40,
        estado: 'ENCONTRADO' as const,
      }],
      totais: { missoes: 3, faturadas: 3, semFatura: 0, receita: 50000, custo: 30000, lucro: 20000 },
    };
    const rows = [{
      id: 'c1',
      fatura_id: 'inv-1',
      fatura_numero: 'NF-1',
      comercial_id: 'abc',
      valor_faturamento: 50000,
      valor_comissao: 1260,
      percentual_comissao_aplicado: 3,
      status: 'LIBERADO_PARA_PAGAMENTO' as const,
    }];
    const funcionarios = montarQuadrosFuncionarios({
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA', valor_fixo: 0, usuario_id: 1 }],
      linhas,
      rows,
      cobertura,
    });
    assert.equal(funcionarios.length, 1);
    assert.equal(funcionarios[0].missoes, 3);
    assert.equal(funcionarios[0].faturamentoBruto, 50000);
    assert.equal(funcionarios[0].imposto, 8000);
    assert.equal(funcionarios[0].comissao3, 1260);
    assert.equal(funcionarios[0].valorFixo, 0);
    assert.equal(funcionarios[0].totalAPagar, 1260);
    const comFixo = montarQuadrosFuncionarios({
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA', valor_fixo: 2000, usuario_id: 1 }],
      linhas,
      rows,
      cobertura,
    });
    assert.equal(comFixo[0].valorFixo, 2000);
    assert.equal(comFixo[0].comissao3, 1260);
    assert.equal(comFixo[0].totalAPagar, 3260);
    assert.equal(funcionarios[0].clientes[0].margemPct, 40);
    assert.equal(funcionarios[0].clientes[0].statusFatura, 'PAGO');
    assert.equal(funcionarios[0].clientes[0].statusComissao, 'EM_ABERTO');
    assert.equal(funcionarios[0].clientes[0].linhaTempo.etapaAtual, 'COMISSAO');
    assert.equal(funcionarios[0].clientes[0].linhaTempo.etapas[0].estado, 'FEITO');
    assert.equal(funcionarios[0].clientes[0].linhaTempo.etapas[1].estado, 'FEITO');
    assert.equal(funcionarios[0].clientes[0].linhaTempo.etapas[2].estado, 'FEITO');
    assert.equal(acharComissaoDaFatura(rows, { id: 'inv-1', numero: 'NF-1' })?.id, 'c1');
    const kpis = montarKpisDashboard({ linhas, funcionarios, cobertura });
    assert.equal(kpis.comissao3, 1260);
    assert.equal(kpis.missoes, 3);
    assert.equal(kpis.margemOperacionalPct, 40);
  });

  it('cobertura sozinha não substitui o quadro; a API junta OS sem NF nas linhas', async () => {
    const { montarQuadrosFuncionarios, montarApuracaoPorComercial } = await import('../lib/comissao/dashboardComissoes');
    const api = fs.readFileSync('lib/comissao/comissaoQuadroApi.ts', 'utf8');
    assert.match(api, /faturasDeOsParaQuadro/);
    assert.match(api, /mesclarLinhasQuadro/);
    const cobertura = {
      estado: 'ENCONTRADO' as const,
      consultaIncompleta: false,
      itens: [],
      porCliente: [{
        cliente: 'TECHTRANS TRANSPORTES',
        comercialId: 'abc',
        comercialNome: 'MIGUEL MOTA',
        missoes: 21,
        faturadas: 0,
        semFatura: 21,
        osSemFaturaIds: ['GTM-1'],
        receita: 74_440.50,
        custo: 40_000,
        lucro: 34_440.50,
        margemPct: 46.3,
        estado: 'ENCONTRADO' as const,
      }],
      totais: { missoes: 21, faturadas: 0, semFatura: 21, receita: 74_440.50, custo: 40_000, lucro: 34_440.50 },
    };
    const linhas = [{
      empresa: 'TM SEG' as const,
      cliente: 'TECHTRANS TRANSPORTES',
      faturas: 1,
      faturamento: 6_900.72,
      imposto: 1104.12,
      baseLiquida: 5796.60,
      comissao: 0,
      comercialId: 'abc',
      comercialNome: 'MIGUEL MOTA',
      abaixoDoPiso: true,
      detalhes: [{ id: 'inv-1', numero: 'NF-1', date: '2026-09-01', faturamento: 6900.72, imposto: 1104.12, valorAPagar: 0, pago: false, osIds: [] }],
    }, {
      empresa: 'TORRES' as const,
      cliente: 'TVM LOG',
      faturas: 1,
      faturamento: 35_851.34,
      imposto: 5736.21,
      baseLiquida: 30115.13,
      comissao: 0,
      comercialId: 'abc',
      comercialNome: 'MIGUEL MOTA',
      abaixoDoPiso: true,
      detalhes: [{ id: 't-1', numero: '1188', date: '2026-09-09', faturamento: 35851.34, imposto: 5736.21, valorAPagar: 0, pago: false, osIds: ['1188'] }],
    }];
    const funcionarios = montarQuadrosFuncionarios({
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA', valor_fixo: 0, usuario_id: 1 }],
      linhas,
      rows: [{
        id: 'c1',
        comercial_id: 'abc',
        valor_faturamento: 42_752.06,
        valor_comissao: 1077.35,
        percentual_comissao_aplicado: 3,
        status: 'AGUARDANDO_PAGAMENTO_CLIENTE',
      }],
      cobertura,
    });
    const apuracao = montarApuracaoPorComercial({
      linhas,
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA', valor_fixo: 0, usuario_id: 1 }],
    });
    assert.equal(funcionarios[0].faturamentoBruto, 42_752.06);
    assert.equal(funcionarios[0].comissao3, 0);
    assert.equal(funcionarios[0].abaixoDoPiso, true);
    assert.equal(funcionarios[0].osSemFatura, 21);
    assert.equal(apuracao[0].fat, funcionarios[0].faturamentoBruto);
    assert.equal(apuracao[0].tm, 6_900.72);
    assert.equal(apuracao[0].torres, 35_851.34);
    assert.equal(apuracao[0].apuracao.comissaoPercentual, funcionarios[0].comissao3);
    assert.equal(apuracao[0].apuracao.totalAPagar, 0);

    const soOs = montarQuadrosFuncionarios({
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA', valor_fixo: 0, usuario_id: 1 }],
      linhas: [],
      rows: [],
      cobertura,
    });
    assert.equal(soOs[0].faturamentoBruto, 0);
    assert.equal(soOs[0].comissao3, 0);
    assert.equal(soOs[0].osSemFatura, 21);
  });

  it('não agrega NF anterior ao cadastro do comercial', async () => {
    const { dataInicioComissaoDoCadastro, lancamentoAposCadastro, filtrarLinhasAposCadastro } = await import('../lib/comissao/dataInicioComissao');
    assert.equal(dataInicioComissaoDoCadastro({
      usuarioCreatedAt: '2026-09-08T17:05:37.246Z',
      comercialCreatedAt: '2026-09-08T16:44:45.301Z',
    }), '2026-09-08');
    assert.equal(lancamentoAposCadastro('2026-09-07', '2026-09-08'), false);
    assert.equal(lancamentoAposCadastro('2026-09-08', '2026-09-08'), true);
    assert.equal(lancamentoAposCadastro('2026-08-11', '2026-09-08'), false);
    const linhas = filtrarLinhasAposCadastro(
      [{
        empresa: 'TM SEG',
        cliente: 'TRANSPORTE PACHECO',
        faturas: 2,
        faturamento: 14182.89,
        imposto: 2269.26,
        baseLiquida: 11913.63,
        comissao: 357.41,
        comercialId: 'abc',
        comercialNome: 'MIGUEL MOTA',
        detalhes: [
          { id: 'a', numero: 'AGO', date: '2026-08-11', faturamento: 7282.17, imposto: 1165.15, valorAPagar: 183.51, pago: true, osIds: [] },
          { id: 'b', numero: 'SET', date: '2026-09-08', faturamento: 6900.72, imposto: 1104.12, valorAPagar: 173.90, pago: false, osIds: [] },
        ],
      }],
      new Map([['abc', '2026-09-08']]),
    );
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].faturas, 1);
    assert.equal(linhas[0].faturamento, 6900.72);
    assert.equal(linhas[0].detalhes[0].numero, 'SET');
  });

  it('OS concluída do cliente vinculado entra no bruto após o cadastro', async () => {
    const { faturasDeOsParaQuadro, montarQuadroClientes, mesclarLinhasQuadro } = await import('../lib/comissao/quadroFaturamentoComissao');
    const { montarCoberturaOsPeriodo } = await import('../lib/comissao/coberturaOsPeriodo');
    const { filtrarLinhasAposCadastro } = await import('../lib/comissao/dataInicioComissao');
    const cob = montarCoberturaOsPeriodo({
      missions: [
        { id: 'GTM-7704', client: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', status: 'Concluída', end_time: '2026-09-09', invoice_number: null, revenue_value: 1311.88, cost_value: 400 },
        { id: 'GTM-7764', client: 'TRANSPACHECO TRANSPORTE RODOVIARIO DE CARGAS LTDA', status: 'Concluída', end_time: '2026-09-01', invoice_number: null, revenue_value: 668, cost_value: 200 },
        { id: 'GTM-7859', client: 'SANKYU LOGISTICS DO BRASIL LTDA.', status: 'Origem', end_time: null, revenue_value: 790, cost_value: 400 },
      ],
      clients: [
        { id: 37, name: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', trading_name: 'TECHTRANS TRANSPORTES', responsavel_comercial_id: 'abc' },
        { id: 13, name: 'TRANSPACHECO TRANSPORTE RODOVIARIO DE CARGAS LTDA', trading_name: 'TRANSPORTE PACHECO', responsavel_comercial_id: 'abc' },
        { id: 64, name: 'SANKYU LOGISTICS DO BRASIL LTDA.', trading_name: 'SANKYU LOGISTICS BRASIL', responsavel_comercial_id: 'abc' },
      ],
      comerciais: [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      idsVinculados: new Set(),
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    const nf = montarQuadroClientes(
      [{
        id: 'inv-p',
        empresa: 'TM_SEG',
        cliente: 'TRANSPACHECO TRANSPORTE RODOVIARIO DE CARGAS LTDA',
        number: 'NF-P',
        amount: 6900.72,
        date: '2026-09-08',
        status: 'EMITIDA',
        comercialId: 'abc',
      }],
      [],
      [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      '2026-09-01',
      '2026-09-30',
    );
    const os = montarQuadroClientes(
      faturasDeOsParaQuadro(cob.itens),
      [],
      [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      '2026-09-01',
      '2026-09-30',
    );
    const linhas = filtrarLinhasAposCadastro(
      mesclarLinhasQuadro(nf, os),
      new Map([['abc', '2026-09-08']]),
    );
    const tech = linhas.find((l) => /TECHTRANS/.test(l.cliente));
    const pacheco = linhas.find((l) => /PACHECO|TRANSPACHECO/.test(l.cliente));
    assert.ok(tech, 'Techtrans após 08/09 precisa entrar');
    assert.ok(tech.detalhes.some((d) => d.osIds.includes('GTM-7704')));
    assert.ok(pacheco, 'Pacheco com NF de 08/09 precisa permanecer');
    assert.equal(pacheco.detalhes.some((d) => d.osIds.includes('GTM-7764')), false);
    assert.ok(pacheco.detalhes.some((d) => d.numero === 'NF-P'));
    assert.equal(linhas.some((l) => /SANKYU/.test(l.cliente)), false);
    const { mesclarOsSemFaturaNoQuadro } = await import('../lib/comissao/quadroFaturamentoComissao');
    const umaVez = mesclarOsSemFaturaNoQuadro(
      nf,
      cob.itens,
      [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      '2026-09-01',
      '2026-09-30',
    );
    const deNovo = mesclarOsSemFaturaNoQuadro(
      umaVez,
      cob.itens,
      [{ id: 'abc', nome: 'MIGUEL MOTA' }],
      '2026-09-01',
      '2026-09-30',
    );
    const tech2 = deNovo.find((l) => /TECHTRANS/.test(l.cliente));
    assert.equal(tech2?.faturamento, umaVez.find((l) => /TECHTRANS/.test(l.cliente))?.faturamento);
    assert.match(
      fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8'),
      /carregarCoberturaOsPeriodo/,
    );
  });

  it('linha do tempo: OS sem NF para em Faturado; fluxo fecha no pagamento da comissão', async () => {
    const { montarLinhaTempoCliente, detalheEhOsSemNf } = await import('../lib/comissao/linhaTempoComissao');
    assert.equal(detalheEhOsSemNf({ id: 'GTM-7704', numero: 'GTM-7704', osIds: ['GTM-7704'] }), true);
    assert.equal(detalheEhOsSemNf({ id: 'inv-1', numero: 'NF-1', osIds: ['GTM-1'] }), false);
    const semNf = montarLinhaTempoCliente({
      empresa: 'TM SEG',
      faturamento: 21620.26,
      missoes: 8,
      osFaturadas: 0,
      osSemFatura: 8,
      coberturaEstado: 'ENCONTRADO',
      statusFatura: 'EM_ABERTO',
      statusComissao: 'EM_ABERTO',
      detalhes: [{ id: 'GTM-7704', numero: 'GTM-7704', osIds: ['GTM-7704'], pago: false }],
    });
    assert.equal(semNf.etapas.map((e) => `${e.id}:${e.estado}`).join('|'), 'OS_GERADA:FEITO|FATURADO:ATUAL|PAGO:PENDENTE|COMISSAO:PENDENTE');
    const misto = montarLinhaTempoCliente({
      empresa: 'TM SEG',
      faturamento: 14028.72,
      missoes: 10,
      osFaturadas: 1,
      osSemFatura: 9,
      coberturaEstado: 'ENCONTRADO',
      statusFatura: 'PARCIAL',
      statusComissao: 'EM_ABERTO',
      detalhes: [
        { id: 'inv-p', numero: 'NF-P', osIds: [], pago: false },
        { id: 'GTM-7812', numero: 'GTM-7812', osIds: ['GTM-7812'], pago: false },
      ],
    });
    assert.equal(misto.etapaAtual, 'FATURADO');
    const fechado = montarLinhaTempoCliente({
      empresa: 'TM SEG',
      faturamento: 50000,
      missoes: 3,
      osFaturadas: 3,
      osSemFatura: 0,
      coberturaEstado: 'ENCONTRADO',
      statusFatura: 'PAGO',
      statusComissao: 'PAGO',
      detalhes: [{ id: 'inv-1', numero: 'NF-1', osIds: ['GTM-1'], pago: true }],
    });
    assert.equal(fechado.etapaAtual, null);
    assert.equal(fechado.etapas.every((e) => e.estado === 'FEITO'), true);
  });

  it('restringe o quadro ao comercial vinculado e zera se não houver cadastro', async () => {
    const { restringirQuadroAoComercial } = await import('../lib/comissao/comissaoQuadroApi');
    const { nomesParaEscopoCliente } = await import('../lib/comercialEscopo');
    assert.deepEqual(
      nomesParaEscopoCliente([
        { name: 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', trading_name: 'TECHTRANS TRANSPORTES' },
        { name: 'TRANSPACHECO TRANSPORTE RODOVIARIO DE CARGAS LTDA', trading_name: 'TRANSPORTE PACHECO' },
      ]).sort(),
      ['TECHTRANS TRANSPORTES', 'TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', 'TRANSPACHECO TRANSPORTE RODOVIARIO DE CARGAS LTDA', 'TRANSPORTE PACHECO'].sort(),
    );
    const quadro = {
      ok: true,
      linhasTm: [
        { empresa: 'TM SEG' as const, cliente: 'TECHTRANS', faturas: 1, faturamento: 100, imposto: 16, baseLiquida: 84, comissao: 2.52, comercialId: 'abc', comercialNome: 'MOTA', detalhes: [] },
        { empresa: 'TM SEG' as const, cliente: 'OUTRO', faturas: 1, faturamento: 200, imposto: 32, baseLiquida: 168, comissao: 5, comercialId: 'xyz', comercialNome: 'OUTRO', detalhes: [] },
      ],
      linhasTorres: [
        { empresa: 'TORRES' as const, cliente: 'TVM', faturas: 1, faturamento: 50, imposto: 8, baseLiquida: 42, comissao: 1, comercialId: 'abc', comercialNome: 'MOTA', detalhes: [] },
      ],
      meses: ['2026-09'],
      pendencias: [{ cliente: 'SEM', faturas: 1, total: 10, motivo: 'sem_comercial' as const }],
      cobertura: {
        estado: 'ENCONTRADO' as const,
        consultaIncompleta: false,
        itens: [
          { id: 'GTM-1', cliente: 'TECHTRANS', comercialId: 'abc', faturada: false, invoiceNumber: null, receita: 100, custo: 40, lucro: 60, date: '2026-09-09' },
          { id: 'GTM-2', cliente: 'OUTRO', comercialId: 'xyz', faturada: false, invoiceNumber: null, receita: 200, custo: 80, lucro: 120, date: '2026-09-09' },
        ],
        porCliente: [
          { cliente: 'TECHTRANS', comercialId: 'abc', comercialNome: 'MOTA', missoes: 1, faturadas: 0, semFatura: 1, osSemFaturaIds: ['GTM-1'], receita: 100, custo: 40, lucro: 60, margemPct: 60, estado: 'ENCONTRADO' as const },
        ],
        totais: { missoes: 2, faturadas: 0, semFatura: 2, receita: 300, custo: 120, lucro: 180 },
      },
      iniciosComissao: { abc: '2026-09-08', xyz: '2026-01-01' },
    };
    const soMota = restringirQuadroAoComercial(quadro, 'abc');
    assert.equal(soMota.linhasTm.length, 1);
    assert.equal(soMota.linhasTm[0].cliente, 'TECHTRANS');
    assert.equal(soMota.linhasTorres.length, 1);
    assert.equal(soMota.cobertura.itens.length, 1);
    assert.equal(soMota.pendencias.length, 0);
    assert.equal(soMota.iniciosComissao.xyz, undefined);
    const vazio = restringirQuadroAoComercial(quadro, null);
    assert.equal(vazio.linhasTm.length, 0);
    assert.equal(vazio.linhasTorres.length, 0);
  });
});

describe('comissao comercial — sincronismo TM SEG + TORRES', () => {
  it('janela de 18 meses e origem inv: sem duplicar ingest numérico', async () => {
    const {
      periodoSyncComissoes,
      origemFaturaTorresPersistencia,
      faturaTorresPaga,
    } = await import('../lib/comissao/sincronizarComissoesTorres');
    assert.deepEqual(periodoSyncComissoes('2026-09-10'), { start: '2025-03-01', end: '2026-09-10' });
    assert.equal(origemFaturaTorresPersistencia({ id: 'inv:161' }), '161');
    assert.equal(origemFaturaTorresPersistencia({ id: 'os:1191' }), 'os:1191');
    assert.equal(faturaTorresPaga({ paymentDate: '2026-09-09' }), true);
    assert.equal(faturaTorresPaga({ status: 'PENDING' }), false);
  });

  it('persiste OS TORRES com comercial e ignora lançamento sem responsável', async () => {
    const { persistirFaturasTorresNoCadastro } = await import('../lib/comissao/sincronizarComissoesTorres');
    const inserts: any[] = [];
    const sb = {
      from() {
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          is() { return chain; },
          order() { return chain; },
          limit() { return Promise.resolve({ data: [], error: null }); },
          maybeSingle: async () => ({ data: null, error: null }),
          insert(row: any) {
            inserts.push(row);
            return {
              select() {
                return {
                  maybeSingle: async () => ({ data: { id: `c${inserts.length}` }, error: null }),
                };
              },
            };
          },
          update() {
            const upd: any = {
              eq() { return upd; },
              select() { return Promise.resolve({ data: [], error: null }); },
            };
            return upd;
          },
        };
        return chain;
      },
    };
    const persist = await persistirFaturasTorresNoCadastro(sb as any, [
      {
        id: 'os:1191',
        empresa: 'TORRES',
        cliente: 'TECHTRANS TRANSPORTES',
        number: '1191',
        amount: 4447.51,
        date: '2026-09-09',
        status: 'EMITIDA',
        comercialId: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32',
        osIds: ['1191'],
      },
      {
        id: 'os:999',
        empresa: 'TORRES',
        cliente: 'SEM COMERCIAL',
        number: '999',
        amount: 100,
        date: '2026-09-09',
        status: 'EMITIDA',
        comercialId: null,
        osIds: ['999'],
      },
    ]);
    assert.equal(persist.generated, 1);
    assert.equal(persist.skippedSemComercial, 1);
    assert.equal(inserts[0].origem_fatura_id, 'os:1191');
    assert.equal(inserts[0].empresa_origem, 'TORRES');
    assert.equal(inserts[0].comercial_id, 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32');
  });

  it('pede à TORRES o envio quando não há leitura ao vivo', async () => {
    const { sincronizarComissoesTorres } = await import('../lib/comissao/sincronizarComissoesTorres');
    const r = await sincronizarComissoesTorres({ from() { return {}; } } as any, {
      sbTorres: null,
      env: { COMISSAO_INGEST_TOKEN: 'tok', TORRES_SUPABASE_SERVICE_ROLE_KEY: 'presente' },
      fetchFn: (async () =>
        new Response(JSON.stringify({
          ok: true,
          clientes: [{ id: 63, nome: 'TECHTRANS TRANSPORTES', comercialId: 'e2fe3779-0b03-47cf-95a2-0c01a35e3e32' }],
          faturados: 1,
          pagos: 0,
        }), { status: 200 })) as typeof fetch,
    });
    assert.equal(r.ok, true);
    assert.equal(r.pushed, true);
    assert.equal(r.generated, 1);
    assert.match(r.clientesComComercial[0].nome, /TECHTRANS/);
  });

  it('não inventa faturamento se o envio da TORRES não estiver autorizado', async () => {
    const { sincronizarComissoesTorres } = await import('../lib/comissao/sincronizarComissoesTorres');
    let chamou = false;
    const r = await sincronizarComissoesTorres({ from() { return {}; } } as any, {
      sbTorres: null,
      env: {},
      fetchFn: (async () => {
        chamou = true;
        return new Response('{}', { status: 500 });
      }) as typeof fetch,
    });
    assert.equal(chamou, false);
    assert.equal(r.ok, true);
    assert.equal(r.pushed, false);
    assert.equal(r.generated, 0);
    assert.equal(r.liveDisponivel, false);
    assert.match(String(r.error || ''), /já está gravado/);
    assert.doesNotMatch(String(r.error || ''), /TORRES_SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('botão, rota, rewrite e cron de 6 horas existem', () => {
    const page = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
    const ingest = fs.readFileSync('api/comissoes-ingest.ts', 'utf8');
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    const cron = fs.readFileSync('server/registerCronRoutes.ts', 'utf8');
    const sync = fs.readFileSync('lib/comissao/sincronizarComissoesTorres.ts', 'utf8');
    assert.equal((page.match(/data-testid="btn-sync-tm-torres"/g) || []).length, 1);
    assert.match(page, /Sincronismo automático a cada 6 horas/);
    assert.match(page, /comissao-sync-torres-info/);
    assert.match(page, /from 'react'/);
    assert.match(ingest, /op === 'sync-tm-torres'/);
    assert.match(vercel, /\/api\/comissoes\/sync-tm-torres/);
    assert.match(vercel, /"schedule": "0 \*\/6 \* \* \*"/);
    assert.match(cron, /sincronizarComissoesTmETorres/);
    assert.match(sync, /dispararPushTorres/);
    assert.doesNotMatch(sync, /trading_name, responsavel_comercial_id/);
  });
});

describe('comissao comercial — e-mail ao financeiro na liberação', () => {
  it('monta o aviso com cliente, fatura e comercial', async () => {
    const { montarEmailComissaoLiberada, EMAIL_FINANCEIRO_COMISSAO, EMAILS_PAGAMENTO_CLIENTE_TORRES } = await import('../lib/comissao/avisoComissaoLiberada');
    const email = montarEmailComissaoLiberada([{
      id: '1',
      cliente: 'ACME <script>',
      fatura: 'NF-9',
      comercial: 'Ana',
      valorComissao: 90,
      valorFaturamento: 3000,
      dataRecebimento: '2026-10-13',
      empresa: 'TM_SEG',
    }]);
    assert.deepEqual(email.to, [EMAIL_FINANCEIRO_COMISSAO]);
    assert.deepEqual(email.to, ['financeiro@grupotmseg.com.br']);
    const torres = montarEmailComissaoLiberada([{
      id: '2',
      cliente: 'TECHTRANS',
      fatura: 'torres-inv-207',
      comercial: 'Miguel',
      valorComissao: 288.07,
      valorFaturamento: 11431.31,
      dataRecebimento: '2026-09-29',
      empresa: 'TORRES',
    }]);
    assert.deepEqual([...torres.to], [...EMAILS_PAGAMENTO_CLIENTE_TORRES]);
    assert.deepEqual(torres.to, [
      'financeiro@torresseguranca.com.br',
      'adm@torresseguranca.com.br',
      'thiago@grupotmseg.com.br',
    ]);
    assert.match(torres.subject, /Cliente TORRES pagou/);
    assert.match(torres.subject, /verificar comissão/);
    assert.match(torres.html, /pagamento está confirmado/);
    assert.match(torres.html, /Verifiquem a comissão/);
    assert.doesNotMatch(torres.to.join(','), /financeiro@grupotmseg.com.br/);
    assert.match(email.subject, /ACME/);
    assert.match(email.html, /pagou/);
    assert.match(email.html, /está liberado/);
    assert.match(email.html, /Ana/);
    assert.match(email.html, /NF-9/);
    assert.match(email.html, /13\/10\/2026/);
    assert.doesNotMatch(email.html, /<script>/);
  });

  it('avisa só quando a baixa realmente libera a comissão', async () => {
    const { atualizarStatusAposBaixaCliente } = await import('../lib/comissao/comissaoCore');
    const g = globalThis as { __tmsegEnviarAvisoComissaoLiberada?: (avisos: Array<{ cliente: string; comercial: string }>) => Promise<void> };
    const anterior = g.__tmsegEnviarAvisoComissaoLiberada;
    const recebidos: Array<{ cliente: string; comercial: string }> = [];
    g.__tmsegEnviarAvisoComissaoLiberada = async (avisos) => {
      recebidos.push(...avisos);
    };
    const sb = {
      from(table: string) {
        if (table === 'comerciais') {
          return {
            select() {
              return { in: async () => ({ data: [{ id: 'c1', nome: 'Ana Comercial' }], error: null }) };
            },
          };
        }
        const chain: {
          update: () => typeof chain;
          eq: () => typeof chain;
          select: () => Promise<{ data: unknown; error: { message: string } | null }>;
        } = {
          update: () => chain,
          eq: () => chain,
          select: async () => ({
            data: [{
              id: 'row-1',
              cliente_nome: 'Cliente Pago',
              fatura_numero: 'NF-9',
              valor_comissao: 90,
              valor_faturamento: 3000,
              data_recebimento_cliente: '2026-10-13',
              empresa_origem: 'TM_SEG',
              comercial_id: 'c1',
            }],
            error: null,
          }),
        };
        return chain;
      },
    };
    try {
      const ok = await atualizarStatusAposBaixaCliente(sb as never, 'fatura-1', '2026-10-13');
      assert.equal(ok.ok, true);
      assert.equal(ok.updated, 1);
      assert.equal(recebidos.length, 1);
      assert.equal(recebidos[0].cliente, 'Cliente Pago');
      assert.equal(recebidos[0].comercial, 'Ana Comercial');

      const vazio = {
        from() {
          const chain: { update: () => typeof chain; eq: () => typeof chain; select: () => Promise<{ data: unknown[]; error: null }> } = {
            update: () => chain,
            eq: () => chain,
            select: async () => ({ data: [], error: null }),
          };
          return chain;
        },
      };
      const semLinha = await atualizarStatusAposBaixaCliente(vazio as never, 'fatura-2');
      assert.equal(semLinha.updated, 0);
      assert.equal(recebidos.length, 1);

      g.__tmsegEnviarAvisoComissaoLiberada = async () => {
        throw new Error('smtp fora');
      };
      const mesmoAssim = await atualizarStatusAposBaixaCliente(sb as never, 'fatura-1', '2026-10-13');
      assert.equal(mesmoAssim.ok, true);
      assert.equal(mesmoAssim.updated, 1);
    } finally {
      g.__tmsegEnviarAvisoComissaoLiberada = anterior;
    }
  });

  it('a tela e o cálculo não importam o envio de e-mail', () => {
    const core = fs.readFileSync('lib/comissao/comissaoCore.ts', 'utf8');
    const page = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
    const service = fs.readFileSync('lib/comissao/comissaoService.ts', 'utf8');
    const webhook = fs.readFileSync('api/asaas-webhook.ts', 'utf8');
    const sync = fs.readFileSync('api/asaas-sync-open-payments.ts', 'utf8');
    const nf = fs.readFileSync('api/nf-control.ts', 'utf8');
    const ingest = fs.readFileSync('api/comissoes-ingest.ts', 'utf8');
    const quadro = fs.readFileSync('server/comissaoQuadroRoutes.ts', 'utf8');
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.equal((core.match(/await notificarComissaoLiberada\(/g) || []).length, 3);
    assert.match(core, /SELECT_COMISSAO_LIBERADA/);
    assert.doesNotMatch(core, /nodemailer|email\/smtp/);
    assert.doesNotMatch(page, /enviarAvisoComissaoLiberada|nodemailer/);
    assert.doesNotMatch(service, /enviarAvisoComissaoLiberada|nodemailer/);
    assert.match(webhook, /instalarAvisoComissaoLiberada/);
    assert.match(sync, /instalarAvisoComissaoLiberada/);
    assert.match(nf, /instalarAvisoComissaoLiberada/);
    assert.match(ingest, /op === 'liberada-email'/);
    assert.match(quadro, /\/api\/comissoes\/liberada-email/);
    assert.match(vercel, /\/api\/comissoes\/liberada-email/);
    assert.match(fs.readFileSync('lib/comissao/avisoComissaoLiberada.ts', 'utf8'), /financeiro@grupotmseg.com.br/);
  });
});

describe('comissao comercial — lançar no Contas a Pagar', () => {
  it('monta uma despesa pendente por comissão, com cliente, NF, comercial e fechamento', async () => {
    const { tituloContaPagarComissao, montarContaPagarComissao, fechamentoComissao } = await import('../lib/comissao/contaPagarComissao');
    assert.equal(fechamentoComissao('2026-10-01'), '1º QUINZENA DE OUTUBRO');
    assert.equal(fechamentoComissao('2026-10-16'), '2º QUINZENA DE OUTUBRO');
    const titulo = tituloContaPagarComissao({
      cliente: 'Techtrans',
      fatura: 'NF-9',
      comercial: 'Ana',
      dataFaturamento: '2026-10-01',
    });
    assert.equal(titulo, 'Comissão Comercial - TECHTRANS / NF-9 / ANA / 1º QUINZENA DE OUTUBRO');
    const payload = montarContaPagarComissao({
      id: 'row-1',
      cliente: 'Techtrans',
      fatura: 'NF-9',
      comercial: 'Ana',
      dataFaturamento: '2026-10-01',
      valor: 90.126,
      dueDate: '2026-10-13',
      categoryId: 'cat-1',
      createdBy: 'Financeiro',
    });
    assert.equal(payload.type, 'EXPENSE');
    assert.equal(payload.status, 'PENDING');
    assert.equal(payload.category_name, 'COMISSÃO');
    assert.equal(payload.amount, 90.13);
    assert.equal(payload.entity_name, 'Ana');
    assert.equal(payload.notes, 'comissao_id:row-1');
    assert.equal(payload.payment_method, 'PIX');
    assert.equal(payload.description, titulo);
    const { vencimentoPagamentoComissao } = await import('../lib/comissao/contaPagarComissao');
    assert.equal(vencimentoPagamentoComissao('2026-10-05'), '2026-10-15');
    assert.equal(vencimentoPagamentoComissao('2026-10-15'), '2026-10-15');
    assert.equal(vencimentoPagamentoComissao('2026-10-16'), '2026-11-15');
    assert.equal(vencimentoPagamentoComissao('2026-10-20'), '2026-11-15');
    assert.equal(vencimentoPagamentoComissao('2026-12-31'), '2027-01-15');
  });

  it('o botão de pagar só aparece depois do lançamento', () => {
    const page = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
    const service = fs.readFileSync('lib/comissao/comissaoService.ts', 'utf8');
    assert.match(service, /vencimentoPagamentoComissao/);
    assert.match(fs.readFileSync('lib/comissao/contaPagarTorres.ts', 'utf8'), /vencimentoPagamentoComissao/);
    const lancar = page.indexOf('btn-lancar-pagamento-');
    const pagar = page.indexOf('btn-pagar-');
    assert.ok(lancar >= 0 && pagar > lancar);
    assert.match(page, /!r\.conta_pagar_id/);
    assert.match(page, /!!r\.conta_pagar_id/);
    assert.match(page, /\/logo-torres\.jpeg/);
    assert.match(page, /\/logo-tm\.svg/);
    assert.doesNotMatch(page, /logo-tm\.svg[\s\S]{0,240}bg-black/);
    assert.match(page, /<LogoEmpresa empresa=\{r\.empresa_origem\} \/>/);
    assert.match(page, /from 'react'/);
    const payload = fs.readFileSync('lib/comissao/contaPagarComissao.ts', 'utf8');
    assert.match(payload, /type: 'EXPENSE'/);
    assert.match(payload, /status: 'PENDING'/);
    assert.match(payload, /category_name: 'COMISSÃO'/);
    assert.match(service, /financial_transactions/);
    assert.match(service, /payment_method = 'PIX'/);
    assert.match(service, /doc_comprovante_url: comprovanteUrl/);
    assert.match(page, /comprovanteUrl: comprovantePorComissao\[r\.id\]/);
    assert.match(service, /Comissão TORRES não entra no Contas a Pagar da TM SEG/);
    assert.match(service, /status: 'PAID'/);
    assert.match(service, /pago_em: agora.toISOString\(\)/);
    assert.match(page, /\/api\/comissoes\/conta-pagar-torres/);
    assert.match(page, /Lançar pagamento/);
    assert.doesNotMatch(page, /autoTorresRef/);
  });

  it('comissão TORRES vai para o contas a pagar da TORRES e leva o comprovante da fatura', async () => {
    const { executarLancamentoTorres, montarContaPagarTorres, valorAceitoNoContasPagarTorres } = await import('../lib/comissao/contaPagarTorres');
    assert.equal(valorAceitoNoContasPagarTorres(13.86, 13.86), true);
    assert.equal(valorAceitoNoContasPagarTorres(20, 13.86), false);
    const payload = montarContaPagarTorres({
      id: 'c-200',
      cliente: 'Nimbus',
      fatura: '200',
      comercial: 'Miguel',
      dataFaturamento: '2026-09-24',
      valor: 13.86,
      dueDate: '2026-10-13',
      categoryId: 'cat-torres',
      createdBy: 'Financeiro',
      comprovantePath: 'invoices/200/recibo.pdf',
    });
    assert.equal(payload.category_name, 'Comissões');
    assert.equal(payload.origin_type, 'comissao_comercial');
    assert.equal(payload.origin_id, 'c-200');
    assert.equal(payload.comprovante_path, 'invoices/200/recibo.pdf');
    assert.equal(payload.payment_method, 'PIX');
    assert.equal(payload.doc_comprovante_url, undefined);
    assert.equal(payload.notes, 'comissao_id:c-200');
    const inserts: Array<Record<string, unknown>> = [];
    const resultado = await executarLancamentoTorres({
      comissao: {
        id: 'c-200',
        status: 'LIBERADO_PARA_PAGAMENTO',
        empresa_origem: 'TORRES',
        valor_comissao: 13.86,
        cliente_nome: 'NIMBUS',
        fatura_numero: '200',
        comercial_nome: 'Miguel',
        data_faturamento: '2026-09-24',
      },
      valor: 13.86,
      dueDate: '2026-10-13',
      comprovantePath: 'invoices/200/recibo.pdf',
    }, {
      buscarExistente: async () => null,
      buscarCategoriaId: async () => 'cat-torres',
      inserir: async (row) => {
        inserts.push(row);
        return 'tx-torres';
      },
      ligar: async () => true,
    });
    assert.equal(resultado.ok, true);
    assert.equal(resultado.transactionId, 'tx-torres');
    assert.equal(inserts[0].category_name, 'Comissões');
    const tm = await executarLancamentoTorres({
      comissao: {
        id: 'c-tm',
        status: 'LIBERADO_PARA_PAGAMENTO',
        empresa_origem: 'TM_SEG',
        valor_comissao: 10,
      },
      valor: 10,
      dueDate: '2026-10-13',
    }, {
      buscarExistente: async () => { throw new Error('não consulta a TORRES'); },
      buscarCategoriaId: async () => null,
      inserir: async () => { throw new Error('não grava na TORRES'); },
      ligar: async () => false,
    });
    assert.equal(tm.ok, false);
  });

  it('setembro só lança no clique, não duplica e não confirma sem vínculo', async () => {
    const { executarLancamentoTorres } = await import('../lib/comissao/contaPagarTorres');
    const page = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
    assert.doesNotMatch(page, /autoTorresRef/);
    assert.match(page, /Lançar pagamento/);

    const setembro = [
      { id: '91beddd8-4a85-4e23-aae5-7f13af639555', fatura: '200', cliente: 'NIMBUS', valor: 13.86 },
      { id: '6b004af2-7cd1-4b61-9b2c-d7c0d0decc87', fatura: 'torres-inv-199', cliente: 'R J C', valor: 41.53 },
      { id: '28bd0a56-57c6-4915-8d0f-e595be1ef21d', fatura: 'torres-inv-207', cliente: 'TECHTRANS', valor: 288.07 },
    ];
    const titulos = new Map<string, string>();
    const vinculos = new Map<string, string>();
    let seq = 0;
    const depsDe = (falhaInserir = false) => ({
      buscarExistente: async (comissaoId: string) => titulos.get(comissaoId) || null,
      buscarCategoriaId: async () => 'cat',
      inserir: async (row: Record<string, unknown>) => {
        if (falhaInserir) throw new Error('TORRES indisponível');
        const id = `tx-${++seq}`;
        titulos.set(String(row.origin_id), id);
        return id;
      },
      ligar: async (comissaoId: string, transactionId: string) => {
        if (vinculos.has(comissaoId)) return vinculos.get(comissaoId) === transactionId;
        vinculos.set(comissaoId, transactionId);
        return true;
      },
      lerVinculo: async (comissaoId: string) => vinculos.get(comissaoId) || null,
      descartarOrfao: async (transactionId: string) => {
        for (const [comissaoId, tituloId] of titulos) {
          if (tituloId === transactionId && vinculos.get(comissaoId) !== transactionId) titulos.delete(comissaoId);
        }
      },
    });

    for (const linha of setembro) {
      const primeiro = await executarLancamentoTorres({
        comissao: {
          id: linha.id,
          status: 'LIBERADO_PARA_PAGAMENTO',
          empresa_origem: 'TORRES',
          valor_comissao: linha.valor,
          cliente_nome: linha.cliente,
          fatura_numero: linha.fatura,
        },
        valor: linha.valor,
        dueDate: '2026-10-15',
      }, depsDe());
      assert.equal(primeiro.ok, true);
      assert.equal(vinculos.get(linha.id), primeiro.transactionId);
      const repetido = await executarLancamentoTorres({
        comissao: {
          id: linha.id,
          status: 'LIBERADO_PARA_PAGAMENTO',
          empresa_origem: 'TORRES',
          conta_pagar_id: primeiro.transactionId,
          valor_comissao: linha.valor,
        },
        valor: linha.valor,
        dueDate: '2026-10-15',
      }, depsDe());
      assert.equal(repetido.ok, true);
      assert.equal(repetido.transactionId, primeiro.transactionId);
    }
    assert.equal(titulos.size, 3);

    const aberta = await executarLancamentoTorres({
      comissao: { id: 'aberta', status: 'AGUARDANDO_PAGAMENTO_CLIENTE', empresa_origem: 'TORRES', valor_comissao: 10 },
      valor: 10,
      dueDate: '2026-10-15',
    }, depsDe());
    assert.equal(aberta.ok, false);
    assert.equal(titulos.size, 3);

    await assert.rejects(() => executarLancamentoTorres({
      comissao: { id: 'sem-rede', status: 'LIBERADO_PARA_PAGAMENTO', empresa_origem: 'TORRES', valor_comissao: 10 },
      valor: 10,
      dueDate: '2026-10-15',
    }, depsDe(true)), /TORRES indisponível/);

    const orfaos: string[] = [];
    const corrida = await executarLancamentoTorres({
      comissao: { id: 'corrida', status: 'LIBERADO_PARA_PAGAMENTO', empresa_origem: 'TORRES', valor_comissao: 10 },
      valor: 10,
      dueDate: '2026-10-15',
    }, {
      buscarExistente: async () => null,
      buscarCategoriaId: async () => null,
      inserir: async () => 'tx-perdedor',
      ligar: async () => false,
      lerVinculo: async () => 'tx-vencedor',
      descartarOrfao: async (id) => { orfaos.push(id); },
    });
    assert.equal(corrida.ok, true);
    assert.equal(corrida.transactionId, 'tx-vencedor');
    assert.deepEqual(orfaos, ['tx-perdedor']);
  });
});

describe('comissao comercial — chave do servidor da TORRES', () => {
  function jwt(payload: Record<string, string>): string {
    const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `eyJhbGciOiJIUzI1NiJ9.${corpo}.assinatura`;
  }

  it('aceita a secret atual e a service_role antiga, e recusa publishable e a chave da TM SEG', async () => {
    const { isTorresServiceRoleKey, mensagemChaveTorresRecusada, motivoChaveTorres } = await import('../lib/comissao/torresSupabase');
    const secret = `sb_secret_${'a'.repeat(22)}_${'b'.repeat(8)}`;
    const serviceRole = jwt({ role: 'service_role', ref: 'erjhxwbutjyylxdthuuz' });
    const publishable = `sb_publishable_${'c'.repeat(22)}_${'d'.repeat(8)}`;
    const daTm = jwt({ role: 'service_role', ref: 'ajhmmjuewdsukecaimik' });
    const anon = jwt({ role: 'anon', ref: 'erjhxwbutjyylxdthuuz' });

    assert.equal(isTorresServiceRoleKey(secret), true);
    assert.equal(isTorresServiceRoleKey(serviceRole), true);
    assert.equal(motivoChaveTorres(secret), 'ok');
    assert.equal(motivoChaveTorres(''), 'ausente');
    assert.equal(motivoChaveTorres(publishable), 'publishable');
    assert.equal(motivoChaveTorres(daTm), 'projeto_tmseg');
    assert.equal(motivoChaveTorres(anon), 'nao_service_role');
    assert.match(mensagemChaveTorresRecusada({}), /não está no servidor que respondeu/);
    assert.match(mensagemChaveTorresRecusada({ TORRES_SUPABASE_SERVICE_ROLE_KEY: publishable }), /publishable/);
    assert.match(mensagemChaveTorresRecusada({ TORRES_SUPABASE_SERVICE_ROLE_KEY: daTm }), /TM SEG/);
    assert.equal(mensagemChaveTorresRecusada({ TORRES_SUPABASE_SERVICE_ROLE_KEY: secret }), '');
    assert.doesNotMatch(mensagemChaveTorresRecusada({}), /computador/);
  });

  it('falha de lançamento não responde HTTP 200', async () => {
    const { respostaFalhaContaPagar } = await import('../lib/comissao/contaPagarTorres');
    assert.deepEqual(respostaFalhaContaPagar('A chave da TORRES não está no servidor que respondeu.'), { status: 503, codigo: 'CREDENCIAL' });
    assert.deepEqual(respostaFalhaContaPagar('Permissão negada'), { status: 403, codigo: 'SEM_PERMISSAO' });
    assert.deepEqual(respostaFalhaContaPagar('fetch failed'), { status: 502, codigo: 'CONEXAO' });
    assert.deepEqual(respostaFalhaContaPagar('A comissão não está liberada para pagamento'), { status: 409, codigo: 'NAO_LIBERADA' });
    assert.deepEqual(respostaFalhaContaPagar('Comissão não encontrada'), { status: 404, codigo: 'NAO_ENCONTRADA' });
    assert.deepEqual(respostaFalhaContaPagar('duplicate key value'), { status: 500, codigo: 'BANCO' });
    assert.notEqual(respostaFalhaContaPagar('A chave da TORRES não está no servidor que respondeu.').status, 200);
  });
});
