import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

describe('Patrimônio — API leve e carga rápida', () => {
  it('handler serverless usa lib leve (sem server/patrimonioStore)', () => {
    const src = readFileSync(join(root, 'api/patrimonio/equipments.ts'), 'utf8');
    assert.match(src, /loadPatrimonioLite|patrimonioLiteApi/);
    assert.match(src, /savePatrimonioLite/);
    assert.doesNotMatch(src, /server\/patrimonioStore|migrateLegacyPatrimonioIfNeeded|runFullEquipmentScan/);
    assert.match(src, /maxDuration:\s*30/);
    const lite = readFileSync(join(root, 'lib/patrimonioLiteApi.ts'), 'utf8');
    assert.match(lite, /patrimonio_equipments/);
    assert.doesNotMatch(lite, /equipmentBackupService|forensic/);
  });

  it('vercel.json roteia /api/patrimonio/equipments para handler leve', () => {
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
      rewrites: { source: string; destination: string }[];
      functions?: Record<string, unknown>;
    };
    const hit = vercel.rewrites.find((r) => r.source === '/api/patrimonio/equipments');
    assert.ok(hit, 'rewrite patrimonio/equipments ausente');
    assert.equal(hit!.destination, '/api/patrimonio/equipments');
    assert.ok(!vercel.functions?.['api/patrimonio/equipments.ts'], 'não deve entrar no bloco functions (limite 50)');
    assert.ok(Object.keys(vercel.functions || {}).length <= 50);
  });

  it('loadPatrimonio não dispara migração/varredura automática', () => {
    const src = readFileSync(join(root, 'server/patrimonioStore.ts'), 'utf8');
    const marker = 'export async function loadPatrimonio(sb';
    const start = src.indexOf(marker);
    assert.ok(start >= 0, 'loadPatrimonio não encontrado');
    const body = src.slice(start, start + 450);
    assert.doesNotMatch(body, /migrateLegacyPatrimonioIfNeeded|runFullEquipmentScan|loadEquipmentWithRecovery/);
    assert.match(body, /loadPatrimonioFromTables/);
  });

  it('EquipmentManager tem timeout de carga e não varre no mount', () => {
    const src = readFileSync(join(root, 'components/EquipmentManager.tsx'), 'utf8');
    assert.match(src, /AbortController/);
    assert.match(src, /from 'react'/);
    // Varredura só sob demanda (botão); loadData não chama full-scan.
    const loadDataIdx = src.indexOf('const loadData = useCallback');
    const nextHook = src.indexOf('useRealtimeRefresh', loadDataIdx);
    const loadBlock = src.slice(loadDataIdx, nextHook > 0 ? nextHook : loadDataIdx + 2000);
    assert.doesNotMatch(loadBlock, /full-scan/);
  });
});
