import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aplicarConsumoRota,
  arredondarHorasPeloCorte,
  calculateTripCost,
  clienteContratualDhlOuIbl,
  consumirRotaEsporadica,
  cotacaoSelecionavel,
  cotacaoVencida,
  ehLinhaPadraoRegional,
  getRegionFromLocation,
  montarAplicacaoTabela,
  numerosDaCotacaoRegional,
  patchEdicaoRegional,
  patchExpiracaoCotacao,
  perfilPodeAplicarTabelaRegional,
  registroVigenciaTabelaRegional,
  rotaVisivelEmNovaOs,
  vigenciaTabelaInformada,
} from '../lib/precificacao/tabela2027';
import { checkAndExpireQuotations } from '../lib/precificacao/expirarCotacoes';
import { getBase64ImageFromURL } from '../lib/precificacao/imageUtils';

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

describe('validade da cotação', () => {
  const agora = new Date('2026-10-26T15:00:00.000Z');
  const dias = (quantidade: number) => new Date(agora.getTime() - quantidade * 24 * 60 * 60 * 1000).toISOString();

  it('cotação com mais de 10 dias volta inativa e fora da busca', async () => {
    const velha = {
      id: 'q-velha',
      created_at: dias(11),
      status: 'Enviada',
      is_active: true,
      converted_to_order_id: null as string | null,
    };
    assert.equal(cotacaoVencida(velha, agora), true);
    assert.equal(cotacaoSelecionavel(velha, agora), false);
    assert.deepEqual(patchExpiracaoCotacao(velha, agora), { is_active: false, status: 'expirada' });
    const noLimite = { ...velha, created_at: dias(10) };
    assert.equal(cotacaoVencida(noLimite, agora), false);
    assert.equal(cotacaoSelecionavel(noLimite, agora), true);

    const filtros: Array<Record<string, unknown>> = [];
    const db = {
      from(tabela: string) {
        assert.equal(tabela, 'quotes');
        return {
          update(valores: { is_active: false; status: 'expirada' }) {
            return {
              is(coluna: string, valor: null) {
                return {
                  eq(colunaAtiva: string, ativa: boolean) {
                    return {
                      lt(colunaData: string, limite: string) {
                        return {
                          neq(colunaStatus: string, status: string) {
                            filtros.push({ valores, coluna, valor, colunaAtiva, ativa, colunaData, limite, colunaStatus, status });
                            return Promise.resolve({ error: null });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const resultado = await checkAndExpireQuotations(db);
    assert.equal(resultado.expiradas, true);
    assert.equal(resultado.colunaAusente, false);
    assert.equal(filtros[0].coluna, 'converted_to_order_id');
    assert.equal(filtros[0].valor, null);
    assert.equal(filtros[0].ativa, true);
    assert.equal((filtros[0].valores as { status: string }).status, 'expirada');
    assert.equal((filtros[0].valores as { is_active: boolean }).is_active, false);
    const decorrido = Date.now() - new Date(String(filtros[0].limite)).getTime();
    assert.ok(Math.abs(decorrido - 10 * 24 * 60 * 60 * 1000) < 2000);
  });

  it('cotação vinculada a OS permanece convertida', async () => {
    const linhas = [
      {
        id: 'q-os',
        created_at: dias(90),
        status: 'convertida',
        is_active: true,
        converted_to_order_id: 'OS-77' as string | null,
      },
      {
        id: 'q-antiga',
        created_at: dias(40),
        status: 'Rascunho',
        is_active: true,
        converted_to_order_id: null as string | null,
      },
    ];
    assert.equal(cotacaoVencida(linhas[0], agora), false);
    assert.equal(patchExpiracaoCotacao(linhas[0], agora), null);
    assert.equal(cotacaoSelecionavel(linhas[0], agora), false);
    const db = {
      from() {
        return {
          update(valores: { is_active: false; status: 'expirada' }) {
            return {
              is(_coluna: string, _valor: null) {
                return {
                  eq(_colunaAtiva: string, ativa: boolean) {
                    return {
                      lt(_colunaData: string, limite: string) {
                        return {
                          neq(_colunaStatus: string, status: string) {
                            for (const linha of linhas) {
                              const cabe = linha.converted_to_order_id == null
                                && linha.is_active === ativa
                                && linha.created_at < limite
                                && linha.status !== status;
                              if (cabe) Object.assign(linha, valores);
                            }
                            return Promise.resolve({ error: null });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    await checkAndExpireQuotations(db);
    assert.equal(linhas[0].status, 'convertida');
    assert.equal(linhas[0].is_active, true);
    assert.equal(linhas[0].converted_to_order_id, 'OS-77');
    assert.equal(linhas[1].status, 'expirada');
    assert.equal(linhas[1].is_active, false);
  });
});

describe('edição da linha regional', () => {
  it('altera só o cliente da linha e deixa o outro intacto', () => {
    const linhas = [
      { id: 'linha-a', client: 'CLIENTE A' },
      { id: 'linha-b', client: 'CLIENTE B' },
    ];
    const patch = patchEdicaoRegional({
      id: 'linha-a',
      clientName: 'CLIENTE A',
      ratePerKm: 8.1,
      extraHourRate: 170,
      franchiseKm: 100,
      franchiseHours: 3,
      linhas,
    });
    assert.equal(patch.ok, true);
    if (!patch.ok) return;
    assert.equal(patch.id, 'linha-a');
    assert.equal(patch.client, 'CLIENTE A');
    assert.equal(patch.payload.price_per_extra_km, 8.1);
    assert.equal(patch.payload.price_per_extra_hour, 170);
    assert.equal(patch.payload.activation_fee, 810);
    assert.equal(JSON.stringify(patch).includes('CLIENTE B'), false);

    const cruzado = patchEdicaoRegional({
      id: 'linha-b',
      clientName: 'CLIENTE A',
      ratePerKm: 1,
      extraHourRate: 1,
      franchiseKm: 100,
      franchiseHours: 3,
      linhas,
    });
    assert.equal(cruzado.ok, false);
    assert.equal(linhas[1].client, 'CLIENTE B');

    const ceva = numerosDaCotacaoRegional({
      cliente: 'CEVA LOGISTICS LTDA',
      origem: 'Salvador, BA',
      km: 80,
      versao: '2027',
      linhas: [
        { operation_type: 'NORDESTE - ROTA ANTIGA', price_per_extra_km: 10, price_per_extra_hour: 250 },
        { operation_type: 'TABELA 2027 - NORDESTE', price_per_extra_km: 8.3, price_per_extra_hour: 207.5 },
      ],
      tarifaKmFallback: 10,
      horaExtraFallback: 250,
    });
    assert.equal(ceva.aplicar, true);
    if (ceva.aplicar) {
      assert.equal(ceva.tarifaKm, 8.3);
      assert.equal(ceva.horaExtra, 207.5);
      assert.equal(ceva.vigenciaUsada, '2027');
      assert.equal(ceva.conta.valor, 830);
    }
    const manual = numerosDaCotacaoRegional({
      cliente: 'CEVA LOGISTICS LTDA',
      origem: 'Salvador, BA',
      km: 80,
      versao: '2026',
      linhas: [
        { operation_type: 'TABELA 2026 - NORDESTE', price_per_extra_km: 10, price_per_extra_hour: 250 },
        { operation_type: 'TABELA 2027 - NORDESTE', price_per_extra_km: 8.3, price_per_extra_hour: 207.5 },
      ],
    });
    assert.equal(manual.aplicar, true);
    if (manual.aplicar) {
      assert.equal(manual.tarifaKm, 10);
      assert.equal(manual.horaExtra, 250);
      assert.equal(manual.vigenciaUsada, '2026');
    }
    const dhl = numerosDaCotacaoRegional({
      cliente: 'DHL EXPRESS',
      origem: 'Guarulhos - SP',
      km: 180,
      versao: '2027',
      linhas: [{ operation_type: 'TABELA 2027 - SUDESTE SP/RJ', price_per_extra_km: 6.9, price_per_extra_hour: 159 }],
    });
    assert.equal(dhl.aplicar, false);
    if (!dhl.aplicar) assert.equal(dhl.motivo, 'contratual');
  });
});

describe('imagem em base64', () => {
  it('devolve a data URL que já está pronta', async () => {
    const pronta = 'data:image/png;base64,abc';
    assert.equal(await getBase64ImageFromURL(pronta), pronta);
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

describe('vigência gravada no servidor', () => {
  it('aceita só 2026 ou 2027 e monta a linha da chave tabela_regional_vigente', () => {
    assert.equal(vigenciaTabelaInformada('2027'), '2027');
    assert.equal(vigenciaTabelaInformada('2026'), '2026');
    assert.equal(vigenciaTabelaInformada('2028'), null);
    assert.equal(vigenciaTabelaInformada(2027), null);
    const linha = registroVigenciaTabelaRegional('2027', '  ', '2026-10-26T15:00:00.000Z');
    assert.deepEqual(linha, {
      key: 'tabela_regional_vigente',
      value: { versao: '2027' },
      updated_by: 'Diretoria',
      updated_at: '2026-10-26T15:00:00.000Z',
    });
  });

  it('o botão não grava system_settings pelo cliente anon', () => {
    const tela = readFileSync('components/ClientForm.tsx', 'utf8');
    assert.equal(tela.includes(".from('system_settings').upsert"), false);
    assert.match(tela, /\/api\/pricing\/tabela-regional-vigente/);
    const rotas = readFileSync('server/routes.ts', 'utf8');
    const inicio = rotas.indexOf("app.post('/api/pricing/tabela-regional-vigente'");
    assert.notEqual(inicio, -1);
    const trecho = rotas.slice(inicio, inicio + 900);
    assert.match(trecho, /requireRole\('diretoria', 'administrador', 'admin'\)/);
    assert.match(trecho, /createSupabaseAdminClient\(\)/);
    assert.match(trecho, /\.from\('system_settings'\)\.upsert/);
    assert.equal(rotas.includes('from "../api/dados-protegidos"'), false);
    assert.match(rotas, /atenderDadosProtegidos/);
    const entrada = readFileSync('api/index.ts', 'utf8');
    assert.match(entrada, /return app\(req, res\)/);
    assert.equal(entrada.includes('require("serverless-http")'), false);
    const sql = readFileSync('migrations/2026_10_26_fix_system_settings_rls.sql', 'utf8');
    assert.match(sql, /key = 'tabela_regional_vigente'/);
    assert.doesNotMatch(sql, /FROM users\b/i);
    assert.doesNotMatch(sql, /USING \(true\)/);
    assert.doesNotMatch(sql, /FOR ALL/);
  });
});
