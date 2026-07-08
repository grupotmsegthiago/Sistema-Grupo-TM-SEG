import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('lib/RealtimeProvider.tsx', 'utf8');

function extractRealtimeTables(source: string): string[] {
  const match = source.match(/const REALTIME_TABLES = \[([\s\S]*?)\] as const;/);
  if (!match) throw new Error('REALTIME_TABLES não encontrado');
  return Array.from(match[1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
}

function extractQueryKeyMap(source: string): string[] {
  const match = source.match(
    /const TABLE_TO_QUERY_KEYS: Record<TableName, string\[\]\[\]> = \{([\s\S]*?)\n\};/,
  );
  if (!match) throw new Error('TABLE_TO_QUERY_KEYS não encontrado');
  return Array.from(match[1].matchAll(/^\s*([a-z_]+):\s*\[/gm)).map((m) => m[1]);
}

test('toda tabela do REALTIME_TABLES tem entrada em TABLE_TO_QUERY_KEYS', () => {
  const tables = extractRealtimeTables(src);
  const keys = new Set(extractQueryKeyMap(src));
  const missing = tables.filter((t) => !keys.has(t));
  assert.deepEqual(missing, [], `tabelas sem mapping: ${missing.join(', ')}`);
});

test('REALTIME_TABLES não tem duplicatas', () => {
  const tables = extractRealtimeTables(src);
  const unique = new Set(tables);
  assert.equal(tables.length, unique.size, 'há tabelas duplicadas em REALTIME_TABLES');
});

test('tabelas críticas de RH estão presentes (gap corrigido)', () => {
  const tables = new Set(extractRealtimeTables(src));
  for (const t of [
    'rh_salary_configs',
    'rh_commissions',
    'rh_awards',
    'rh_bonuses',
    'rh_payroll_items',
    'rh_warnings',
  ]) {
    assert.ok(tables.has(t), `tabela ${t} ausente do Realtime`);
  }
});

test('tabelas operacionais estratégicas estão presentes', () => {
  const tables = new Set(extractRealtimeTables(src));
  for (const t of [
    'mission_history',
    'client_registries',
    'client_mission_notes',
    'operational_reports',
    'monitored_processes',
    'system_settings',
  ]) {
    assert.ok(tables.has(t), `tabela ${t} ausente do Realtime`);
  }
});

test('tabelas pesadas de log/telemetria continuam FORA', () => {
  const tables = new Set(extractRealtimeTables(src));
  for (const t of [
    'audit_logs',
    'rh_audit_logs',
    'whatsapp_outbound_log',
    'whatsapp_session_events',
    'backup_history',
  ]) {
    assert.ok(!tables.has(t), `tabela ${t} entrou no Realtime mas deveria ficar fora`);
  }
});
