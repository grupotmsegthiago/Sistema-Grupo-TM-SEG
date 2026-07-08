import { createClient } from '@supabase/supabase-js';
import {
  clearMissionBillingAuditCache,
  computeMissionBillingAudit,
  indexBillingAdjustments,
} from '../lib/missionBillingAudit';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co',
  process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk',
);

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['GTM-6235', 'GTM-6258', 'GTM-6283'];

async function fetchAllTables<T>(sb: ReturnType<typeof createClient>, table: string): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw error;
    if (data) all = all.concat(data as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const [mRes, ct, pt, adjRes] = await Promise.all([
    sb.from('missions').select('*').in('id', ids),
    fetchAllTables(sb, 'client_price_tables'),
    fetchAllTables(sb, 'provider_cost_tables'),
    sb
      .from('system_logs')
      .select('entity_id,details,created_at')
      .eq('entity', 'BillingAdjustment')
      .in('entity_id', ids)
      .order('created_at', { ascending: false }),
  ]);
  console.log(`Tabelas cliente carregadas: ${ct.length}`);
  for (const id of ids) {
    const adj = indexBillingAdjustments(adjRes.data || []).get(id);
    if (adj?.clientTableId) {
      const found = ct.find((t: any) => String(t.id) === String(adj.clientTableId));
      console.log(`[${id}] tabela adj ${adj.clientTableId} no catálogo:`, found ? (found as any).operation_type : 'NÃO ENCONTRADA');
    }
  }
  const adjMap = indexBillingAdjustments(adjRes.data || []);
  clearMissionBillingAuditCache();
  for (const m of mRes.data || []) {
    const adj = adjMap.get(m.id);
    if (adj) {
      console.log(`[${m.id}] BillingAdjustment:`, JSON.stringify(adj));
    } else {
      console.log(`[${m.id}] Sem BillingAdjustment`);
    }
    const audit = computeMissionBillingAudit(
      m as any,
      ct as any,
      pt as any,
      undefined,
      null,
      undefined,
      adjMap.get(m.id),
    );
    console.log(
      `${m.id} ${audit.overallIcon} ${audit.overallStatus} | cliente: ${audit.client.tableName} Δ ${audit.client.diferenca.toFixed(2)} | fornec.: ${audit.provider.tableName} Δ ${audit.provider.diferenca.toFixed(2)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
