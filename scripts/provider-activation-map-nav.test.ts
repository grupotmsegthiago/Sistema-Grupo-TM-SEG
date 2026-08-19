import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('menu Monitoramento e Fornecedor apontam para o mapa de acionamento', () => {
  const constants = fs.readFileSync('constants.ts', 'utf8');
  assert.match(constants, /name: 'Fornecedor', id: 'provider-activation-map'/);
  assert.match(constants, /name: 'Mapa de Acionamento', id: 'provider-activation-map'/);

  const app = fs.readFileSync('App.tsx', 'utf8');
  assert.match(app, /case 'provider-activation-map'/);
  assert.match(app, /from 'react'/);
  assert.match(app, /ProviderActivationMap/);

  const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
  assert.match(sidebar, /from 'react'/);
  assert.match(sidebar, /useState/);
  assert.match(sidebar, /providerMenuIds/);
  assert.match(sidebar, /'providers-group'/);
  assert.match(sidebar, /'providers'/);
  assert.match(sidebar, /'provider-activation-map'/);
  assert.match(sidebar, /return !isClientUser/);
  assert.match(sidebar, /todos os usuários internos/);

  const page = fs.readFileSync('components/ProviderActivationMap.tsx', 'utf8');
  assert.match(page, /from 'react'/);
  assert.match(page, /useState/);
  assert.match(page, /svg-brazil-activation-map/);
  assert.match(page, /input-provider-activation-search/);
  assert.match(page, /region-columns/);
  assert.match(page, /region-uf-/);
  assert.match(page, /UF_LABEL\[group\.uf\]/);
  assert.match(page, /Prioridade \{row\.priority\}/);
  assert.match(page, /Fixo em SP/);
  assert.doesNotMatch(page, /formatActivationCost/);

  const form = fs.readFileSync('components/ProviderForm.tsx', 'utf8');
  assert.match(form, /from 'react'/);
  assert.match(form, /ProviderOperatingCoverageEditor/);
  assert.match(form, /operating_coverage/);

  const editor = fs.readFileSync('components/ProviderOperatingCoverageEditor.tsx', 'utf8');
  assert.match(editor, /from 'react'/);
  assert.match(editor, /provider-operating-coverage/);
  assert.match(editor, /coverage-cost-/);
});
