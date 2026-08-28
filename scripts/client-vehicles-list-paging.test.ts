import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';

/**
 * Regressão: listagem de veículos de cliente cortava em 1000 (default PostgREST).
 * Placas antigas como GIJ9D88 (posição ~1418 em created_at desc) sumiam da UI
 * e da busca client-side.
 */
describe('ClientVehicleList — paginação completa', () => {
  const listSrc = fs.readFileSync('components/ClientVehicleList.tsx', 'utf8');
  const formSrc = fs.readFileSync('components/MissionForm.tsx', 'utf8');

  it('ClientVehicleList usa fetchAllPages (não consulta única sem range)', () => {
    assert.match(listSrc, /import \{ fetchAllPages \} from ['"]\.\.\/lib\/supabasePaging['"]/);
    assert.match(listSrc, /fetchAllPages/);
    assert.match(listSrc, /\.range\(from,\s*from \+ size - 1\)/);
  });

  it('ClientVehicleList sinaliza CONSULTA INCOMPLETA quando truncated', () => {
    assert.match(listSrc, /listTruncated/);
    assert.match(listSrc, /CONSULTA INCOMPLETA/);
  });

  it('MissionForm pagina veículos do cliente via fetchAllPages', () => {
    assert.match(formSrc, /import \{ fetchAllPages \} from ['"]\.\.\/lib\/supabasePaging['"]/);
    assert.match(formSrc, /fetchClientVehicles[\s\S]*fetchAllPages/);
  });

  it('UpdateMissionModal pagina veículos do cliente via fetchAllPages', () => {
    const modalSrc = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(modalSrc, /import \{ fetchAllPages \} from ['"]\.\.\/lib\/supabasePaging['"]/);
    assert.match(modalSrc, /client_vehicles[\s\S]*fetchAllPages|\.from\('client_vehicles'\)[\s\S]*\.range\(from/);
  });
});
