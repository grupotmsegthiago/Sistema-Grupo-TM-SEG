import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAutoReconnectPolicyMessage,
  isWhatsappAutoReconnectEnabled,
} from '../server/zapiAutoReconnect';

describe('zapiAutoReconnect policy', () => {
  it('desativado por padrão sem WHATSAPP_AUTO_RECONNECT', () => {
    const prev = process.env.WHATSAPP_AUTO_RECONNECT;
    delete process.env.WHATSAPP_AUTO_RECONNECT;
    assert.equal(isWhatsappAutoReconnectEnabled(), false);
    assert.match(getAutoReconnectPolicyMessage(), /desativada/i);
    if (prev !== undefined) process.env.WHATSAPP_AUTO_RECONNECT = prev;
  });

  it('ativado quando WHATSAPP_AUTO_RECONNECT=true', () => {
    const prev = process.env.WHATSAPP_AUTO_RECONNECT;
    process.env.WHATSAPP_AUTO_RECONNECT = 'true';
    assert.equal(isWhatsappAutoReconnectEnabled(), true);
    assert.match(getAutoReconnectPolicyMessage(), /ativa/i);
    if (prev !== undefined) process.env.WHATSAPP_AUTO_RECONNECT = prev;
    else delete process.env.WHATSAPP_AUTO_RECONNECT;
  });
});
