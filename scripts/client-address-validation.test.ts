import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  formatClientAddressIncompleteError,
  isClientAddressComplete,
  missingClientAddressFields,
  toAsaasAddressPayload,
} from '../lib/clientAddressValidation';

describe('clientAddressValidation — endereço fiscal obrigatório', () => {
  it('detecta campos faltantes', () => {
    assert.deepEqual(missingClientAddressFields(null), [
      'CEP',
      'Logradouro',
      'Número',
      'Cidade',
      'UF',
    ]);
    assert.ok(!isClientAddressComplete({ street: 'RUA A', number: '10' }));
    assert.ok(
      isClientAddressComplete({
        zip_code: '02167-010',
        street: 'RUA A',
        number: '210',
        city: 'SAO PAULO',
        state: 'SP',
      }),
    );
  });

  it('monta payload Asaas e mensagem de erro', () => {
    const payload = toAsaasAddressPayload({
      zip_code: '02167010',
      street: 'RUA X',
      number: '1',
      city: 'SAO PAULO',
      state: 'sp',
      neighborhood: 'CENTRO',
    });
    assert.equal(payload.postalCode, '02167010');
    assert.equal(payload.state, 'SP');
    const err = formatClientAddressIncompleteError({
      clientName: 'AMAZON',
      missing: ['CEP', 'Cidade'],
      cnpj: '01661770000300',
    });
    assert.equal(err.code, 'CLIENT_ADDRESS_INCOMPLETE');
    assert.match(err.error, /Cadastro incompleto/);
    assert.match(err.error, /CEP, Cidade/);
  });

  it('create-charge e faturamento bloqueiam cadastro incompleto', () => {
    const core = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(core, /CLIENT_ADDRESS_INCOMPLETE|formatClientAddressIncompleteError/);
    assert.match(core, /addressIncompleteResponse/);
    assert.match(core, /clientId/);
    assert.doesNotMatch(core, /lookupCnpjAddressBrasilApi/);
    const billing = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(billing, /assertClientAddressReady/);
    assert.match(billing, /openClientAddressFix/);
    assert.match(billing, /alert-client-address-incomplete/);
    const form = fs.readFileSync('components/ClientForm.tsx', 'utf8');
    assert.match(form, /CEP \*/);
    assert.match(form, /Cidade \*/);
    assert.match(form, /nfAddressRequiredHint/);
    assert.match(form, /client-nf-address-section/);
    // Destaque vermelho acompanha campos faltantes — não pinta CEP se já preenchido.
    assert.match(form, /missingClientAddressFields/);
    assert.match(form, /isNfFieldMissing\('CEP'\)/);
    assert.match(form, /isNfFieldMissing\('Logradouro'\)/);
    assert.match(form, /isNfFieldMissing\('Número'\)/);
    assert.match(form, /isNfFieldMissing\('Cidade'\)/);
    assert.match(form, /isNfFieldMissing\('UF'\)/);
    assert.doesNotMatch(
      form,
      /nfAddressRequiredHint \? 'rounded-xl border-2 border-red-300/,
    );
    const app = fs.readFileSync('App.tsx', 'utf8');
    assert.match(app, /clientFormReturnTo|fin-billing/);
    assert.match(app, /nfAddressRequiredHint/);
  });

  it('erro de endereço incompleto inclui clientId quando informado', () => {
    const err = formatClientAddressIncompleteError({
      clientName: 'RFM',
      missing: ['CEP', 'Cidade'],
      cnpj: '24455580000170',
      clientId: 42,
    });
    assert.equal(err.clientId, '42');
    assert.equal(err.fixCadastro, true);
    assert.match(err.error, /abrirá o cadastro/);
  });
});
