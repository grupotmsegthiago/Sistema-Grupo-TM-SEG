import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAutoReconnectPolicyMessage,
  isWaOldReconnectEnabled,
  isWhatsappAutoReconnectEnabled,
  requiresManualMobileReconnect,
  shouldUseMobileWaOld,
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

  it('wa_old ativo por padrão para instância mobile', () => {
    const prev = process.env.ZAPI_WA_OLD_RECONNECT;
    delete process.env.ZAPI_WA_OLD_RECONNECT;
    assert.equal(isWaOldReconnectEnabled(), true);
    assert.equal(
      shouldUseMobileWaOld({
        instance_type: 'mobile',
      } as any),
      true,
    );
    if (prev !== undefined) process.env.ZAPI_WA_OLD_RECONNECT = prev;
  });

  it('política menciona wa_old quando ativo', () => {
    assert.match(getAutoReconnectPolicyMessage(), /wa_old/i);
  });

  it('MOBILE só permite reconexão por ação manual autenticada', () => {
    const mobile = { instance_type: 'mobile' } as any;
    assert.equal(requiresManualMobileReconnect(mobile, 'watchdog'), true);
    assert.equal(requiresManualMobileReconnect(mobile, 'webhook'), true);
    assert.equal(requiresManualMobileReconnect(mobile, 'cron'), true);
    assert.equal(requiresManualMobileReconnect(mobile, 'api'), false);
  });

  it('WEB mantém reconexão automática disponível', () => {
    assert.equal(
      requiresManualMobileReconnect({ instance_type: 'web' } as any, 'watchdog'),
      false,
    );
  });
});
