/**
 * Na criação da OS, as últimas do mesmo cliente indicam a tabela.
 * A rota igual vem na frente. O km desempata. Sem fornecedor, só a tabela do cliente.
 */

import { calculateMissionFinancials } from '../financialUtils';
import { computeRouteDistanceKm } from '../routeDistance';
import { quilometragemRegistrada, type OsRotaAprovada } from '../rotaAprovadaTabela';

type Consulta = { from: (tabela: string) => any };

function tokenDoCliente(cliente: string): string {
  return (String(cliente || '').split(/[\s,.\-/]+/).find((parte) => parte.length >= 6) || '').replace(/[^A-Za-z0-9]/g, '');
}

function lerIds(snapshot: unknown): { clientTableId: string | null; providerTableId: string | null } {
  let valor = snapshot;
  if (typeof valor === 'string') {
    try { valor = JSON.parse(valor); } catch { valor = null; }
  }
  if (!valor || typeof valor !== 'object') return { clientTableId: null, providerTableId: null };
  const obj = valor as { clientTableId?: unknown; providerTableId?: unknown };
  return {
    clientTableId: obj.clientTableId ? String(obj.clientTableId) : null,
    providerTableId: obj.providerTableId ? String(obj.providerTableId) : null,
  };
}

/** Até 10 OS recentes do cliente. Se essas 10 não tiverem tabela, usa as 10 recentes que tiverem. */
export async function historicoRecenteDoCliente(sb: Consulta, cliente: string): Promise<OsRotaAprovada[]> {
  const token = tokenDoCliente(cliente);
  if (token.length < 4) return [];
  const { data, error } = await sb.from('missions')
    .select('id,origin,destination,client,original_client_name,provider,snapshot_data,created_at,total_distance,start_km,end_km')
    .or(`client.ilike.%${token}%,original_client_name.ilike.%${token}%`)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error || !Array.isArray(data)) return [];
  const linhas: OsRotaAprovada[] = data.map((row: any) => {
    const ids = lerIds(row.snapshot_data);
    return {
      id: String(row.id),
      cliente: String(row.original_client_name || row.client || ''),
      origem: String(row.origin || ''),
      destino: String(row.destination || ''),
      fornecedor: row.provider,
      clientTableId: ids.clientTableId,
      providerTableId: ids.providerTableId,
      aprovadaEm: row.created_at,
      km: quilometragemRegistrada(row.start_km, row.end_km, row.total_distance),
    };
  });
  const dez = linhas.slice(0, 10);
  if (dez.some((os) => os.clientTableId)) return dez;
  return linhas.filter((os) => os.clientTableId).slice(0, 10);
}

/** Receita do serviço com a tabela do cliente. Sem fornecedor, o custo não entra. */
export async function receitaDaTabelaNaCriacao(
  sb: Consulta,
  cliente: string,
  origem: string,
  destino: string,
  clientTableId: string,
): Promise<{ receita: number; km: number } | null> {
  const token = tokenDoCliente(cliente);
  if (!token || !clientTableId) return null;
  const distancia = await computeRouteDistanceKm(origem, destino);
  const km = distancia.success && Number(distancia.distanceKm) > 0 ? Number(distancia.distanceKm) : 0;
  const { data, error } = await sb.from('client_price_tables').select('*').ilike('client', `%${token}%`).limit(200);
  if (error || !Array.isArray(data) || !data.length) return null;
  const fin = calculateMissionFinancials(
    {
      id: 'nova',
      client: cliente,
      origin: origem,
      destination: destino,
      status: 'Solicitada',
      totalDistance: km,
      provider: '',
    } as any,
    data as any,
    [],
    undefined,
    new Date(),
    { clientTableId },
  );
  const receita = Math.round((Number(fin?.client?.serviceTotal) || 0) * 100) / 100;
  return { receita, km };
}
