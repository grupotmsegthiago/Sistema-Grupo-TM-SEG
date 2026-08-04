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

/** Remove comentários `--` ANTES de partir em `;` — senão `cadastro; coleta` quebra o SQL. */
function stripSqlLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) return '';
      const inSingle = false;
      // Comentário de linha fora de string simples (SQL da fundação não usa -- em literais).
      const idx = line.indexOf('--');
      if (idx >= 0 && !inSingle) return line.slice(0, idx);
      return line;
    })
    .join('\n');
}

export function splitStatements(sql: string): string[] {
  return stripSqlLineComments(sql)
    .split(';')
    .map((block) => block.replace(/\s+/g, ' ').trim())
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
      const rpcResult = await Promise.race([
        client.rpc('exec_sql', { sql: `${statement};` }),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: 'exec_sql timeout 8s' } }), 8_000),
        ),
      ]);
      const error = (rpcResult as any)?.error;
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

  // Aguarda PostgREST recarregar o schema cache após NOTIFY.
  await new Promise((r) => setTimeout(r, 800));

  for (const table of REQUIRED_TABLES) {
    let lastErr = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await client.from(table).select('*').limit(1);
      if (!error) {
        lastErr = '';
        break;
      }
      lastErr = error.message;
      if (!/schema cache|Could not find the table/i.test(error.message)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (lastErr) {
      return {
        ok: false,
        message: `Tabela ${table} inacessível após migration: ${lastErr}${errors.length ? ` | ${errors[0]}` : ''}`,
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
