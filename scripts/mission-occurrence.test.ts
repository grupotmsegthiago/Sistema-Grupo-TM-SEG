import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCCURRENCE_BANNER,
  buildOpenOccurrenceViews,
  formatarPontoRota,
  formatarRotaCidadeUf,
  countOpenOccurrences,
  isOccurrenceOpen,
  missionHasOccurrence,
  normalizeOccurrenceText,
  occurrenceTextError,
  resolutionTextError,
  ROTULO_O_QUE_FOI_FEITO,
  ROTULO_RESOLVER_OCORRENCIA,
} from '../lib/missionOccurrence';

test('ocorrência exige um texto que a auditoria consiga ler', () => {
  assert.equal(occurrenceTextError('  '), 'Descreva o problema para a auditoria poder verificar.');
  assert.equal(occurrenceTextError('ok'), 'Descreva o problema para a auditoria poder verificar.');
  assert.equal(occurrenceTextError('Motorista recusou o embarque'), null);
  assert.equal(normalizeOccurrenceText('  atraso   na   origem  '), 'atraso na origem');
});

test('ocorrência resolvida exige o motivo e sai da lista em aberto', () => {
  assert.equal(resolutionTextError('ok'), 'Informe o que foi feito.');
  assert.equal(ROTULO_RESOLVER_OCORRENCIA, 'Resolvido');
  assert.equal(ROTULO_O_QUE_FOI_FEITO, 'Informar o que foi feito');
  assert.equal(resolutionTextError('Motorista liberado e viagem retomada'), null);
  assert.equal(isOccurrenceOpen({ resolved_at: null }), true);
  assert.equal(isOccurrenceOpen({ resolved_at: '2026-09-30T14:00:00Z' }), false);
  assert.equal(countOpenOccurrences([
    { resolved_at: null },
    { resolved_at: '2026-09-30T14:00:00Z' },
  ]), 1);
  const views = buildOpenOccurrenceViews([
    {
      id: 'a',
      mission_id: 'GTM-1',
      description: 'Atraso',
      created_by: 'Ana',
      created_at: '2026-09-30T14:00:00Z',
      resolved_at: null,
    },
    {
      id: 'b',
      mission_id: 'GTM-2',
      description: 'Já resolvida',
      created_at: '2026-09-30T13:00:00Z',
      resolved_at: '2026-09-30T15:00:00Z',
    },
  ], [{
    id: 'GTM-1',
    client: 'LUFT',
    origin: 'AV. AÇAÍ, 875 - DISTRITO INDUSTRIAL I, MANAUS - AM, 69075-020',
    destination: 'PINDORAMA - SP, 15830-000',
  }]);
  assert.equal(views.length, 1);
  assert.equal(views[0].missionId, 'GTM-1');
  assert.equal(views[0].client, 'LUFT');
  assert.equal(views[0].route, 'MANAUS - AM x PINDORAMA - SP');
  const missing = buildOpenOccurrenceViews([
    { id: 'c', mission_id: 'GTM-9', description: 'Sem OS', created_at: '2026-09-30T14:00:00Z' },
  ], []);
  assert.equal(missing[0].client, 'NÃO CARREGADO');
});

test('rota da ocorrência fica cidade e UF, e código plus vira a cidade', () => {
  assert.equal(
    formatarPontoRota('XGMH+H3X - PARANATINGA, MT, 78870-000'),
    'PARANATINGA - MT',
  );
  assert.equal(
    formatarPontoRota('8MRW+2XR, TRÊS CORAÇÕES - MG, 37410-000'),
    'TRÊS CORAÇÕES - MG',
  );
  assert.equal(
    formatarPontoRota('VXVV+HH2 - REGIÃO METROPOLITANA DE JUNDIAÍ, JUNDIAÍ - SP'),
    'JUNDIAÍ - SP',
  );
  assert.equal(
    formatarPontoRota('BR-153, KM 9 - PARQUE INDUSTRIAL, JACAREZINHO - PR, 86400-000'),
    'JACAREZINHO - PR',
  );
  assert.equal(
    formatarRotaCidadeUf(
      'LMG-800, KM 7.9, S/N - RODOVIARIO, CONFINS - MG, 33500-000',
      'R. SIMÃO ANTÔNIO, 149 - CINCAO, CONTAGEM - MG, 32371-610',
    ),
    'CONFINS - MG x CONTAGEM - MG',
  );
  assert.equal(formatarRotaCidadeUf('LAT -23.550500, LNG -46.633300', 'RIO DE JANEIRO - RJ'), 'RIO DE JANEIRO - RJ');
});

test('o cartão só avisa quando a OS já tem ocorrência', () => {
  assert.equal(missionHasOccurrence(0), false);
  assert.equal(missionHasOccurrence(null), false);
  assert.equal(missionHasOccurrence(2), true);
  assert.equal(OCCURRENCE_BANNER.includes('verificar'), true);
});
