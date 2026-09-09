import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calcularCotacaoRapida,
  intervaloQuinzena,
  montarCsvRelatorioComissoes,
  montarPayloadQuoteRapida,
  montarPayloadTabelaCliente,
  montarResumoCotacao,
  nomeArquivoRelatorioComissoes,
  quinzenaDeDataFaturamento,
  roundMoney,
} from '../lib/comercial/tabelaPrecosRegionais';

const spRj = {
  id: '1',
  codigo: 'sudeste-sp-rj',
  regiao: 'Sudeste - SP/RJ',
  estados: 'SP, RJ',
  valor_acionamento: 6.5,
  valor_km_extra: 6.5,
  valor_hora_extra: 159,
};

describe('cotação rápida regional — cálculo de piso', () => {
  it('soma acionamento + KM extra + hora extra', () => {
    const r = calcularCotacaoRapida({ regiao: spRj, kmEstimado: 150, horasExtrasEstimadas: 2 });
    assert.equal(r.valorAcionamento, 6.5);
    assert.equal(r.valorTotalKm, 975);
    assert.equal(r.valorTotalHoras, 318);
    assert.equal(r.valorTotalEstimado, 1299.5);
  });

  it('não deixa KM/hora negativos', () => {
    const r = calcularCotacaoRapida({ regiao: spRj, kmEstimado: -10, horasExtrasEstimadas: -2 });
    assert.equal(r.valorTotalEstimado, 6.5);
  });

  it('grava quote como RAPIDA_REGIONAL sem virar faturamento', () => {
    const resultado = calcularCotacaoRapida({ regiao: spRj, kmEstimado: 10, horasExtrasEstimadas: 1 });
    const payload = montarPayloadQuoteRapida({
      resultado,
      clienteNome: 'Prospect Alfa',
      createdBy: 'Comercial',
    });
    assert.equal(payload.quote_source, 'RAPIDA_REGIONAL');
    assert.equal(payload.status, 'Rascunho');
    assert.equal(payload.client_id, null);
    assert.match(payload.contract_details, /não é faturamento/i);
  });

  it('ao fechar gera payload de client_price_tables com piso da região', () => {
    const resultado = calcularCotacaoRapida({ regiao: spRj, kmEstimado: 80, horasExtrasEstimadas: 1 });
    const tabela = montarPayloadTabelaCliente({ clienteNome: 'Cliente Novo', resultado });
    assert.equal(tabela.client, 'Cliente Novo');
    assert.match(tabela.operation_type, /PISO REGIONAL/);
    assert.equal(tabela.activation_fee, 6.5);
    assert.equal(tabela.price_per_extra_km, 6.5);
    assert.equal(tabela.price_per_extra_hour, 159);
    assert.equal(tabela.franchise_km, 80);
  });

  it('resumo inclui região e total', () => {
    const resultado = calcularCotacaoRapida({ regiao: spRj, kmEstimado: 1, horasExtrasEstimadas: 0 });
    const texto = montarResumoCotacao(resultado, 'ACME');
    assert.match(texto, /ACME/);
    assert.match(texto, /SP\/RJ/);
    assert.match(texto, /Total estimado/);
  });
});

describe('cotação rápida — isolamento do faturamento', () => {
  it('cálculo de OS/NF não importa a tabela de piso', () => {
    const fin = fs.readFileSync('lib/financialUtils.ts', 'utf8');
    const persist = fs.readFileSync('lib/persistAsaasChargeInvoice.ts', 'utf8');
    const billing = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.doesNotMatch(fin, /tabela_precos_regioes/);
    assert.doesNotMatch(persist, /tabela_precos_regioes/);
    assert.doesNotMatch(billing, /tabela_precos_regioes/);
  });

  it('tela de propostas embute o simulador e a lista fecha para tabela real', () => {
    const list = fs.readFileSync('components/QuoteList.tsx', 'utf8');
    const page = fs.readFileSync('components/CotacaoRapidaRegional.tsx', 'utf8');
    assert.match(list, /CotacaoRapidaRegional/);
    assert.match(list, /Fechar proposta/);
    assert.match(list, /from 'react'/);
    assert.match(page, /from 'react'/);
    assert.match(page, /tabela_precos_regioes/);
  });
});

describe('comissões — quinzena civil e relatório', () => {
  it('corta 1ª quinzena em 01–15 e 2ª no restante do mês', () => {
    const q1 = intervaloQuinzena(2026, 9, 'q1');
    const q2 = intervaloQuinzena(2026, 9, 'q2');
    const mes = intervaloQuinzena(2026, 2, 'todas');
    const fevQ2 = intervaloQuinzena(2026, 2, 'q2');
    assert.deepEqual(q1, { start: '2026-09-01', end: '2026-09-15' });
    assert.deepEqual(q2, { start: '2026-09-16', end: '2026-09-30' });
    assert.deepEqual(mes, { start: '2026-02-01', end: '2026-02-28' });
    assert.deepEqual(fevQ2, { start: '2026-02-16', end: '2026-02-28' });
  });

  it('classifica data_faturamento sem Date UTC', () => {
    assert.equal(quinzenaDeDataFaturamento('2026-09-01'), 'q1');
    assert.equal(quinzenaDeDataFaturamento('2026-09-15'), 'q1');
    assert.equal(quinzenaDeDataFaturamento('2026-09-16'), 'q2');
    assert.equal(quinzenaDeDataFaturamento('2026-09-30'), 'q2');
  });

  it('CSV de relatório usa as linhas filtradas, não exemplo vazio', () => {
    const csv = montarCsvRelatorioComissoes([
      {
        empresa: 'TM SEG',
        cliente_nome: 'Cliente A',
        comercial_nome: 'João',
        fatura_numero: 'NF-1',
        data_faturamento: '2026-09-10',
        valor_faturamento: 10000,
        valor_comissao: 252,
        status: 'AGUARDANDO_PAGAMENTO_CLIENTE',
      },
    ], { year: 2026, month: 9, quinzena: 'q1', comercialNome: 'João' });
    assert.match(csv, /Cliente A/);
    assert.match(csv, /1ª Quinzena/);
    assert.match(csv, /252,00/);
    assert.equal(roundMoney(252), 252);
    assert.equal(
      nomeArquivoRelatorioComissoes({ year: 2026, month: 9, quinzena: 'q1', comercialNome: 'João Silva' }),
      'comissoes_joao_silva_2026-09_q1.csv',
    );
  });
});
