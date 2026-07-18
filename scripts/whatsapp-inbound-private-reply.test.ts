import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildOperationalPrivateReply,
  extractInboundText,
  isFleetSummaryCommand,
  isOperationalPrivateReplyCommand,
  resolveInboundChatKind,
  resolveReplyPhone,
} from '../server/whatsapp/inboundBot';
import { isTorresOperationalGroupSync } from '../server/whatsapp/torresGroupGate';

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

test('pedido operacional "Reinicio?" em grupo é reconhecido e montado para PV', () => {
  const payload = {
    isGroup: true,
    phone: '120363019502650977-group',
    participantPhone: '11926831234',
    senderName: 'Beatriz',
    text: { message: 'Reinicio?' },
  };

  assert.equal(isFleetSummaryCommand(extractInboundText(payload)), false);
  assert.equal(isOperationalPrivateReplyCommand(extractInboundText(payload)), true);
  assert.equal(resolveInboundChatKind(payload), 'group');
  assert.equal(resolveReplyPhone(payload), '5511926831234');
  assert.equal(
    buildOperationalPrivateReply(payload),
    'Beatriz, vou checar com a equipe agora e já retorno com atualização. 👍',
  );
});

test('pedido operacional em grupo sem remetente privado não responde no grupo', () => {
  const payload = {
    isGroup: true,
    phone: '120363019502650977-group',
    senderName: 'Beatriz',
    text: { message: 'Reinicio?' },
  };

  assert.equal(isOperationalPrivateReplyCommand(extractInboundText(payload)), true);
  assert.equal(resolveInboundChatKind(payload), 'group');
  assert.equal(resolveReplyPhone(payload), null);
});

test('comando resumo em grupo de cliente (não Torres) é bloqueado pelo gate', () => {
  assert.equal(
    isTorresOperationalGroupSync({
      isGroup: true,
      groupId: '120363019502650977-group',
      chatName: 'Cliente Intermodal',
      envGroupIds: ['999999999999999999-group'],
    }),
    false,
  );
});

test('comando resumo no grupo Torres (chatName) passa no gate', () => {
  assert.equal(
    isTorresOperationalGroupSync({
      isGroup: true,
      groupId: '120363019502650977-group',
      chatName: 'Torres Vigilância Patrimonial',
      envGroupIds: [],
    }),
    true,
  );
});

test('mensagem privada com resumo não passa no gate Torres', () => {
  assert.equal(
    isTorresOperationalGroupSync({
      isGroup: false,
      groupId: null,
      chatName: null,
      envGroupIds: ['120363019502650977-group'],
    }),
    false,
  );
});
