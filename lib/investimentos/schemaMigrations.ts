/**
 * Aplica migration de fundação da Gestão Investimento via RPC exec_sql (service role).
 * Idempotente — seguro chamar em cron ou no primeiro acesso.
 * SQL embutido em fundacaoSql.ts (Vercel não empacota a pasta migrations/).
 */
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { GESTAO_INVESTIMENTO_FUNDACAO_SQL } from './fundacaoSql.js';

const REQUIRED_TABLES = [
  'investor_profiles',
  'investment_portfolios',
  'investment_positions',
  'investment_watchlists',
  'investment_risk_limits',
  'investment_data_sources',
  'investment_audit_log',
] as const;

function splitStatements(sql: string): string[] {
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

export async function isGestaoInvestimentoSchemaReady(): Promise<boolean> {
  const client = createSupabaseAdminClient();
  if (!client) return false;
  const { error } = await client.from('investment_data_sources').select('code').limit(1);
  return !error;
}

export async function runGestaoInvestimentoMigrations(): Promise<{ ok: boolean; message: string; applied: boolean }> {
  const client = createSupabaseAdminClient();
  if (!client) {
    return { ok: false, message: 'Supabase admin indisponível', applied: false };
  }

  if (await isGestaoInvestimentoSchemaReady()) {
    return { ok: true, message: 'Schema Gestão Investimento já pronto', applied: false };
  }

  const statements = splitStatements(GESTAO_INVESTIMENTO_FUNDACAO_SQL);
  const errors: string[] = [];

  for (const statement of statements) {
    try {
      const { error } = await client.rpc('exec_sql', { sql: `${statement};` });
      if (error) {
        const msg = String(error.message || error);
        if (!/already exists|duplicate/i.test(msg)) {
          errors.push(msg.slice(0, 180));
        }
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (!/already exists|duplicate/i.test(msg)) {
        errors.push(msg.slice(0, 180));
      }
    }
  }

  for (const table of REQUIRED_TABLES) {
    const { error } = await client.from(table).select('*').limit(1);
    if (error) {
      return {
        ok: false,
        message: `Tabela ${table} inacessível após migration: ${error.message}${errors.length ? ` | ${errors[0]}` : ''}`,
        applied: true,
      };
    }
  }

  if (errors.length) {
    console.warn('[GestaoInvestimento] Migration avisos:', errors.join(' | '));
  }
  console.log('[GestaoInvestimento] Schema fundação aplicado/verificado.');
  return { ok: true, message: 'Schema Gestão Investimento OK', applied: true };
}
