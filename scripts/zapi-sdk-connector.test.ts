import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZAPI_SDK_MESSAGES_PT } from '../lib/zapiSdkConnector';

describe('zapiSdkConnector messages', () => {
  it('mensagens PT orientam Business no eSIM e cooldown', () => {
    assert.match(ZAPI_SDK_MESSAGES_PT.title, /WhatsApp/i);
    assert.match(ZAPI_SDK_MESSAGES_PT.mMethodHint, /Business/i);
    assert.match(ZAPI_SDK_MESSAGES_PT.mMethodHint, /cronômetro|cinza/i);
    assert.match(ZAPI_SDK_MESSAGES_PT.mWaOldHint, /Business/i);
    assert.match(ZAPI_SDK_MESSAGES_PT.mRateLimit, /blocked/i);
  });
});
