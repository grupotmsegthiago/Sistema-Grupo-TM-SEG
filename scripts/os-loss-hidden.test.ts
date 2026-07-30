import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isOsLossHidden,
  loadOsLossHiddenMap,
  markOsLossHidden,
  unmarkOsLossHidden,
} from '../lib/osLossHidden';

describe('OS com Prejuízo — ocultar após análise', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });

  it('marca e filtra OS ocultada de forma permanente (mesmo se rev/custo mudarem)', () => {
    markOsLossHidden([{ missionId: 'GTM-6444', rev: 1000, cost: 1600 }], 'Bárbara');
    const map = loadOsLossHiddenMap();
    assert.equal(isOsLossHidden(map, 'GTM-6444', 1000, 1600), true);
    assert.equal(isOsLossHidden(map, 'GTM-6444', 1000, 1700), true, 'permanece oculta se custo mudar');
    assert.equal(isOsLossHidden(map, 'GTM-6444', 900, 1600), true, 'permanece oculta se receita mudar');
    assert.equal(isOsLossHidden(map, 'GTM-9999', 1000, 1600), false);
  });

  it('permite desocultar', () => {
    markOsLossHidden([{ missionId: 'GTM-1', rev: 10, cost: 20 }], 'Thiago');
    unmarkOsLossHidden(['GTM-1']);
    assert.equal(isOsLossHidden(loadOsLossHiddenMap(), 'GTM-1', 10, 20), false);
  });

  it('UI tem botão Ocultar e importa React', () => {
    const src = fs.readFileSync('components/LossesDialog.tsx', 'utf8');
    assert.match(src, /from 'react'/);
    assert.match(src, /button-hide-loss-/);
    assert.match(src, /EyeOff/);
    assert.match(src, /markOsLossHidden/);
    assert.match(src, /não volta mais/);
    const table = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(table, /loadOsLossHiddenMap/);
    assert.match(table, /lossesCount > 0/);
  });
});
