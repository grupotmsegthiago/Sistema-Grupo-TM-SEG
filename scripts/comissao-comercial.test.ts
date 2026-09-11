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

  it('libera tela somente para perfil Diretoria', () => {
    assert.equal(canAccessComissoesComerciais({ name: 'Daniel Pinto', role: 'Diretoria' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'Thiago Moreira', role: 'Diretoria' }), true);
    assert.equal(canAccessComissoesComerciais({ name: 'Thiago Moreira' }), false);
    assert.equal(canAccessComissoesComerciais({ name: 'Bárbara Silva', role: 'Administrador' }), false);
    assert.equal(canAccessComissoesComerciais({ name: 'João', role: 'comercial' }), false);
    assert.equal(canAccessComissoesComerciais({ name: 'João', role: 'Financeiro' }), false);
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
    assert.match(page, /quadro-tm-seg/);
    assert.match(page, /quadro-torres/);
    assert.match(page, /meses-com-fatura/);
    assert.match(page, /tabela-comissao-padrao/);
    assert.match(page, /btn-expand-cliente/);
    assert.match(page, /dashboard-comissoes-kpis/);
    assert.match(page, /cobertura-os-periodo/);
    assert.match(page, /card-funcionario-/);
    assert.match(page, /quadros-funcionarios/);
    assert.match(page, /Fatura cliente/);
    assert.match(page, /mesclarLinhasQuadro/);
    assert.match(page, /aplicarPisoComissaoQuadro/);
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
    assert.equal(
      casarClienteDaFatura('TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', clients).status,
      'ok',
    );
    assert.equal(casarClienteDaFatura('TECHTRANS TRANSPORTES ESPECIALIZADOS LTDA', clients).client?.id, 37);
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

  it('coloca OS TECHTRANS sem NF no quadro TM SEG do comercial', async () => {
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
    assert.equal(funcionarios[0].clientes[0].margemPct, 40);
    assert.equal(funcionarios[0].clientes[0].statusFatura, 'PAGO');
    assert.equal(funcionarios[0].clientes[0].statusComissao, 'EM_ABERTO');
    assert.equal(acharComissaoDaFatura(rows, { id: 'inv-1', numero: 'NF-1' })?.id, 'c1');
    const kpis = montarKpisDashboard({ linhas, funcionarios, cobertura });
    assert.equal(kpis.comissao3, 1260);
    assert.equal(kpis.missoes, 3);
    assert.equal(kpis.margemOperacionalPct, 40);
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
      env: { COMISSAO_INGEST_TOKEN: 'tok' },
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
    const r = await sincronizarComissoesTorres({ from() { return {}; } } as any, { sbTorres: null, env: {} });
    assert.equal(r.ok, false);
    assert.equal(r.liveDisponivel, false);
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
