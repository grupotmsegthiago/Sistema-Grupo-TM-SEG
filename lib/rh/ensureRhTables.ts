import fs from 'fs';
import path from 'path';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRhServiceRoleClient } from './rhApiAccess.js';

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  const connectionString = String(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL ||
    '',
  ).trim();
  if (!connectionString) return null;
  if (!pool) pool = new pg.Pool({ connectionString, max: 2, ssl: { rejectUnauthorized: false } });
  return pool;
}

function readMigrationSql(): string {
  const sqlPath = path.join(process.cwd(), 'migrations', '2026_07_07_rh_module.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');
  // ON CONFLICT DO NOTHING sem unique constraint quebra — seed só se vazio
  sql = sql.replace(
    /INSERT INTO rh_tax_brackets[\s\S]*ON CONFLICT DO NOTHING;/,
    `INSERT INTO rh_tax_brackets (tax_type, bracket_from, bracket_to, rate_pct, deduction, year)
SELECT v.tax_type, v.bracket_from, v.bracket_to, v.rate_pct, v.deduction, v.year
FROM (VALUES
  ('INSS'::text, 0::numeric, 1518.00::numeric, 7.5::numeric, 0::numeric, 2026::int),
  ('INSS', 1518.01, 2793.60, 9.0, 0, 2026),
  ('INSS', 2793.61, 4190.40, 12.0, 0, 2026),
  ('INSS', 4190.41, 8157.41, 14.0, 0, 2026),
  ('IRRF', 0, 2259.20, 0, 0, 2026),
  ('IRRF', 2259.21, 2826.65, 7.5, 169.44, 2026),
  ('IRRF', 2826.66, 3751.05, 15.0, 381.44, 2026),
  ('IRRF', 3751.06, 4664.68, 22.5, 662.77, 2026),
  ('IRRF', 4664.69, 99999999, 27.5, 896.00, 2026)
) AS v(tax_type, bracket_from, bracket_to, rate_pct, deduction, year)
WHERE NOT EXISTS (SELECT 1 FROM rh_tax_brackets LIMIT 1);`,
  );
  return sql;
}

async function runViaPg(sql: string): Promise<void> {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL/POSTGRES_URL não configurada na Vercel');
  // Garante função exec_sql para migrações futuras
  await p.query(`CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN EXECUTE sql; END; $$;`);
  await p.query(sql);
}

async function runViaExecSql(sql: string, client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('exec_sql', { sql });
  if (error) throw error;
}

export async function ensureRhTables(): Promise<{ method: string; tables: string[] }> {
  const adminClient = createRhServiceRoleClient();
  if (!adminClient) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY indisponível neste ambiente');
  }

  const sql = readMigrationSql();

  let method = 'pg';
  try {
    if (getPool()) {
      await runViaPg(sql);
    } else {
      method = 'exec_sql';
      await runViaExecSql(sql, adminClient);
    }
  } catch (e: any) {
    if (method === 'pg') {
      method = 'exec_sql';
      await runViaExecSql(sql, adminClient);
    } else {
      throw new Error(
        `${e?.message || e}. Configure POSTGRES_URL na Vercel (integração Supabase) ou execute migrations/2026_07_07_rh_module.sql no SQL Editor.`,
      );
    }
  }

  const checks = await Promise.all([
    adminClient.from('rh_employees').select('id', { count: 'exact', head: true }),
    adminClient.from('rh_departments').select('id', { count: 'exact', head: true }),
    adminClient.from('rh_tax_brackets').select('id', { count: 'exact', head: true }),
  ]);

  const missing = ['rh_employees', 'rh_departments', 'rh_tax_brackets'].filter((_, i) => checks[i].error);
  if (missing.length) {
    throw new Error(`Tabelas não criadas: ${missing.map((t, i) => `${t} (${checks[i].error?.message})`).join(', ')}`);
  }

  return { method, tables: ['rh_employees', 'rh_departments', 'rh_positions', 'rh_payroll_runs', 'rh_tax_brackets'] };
}
