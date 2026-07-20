// Testes do filtro global de envio ao grupo WhatsApp do cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasExplicitUpdatePrint, shouldSendClientGroupWhatsApp } from '../lib/clientGroupUpdateFilter';
import { MissionStatus } from '../types';

const base = {
    finalStatus: MissionStatus.ORIGIN as string,
    originalStatus: MissionStatus.SCHEDULED as string,
    hasExplicitPrint: true,
    isMissionCompletion: false,
    isDhl: false,
    occurrence: 'CHEGADA NA ORIGEM',
    previousOccurrence: '',
};

test('sem print e sem mudança de status NÃO envia', () => {
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        hasExplicitPrint: false,
        finalStatus: MissionStatus.SCHEDULED,
        originalStatus: MissionStatus.SCHEDULED,
    }), false);
});

test('print colado sem mudança de status ENVIA (cliente não-DHL — monitoramento)', () => {
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        finalStatus: MissionStatus.IN_TRANSIT,
        originalStatus: MissionStatus.IN_TRANSIT,
        occurrence: 'SEGUE VIAGEM — KM 120',
    }), true);
});

test('sem print mas com mudança de status ENVIA (foto fallback no frontend)', () => {
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        hasExplicitPrint: false,
    }), true);
});

test('print colado com mudança de status envia (cliente não-DHL)', () => {
    assert.equal(shouldSendClientGroupWhatsApp({ ...base }), true);
});

test('conclusão de missão exige print explícito', () => {
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        isMissionCompletion: true,
        hasExplicitPrint: false,
        finalStatus: MissionStatus.COMPLETED,
        originalStatus: MissionStatus.IN_TRANSIT,
    }), false);
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        isMissionCompletion: true,
        hasExplicitPrint: true,
        finalStatus: MissionStatus.COMPLETED,
        originalStatus: MissionStatus.IN_TRANSIT,
    }), true);
});

test('DHL rotineiro com print e status igual NÃO envia', () => {
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        isDhl: true,
        finalStatus: MissionStatus.IN_TRANSIT,
        originalStatus: MissionStatus.IN_TRANSIT,
        occurrence: 'SEGUE VIAGEM NORMAL',
    }), false);
});

test('DHL marco com print e mudança de status envia', () => {
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        isDhl: true,
        finalStatus: MissionStatus.ORIGIN,
        originalStatus: MissionStatus.SCHEDULED,
    }), true);
});

test('DHL atípico com print e status igual ENVIA (não exige mudança de status)', () => {
    assert.equal(shouldSendClientGroupWhatsApp({
        ...base,
        isDhl: true,
        finalStatus: MissionStatus.IN_TRANSIT,
        originalStatus: MissionStatus.IN_TRANSIT,
        occurrence: 'VEÍCULO BLOQUEADO NA BR-101',
    }), true);
});

test('hasExplicitUpdatePrint detecta blob e data URL', () => {
    assert.equal(hasExplicitUpdatePrint(null, ''), false);
    assert.equal(hasExplicitUpdatePrint(new Blob(['x']), ''), true);
    assert.equal(hasExplicitUpdatePrint(null, 'data:image/png;base64,abc'), true);
});
