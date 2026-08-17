#!/usr/bin/env node
/**
 * Aplica migration billing_usage (monitoramento custos IA).
 *
 * Uso:
 *   node scripts/apply-billing-usage-migration.mjs
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const DEFAULT_URL = `https://${TMSEG_REF}.supabase.co`;
const DEFAULT_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';

const SQL_PATH = path.join(process.cwd(), 'migrations', '2026_07_12_billing_usage.sql');

function splitStatements(sql) {
  return sql
    .split(';')
    .map((block) =>
      block
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

function isBillingUsagePolicyStatement(statement) {
  return /\b(create|drop)\s+policy\b/i.test(statement) && /billing_usage/i.test(statement);
}

function getPgPool() {
  const connectionString = String(
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || '',
  ).trim();
  if (!connectionString) return null;
  return new pg.Pool({ connectionString, max: 2 });
}

async function applyViaPg(statements) {
  const pool = getPgPool();
  if (!pool) return false;
  console.log('[billing] Aplicando via DATABASE_URL...');
  for (const statement of statements) {
    await pool.query(`${statement};`);
  }
  await pool.end();
  console.log('[billing] Migration OK (pg)');
  return true;
}

async function applyViaExecSql(statements) {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const key = serviceKey || DEFAULT_ANON;
  const sb = createClient(url, key);
  console.log('[billing] Aplicando via exec_sql...');
  for (const statement of statements) {
    const { error } = await sb.rpc('exec_sql', { sql: `${statement};` });
    if (error) {
      const msg = String(error.message || error);
      if (msg.includes('already exists') || msg.includes('duplicate')) continue;
      throw error;
    }
  }
  console.log('[billing] Migration OK (exec_sql)');
  return true;
}

async function verifyTable() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || DEFAULT_ANON;
  const sb = createClient(url, key);
  const { error } = await sb.from('billing_usage').select('id').limit(1);
  if (error) throw new Error(error.message);
  console.log('[billing] Tabela billing_usage acessível via REST.');
}

async function main() {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const statements = splitStatements(sql).filter((statement) => !isBillingUsagePolicyStatement(statement));

  const ok =
    (await applyViaPg(statements).catch((e) => {
      console.warn('[billing] pg falhou:', e.message);
      return false;
    })) ||
    (await applyViaExecSql(statements).catch((e) => {
      console.warn('[billing] exec_sql falhou:', e.message);
      return false;
    }));

  if (!ok) {
    console.error('[billing] Não foi possível aplicar. Rode migrations/2026_07_12_billing_usage.sql no Supabase SQL Editor.');
    process.exit(1);
  }

  await verifyTable();
}

main();
