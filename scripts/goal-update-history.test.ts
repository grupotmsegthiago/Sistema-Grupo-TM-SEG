import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  pushGoalUpdateHistory,
  selectChartSnapshots,
  type GoalUpdateSnapshot,
} from '../lib/goalUpdateHistory';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

test('histórico do gráfico mantém atualizações próximas e mostra só as últimas 5', () => {
  const storage = new MemoryStorage();
  (globalThis as any).localStorage = storage;

  const key = `test-goal-history-${Date.now()}`;
  const base = new Date('2026-07-06T10:00:00.000Z').getTime();
  let rows: GoalUpdateSnapshot[] = [];

  for (let i = 0; i < 6; i++) {
    rows = pushGoalUpdateHistory(key, {
      at: new Date(base + i * 60_000).toISOString(),
      revenue: 1000 + i * 100,
      cost: 500,
      profit: 500 + i * 100,
      missionCount: i + 1,
      percentage: 10 + i,
      source: 'manual',
    });
  }

  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(r => r.at)).size, 6);

  const chartRows = selectChartSnapshots(rows);
  assert.equal(chartRows.length, 5);
  assert.deepEqual(chartRows.map(r => r.revenue), [1100, 1200, 1300, 1400, 1500]);
});

