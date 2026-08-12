/**
 * Aplica migration de fundação da Gestão Investimento via RPC exec_sql (service role).
 * Idempotente — seguro chamar em cron ou no primeiro acesso.
 * SQL embutido em fundacaoSql.ts (Vercel não empacota a pasta migrations/).
 */
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { GESTAO_INVESTIMENTO_FUNDACAO_SQL } from './fundacaoSql.js';
import { GESTAO_INVESTIMENTO_MESA_SQL } from './mesaSql.js';

const REQUIRED_TABLES = [
  'investor_profiles',
  'investment_portfolios',
  'investment_positions',
  'investment_watchlists',
  'investment_risk_limits',
  'investment_data_sources',
  'investment_audit_log',
] as const;

async function applySqlBundle(
  client: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  sql: string,
): Promise<string[]> {
  const statements = splitStatements(sql);
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
        if (!/already exists|duplicate|already exists/i.test(msg)) {
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
  return errors;
}

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

  const ready = await isGestaoInvestimentoSchemaReady();
  const errors: string[] = [];
  let applied = false;

  if (!ready) {
    errors.push(...(await applySqlBundle(client, GESTAO_INVESTIMENTO_FUNDACAO_SQL)));
    applied = true;
    await new Promise((r) => setTimeout(r, 800));
  }

  // Mesa (sleeve/trades/marcação) — sempre tenta (idempotente), mesmo com fundação já pronta.
  const mesaErrors = await applySqlBundle(client, GESTAO_INVESTIMENTO_MESA_SQL);
  if (mesaErrors.length) errors.push(...mesaErrors);
  else if (ready) applied = true; // colunas/tabelas novas podem ter sido criadas

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
        applied,
      };
    }
  }

  if (errors.length) {
    console.warn('[GestaoInvestimento] Migration avisos:', errors.join(' | '));
  }
  console.log('[GestaoInvestimento] Schema fundação + mesa aplicado/verificado.');
  return { ok: true, message: ready ? 'Schema Gestão Investimento OK (mesa verificada)' : 'Schema Gestão Investimento OK', applied };
}
