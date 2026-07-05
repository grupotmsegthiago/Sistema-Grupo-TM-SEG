import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ZapiWhatsappProvider } from '../server/whatsapp/providers/zapi';
import type { WhatsappInstanceRecord } from '../server/whatsapp/types';

const mockInstance: WhatsappInstanceRecord = {
  id: 'test-zapi',
  slug: 'test-zapi',
  label: 'Teste Z-API',
  provider: 'zapi',
  instance_type: 'web',
  zapi_instance_id: 'instance-id',
  zapi_token: 'token-id',
  zapi_client_token: 'client-token',
  meta_phone_number_id: null,
  meta_access_token: null,
  meta_api_version: null,
  official_ddi: '55',
  official_phone: '11999999999',
  is_default: true,
  enabled: true,
  last_checked_at: null,
  last_connected: null,
  last_connected_phone: null,
  phone_matches_official: null,
  last_error: null,
  last_heartbeat_at: null,
  last_qr_base64: null,
  last_connected_at: null,
  last_status_raw: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

test('Z-API envia foto como mídia única com formulário na legenda', async () => {
  process.env.ZAPI_SEND_MIN_INTERVAL_MS = '0';
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ messageId: 'mock-image-id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const provider = new ZapiWhatsappProvider(mockInstance);
    const result = await provider.sendImage({
      phone: '120363000000000000-group',
      caption: '*MONITORAMENTO GRUPO TMSEG*\n*OS:* 123',
      imageBase64: '  data:image/png;base64,abc123  ',
      queueLabel: 'teste send-image',
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.match(String(calls[0].input), /\/send-image$/);

    const body = JSON.parse(String(calls[0].init?.body));
    assert.deepEqual(body, {
      phone: '120363000000000000-group',
      image: 'data:image/png;base64,abc123',
      caption: '*MONITORAMENTO GRUPO TMSEG*\n*OS:* 123',
      viewOnce: false,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'message'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
