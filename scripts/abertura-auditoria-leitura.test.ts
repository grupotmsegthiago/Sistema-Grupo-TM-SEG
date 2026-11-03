import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

describe('abertura da auditoria sem leitura morta', () => {
  const tela = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');

  it('não pede a coluna original_client_name', () => {
    assert.doesNotMatch(tela, /original_client_name/);
    assert.doesNotMatch(tela, /aplicarRotaAprovada/);
  });

  it('reusa a OS completa que já veio na abertura e só relê depois', () => {
    assert.match(tela, /loadData\(\{ reutilizar: true \}\)/);
    assert.match(tela, /reutilizarOs/);
    assert.match(tela, /supabase\.from\('missions'\)\.select\('\*'\)\.eq\('id', initialMission\.id\)\.single\(\)/);
  });
});
