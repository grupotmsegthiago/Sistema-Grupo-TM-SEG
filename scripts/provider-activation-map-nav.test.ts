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
  assert.match(sidebar, /provider-activation-map/);
  assert.match(sidebar, /from 'react'/);

  const page = fs.readFileSync('components/ProviderActivationMap.tsx', 'utf8');
  assert.match(page, /from 'react'/);
  assert.match(page, /useState/);
  assert.match(page, /svg-brazil-activation-map/);
  assert.match(page, /input-provider-activation-search/);
  assert.match(page, /region-columns/);
});
