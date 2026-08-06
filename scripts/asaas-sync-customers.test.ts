import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ASAAS_SYNC_COMPANIES,
  clientEligibleForAsaasSync,
} from '../lib/asaasSyncCustomersCore';

describe('asaasSyncCustomers — elegibilidade e wiring', () => {
  it('exige Ativo + CNPJ + endereço completo', () => {
    assert.equal(
      clientEligibleForAsaasSync({
        id: 1,
        status: 'Inativo',
        cnpj: '24455580000170',
        zip_code: '01310100',
        street: 'AV PAULISTA',
        number: '1000',
        city: 'SAO PAULO',
        state: 'SP',
      }).ok,
      false,
    );
    assert.equal(
      clientEligibleForAsaasSync({
        id: 1,
        status: 'Ativo',
        cnpj: '24455580000170',
        zip_code: '01310100',
        street: 'AV PAULISTA',
        number: '1000',
        city: 'SAO PAULO',
        state: 'SP',
      }).ok,
      true,
    );
    assert.match(
      clientEligibleForAsaasSync({
        id: 1,
        status: 'Ativo',
        cnpj: '24455580000170',
      }).reason || '',
      /Endereço incompleto/,
    );
  });

  it('sincroniza nas 3 empresas Asaas', () => {
    assert.deepEqual([...ASAAS_SYNC_COMPANIES], ['TM GESTÃO', 'TM SEGURANCA', 'TM SECURITY']);
    const core = fs.readFileSync('lib/asaasSyncCustomersCore.ts', 'utf8');
    assert.match(core, /findOrCreateCustomer/);
    assert.match(core, /runAsaasSyncCustomers/);
    const api = fs.readFileSync('api/asaas-sync-customers.ts', 'utf8');
    assert.match(api, /runAsaasSyncCustomers/);
    assert.match(api, /assertAsaasApiAccess/);
    assert.match(api, /CRON_SECRET|hasCronSecret/);
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /asaas\/sync-customers/);
    const form = fs.readFileSync('components/ClientForm.tsx', 'utf8');
    assert.match(form, /asaas\/sync-customers/);
    const list = fs.readFileSync('components/ClientList.tsx', 'utf8');
    assert.match(list, /asaas\/sync-customers/);
    assert.match(list, /btn-sync-clients-asaas/);
    // Botão em massa não pode parar em 40 lotes (carteira > 80 ativos).
    assert.match(list, /round < 500/);
    assert.doesNotMatch(list, /round < 40/);
    const admin = fs.readFileSync('lib/supabaseAdmin.ts', 'utf8');
    assert.match(admin, /normalizeSupabaseProjectUrl/);
  });
});
