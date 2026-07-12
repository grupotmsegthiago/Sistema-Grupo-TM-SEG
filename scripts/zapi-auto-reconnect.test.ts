import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAutoReconnectPolicyMessage,
  isWhatsappAutoReconnectEnabled,
} from '../server/zapiAutoReconnect';

describe('zapiAutoReconnect policy', () => {
  it('ativado por padrão (opt-out com false)', () => {
    const prev = process.env.WHATSAPP_AUTO_RECONNECT;
    delete process.env.WHATSAPP_AUTO_RECONNECT;
    assert.equal(isWhatsappAutoReconnectEnabled(), true);
    process.env.WHATSAPP_AUTO_RECONNECT = 'false';
    assert.equal(isWhatsappAutoReconnectEnabled(), false);
    if (prev !== undefined) process.env.WHATSAPP_AUTO_RECONNECT = prev;
    else delete process.env.WHATSAPP_AUTO_RECONNECT;
  });

  it('ativado explicitamente com true', () => {
    const prev = process.env.WHATSAPP_AUTO_RECONNECT;
    process.env.WHATSAPP_AUTO_RECONNECT = 'true';
    assert.equal(isWhatsappAutoReconnectEnabled(), true);
    assert.match(getAutoReconnectPolicyMessage(), /ativa/i);
    if (prev !== undefined) process.env.WHATSAPP_AUTO_RECONNECT = prev;
    else delete process.env.WHATSAPP_AUTO_RECONNECT;
  });
});
