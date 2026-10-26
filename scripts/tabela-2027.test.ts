import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarConsumoRota,
  arredondarHorasPeloCorte,
  calculateTripCost,
  clienteContratualDhlOuIbl,
  consumirRotaEsporadica,
  ehLinhaPadraoRegional,
  getRegionFromLocation,
  montarAplicacaoTabela,
  perfilPodeAplicarTabelaRegional,
  rotaVisivelEmNovaOs,
} from '../lib/precificacao/tabela2027';

describe('rota esporádica na criação da OS', () => {
  it('desativa a rota e tira ela do select da próxima OS', async () => {
    const antes = {
      id: '10',
      route_type: 'esporadica',
      is_active: true,
      consumed_in_order_id: null as string | null,
      name: 'SUDESTE - GUARULHOS X SERRA',
    };
    const gravacoes: Array<{ id: string; patch: { is_active: boolean; consumed_in_order_id: string } }> = [];
    const db = {
      from(table: string) {
        assert.equal(table, 'client_routes');
        return {
          update(patch: { is_active: false; consumed_in_order_id: string }) {
            return {
              eq(_coluna: string, id: string) {
                gravacoes.push({ id, patch });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };

    const resultado = await consumirRotaEsporadica(db, antes, 'OS-99');
    const depois = aplicarConsumoRota(antes, 'OS-99');

    assert.equal(resultado.consumida, true);
    assert.equal(resultado.motivo, 'ok');
    assert.equal(gravacoes.length, 1);
    assert.equal(gravacoes[0].id, '10');
    assert.equal(gravacoes[0].patch.is_active, false);
    assert.equal(gravacoes[0].patch.consumed_in_order_id, 'OS-99');
    assert.equal(depois.is_active, false);
    assert.equal(depois.consumed_in_order_id, 'OS-99');
    assert.equal(rotaVisivelEmNovaOs(depois), false);
  });

  it('mantém a rota fixa ativa e visível', async () => {
    const fixa = { id: '3', route_type: 'fixa', is_active: true, consumed_in_order_id: null };
    let chamou = false;
    const db = {
      from() {
        chamou = true;
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      },
    };
    const resultado = await consumirRotaEsporadica(db, fixa, 'OS-1');
    assert.equal(resultado.consumida, false);
    assert.equal(resultado.motivo, 'nao_esporadica');
    assert.equal(chamou, false);
    assert.equal(aplicarConsumoRota(fixa, 'OS-1').is_active, true);
    assert.equal(rotaVisivelEmNovaOs(fixa), true);
  });
});

describe('tabela contratual de DHL e IBL', () => {
  const nomeada = {
    id: '1',
    operation_type: 'SUDESTE - GUARULHOS X SERRA',
    price_per_extra_hour: 180,
    price_per_extra_km: 8,
  };

  it('não aplica a Tabela 2027 na DHL', () => {
    const local = getRegionFromLocation('Guarulhos', 'SP', 'DHL EXPRESS');
    assert.equal(local.aplicaPrecificacaoRegional, false);
    assert.equal(local.region, null);
    assert.equal(local.motivo, 'cliente_dhl');
    assert.equal(clienteContratualDhlOuIbl('DHL'), 'DHL');

    const plano = montarAplicacaoTabela({
      versao: '2027',
      cliente: 'DHL EXPRESS',
      existentes: [nomeada],
    });
    assert.equal(plano.aplicarNoCliente, false);
    assert.equal(plano.linhas.length, 0);
    assert.equal(plano.rotas.length, 0);
    assert.equal(plano.linhas.some((linha) => linha.operation_type.includes('GUARULHOS')), false);
  });

  it('não aplica a Tabela 2027 na IBL, inclusive Intermodal', () => {
    const plano = montarAplicacaoTabela({
      versao: '2027',
      cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
      existentes: [nomeada],
    });
    assert.equal(plano.aplicarNoCliente, false);
    assert.equal(plano.linhas.length, 0);
    assert.equal(clienteContratualDhlOuIbl('IBL LOGISTICA'), 'IBL');
    assert.equal(getRegionFromLocation('São Paulo', 'SP', 'IBL').aplicaPrecificacaoRegional, false);
  });

  it('não reescreve rota nomeada de outro cliente', () => {
    const plano = montarAplicacaoTabela({
      versao: '2027',
      cliente: 'ACME LOG',
      existentes: [nomeada, { id: '9', operation_type: 'TABELA 2027 - SUDESTE SP/RJ', price_per_extra_hour: 160 }],
    });
    assert.equal(plano.aplicarNoCliente, true);
    assert.equal(plano.linhas.length, 6);
    assert.equal(plano.linhas.some((linha) => String(linha.operation_type).includes('GUARULHOS')), false);
    assert.equal(ehLinhaPadraoRegional(nomeada.operation_type), false);
    const sp = plano.linhas.find((linha) => linha.region === 'sudeste_sp_rj');
    assert.ok(sp);
    assert.equal(sp.id, '9');
    assert.equal(sp.price_per_extra_km, 6.9);
    assert.equal(sp.activation_fee, 690);
    assert.equal(sp.franchise_km, 100);
    assert.equal(sp.franchise_hours, 3);
    assert.equal(sp.price_per_extra_hour, 160);
  });
});

describe('região pela origem', () => {
  it('Guarulhos/SP vai para sudeste_sp_rj e Belo Horizonte/MG para sudeste_mg_es', () => {
    assert.equal(getRegionFromLocation('Guarulhos', 'SP', 'Cliente Novo').region, 'sudeste_sp_rj');
    assert.equal(getRegionFromLocation('Guarulhos/SP', '', 'Cliente Novo').region, 'sudeste_sp_rj');
    assert.equal(getRegionFromLocation('Belo Horizonte', 'MG', 'Cliente Novo').region, 'sudeste_mg_es');
    assert.equal(getRegionFromLocation('Belo Horizonte/MG', '', 'Cliente Novo').region, 'sudeste_mg_es');
    assert.equal(getRegionFromLocation('Curitiba', 'PR', 'Cliente Novo').region, 'sul');
    assert.equal(getRegionFromLocation('Manaus', 'AM', 'Cliente Novo').region, 'norte');
  });
});

describe('arredondamento de horas da Tabela 2027', () => {
  it('40 minutos desce e 41 minutos sobe', () => {
    assert.equal(arredondarHorasPeloCorte(4, 39), 4);
    assert.equal(arredondarHorasPeloCorte(4, 40), 4);
    assert.equal(arredondarHorasPeloCorte(4, 41), 5);
    assert.equal(arredondarHorasPeloCorte(4, 54), 5);
    assert.equal(arredondarHorasPeloCorte(3, 22), 3);
    assert.equal(arredondarHorasPeloCorte(3, 31), 3);
    assert.equal(arredondarHorasPeloCorte(2, 62), 3);
    assert.equal(arredondarHorasPeloCorte(3, 2), 3);

    const emQuatroEQuarenta = calculateTripCost((4 + 40 / 60) * 40, 6.9);
    assert.equal(emQuatroEQuarenta.minutos, 40);
    assert.equal(emQuatroEQuarenta.horasFaturadas, 4);

    const emQuatroEQuarentaEUm = calculateTripCost((4 + 41 / 60) * 40, 6.9);
    assert.equal(emQuatroEQuarentaEUm.minutos, 41);
    assert.equal(emQuatroEQuarentaEUm.horasFaturadas, 5);
    assert.equal(emQuatroEQuarentaEUm.valor, Math.round(emQuatroEQuarentaEUm.kmFaturado * 6.9 * 100) / 100);
  });

  it('menos de 100 km cobra 100 km e 3 horas', () => {
    const curto = calculateTripCost(80, 6.9);
    assert.equal(curto.usouMinimo, true);
    assert.equal(curto.kmFaturado, 100);
    assert.equal(curto.horasFaturadas, 3);
    assert.equal(curto.valor, 690);
    assert.equal(curto.acionamentoMinimo, 690);

    const noLimite = calculateTripCost(100, 7.3);
    assert.equal(noLimite.kmFaturado, 100);
    assert.equal(noLimite.horasFaturadas, 3);
    assert.equal(noLimite.valor, 730);

    const acima = calculateTripCost(150, 10);
    assert.equal(acima.usouMinimo, false);
    assert.equal(acima.kmFaturado, 150);
    assert.equal(acima.valor, 1500);
    assert.ok(acima.horasFaturadas >= 3);
  });
});

describe('acesso da Diretoria', () => {
  it('libera só diretoria e administrador', () => {
    assert.equal(perfilPodeAplicarTabelaRegional('Diretoria'), true);
    assert.equal(perfilPodeAplicarTabelaRegional('Administrador'), true);
    assert.equal(perfilPodeAplicarTabelaRegional('Financeiro'), false);
    assert.equal(perfilPodeAplicarTabelaRegional('Comercial'), false);
  });
});
