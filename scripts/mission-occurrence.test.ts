import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCCURRENCE_BANNER,
  buildOpenOccurrenceViews,
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
  ], [{ id: 'GTM-1', client: 'LUFT', origin: 'Cuiabá', destination: 'MT' }]);
  assert.equal(views.length, 1);
  assert.equal(views[0].missionId, 'GTM-1');
  assert.equal(views[0].client, 'LUFT');
  assert.equal(views[0].route, 'Cuiabá → MT');
  const missing = buildOpenOccurrenceViews([
    { id: 'c', mission_id: 'GTM-9', description: 'Sem OS', created_at: '2026-09-30T14:00:00Z' },
  ], []);
  assert.equal(missing[0].client, 'NÃO CARREGADO');
});

test('o cartão só avisa quando a OS já tem ocorrência', () => {
  assert.equal(missionHasOccurrence(0), false);
  assert.equal(missionHasOccurrence(null), false);
  assert.equal(missionHasOccurrence(2), true);
  assert.equal(OCCURRENCE_BANNER.includes('verificar'), true);
});
