import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRAZO_COTACAO_MS, cotacaoSelecionavel } from '../lib/precificacao/tabela2027';
import {
  TEXTO_HISTORICO_VAZIO,
  formatarDataHoraCotacao,
  formatarValorCotacao,
  lerSnapshot,
  linhaConfereComTela,
  mensagemCompletaCotacao,
  nomePdfCotacao,
  pedidoParaRegistro,
  propostaDoHistorico,
  resumirEndereco,
  rotuloValidade,
  textoDistanciaTempo,
  textoRegiaoFranquia,
} from '../lib/portalCliente/historicoCotacoes';
import { aplicarContaNaProposta, contaVisivelDaCotacao } from '../lib/portalCliente/cotacao';
import { listarHistoricoCotacoes, registrarCotacaoPortal } from '../lib/portalCliente/cotacaoHttp';
import { AcoesDaLinha, HistoricoVazio } from '../components/ceva/HistoricoCotacoes';
import { escalaDaCaptura } from '../components/ceva/abrirPdfCotacao';
import { ExperienciaProposta } from '../components/ceva/ExperienciaProposta';

const AGORA = new Date('2026-10-26T15:00:00.000Z');

describe('histórico de cotações do portal', () => {
  it('a foto alta não usa escala que estoura o canvas', () => {
    assert.equal(escalaDaCaptura(1200), 2);
    assert.equal(escalaDaCaptura(5000), 1.25);
    assert.equal(escalaDaCaptura(9000), 1);
    assert.equal(escalaDaCaptura(0), 1);
  });

  it('troca o menu por PDF, e-mail e copiar a mensagem', () => {
    const fechado = renderToStaticMarkup(React.createElement(AcoesDaLinha, { id: 'q0', mostrarDesativar: true, mostrarExcluir: true }));
    assert.match(fechado, /Ações/);
    assert.match(fechado, /abrir-acoes-q0/);
    assert.doesNotMatch(fechado, /Copiar MSG/);
    assert.doesNotMatch(fechado, /painel-acoes-q0/);
    const interno = renderToStaticMarkup(React.createElement(AcoesDaLinha, { id: 'q1', mostrarDesativar: true, mostrarExcluir: false, painelAberto: true }));
    assert.match(interno, /PDF/);
    assert.match(interno, /E-mail/);
    assert.match(interno, /Copiar MSG/);
    assert.match(interno, /Desativar/);
    assert.doesNotMatch(interno, /Excluir/);
    assert.match(interno, /painel-acoes-q1/);
    const diretoria = renderToStaticMarkup(React.createElement(AcoesDaLinha, { id: 'q2', mostrarDesativar: true, mostrarExcluir: true, painelAberto: true }));
    assert.match(diretoria, /desativar-q2/);
    assert.match(diretoria, /excluir-q2/);
    const portal = renderToStaticMarkup(React.createElement(AcoesDaLinha, { id: 'q3', mostrarDesativar: false, mostrarExcluir: false }));
    assert.doesNotMatch(portal, /Desativar/);
    assert.doesNotMatch(portal, /Excluir/);
    const texto = mensagemCompletaCotacao({
      id: 'q1',
      client_name: 'CEVA LOGISTICS LTDA',
      origin: 'Avenida Talma Rodrigues Ribeiro, Salvador, BA',
      destination: 'Rodovia Presidente Dutra, São Paulo, SP',
      total_km: 912.5,
      total_hours: 12,
      total_value: 9583.8,
      created_at: '2026-10-24T20:13:00.000Z',
      created_by: 'THIAGO MOREIRA DOS SANTOS',
      status: 'Enviada',
      is_active: true,
      contract_details: JSON.stringify({
        kind: 'PORTAL_COTACAO',
        numero: 42,
        vigencia: '2027',
        regiao: 'SUDESTE',
        usouMinimo: false,
        kmExtra: 4.6,
        horaExtra: 140,
        acionamento: 830,
        kmFranquia: 100,
        horasFranquia: 3,
        duracaoMin: 760,
        paradas: [],
        solicitanteEmail: 'thiago@grupotmseg.com.br',
      }),
    }, AGORA);
    assert.match(texto, /Cotação 42 — CEVA LOGISTICS LTDA/);
    assert.match(texto, /Tabela 2027/);
    assert.match(texto, /Salvador, BA/);
    assert.match(texto, /Pedágio cobrado à parte/);
    assert.doesNotMatch(texto, /\(2027-\)/);
  });

  it('mostra vazio quando o cliente não tem cotação', () => {
    const html = renderToStaticMarkup(React.createElement(HistoricoVazio));
    assert.match(html, new RegExp(TEXTO_HISTORICO_VAZIO));
    assert.match(html, /historico-vazio/);
  });

  it('resume endereço, valor, distância e o nome do PDF', () => {
    assert.equal(resumirEndereco('Rod. Pres. Dutra, 17744 - Cumbica, Guarulhos - SP'), 'Rod. Pres. Dutra');
    assert.equal(textoDistanciaTempo(47.7, 46), '47,7 km | 46 min');
    assert.equal(formatarValorCotacao(690).replace(/\u00a0/g, ' '), 'R$ 690,00');
    assert.equal(textoRegiaoFranquia('SUDESTE SP/RJ', true), 'SUDESTE SP/RJ · franquia mínima');
    assert.equal(nomePdfCotacao({
      cliente: 'CEVA LOGISTICS LTDA',
      origem: 'Salvador, BA, Brasil',
      destino: 'São Paulo, SP, Brasil',
      numero: 42,
      data: '2026-10-26T14:41:00.000Z',
    }), 'Cotacao_42_CEVA_LOGISTICS_LTDA_26-10-2026.pdf');
    assert.equal(nomePdfCotacao({
      cliente: 'CEVA / São Paulo',
      data: '26-10-2026',
    }), 'Cotacao_sem_numero_CEVA_Sao_Paulo_26-10-2026.pdf');
    assert.equal(formatarDataHoraCotacao('2026-10-26T14:41:00.000Z'), '26/10/2026 11:41');
    assert.equal(linhaConfereComTela(
      { origin: 'Avenida Talma Rodrigues Ribeiro, Vitória - ES', destination: 'Rodovia Presidente Dutra, SP', total_km: 942.5 },
      { origem: 'Avenida Talma Rodrigues Ribeiro', destino: 'Rodovia Presidente Dutra, 17744', km: 942.5 },
    ), true);
  });

  it('o histórico da rota na tela usa a mesma conta do card', () => {
    const conta = contaVisivelDaCotacao({
      cliente: 'CEVA LOGISTICS',
      origem: 'Avenida Talma Rodrigues Ribeiro, Vitória - ES',
      km: 942.5,
      versao: '2027',
      linhas: [{ operation_type: 'TABELA 2027 - SUDESTE MG/ES', price_per_extra_km: 7.3, price_per_extra_hour: 180 }],
    });
    assert.equal(conta.aplicar, true);
    if (!conta.aplicar) return;
    assert.equal(conta.tarifaKm, 7.3);
    assert.equal(conta.horaExtra, 180);
    assert.equal(conta.kmFaturado, 942.5);
    assert.equal(conta.horasFaturadas, 23);
    assert.equal(conta.total, 6880.25);
    assert.equal(conta.franquiaKm, 100);
    assert.equal(conta.franquiaHoras, 3);
    const proposta = aplicarContaNaProposta({
      acordada: false,
      regiao: 'SUDESTE',
      origem: 'Avenida Talma Rodrigues Ribeiro, Vitória - ES',
      destino: 'Rodovia Presidente Dutra, SP',
      paradas: [],
      acionamento: 9583.8,
      kmFranquia: 943,
      horasFranquia: 24,
      kmExtra: 6.6,
      horaExtra: 160,
      operacao: 'SUDESTE - ROTA ANTIGA',
    }, conta);
    assert.equal(proposta.acionamento, 6880.25);
    assert.equal(proposta.kmExtra, 7.3);
    assert.equal(proposta.horaExtra, 180);
    assert.notEqual(proposta.acionamento, 9583.8);
  });

  it('mantém ativa no 10º dia, expira no 11º e não reabre cotação convertida', () => {
    const noLimite = { created_at: new Date(AGORA.getTime() - PRAZO_COTACAO_MS).toISOString(), status: 'Enviada', is_active: true };
    const vencida = { created_at: new Date(AGORA.getTime() - PRAZO_COTACAO_MS - 1000).toISOString(), status: 'Enviada', is_active: true };
    const convertida = { created_at: vencida.created_at, status: 'convertida', is_active: true, converted_to_order_id: 'OS-1' };
    assert.equal(rotuloValidade(noLimite, AGORA).rotulo, 'Ativa · 1 dia');
    assert.equal(cotacaoSelecionavel(noLimite, AGORA), true);
    assert.equal(rotuloValidade(vencida, AGORA).tom, 'expirada');
    assert.equal(cotacaoSelecionavel(vencida, AGORA), false);
    assert.equal(rotuloValidade(convertida, AGORA).rotulo, 'Convertida em OS');
    assert.equal(cotacaoSelecionavel(convertida, AGORA), false);
  });

  it('reabre a proposta com os valores gravados no snapshot', () => {
    const registro = pedidoParaRegistro({
      origem: 'Rod. Pres. Dutra, 17744 - Cumbica',
      destino: 'Shopping Cidade Jardim - São Paulo',
      km: 47.7,
      duracaoMin: 46,
      valor: 690,
      horas: 3,
      regiao: 'SUDESTE SP/RJ',
      kmFranquia: 100,
      kmExtra: 6.9,
      horaExtra: 159,
      acionamento: 690,
      paradas: [],
      acordada: false,
      operacao: 'SUDESTE SP/RJ - GUARULHOS X SAO PAULO',
      usouMinimo: true,
    }, { id: 12, name: 'CEVA LOGISTICS LTDA' }, { name: 'Thiago Moreira dos Santos', email: 'thiago@grupotmseg.com.br' });
    assert.equal(registro.ok, true);
    if (!registro.ok) return;
    assert.equal(registro.linha.client_id, 12);
    assert.equal(registro.linha.status, 'Enviada');
    assert.equal(registro.linha.quote_source, 'ROTA');
    assert.equal(registro.linha.converted_to_order_id, undefined);
    const proposta = propostaDoHistorico({
      origin: String(registro.linha.origin),
      destination: String(registro.linha.destination),
      total_km: 47.7,
      total_hours: 3,
      total_value: 690,
      contract_details: String(registro.linha.contract_details),
    });
    assert.equal(proposta.acionamento, 690);
    assert.equal(proposta.kmFranquia, 100);
    assert.equal(proposta.regiao, 'SUDESTE SP/RJ');
    assert.equal(proposta.origem, 'Rod. Pres. Dutra, 17744 - Cumbica');
    assert.equal(lerSnapshot(String(registro.linha.contract_details))?.duracaoMin, 46);
    assert.equal(proposta.vigencia, '2026');
    assert.equal(proposta.kmRota, 47.7);
    assert.equal(lerSnapshot('{"kind":"outro"}'), null);
  });

  it('grava no snapshot a tarifa 2027 do Nordeste da CEVA', () => {
    const registro = pedidoParaRegistro({
      origem: 'Salvador, BA',
      destino: 'Recife, PE',
      km: 80,
      valor: 830,
      horas: 3,
      regiao: 'NORDESTE',
      kmFranquia: 100,
      kmExtra: 8.3,
      horaExtra: 207.5,
      acionamento: 830,
      paradas: [],
      acordada: false,
      operacao: 'TABELA 2027 - NORDESTE',
      usouMinimo: true,
      vigencia: '2027',
    }, { id: 4, name: 'CEVA LOGISTICS LTDA' }, { name: 'Portal CEVA', email: 'portal@ceva.com' });
    assert.equal(registro.ok, true);
    if (!registro.ok) return;
    assert.equal(registro.linha.client_id, 4);
    assert.equal(registro.linha.total_value, 830);
    const salvo = lerSnapshot(String(registro.linha.contract_details));
    assert.equal(salvo?.kmExtra, 8.3);
    assert.equal(salvo?.horaExtra, 207.5);
    assert.equal(salvo?.acionamento, 830);
    assert.equal(salvo?.vigencia, '2027');
    const proposta = propostaDoHistorico({
      origin: 'Salvador, BA',
      destination: 'Recife, PE',
      total_km: 80,
      total_hours: 3,
      total_value: 830,
      contract_details: String(registro.linha.contract_details),
    });
    assert.equal(proposta.kmExtra, 8.3);
    assert.equal(proposta.horaExtra, 207.5);
    assert.equal(proposta.acionamento, 830);
  });

  it('lista só o cliente do portal e grava a cotação sem converter em OS', async () => {
    const linhas = [
      { id: 'nova', client_id: 7, client_name: 'CEVA', origin: 'A', destination: 'B', total_km: 10, total_hours: 3, total_value: 100, created_at: '2026-10-26T12:00:00Z', created_by: 'Ana', status: 'Enviada', is_active: true, contract_details: null },
      { id: 'antiga', client_id: 7, client_name: 'CEVA', origin: 'C', destination: 'D', total_km: 20, total_hours: 3, total_value: 200, created_at: '2026-10-20T12:00:00Z', created_by: 'Ana', status: 'Enviada', is_active: true, contract_details: null },
      { id: 'outro', client_id: 9, client_name: 'IBL', origin: 'E', destination: 'F', total_km: 30, total_hours: 3, total_value: 300, created_at: '2026-10-26T13:00:00Z', created_by: 'Bia', status: 'Enviada', is_active: true, contract_details: null },
    ];
    const sb = {
      from(tabela: string) {
        assert.equal(tabela, 'quotes');
        const filtros: Record<string, unknown> = {};
        const api = {
          select() { return api; },
          eq(coluna: string, valor: unknown) { filtros[coluna] = valor; return api; },
          order() { return api; },
          range(inicio: number, fim: number) {
            const lista = linhas.filter((item) => item.client_id === filtros.client_id).slice(inicio, fim + 1);
            return Promise.resolve({ data: lista, error: null });
          },
          insert(payload: Record<string, unknown>) {
            assert.equal(payload.client_id, 7);
            assert.equal(payload.converted_to_order_id, undefined);
            assert.equal(payload.created_by, 'Thiago Moreira dos Santos');
            return {
              select() {
                return { single: async () => ({ data: { id: 'q-portal', created_at: '2026-10-26T15:00:00Z' }, error: null }) };
              },
            };
          },
        };
        return api;
      },
    };
    const lista = await listarHistoricoCotacoes(sb, { id: 7, name: 'CEVA LOGISTICS LTDA' }, 0);
    assert.equal(lista.status, 200);
    if (!('cotacoes' in lista.corpo)) return;
    assert.deepEqual(lista.corpo.cotacoes.map((item) => item.id), ['nova', 'antiga']);
    const gravado = await registrarCotacaoPortal(sb, { id: 7, name: 'CEVA LOGISTICS LTDA' }, { name: 'Thiago Moreira dos Santos', email: 'thiago@grupotmseg.com.br' }, {
      origem: 'Guarulhos',
      destino: 'São Paulo',
      km: 47.7,
      valor: 690,
      horas: 3,
      regiao: 'SUDESTE SP/RJ',
      usouMinimo: true,
    });
    const registro2027 = pedidoParaRegistro({
      origem: 'Salvador, BA',
      destino: 'São Paulo, SP',
      km: 80,
      valor: 830,
      horas: 3,
      kmExtra: 8.3,
      horaExtra: 207.5,
      acionamento: 830,
      vigencia: '2027',
    }, { id: 4, name: 'CEVA LOGISTICS LTDA' }, { name: 'Portal', email: 'portal@ceva.com' });
    assert.equal(registro2027.ok, true);
    if (registro2027.ok) {
      assert.equal(registro2027.snapshot.vigencia, '2027');
      assert.equal(registro2027.snapshot.kmExtra, 8.3);
      assert.equal(registro2027.snapshot.horaExtra, 207.5);
      assert.equal(registro2027.linha.total_value, 830);
    }
    const registro2026 = pedidoParaRegistro({
      origem: 'Salvador, BA',
      destino: 'São Paulo, SP',
      km: 80,
      valor: 1000,
      horas: 3,
      kmExtra: 10,
      horaExtra: 250,
      acionamento: 1000,
      vigencia: '2026',
    }, { id: 4, name: 'CEVA LOGISTICS LTDA' }, { name: 'Portal', email: 'portal@ceva.com' });
    assert.equal(registro2026.ok, true);
    if (registro2026.ok) assert.equal(registro2026.snapshot.vigencia, '2026');
    assert.equal(gravado.status, 201);
    if (!('ok' in gravado.corpo)) return;
    assert.equal(gravado.corpo.id, 'q-portal');
  });

  it('a proposta de captura marca os blocos e o sufixo da vigência', () => {
    const html = renderToStaticMarkup(React.createElement(ExperienciaProposta, {
      frase: '',
      mostrando: true,
      modoCaptura: true,
      marcaPdf: 'historico',
      proposta: {
        acordada: false,
        regiao: 'NORDESTE',
        origem: 'Salvador, BA',
        destino: 'São Paulo, SP',
        paradas: [],
        acionamento: 830,
        kmFranquia: 100,
        horasFranquia: 3,
        kmExtra: 8.3,
        horaExtra: 207.5,
        operacao: 'TABELA 2027 - NORDESTE',
        vigencia: '2027',
        kmRota: 1986,
        duracaoMin: 1609,
      },
      pedido: { regiao: 'NORDESTE', origem: 'Salvador, BA', destino: 'São Paulo, SP', paradas: [], km: 1986 },
      onFechar: () => undefined,
    }));
    assert.match(html, /data-proposta-pdf="historico"/);
    assert.match(html, /data-captura-proposta="historico"/);
    assert.match(html, /data-proposta-bloco/);
    assert.match(html, /Tabela: Salvador x São Paulo/);
    assert.match(html, /Rota: Salvador x São Paulo/);
    assert.doesNotMatch(html, /\(2027-\)/);
    assert.doesNotMatch(html, /\(2026-\)/);
    assert.match(html, /1\.986 km/);
    assert.match(html, /1609 min/);
    assert.ok(html.split('data-proposta-bloco').length - 1 >= 6);
    const tela = renderToStaticMarkup(React.createElement(ExperienciaProposta, {
      frase: '',
      mostrando: true,
      proposta: {
        acordada: false,
        regiao: 'NORDESTE',
        origem: 'Salvador, BA',
        destino: 'São Paulo, SP',
        paradas: [],
        acionamento: 830,
        kmFranquia: 100,
        horasFranquia: 3,
        kmExtra: 8.3,
        horaExtra: 207.5,
        operacao: 'TABELA 2027 - NORDESTE',
        vigencia: '2027',
      },
      pedido: { regiao: 'NORDESTE', origem: 'Salvador, BA', destino: 'São Paulo, SP', paradas: [], km: 1986 },
      printMapa: 'data:image/jpeg;base64,abc',
      onFechar: () => undefined,
    }));
    assert.match(tela, /Enviar para o e-mail/);
    assert.match(tela, /data-proposta-mapa="1"/);
    assert.match(tela, /Mapa da rota na tela/);
    assert.match(tela, /PDF completo da proposta vai em anexo/);
  });
});
