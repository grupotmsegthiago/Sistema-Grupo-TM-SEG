#!/usr/bin/env node
/**
 * Aplica somente a estrutura de account_balance_snapshots (saldo de investimento).
 * CREATE/DROP POLICY da migration histórica são filtrados para não reabrir RLS.
 *
 * Uso:
 *   node scripts/apply-account-balance-snapshots-migration.mjs
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const DEFAULT_URL = `https://${TMSEG_REF}.supabase.co`;

function isSnapshotPolicyStatement(statement) {
  return (
    /\b(create|drop)\s+policy\b/i.test(statement)
    && /account_balance_snapshots/i.test(statement)
  );
}

/** Mantém a migration histórica imutável, mas nunca executa CREATE/DROP POLICY. */
export function selectStructuralSnapshotStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => !isSnapshotPolicyStatement(statement));
}

function readStructuralSql() {
  const sqlPath = path.join(
    process.cwd(),
    'migrations',
    '2026_07_08_account_balance_snapshots.sql',
  );
  const historical = fs.readFileSync(sqlPath, 'utf8');
  return `${selectStructuralSnapshotStatements(historical).join(';\n')};`;
}

function getPgPool() {
  const connectionString = String(
    process.env.DATABASE_URL
      || process.env.POSTGRES_URL
      || process.env.SUPABASE_DB_URL
      || '',
  ).trim();
  if (!connectionString) return null;
  return new pg.Pool({ connectionString, max: 2 });
}

async function applyViaPg() {
  const pool = getPgPool();
  if (!pool) return false;
  const sql = readStructuralSql();
  console.log('[snapshots] Aplicando estrutura via DATABASE_URL...');
  await pool.query(sql);
  await pool.end();
  console.log('[snapshots] Estrutura OK (pg)');
  return true;
}

async function applyViaExecSql() {
  const rawUrl = String(
    process.env.SUPABASE_URL
      || process.env.VITE_SUPABASE_URL
      || DEFAULT_URL,
  );
  const url = rawUrl.includes(TMSEG_REF) ? rawUrl : DEFAULT_URL;
  const serviceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SERVICE_KEY
      || '',
  ).trim();
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');

  const sb = createClient(url, serviceKey);
  const sql = readStructuralSql();
  console.log('[snapshots] Aplicando estrutura via exec_sql...');
  const { error } = await sb.rpc('exec_sql', { sql });
  if (error) throw error;
  console.log('[snapshots] Estrutura OK (exec_sql)');
  return true;
}

async function main() {
  const ok =
    (await applyViaPg().catch((e) => {
      console.warn('[snapshots] pg falhou:', e.message);
      return false;
    }))
    || (await applyViaExecSql().catch((e) => {
      console.warn('[snapshots] exec_sql falhou:', e.message);
      return false;
    }));

  if (!ok) {
    console.error('[snapshots] Não foi possível aplicar a estrutura.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
