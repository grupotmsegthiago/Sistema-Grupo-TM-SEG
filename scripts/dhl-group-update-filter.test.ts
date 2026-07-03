// Testes do filtro de marcos DHL — o grupo do cliente só recebe:
// chegada na origem, início de missão, início/reinício de pernoite,
// cancelamento e situações atípicas. Rotina de monitoramento NÃO vai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSendDhlGroupUpdate } from '../lib/dhlGroupUpdateFilter';
import { MissionStatus } from '../types';

const base = { finalStatus: MissionStatus.IN_TRANSIT as string, originalStatus: MissionStatus.IN_TRANSIT as string, occurrence: '', previousOccurrence: '' };

test('chegada na origem (transição de status) envia', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, originalStatus: MissionStatus.SCHEDULED, finalStatus: MissionStatus.ORIGIN }), true);
});

test('início de missão (transição para Em Viagem) envia', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, originalStatus: MissionStatus.ORIGIN, finalStatus: MissionStatus.IN_TRANSIT }), true);
});

test('cancelamento envia (situação atípica)', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, originalStatus: MissionStatus.IN_TRANSIT, finalStatus: MissionStatus.CANCELLED }), true);
});

test('atualização rotineira sem mudança de status NÃO envia', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'SEGUE VIAGEM NORMAL, TUDO OK' }), false);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'EM OPERAÇÃO, KM 320 BR-116' }), false);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: '' }), false);
});

test('início de pernoite (primeira menção) envia', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'INÍCIO DE PERNOITE NO POSTO GRAAL', previousOccurrence: 'SEGUE VIAGEM' }), true);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'PERNOITE NO PÁTIO DO CLIENTE', previousOccurrence: '' }), true);
});

test('atualizações repetidas DURANTE o pernoite NÃO enviam', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'SEGUE EM PERNOITE, SEM ALTERAÇÕES', previousOccurrence: 'INÍCIO DE PERNOITE NO POSTO GRAAL' }), false);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'PERNOITE TRANQUILO', previousOccurrence: 'PERNOITE NO PÁTIO' }), false);
});

test('reinício/fim de pernoite envia mesmo vindo de pernoite', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'REINÍCIO DE PERNOITE', previousOccurrence: 'PERNOITE NO POSTO' }), true);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'FIM DE PERNOITE, SEGUE VIAGEM', previousOccurrence: 'PERNOITE NO POSTO' }), true);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'REINICIO DE PERNOITE', previousOccurrence: 'PERNOITE' }), true);
});

test('situações atípicas enviam sem mudança de status', () => {
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'VEÍCULO BLOQUEADO PELA TRANSPORTADORA' }), true);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'ACIDENTE NA PISTA, TRÂNSITO PARADO' }), true);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'PANE MECÂNICA NO CAVALO' }), true);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'FISCALIZAÇÃO PRF' }), true);
    assert.equal(shouldSendDhlGroupUpdate({ ...base, occurrence: 'TENTATIVA DE ABORDAGEM SUSPEITA' }), true);
});
