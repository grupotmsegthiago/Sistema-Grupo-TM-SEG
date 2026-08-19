import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActivationOffers,
  isGeneric100KmTable,
  rankByHomeCity,
  rankByUf,
  shortProviderName,
} from '../lib/providerActivationRanking.ts';

test('isGeneric100KmTable aceita faixa 100/110 e rejeita rota específica', () => {
  assert.equal(isGeneric100KmTable({ provider: 'A', operation_type: '100KM', franchise_km: 100 }), true);
  assert.equal(isGeneric100KmTable({ provider: 'A', operation_type: 'SUDESTE - ATÉ 110 KM', franchise_km: 110 }), true);
  assert.equal(isGeneric100KmTable({ provider: 'A', operation_type: '02 ARMADOS PRONTA RESPOSTA', franchise_km: 50 }), false);
  assert.equal(isGeneric100KmTable({ provider: 'A', operation_type: 'FLORIANÓPOLIS X PALHOÇA', franchise_km: 100 }), false);
  assert.equal(isGeneric100KmTable({ provider: 'A', operation_type: '__AUTO_MASTER__', franchise_km: 100 }), false);
});

test('buildActivationOffers — Prioridade 0 é o 100 km mais em conta na UF', () => {
  const providers = [
    { name: 'DEMARK SERVICOS', city: 'SAO PAULO', state: 'SP', status: 'Ativo' },
    { name: 'BAZISUL SEGURANCA PRIVADA LTDA', city: 'PAULINIA', state: 'SP', status: 'Ativo' },
    { name: 'CONSEGUR VIGILANCIA', city: 'BELO HORIZONTE', state: 'MG', status: 'Ativo' },
    { name: 'BLOQUEADO X', city: 'SAO PAULO', state: 'SP', status: 'Bloqueado' },
  ];
  const tables = [
    { provider: 'DEMARK SERVICOS', operation_type: 'ORIGEM - ATÉ 110 KM', activation_cost: 430, franchise_km: 110 },
    { provider: 'BAZISUL SEGURANCA PRIVADA LTDA', operation_type: 'FAIXA SP: 110 KM', activation_cost: 400, franchise_km: 110 },
    { provider: 'CONSEGUR VIGILANCIA', operation_type: 'URBANA MG', activation_cost: 450, franchise_km: 100 },
    { provider: 'BLOQUEADO X', operation_type: '100KM', activation_cost: 10, franchise_km: 100 },
  ];
  const ranked = rankByUf(buildActivationOffers(providers, tables));
  assert.equal(ranked.SP[0].provider, 'BAZISUL SEGURANCA PRIVADA LTDA');
  assert.equal(ranked.SP[0].priority, 0);
  assert.equal(ranked.SP[0].city, 'Paulínia');
  assert.equal(ranked.SP[1].provider, 'DEMARK SERVICOS');
  assert.equal(ranked.SP[1].priority, 1);
  assert.equal(ranked.MG[0].provider, 'CONSEGUR VIGILANCIA');
  assert.equal(ranked.SP.some((r) => r.provider === 'BLOQUEADO X'), false);
});

test('COLISEU PE entra em Pernambuco mesmo com sede cadastrada em SP', () => {
  const offers = buildActivationOffers(
    [{ name: 'COLISEU PE', city: 'SÃO PAULO', state: 'SP', status: 'Ativo' }],
    [{ provider: 'COLISEU PE', operation_type: '100KM', activation_cost: 450, franchise_km: 100 }],
  );
  assert.equal(offers.length, 1);
  assert.equal(offers[0].marketUf, 'PE');
  assert.equal(offers[0].city, 'Recife');
  assert.equal(offers[0].region, 'NORDESTE');
});

test('motor automático preenche 100 km quando não há tabela manual', () => {
  const offers = buildActivationOffers(
    [{
      name: 'UP VIGILANCIA LTDA',
      city: 'SAO JOAO DE MERITI',
      state: 'RJ',
      status: 'Ativo',
      auto_calc_enabled: true,
      auto_base_value: 380,
      auto_base_km: 100,
    }],
    [],
  );
  assert.equal(offers.length, 1);
  assert.equal(offers[0].marketUf, 'RJ');
  assert.equal(offers[0].cost, 380);
  assert.match(offers[0].source, /MOTOR AUTO/);
});

test('rankByHomeCity agrupa por estado, não por cidade', () => {
  const offers = buildActivationOffers(
    [
      { name: 'GAIA', city: 'NOVA IGUAÇU', state: 'RJ', status: 'Ativo' },
      { name: 'IMPETUS', city: 'RIO DE JANEIRO', state: 'RJ', status: 'Ativo' },
      { name: 'BAZISUL SEGURANCA PRIVADA LTDA', city: 'PAULINIA', state: 'SP', status: 'Ativo' },
      { name: 'DEMARK SERVICOS', city: 'SAO PAULO', state: 'SP', status: 'Ativo' },
    ],
    [
      { provider: 'GAIA', operation_type: 'SUDESTE - 100KM', activation_cost: 380, franchise_km: 100 },
      { provider: 'IMPETUS', operation_type: 'ATÉ 100KM', activation_cost: 430, franchise_km: 100 },
      { provider: 'BAZISUL SEGURANCA PRIVADA LTDA', operation_type: '100KM', activation_cost: 400, franchise_km: 100 },
      { provider: 'DEMARK SERVICOS', operation_type: '100KM', activation_cost: 430, franchise_km: 100 },
    ],
  );
  const groups = rankByHomeCity(offers);
  assert.equal(groups.filter((g) => g.uf === 'RJ').length, 1);
  assert.equal(groups.filter((g) => g.uf === 'SP').length, 1);
  const rj = groups.find((g) => g.uf === 'RJ');
  const sp = groups.find((g) => g.uf === 'SP');
  assert.equal(rj?.city, 'Rio de Janeiro');
  assert.equal(rj?.rows[0].provider, 'GAIA');
  assert.equal(rj?.rows[0].priority, 0);
  assert.equal(rj?.rows[1].provider, 'IMPETUS');
  assert.equal(sp?.city, 'São Paulo');
  assert.equal(sp?.rows.map((r) => r.provider).includes('BAZISUL SEGURANCA PRIVADA LTDA'), true);
  assert.equal(sp?.rows.map((r) => r.provider).includes('DEMARK SERVICOS'), true);
  assert.equal(groups.some((g) => g.city === 'Nova Iguaçu' || g.city === 'Paulínia'), false);
});

test('shortProviderName enxuga razão social para o mapa', () => {
  assert.equal(shortProviderName('GAIA SEGURANCA E VIGILANCIA'), 'GAIA');
  assert.ok(shortProviderName('COLISEU PE').includes('COLISEU'));
});

test('cobertura explícita define UFs e valor da filial; prioridade 0 é o mais barato', () => {
  const providers = [
    {
      name: 'ALPHA SEG',
      city: 'SAO PAULO',
      state: 'SP',
      status: 'Ativo',
      operating_coverage: [
        { uf: 'SP', city: 'São Paulo', cost100km: 500, isHq: true },
        { uf: 'RJ', city: 'Rio de Janeiro', cost100km: 380, isHq: false },
      ],
    },
    {
      name: 'BETA SEG',
      city: 'RIO DE JANEIRO',
      state: 'RJ',
      status: 'Ativo',
      operating_coverage: [
        { uf: 'RJ', cost100km: 420, isHq: true },
      ],
    },
  ];
  const tables = [
    { provider: 'ALPHA SEG', operation_type: '100KM', activation_cost: 500, franchise_km: 100 },
    { provider: 'BETA SEG', operation_type: '100KM', activation_cost: 420, franchise_km: 100 },
  ];
  const ranked = rankByUf(buildActivationOffers(providers, tables));
  assert.equal(ranked.RJ[0].provider, 'ALPHA SEG');
  assert.equal(ranked.RJ[0].priority, 0);
  assert.equal(ranked.RJ[0].cost, 380);
  assert.equal(ranked.RJ[0].fromCoverage, true);
  assert.equal(ranked.RJ[0].city, 'Rio de Janeiro');
  assert.equal(ranked.RJ[1].provider, 'BETA SEG');
  assert.equal(ranked.RJ[1].priority, 1);
  assert.equal(ranked.SP.length, 1);
  assert.equal(ranked.SP[0].provider, 'ALPHA SEG');
});

test('cobertura restringe o fornecedor às UFs marcadas mesmo com tabela genérica', () => {
  const offers = buildActivationOffers(
    [{
      name: 'SUL ONLY',
      city: 'CURITIBA',
      state: 'PR',
      status: 'Ativo',
      operating_coverage: [{ uf: 'PR', cost100km: 400, isHq: true }],
    }],
    [{ provider: 'SUL ONLY', operation_type: 'SUDESTE - 100KM', activation_cost: 400, franchise_km: 100 }],
  );
  assert.deepEqual(offers.map((o) => o.marketUf).sort(), ['PR']);
});

test('filial sem valor usa o 100 km da sede para entrar no ranking', () => {
  const offers = buildActivationOffers(
    [{
      name: 'FILIAL PE',
      city: 'SAO PAULO',
      state: 'SP',
      status: 'Ativo',
      operating_coverage: [
        { uf: 'SP', cost100km: 430, isHq: true },
        { uf: 'PE', city: 'Recife', isHq: false },
      ],
    }],
    [{ provider: 'FILIAL PE', operation_type: '100KM', activation_cost: 430, franchise_km: 100 }],
  );
  const pe = offers.find((o) => o.marketUf === 'PE');
  assert.ok(pe);
  assert.equal(pe?.cost, 430);
  assert.equal(pe?.city, 'Recife');
  assert.match(pe?.source || '', /FILIAL PE/);
});

test('em São Paulo a TORRES fica sempre na prioridade 0, mesmo mais cara', () => {
  const ranked = rankByUf(buildActivationOffers(
    [
      { name: 'BAZISUL SEGURANCA PRIVADA LTDA', city: 'PAULINIA', state: 'SP', status: 'Ativo' },
      { name: 'TORRES VIGILANCIA PATRIMONIAL LTDA', city: 'SAO PAULO', state: 'SP', status: 'Ativo' },
      { name: 'CONSEGUR VIGILANCIA', city: 'BELO HORIZONTE', state: 'MG', status: 'Ativo' },
    ],
    [
      { provider: 'BAZISUL SEGURANCA PRIVADA LTDA', operation_type: '100KM', activation_cost: 400, franchise_km: 100 },
      { provider: 'TORRES VIGILANCIA PATRIMONIAL LTDA', operation_type: '100KM', activation_cost: 900, franchise_km: 100 },
      { provider: 'CONSEGUR VIGILANCIA', operation_type: '100KM', activation_cost: 450, franchise_km: 100 },
    ],
  ));
  assert.equal(ranked.SP[0].provider, 'TORRES VIGILANCIA PATRIMONIAL LTDA');
  assert.equal(ranked.SP[0].priority, 0);
  assert.equal(ranked.SP[0].pinned, true);
  assert.equal(ranked.SP[1].provider, 'BAZISUL SEGURANCA PRIVADA LTDA');
  assert.equal(ranked.SP[1].priority, 1);
  assert.equal(ranked.MG[0].provider, 'CONSEGUR VIGILANCIA');
  assert.equal(ranked.MG[0].pinned, false);
});

test('TORRES fora de SP segue a ordem de custo', () => {
  const ranked = rankByUf(buildActivationOffers(
    [
      { name: 'TORRES VIGILANCIA PATRIMONIAL LTDA', city: 'RIO DE JANEIRO', state: 'RJ', status: 'Ativo' },
      { name: 'GAIA', city: 'NOVA IGUAÇU', state: 'RJ', status: 'Ativo' },
    ],
    [
      { provider: 'TORRES VIGILANCIA PATRIMONIAL LTDA', operation_type: '100KM', activation_cost: 900, franchise_km: 100 },
      { provider: 'GAIA', operation_type: '100KM', activation_cost: 380, franchise_km: 100 },
    ],
  ));
  assert.equal(ranked.RJ[0].provider, 'GAIA');
  assert.equal(ranked.RJ[0].priority, 0);
  assert.equal(ranked.RJ[1].provider, 'TORRES VIGILANCIA PATRIMONIAL LTDA');
});


