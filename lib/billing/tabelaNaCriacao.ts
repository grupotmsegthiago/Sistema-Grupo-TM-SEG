/**
 * Na criação da OS, as 10 mais recentes da mesma origem e do mesmo destino
 * indicam a tabela. A que mais se repetiu é a escolhida. Sem fornecedor, só a do cliente.
 */

import { calculateMissionFinancials } from '../financialUtils';
import { computeRouteDistanceKm } from '../routeDistance';
import { osEstaNaRota, quilometragemRegistrada, resolverSugestaoTop1, rotaDaOs, type OsRotaAprovada, type SugestaoTabelas } from '../rotaAprovadaTabela';

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

const COLUNAS_HISTORICO = 'id,origin,destination,client,provider,snapshot_data,created_at,total_distance,start_km,end_km';

function mapearHistorico(data: any[]): OsRotaAprovada[] {
  return data.map((row: any) => {
    const ids = lerIds(row.snapshot_data);
    return {
      id: String(row.id),
      cliente: String(row.client || ''),
      origem: String(row.origin || ''),
      destino: String(row.destination || ''),
      fornecedor: row.provider,
      clientTableId: ids.clientTableId,
      providerTableId: ids.providerTableId,
      aprovadaEm: row.created_at,
      km: quilometragemRegistrada(row.start_km, row.end_km, row.total_distance),
    };
  });
}

/** Até 10 OS recentes do cliente. Se essas 10 não tiverem tabela, usa as 10 recentes que tiverem. */
export async function historicoRecenteDoCliente(sb: Consulta, cliente: string): Promise<OsRotaAprovada[]> {
  const token = tokenDoCliente(cliente);
  if (token.length < 4) return [];
  const { data, error } = await sb.from('missions')
    .select(COLUNAS_HISTORICO)
    .ilike('client', `%${token}%`)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error || !Array.isArray(data)) return [];
  const linhas = mapearHistorico(data);
  const dez = linhas.slice(0, 10);
  if (dez.some((os) => os.clientTableId)) return dez;
  return linhas.filter((os) => os.clientTableId).slice(0, 10);
}

/** As 10 OS mais recentes da mesma cidade de origem e de destino, com tabela gravada. */
export async function historicoDaMesmaRota(sb: Consulta, cliente: string, origem: string, destino: string): Promise<OsRotaAprovada[]> {
  const rota = rotaDaOs(origem, destino);
  const token = tokenDoCliente(cliente);
  if (!rota || token.length < 4) return historicoRecenteDoCliente(sb, cliente);
  const { data, error } = await sb.from('missions')
    .select(COLUNAS_HISTORICO)
    .ilike('client', `%${token}%`)
    .ilike('origin', `%${rota.origem}%`)
    .ilike('destination', `%${rota.destino}%`)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error || !Array.isArray(data)) return [];
  return mapearHistorico(data)
    .filter((os) => !!os.clientTableId && osEstaNaRota(os.origem, os.destino, origem, destino))
    .slice(0, 10);
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

/** A sugestão não escolheu tabela de custo. O cálculo da Nova OS não preenche sozinho. */
export const SEM_TABELA_CUSTO_SUGERIDA = '__sem_tabela_custo_sugerida__';

const SUGESTAO_VAZIA: SugestaoTabelas = { tabelaClienteSugeridaId: null, tabelaFornecedorSugeridaId: null };

/** Destino em aberto não consulta histórico. */
export function destinoBloqueiaSugestao(destino: string): boolean {
  const texto = String(destino || '').trim();
  if (!texto) return true;
  return /RAIO\b|A DEFINIR|ACOMPANHAMENTO/i.test(texto);
}

/**
 * Últimas 10 OS aprovadas da mesma rota, com tabela gravada.
 * clienteId e fornecedorId são os nomes já usados na OS (não há id nessas colunas).
 * Aprovação no banco: billing_approved = true. A janela de 80 só existe para
 * descartar cidade parecida antes de ficar com as 10.
 */
export async function fetchTopTabelasSugestao(
  sb: Consulta,
  clienteId: string,
  fornecedorId: string | null | undefined,
  rotaOrigem: string,
  rotaDestino: string,
  signal?: AbortSignal,
): Promise<SugestaoTabelas> {
  if (destinoBloqueiaSugestao(rotaDestino)) return SUGESTAO_VAZIA;
  const rota = rotaDaOs(rotaOrigem, rotaDestino);
  const token = tokenDoCliente(clienteId);
  if (!rota || token.length < 4 || !String(rotaOrigem || '').trim()) return SUGESTAO_VAZIA;

  let consulta = sb.from('missions')
    .select(`${COLUNAS_HISTORICO},billing_approved`)
    .eq('billing_approved', true)
    .ilike('client', `%${token}%`)
    .ilike('origin', `%${rota.origem}%`)
    .ilike('destination', `%${rota.destino}%`)
    .not('snapshot_data', 'is', null)
    .order('created_at', { ascending: false })
    .limit(80);
  if (signal && typeof consulta.abortSignal === 'function') consulta = consulta.abortSignal(signal);
  const { data, error } = await consulta;
  if (signal?.aborted) return SUGESTAO_VAZIA;
  if (error || !Array.isArray(data)) return SUGESTAO_VAZIA;

  const historico = mapearHistorico(data.filter((row: { billing_approved?: boolean }) => row?.billing_approved === true))
    .filter((os) => !!os.clientTableId && osEstaNaRota(os.origem, os.destino, rotaOrigem, rotaDestino))
    .slice(0, 10);
  return resolverSugestaoTop1({
    cliente: clienteId,
    fornecedor: fornecedorId,
    origem: rotaOrigem,
    destino: rotaDestino,
    historico,
  });
}
