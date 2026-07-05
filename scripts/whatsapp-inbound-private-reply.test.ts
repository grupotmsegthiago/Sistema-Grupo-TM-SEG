import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractInboundText,
  isFleetSummaryCommand,
  resolveInboundChatKind,
  resolveReplyPhone,
} from '../server/whatsapp/inboundBot';

test('comando resumo em grupo Z-API responde no telefone do participantPhone', () => {
  const payload = {
    isGroup: true,
    phone: '120363019502650977-group',
    participantPhone: '11987654321',
    text: { message: 'resumo' },
  };

  assert.equal(isFleetSummaryCommand(extractInboundText(payload)), true);
  assert.equal(resolveInboundChatKind(payload), 'group');
  assert.equal(resolveReplyPhone(payload), '5511987654321');
});

test('grupo antigo com hífen não é tratado como telefone privado', () => {
  const payload = {
    phone: '5511999999999-1623275280',
    participantPhone: '5544999999999',
    text: { message: 'resumo operacional' },
  };

  assert.equal(resolveInboundChatKind(payload), 'group');
  assert.equal(resolveReplyPhone(payload), '5544999999999');
});

test('eventResponse em grupo usa responseFrom como destinatário privado', () => {
  const payload = {
    isGroup: true,
    phone: '120363019502650977-group',
    eventResponse: {
      response: 'status',
      responseFrom: '5544888888888',
      referencedMessage: {
        participant: '5544777777777',
      },
    },
  };

  assert.equal(isFleetSummaryCommand(extractInboundText(payload)), true);
  assert.equal(resolveReplyPhone(payload), '5544888888888');
});

test('grupo sem participantPhone não usa o ID do grupo como destinatário', () => {
  const payload = {
    isGroup: true,
    phone: '120363019502650977-group',
    text: { message: 'resumo' },
  };

  assert.equal(resolveInboundChatKind(payload), 'group');
  assert.equal(resolveReplyPhone(payload), null);
});

test('ID novo de grupo sem sufixo não é tratado como telefone privado', () => {
  const payload = {
    phone: '120363019502650977',
    text: { message: 'resumo' },
  };

  assert.equal(resolveInboundChatKind(payload), 'group');
  assert.equal(resolveReplyPhone(payload), null);
});

test('grupo pode responder no PV usando from quando participantPhone vier ausente', () => {
  const payload = {
    isGroup: true,
    phone: '120363019502650977-group',
    from: '5511926839456',
    participantPhone: null,
    text: { message: 'resumo' },
  };

  assert.equal(resolveInboundChatKind(payload), 'group');
  assert.equal(resolveReplyPhone(payload), '5511926839456');
});

test('mensagem privada continua respondendo para o próprio phone', () => {
  const payload = {
    isGroup: false,
    phone: '11911112222',
    text: { message: 'viaturas' },
  };

  assert.equal(resolveInboundChatKind(payload), 'private');
  assert.equal(resolveReplyPhone(payload), '5511911112222');
});
