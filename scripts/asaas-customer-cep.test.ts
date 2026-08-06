import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Asaas create-charge — CEP no cliente (anti NF 400)', () => {
  it('bloqueia cadastro incompleto e envia postalCode quando completo', () => {
    const src = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.doesNotMatch(src, /postalCode:\s*_omit/);
    assert.match(src, /addressIncompleteResponse|CLIENT_ADDRESS_INCOMPLETE|formatClientAddressIncompleteError/);
    assert.match(src, /isClientAddressComplete/);
    assert.match(src, /cpfCnpjLookupVariants/);
    assert.match(src, /bodyClientId|opts\?\.clientId/);
    // Regressão: ilike só com dígitos limpos não encontra CNPJ formatado no banco.
    assert.doesNotMatch(src, /cnpj\.ilike\.%\$\{cleanCnpj\}%/);
  });

  it('findOrCreateCustomer atualiza endereço quando há CEP local', () => {
    const api = fs.readFileSync('lib/asaasChargeApi.ts', 'utf8');
    assert.match(api, /updateCustomerAddress/);
    assert.match(api, /if \(params\.postalCode\)/);
    assert.match(api, /await updateCustomerAddress\(existing\.id, params\)/);
  });
});
