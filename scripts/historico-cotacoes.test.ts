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
  nomePdfCotacao,
  pedidoParaRegistro,
  propostaDoHistorico,
  resumirEndereco,
  rotuloValidade,
  textoDistanciaTempo,
  textoRegiaoFranquia,
} from '../lib/portalCliente/historicoCotacoes';
import { listarHistoricoCotacoes, registrarCotacaoPortal } from '../lib/portalCliente/cotacaoHttp';
import { HistoricoVazio } from '../components/ceva/HistoricoCotacoes';

const AGORA = new Date('2026-10-26T15:00:00.000Z');

describe('histórico de cotações do portal', () => {
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
    assert.equal(nomePdfCotacao('CEVA LOGISTICS LTDA', 'abc-123'), 'Cotacao-CEVA-abc-123.pdf');
    assert.equal(formatarDataHoraCotacao('2026-10-26T14:41:00.000Z'), '26/10/2026 11:41');
  });

  it('mantém ativa no 30º dia, expira no 31º e não reabre cotação convertida', () => {
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
    assert.equal(lerSnapshot('{"kind":"outro"}'), null);
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
});
