import fs from 'fs';
import path from 'path';
import { createSupabaseAdminClient } from '../supabaseAdmin.js';

const MIGRATION_FILES = ['2026_07_12_billing_usage.sql', '2026_07_13_billing_cursor_source.sql'];

export function splitStatements(sql: string): string[] {
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

/** Bootstrap histórico não pode recriar policy ampla após F4-P0-RLS. */
export function isBillingUsagePolicyStatement(statement: string): boolean {
  return /\b(create|drop)\s+policy\b/i.test(statement) && /billing_usage/i.test(statement);
}

export function selectBillingUsageBootstrapStatements(sql: string): string[] {
  return splitStatements(sql).filter((statement) => !isBillingUsagePolicyStatement(statement));
}

/** Cria/atualiza tabela billing_usage (monitoramento custos IA). Idempotente. */
export async function runBillingUsageMigrations(): Promise<{ ok: boolean; message: string }> {
  const client = createSupabaseAdminClient();
  if (!client) {
    return { ok: false, message: 'Supabase admin indisponível' };
  }

  const errors: string[] = [];

  for (const migrationFile of MIGRATION_FILES) {
    const sqlPath = path.join(process.cwd(), 'migrations', migrationFile);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`[Billing] Migration ausente (ignorado): ${migrationFile}`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = selectBillingUsageBootstrapStatements(sql);

    for (const statement of statements) {
      try {
        const { error } = await client.rpc('exec_sql', { sql: `${statement};` });
        if (error) {
          const msg = String(error.message || error);
          if (!msg.includes('already exists') && !msg.includes('duplicate')) {
            errors.push(msg.slice(0, 160));
          }
        }
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (!msg.includes('already exists') && !msg.includes('duplicate')) {
          errors.push(msg.slice(0, 160));
        }
      }
    }
  }

  const { error: verifyErr } = await client.from('billing_usage').select('id').limit(1);
  if (verifyErr) {
    return { ok: false, message: verifyErr.message || 'Tabela billing_usage inacessível após migration' };
  }

  if (errors.length) {
    console.warn('[Billing] Migration avisos:', errors.join(' | '));
  }
  console.log('[Billing] Tabela billing_usage verificada.');
  return { ok: true, message: 'billing_usage OK' };
}
