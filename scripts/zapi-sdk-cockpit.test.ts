import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('zapiSdkConnector', () => {
  it('módulo frontend aponta para o SDK oficial da Z-API', () => {
    const src = readFileSync(resolve('lib/zapiSdkConnector.ts'), 'utf8');
    assert.match(src, /https:\/\/app\.z-api\.io\/sdk\.js/);
    assert.match(src, /ZAPIConnector/);
    assert.match(src, /openZapiSdkConnector/);
    assert.match(src, /methods:\s*isMobile/);
  });

  it('API sdk-token existe e usa getSdkConnectorToken', () => {
    const api = readFileSync(resolve('api/whatsapp-connection-sdk-token.ts'), 'utf8');
    assert.match(api, /getSdkConnectorToken/);
    assert.match(api, /assertWhatsappAdminAccess/);
  });

  it('whatsappLiteApi chama endpoint sdk-connector-token', () => {
    const lite = readFileSync(resolve('lib/whatsappLiteApi.ts'), 'utf8');
    assert.match(lite, /sdk-connector-token/);
    assert.match(lite, /export async function getSdkConnectorToken/);
  });
});

describe('cockpit com detalhe do em aberto (P4-TEST)', () => {
  it('DashboardDiretoria renderiza seção Detalhe do em aberto (feature ativa)', () => {
    const dash = readFileSync(resolve('components/dashboard/DashboardDiretoria.tsx'), 'utf8');
    assert.match(dash, /Detalhe do em aberto/);
    assert.match(dash, /open-cash-outlook-diretoria/);
    assert.match(dash, /Receita em aberto por cliente/);
    assert.match(dash, /Próximas dívidas/);
    assert.match(dash, /Próximas receitas/);
  });
});
