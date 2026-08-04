#!/usr/bin/env node
/**
 * Aplica migration Gestão Investimento (fundação Fase 2).
 *
 * Uso:
 *   node scripts/apply-gestao-investimento-migration.mjs
 *
 * Requer DATABASE_URL / SUPABASE_DB_URL ou SUPABASE_SERVICE_ROLE_KEY + RPC exec_sql.
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const DEFAULT_URL = `https://${TMSEG_REF}.supabase.co`;
const SQL_FILE = 'migrations/2026_08_04_gestao_investimento_fundacao.sql';

function getPgPool() {
  const connectionString = String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.SUPABASE_DB_URL ||
      '',
  ).trim();
  if (!connectionString) return null;
  return new pg.Pool({ connectionString, max: 2, ssl: { rejectUnauthorized: false } });
}

async function applyViaPg() {
  const pool = getPgPool();
  if (!pool) return false;
  const sqlPath = path.join(process.cwd(), SQL_FILE);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('[gestao-investimento] Aplicando via DATABASE_URL...');
  await pool.query(sql);
  await pool.end();
  console.log('[gestao-investimento] Migration OK (pg)');
  return true;
}

async function applyViaExecSql() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!serviceKey) {
    console.warn('[gestao-investimento] SUPABASE_SERVICE_ROLE_KEY ausente');
    return false;
  }
  const sb = createClient(url, serviceKey);
  const sqlPath = path.join(process.cwd(), SQL_FILE);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('[gestao-investimento] Aplicando via exec_sql...');
  const { error } = await sb.rpc('exec_sql', { sql });
  if (error) throw error;
  console.log('[gestao-investimento] Migration OK (exec_sql)');
  return true;
}

async function verifyTables(sb) {
  const needed = [
    'investor_profiles',
    'investment_portfolios',
    'investment_positions',
    'investment_watchlists',
    'investment_risk_limits',
    'investment_data_sources',
    'investment_audit_log',
  ];
  for (const table of needed) {
    const { error } = await sb.from(table).select('*').limit(1);
    if (error) throw new Error(`Verificação falhou em ${table}: ${error.message}`);
    console.log(`[gestao-investimento] OK tabela ${table}`);
  }
}

async function main() {
  const ok =
    (await applyViaPg().catch((e) => {
      console.warn('[gestao-investimento] pg falhou:', e.message);
      return false;
    })) ||
    (await applyViaExecSql().catch((e) => {
      console.warn('[gestao-investimento] exec_sql falhou:', e.message);
      return false;
    }));

  if (!ok) {
    console.error('[gestao-investimento] Não foi possível aplicar automaticamente.');
    process.exit(1);
  }

  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (serviceKey) {
    const sb = createClient(url, serviceKey);
    await verifyTables(sb);
  }
  console.log('[gestao-investimento] Concluído.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
