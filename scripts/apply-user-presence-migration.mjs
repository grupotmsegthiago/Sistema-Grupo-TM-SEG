#!/usr/bin/env node
/**
 * Aplica migration user_presence (heartbeat no banco para quadro de presença).
 *
 * Uso:
 *   node scripts/apply-user-presence-migration.mjs
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const DEFAULT_URL = `https://${TMSEG_REF}.supabase.co`;
const DEFAULT_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';

function decodeRef(key) {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

function getPgPool() {
  const connectionString = String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.SUPABASE_DB_URL ||
      '',
  ).trim();
  if (!connectionString) return null;
  return new pg.Pool({ connectionString, max: 2 });
}

async function applyViaPg() {
  const pool = getPgPool();
  if (!pool) return false;
  const sqlPath = path.join(process.cwd(), 'migrations', '2026_07_08_user_presence.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('[user-presence] Aplicando via DATABASE_URL...');
  await pool.query(sql);
  await pool.end();
  console.log('[user-presence] Migration OK (pg)');
  return true;
}

async function applyViaExecSql() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const key = serviceKey && decodeRef(serviceKey) === TMSEG_REF ? serviceKey : DEFAULT_ANON;
  const sb = createClient(url, key);
  const sqlPath = path.join(process.cwd(), 'migrations', '2026_07_08_user_presence.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('[user-presence] Aplicando via exec_sql...');
  const { error } = await sb.rpc('exec_sql', { sql });
  if (error) throw error;
  console.log('[user-presence] Migration OK (exec_sql)');
  return true;
}

async function main() {
  const ok =
    (await applyViaPg().catch((e) => {
      console.warn('[user-presence] pg falhou:', e.message);
      return false;
    })) ||
    (await applyViaExecSql().catch((e) => {
      console.warn('[user-presence] exec_sql falhou:', e.message);
      return false;
    }));

  if (!ok) {
    console.error('[user-presence] Não foi possível aplicar. Rode o SQL manualmente no Supabase.');
    process.exit(1);
  }
}

main();
