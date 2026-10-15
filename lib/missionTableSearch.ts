/**
 * Busca server-side de OS na Central — substitui .limit(300) fixo.
 * Não carrega o banco inteiro no navegador: pagina por termo + teto configurável.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type MissionSearchClientScope =
  | { type: 'empty' }
  | { type: 'all' }
  | { type: 'eq'; value: string }
  | { type: 'in'; values: string[] };

export const MISSION_SEARCH_PAGE_SIZE = 100;
export const MISSION_SEARCH_MAX_RESULTS = 500;

export function sanitizeMissionSearchTerm(term: string): string {
  return term.trim().replace(/[%,().,]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildMissionSearchOrFilter(term: string): string {
  const like = `%${sanitizeMissionSearchTerm(term)}%`;
  return `id.ilike.${like},client.ilike.${like},provider.ilike.${like},driver_name.ilike.${like},dhl_se_number.ilike.${like}`;
}

function applyClientScope<T extends { eq: Function; in: Function }>(q: T, scope: MissionSearchClientScope): T {
  if (scope.type === 'eq') return q.eq('client', scope.value!) as T;
  if (scope.type === 'in') return q.in('client', scope.values!) as T;
  return q;
}

/** Tenta ID exato (GTM-xxx) antes da busca textual ampla. */
export async function searchMissionsByTerm(
  supabase: SupabaseClient,
  rawTerm: string,
  scope: MissionSearchClientScope,
  options?: { pageSize?: number; maxResults?: number },
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean; exactIdAttempted: boolean }> {
  if (scope.type === 'empty') return { rows: [], truncated: false, exactIdAttempted: false };

  const pageSize = options?.pageSize ?? MISSION_SEARCH_PAGE_SIZE;
  const maxResults = options?.maxResults ?? MISSION_SEARCH_MAX_RESULTS;
  const term = sanitizeMissionSearchTerm(rawTerm);
  if (term.length < 2) return { rows: [], truncated: false, exactIdAttempted: false };

  const byId = new Map<string, Record<string, unknown>>();
  let exactIdAttempted = false;

  const normalizedId = term.toUpperCase().startsWith('GTM-') ? term.toUpperCase() : `GTM-${term.replace(/^gtm-?/i, '')}`;
  if (/^GTM-[A-Z0-9-]+$/i.test(normalizedId) && normalizedId.length >= 6) {
    exactIdAttempted = true;
    let exactQ = supabase.from('missions').select('*').eq('id', normalizedId).limit(1);
    exactQ = applyClientScope(exactQ, scope);
    const { data: exactRow } = await exactQ;
    if (exactRow?.[0]) byId.set(String(exactRow[0].id), exactRow[0] as Record<string, unknown>);
  }

  let from = 0;
  let exhausted = false;
  while (byId.size < maxResults) {
    const take = Math.min(pageSize, maxResults - byId.size);
    let q = supabase
      .from('missions')
      .select('*')
      .order('created_at', { ascending: false })
      .or(buildMissionSearchOrFilter(rawTerm))
      .range(from, from + take - 1);
    q = applyClientScope(q, scope);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const id = String((row as { id?: string }).id || '');
      if (id) byId.set(id, row as Record<string, unknown>);
    }
    if (data.length < take) {
      exhausted = true;
      break;
    }
    from += data.length;
  }

  const rows = Array.from(byId.values());
  let truncated = false;
  if (!exhausted && rows.length >= maxResults) {
    let sentinelQ = supabase
      .from('missions')
      .select('id')
      .order('created_at', { ascending: false })
      .or(buildMissionSearchOrFilter(rawTerm))
      .range(maxResults, maxResults);
    sentinelQ = applyClientScope(sentinelQ, scope);
    const { data: sentinel, error: sentinelError } = await sentinelQ;
    if (sentinelError) throw sentinelError;
    truncated = !!(sentinel && sentinel.length > 0);
  }

  return { rows, truncated, exactIdAttempted };
}

export type ConsultaOsContexto = {
  vehicleMap: Record<string, any>;
  clientVehicleMap: Record<string, any>;
  clientNameMap: Record<string, string>;
  providerNameMap: Record<string, string>;
  clients: any[];
  clientTables: any[];
  providerTables: any[];
  agentPhones: Record<string, string>;
};

function valoresUnicos(values: unknown[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const value of values) {
    if (value == null || value === '' || value === '---') continue;
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function selectInChunks(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  values: any[],
  chunkSize = 80,
): Promise<any[]> {
  if (values.length === 0) return [];
  const out: any[] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    const slice = values.slice(index, index + chunkSize);
    const { data, error } = await supabase.from(table).select(columns).in(column, slice);
    if (error) throw error;
    if (data) out.push(...data);
  }
  return out;
}

/**
 * Contexto só das OS que o Financeiro consultou.
 * Não pagina missions, nem baixa tabelas/clientes/agentes inteiros.
 */
export async function carregarContextoOsConsultadas(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<ConsultaOsContexto> {
  const vehicleIds = valoresUnicos(rows.map((row) => row.vehicle_id));
  const clientVehicleIds = valoresUnicos(rows.map((row) => row.client_vehicle));
  const clientNames = valoresUnicos(rows.map((row) => String(row.client || '').trim())).map(String);
  const providerNames = valoresUnicos(rows.map((row) => String(row.provider || '').trim())).map(String);
  const agentNames = valoresUnicos(rows.flatMap((row) => [row.agent1, row.agent2])).map(String);

  const [vehicles, clientVehicles, clients, providers, clientTables, providerTables, agents] = await Promise.all([
    selectInChunks(supabase, 'vehicles', '*', 'id', vehicleIds),
    selectInChunks(supabase, 'client_vehicles', 'id, plate, model, brand, color', 'id', clientVehicleIds),
    selectInChunks(supabase, 'clients', '*', 'name', clientNames),
    selectInChunks(supabase, 'providers', 'name, trading_name', 'name', providerNames),
    selectInChunks(supabase, 'client_price_tables', '*', 'client', clientNames),
    selectInChunks(supabase, 'provider_cost_tables', '*', 'provider', providerNames),
    selectInChunks(supabase, 'agents', 'name, phone', 'name', agentNames),
  ]);

  const vehicleMap = vehicles.reduce((acc: Record<string, any>, vehicle: any) => {
    acc[vehicle.id] = vehicle;
    return acc;
  }, {});
  const clientVehicleMap = clientVehicles.reduce((acc: Record<string, any>, vehicle: any) => {
    acc[String(vehicle.id)] = vehicle;
    return acc;
  }, {});
  const clientNameMap = clients.reduce((acc: Record<string, string>, client: any) => {
    if (client.trading_name && String(client.trading_name).trim() !== '') {
      acc[String(client.name || '').trim().toUpperCase()] = String(client.trading_name).trim();
    }
    return acc;
  }, {});
  const providerNameMap = providers.reduce((acc: Record<string, string>, provider: any) => {
    if (provider.trading_name && String(provider.trading_name).trim() !== '') {
      acc[String(provider.name || '').trim().toUpperCase()] = String(provider.trading_name).trim();
    }
    return acc;
  }, {});
  const agentPhones: Record<string, string> = {};
  for (const agent of agents) {
    if (agent?.name && agent?.phone) agentPhones[agent.name] = agent.phone;
  }

  return {
    vehicleMap,
    clientVehicleMap,
    clientNameMap,
    providerNameMap,
    clients,
    clientTables,
    providerTables,
    agentPhones,
  };
}
