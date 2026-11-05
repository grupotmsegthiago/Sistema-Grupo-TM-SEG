/**
 * Seleção da tabela na abertura da OS.
 *
 * Lacunas do cadastro, resolvidas com coluna que já existe:
 * - client_price_tables e missions não têm client_id. O vínculo é o nome
 *   oficial em `client`, com igualdade exata. Não há ILIKE de pedaço do nome.
 * - Não há coluna de tabela ativa. Linha apagada é a que não volta no
 *   cadastro. adjustment_status é reajuste de preço, não desativação.
 * - Não há coluna de franquia horária. HORA, DIARIA ou ACOMPANHAMENTO no
 *   nome, ou franchise_hours preenchida com franchise_km vazio, identificam
 *   a franquia horária/diária.
 *
 * O motor calculateMissionFinancials não é chamado daqui. Quem chama recebe
 * só o id da tabela.
 */

import { evaluateRegionalTableConstraint, extractUF, UF_TO_REGION } from '../financialUtils';
import { computeRouteDistanceKm } from '../routeDistance';
import { cidadeNoEndereco, mesmoTipoMissao, osEstaNaRota } from '../rotaAprovadaTabela';
import { fetchAllPages } from '../supabasePaging';

export const JANELA_HISTORICO_DIAS = 180;
export const ATRASO_DIGITACAO_MS = 700;
const AMOSTRA_ROTA = 10;

export type OrigemSugestao = 'historico' | 'franquia_horaria' | 'cadastro_regional' | 'nenhuma';

export interface LinhaPreco {
  id: string | number;
  operation_type?: string | null;
  franchise_km?: number | null;
  franchise_hours?: number | null;
  client?: string | null;
  provider?: string | null;
}

export interface OsHistoricoTabela {
  id: string;
  cliente: string;
  fornecedor?: string | null;
  origem: string;
  destino: string;
  tipoMissao?: string | null;
  clientTableId?: string | null;
  providerTableId?: string | null;
  criadaEm?: string | null;
}

export interface ResultadoTabelaProgressiva {
  tabelaClienteId: string | null;
  tabelaFornecedorId: string | null;
  origem: OrigemSugestao;
  rotulo: string;
}

export const RESULTADO_TABELA_VAZIO: ResultadoTabelaProgressiva = {
  tabelaClienteId: null,
  tabelaFornecedorId: null,
  origem: 'nenhuma',
  rotulo: '',
};

type Consulta = { from: (tabela: string) => any };

function fold(valor: string | null | undefined): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function inicioDaJanelaHistorico(agora = new Date()): string {
  return new Date(agora.getTime() - JANELA_HISTORICO_DIAS * 24 * 60 * 60 * 1000).toISOString();
}

export function destinoEspecial(destino: string | null | undefined): boolean {
  return /RAIO\b|A DEFINIR|ACOMPANHAMENTO/i.test(String(destino || ''));
}

function familiaDoNome(nome: string): 'velada' | 'caracterizada' | 'mista' | 'neutra' {
  const texto = fold(nome);
  const velada = texto.includes('VELADA') || texto.includes('ARMADO') || texto.includes('PRONTA RESPOSTA');
  const caracterizada = texto.includes('CARACTERIZADA');
  if (velada && caracterizada) return 'mista';
  if (velada) return 'velada';
  if (caracterizada) return 'caracterizada';
  return 'neutra';
}

/** Velada não lista tabela Caracterizada, e o contrário também. Nome sem os dois tipos continua disponível. */
export function tabelaCompativelComTipo(nome: string | null | undefined, tipoMissao: string | null | undefined): boolean {
  const tipo = fold(tipoMissao || '');
  if (!tipo) return false;
  const familia = familiaDoNome(nome || '');
  if (familia === 'mista') return false;
  if (tipo.includes('CARACTER')) return familia !== 'velada';
  if (tipo.includes('VELAD') || tipo.includes('PRONTA')) return familia !== 'caracterizada';
  return false;
}

function mesmoNome(a: string | null | undefined, b: string | null | undefined): boolean {
  const esquerda = fold(a);
  const direita = fold(b);
  return !!esquerda && esquerda === direita;
}

export function tabelasGravadasNoSnapshot(snapshot: unknown): { clientTableId: string | null; providerTableId: string | null } {
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

export function mapearOsHistorico(row: {
  id?: unknown;
  client?: unknown;
  provider?: unknown;
  origin?: unknown;
  destination?: unknown;
  mission_type?: unknown;
  created_at?: unknown;
  snapshot_data?: unknown;
}): OsHistoricoTabela {
  const ids = tabelasGravadasNoSnapshot(row.snapshot_data);
  return {
    id: String(row.id || ''),
    cliente: String(row.client || ''),
    fornecedor: row.provider == null ? null : String(row.provider),
    origem: String(row.origin || ''),
    destino: String(row.destination || ''),
    tipoMissao: row.mission_type ? String(row.mission_type) : null,
    clientTableId: ids.clientTableId,
    providerTableId: ids.providerTableId,
    criadaEm: row.created_at ? String(row.created_at) : null,
  };
}

function catalogoCompativel(tabelas: LinhaPreco[], tipoMissao: string): Map<string, LinhaPreco> {
  const mapa = new Map<string, LinhaPreco>();
  for (const tabela of tabelas || []) {
    if (!tabelaCompativelComTipo(tabela.operation_type, tipoMissao)) continue;
    mapa.set(String(tabela.id), tabela);
  }
  return mapa;
}

function ehFranquiaHoraria(tabela: LinhaPreco): boolean {
  const nome = fold(tabela.operation_type || '');
  if (/\b(HORA|HORAS|DIARIA|DIARIO|ACOMPANHAMENTO)\b/.test(nome)) return true;
  const horas = Number(tabela.franchise_hours) || 0;
  const km = Number(tabela.franchise_km) || 0;
  return horas > 0 && km <= 0;
}

function escolherUnicaMenorHora(tabelas: LinhaPreco[]): LinhaPreco | null {
  const validas = tabelas.filter(ehFranquiaHoraria);
  if (!validas.length) return null;
  const ordenadas = [...validas].sort((a, b) => {
    const horasA = Number(a.franchise_hours) || Number.MAX_SAFE_INTEGER;
    const horasB = Number(b.franchise_hours) || Number.MAX_SAFE_INTEGER;
    return horasA - horasB;
  });
  const menor = Number(ordenadas[0].franchise_hours) || 0;
  const empatadas = ordenadas.filter((tabela) => (Number(tabela.franchise_hours) || 0) === menor);
  if (empatadas.length !== 1) return null;
  return empatadas[0];
}

function mencionaPalavra(nome: string, palavra: string): boolean {
  const alvo = fold(palavra);
  if (alvo.length < 4) return false;
  if (alvo === 'SERRA' && fold(nome).includes('TABOAO')) return false;
  const texto = fold(nome);
  return new RegExp(`(?:^|[^A-Z0-9])${alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^A-Z0-9]|$)`).test(texto);
}

function mencionaUf(nome: string, uf: string): boolean {
  const sigla = fold(uf);
  if (sigla.length !== 2) return false;
  return new RegExp(`(?:^|[^A-Z])${sigla}(?:[^A-Z]|$)`).test(fold(nome));
}

function mencionaRegiao(nome: string, regiao: string): boolean {
  const texto = fold(nome);
  const alvo = fold(regiao);
  if (!alvo || !texto) return false;
  if (alvo === 'SUL') return texto.includes('SUL') && !texto.includes('SUDESTE');
  if (alvo === 'NORTE') return texto.includes('NORTE') && !texto.includes('NORDESTE');
  if (alvo.startsWith('CENTRO')) return texto.includes('CENTRO');
  return texto.includes(alvo);
}

function especificidade(tabela: LinhaPreco, cidade: string, uf: string, regiao: string): number {
  const nome = tabela.operation_type || '';
  if (cidade && mencionaPalavra(nome, cidade)) return 3;
  if (uf && mencionaUf(nome, uf)) return 2;
  if (regiao && mencionaRegiao(nome, regiao)) return 1;
  return 0;
}

function escolherFaixaRegional(
  tabelas: LinhaPreco[],
  origem: string,
  destino: string,
  distanciaKm: number,
): LinhaPreco | null {
  if (!(distanciaKm > 0)) return null;
  const cidade = cidadeNoEndereco(destino);
  const uf = extractUF(destino);
  const regiao = UF_TO_REGION[uf] || '';
  const origemCidade = cidadeNoEndereco(origem);
  const origemUf = extractUF(origem);
  const pool = tabelas.filter((tabela) => {
    if (ehFranquiaHoraria(tabela)) return false;
    const nome = tabela.operation_type || '';
    const gate = evaluateRegionalTableConstraint(nome, {
      originCity: origemCidade,
      destCity: cidade,
      originRegion: UF_TO_REGION[origemUf] || '',
      originUF: origemUf,
      originAddress: origem,
    });
    if (gate.blocked) return false;
    return especificidade(tabela, cidade, uf, regiao) > 0;
  });
  if (!pool.length) return null;
  const melhorNivel = Math.max(...pool.map((tabela) => especificidade(tabela, cidade, uf, regiao)));
  const doNivel = pool.filter((tabela) => especificidade(tabela, cidade, uf, regiao) === melhorNivel);
  const cobrem = doNivel.filter((tabela) => {
    const franquia = Number(tabela.franchise_km) || 0;
    return franquia > 0 && franquia >= distanciaKm;
  });
  if (!cobrem.length) return null;
  const menor = Math.min(...cobrem.map((tabela) => Number(tabela.franchise_km) || 0));
  const empatadas = cobrem.filter((tabela) => (Number(tabela.franchise_km) || 0) === menor);
  if (empatadas.length !== 1) return null;
  return empatadas[0];
}

function topPorFrequencia(ordens: { id: string; criadaEm: string }[]): string | null {
  const contagem = new Map<string, { total: number; maisRecente: string }>();
  for (const os of ordens) {
    if (!os.id) continue;
    const atual = contagem.get(os.id) || { total: 0, maisRecente: os.criadaEm };
    contagem.set(os.id, {
      total: atual.total + 1,
      maisRecente: os.criadaEm > atual.maisRecente ? os.criadaEm : atual.maisRecente,
    });
  }
  const ordenado = [...contagem.entries()].sort((a, b) => {
    if (b[1].total !== a[1].total) return b[1].total - a[1].total;
    return new Date(b[1].maisRecente).getTime() - new Date(a[1].maisRecente).getTime();
  });
  return ordenado[0]?.[0] || null;
}

function rotuloRegional(destino: string): string {
  const uf = extractUF(destino);
  return uf ? `Sugerido: Cadastro Regional ${uf}` : 'Sugerido: Cadastro Regional';
}

/**
 * Resolve a tabela com os dados já em memória.
 * Ordem: destino especial, Top 1 das 10 aprovadas da rota, faixa regional, em branco.
 */
export function resolverTabelaProgressiva(entrada: {
  tipoMissao?: string | null;
  cliente: string;
  fornecedor?: string | null;
  origem: string;
  destino: string;
  distanciaKm?: number | null;
  tabelasCliente: LinhaPreco[];
  tabelasFornecedor: LinhaPreco[];
  historico: OsHistoricoTabela[];
}): ResultadoTabelaProgressiva {
  const tipo = String(entrada.tipoMissao || '').trim();
  if (!tipo || !String(entrada.cliente || '').trim()) return RESULTADO_TABELA_VAZIO;
  const destino = String(entrada.destino || '').trim();
  const origem = String(entrada.origem || '').trim();
  if (!destino) return RESULTADO_TABELA_VAZIO;

  const doCliente = catalogoCompativel(entrada.tabelasCliente, tipo);
  const doFornecedor = catalogoCompativel(entrada.tabelasFornecedor, tipo);
  const fornecedor = String(entrada.fornecedor || '').trim();

  if (destinoEspecial(destino)) {
    const hora = escolherUnicaMenorHora([...doCliente.values()]);
    if (!hora) return RESULTADO_TABELA_VAZIO;
    return {
      tabelaClienteId: String(hora.id),
      tabelaFornecedorId: null,
      origem: 'franquia_horaria',
      rotulo: 'Sugerido: Franquia horária/diária',
    };
  }

  if (!origem) return RESULTADO_TABELA_VAZIO;

  const amostra = (entrada.historico || [])
    .filter((os) => (
      !!os.clientTableId
      && mesmoNome(os.cliente, entrada.cliente)
      && mesmoTipoMissao(os.tipoMissao, tipo)
      && osEstaNaRota(os.origem, os.destino, origem, destino)
      && (!fornecedor || mesmoNome(os.fornecedor, fornecedor))
    ))
    .sort((a, b) => (Date.parse(b.criadaEm || '') || 0) - (Date.parse(a.criadaEm || '') || 0))
    .slice(0, AMOSTRA_ROTA);

  const tabelaClienteId = topPorFrequencia(amostra
    .filter((os) => os.clientTableId && doCliente.has(String(os.clientTableId)))
    .map((os) => ({ id: String(os.clientTableId), criadaEm: os.criadaEm || '' })));

  let tabelaFornecedorId: string | null = null;
  if (fornecedor && tabelaClienteId) {
    tabelaFornecedorId = topPorFrequencia(amostra
      .filter((os) => os.providerTableId && doFornecedor.has(String(os.providerTableId)))
      .map((os) => ({ id: String(os.providerTableId), criadaEm: os.criadaEm || '' })));
  }

  if (tabelaClienteId) {
    return {
      tabelaClienteId,
      tabelaFornecedorId,
      origem: 'historico',
      rotulo: 'Sugerido: Histórico Aprovado (Top 1)',
    };
  }

  const faixa = escolherFaixaRegional(
    [...doCliente.values()],
    origem,
    destino,
    Number(entrada.distanciaKm) || 0,
  );
  if (!faixa) return RESULTADO_TABELA_VAZIO;
  return {
    tabelaClienteId: String(faixa.id),
    tabelaFornecedorId: null,
    origem: 'cadastro_regional',
    rotulo: rotuloRegional(destino),
  };
}

async function lerPaginas(montar: (from: number, to: number) => any): Promise<any[]> {
  const { rows } = await fetchAllPages(async (from, size) => {
    const consulta = montar(from, from + size - 1);
    const { data, error } = await consulta;
    return { data, error };
  });
  return rows;
}

export async function carregarTabelasDoCliente(sb: Consulta, cliente: string): Promise<LinhaPreco[]> {
  const nome = String(cliente || '').trim();
  if (!nome) return [];
  return lerPaginas((from, to) => sb.from('client_price_tables')
    .select('id, client, operation_type, franchise_km, franchise_hours')
    .eq('client', nome)
    .order('id')
    .range(from, to));
}

export async function carregarTabelasDoFornecedor(sb: Consulta, fornecedor: string): Promise<LinhaPreco[]> {
  const nome = String(fornecedor || '').trim();
  if (!nome) return [];
  return lerPaginas((from, to) => sb.from('provider_cost_tables')
    .select('id, provider, operation_type, franchise_km, franchise_hours')
    .eq('provider', nome)
    .order('id')
    .range(from, to));
}

export async function carregarHistoricoAprovado(sb: Consulta, cliente: string, signal?: AbortSignal): Promise<OsHistoricoTabela[]> {
  const nome = String(cliente || '').trim();
  if (!nome) return [];
  const desde = inicioDaJanelaHistorico();
  const rows = await lerPaginas((from, to) => {
    let consulta = sb.from('missions')
      .select('id, origin, destination, client, provider, snapshot_data, created_at, mission_type')
      .eq('billing_approved', true)
      .eq('client', nome);
    if (typeof consulta.gte === 'function') consulta = consulta.gte('created_at', desde);
    consulta = consulta
      .not('snapshot_data', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (signal && typeof consulta.abortSignal === 'function') consulta = consulta.abortSignal(signal);
    return consulta;
  });
  return rows.filter((row) => row?.billing_approved !== false).map(mapearOsHistorico);
}

/** Portal e auditoria: uma passagem. A Nova OS usa o hook, que guarda o histórico em memória. */
export async function sugerirTabelaNaAbertura(
  sb: Consulta,
  entrada: {
    cliente: string;
    fornecedor?: string | null;
    origem: string;
    destino: string;
    tipoMissao?: string | null;
    distanciaKm?: number | null;
    signal?: AbortSignal;
  },
): Promise<ResultadoTabelaProgressiva> {
  const tipo = String(entrada.tipoMissao || '').trim();
  if (!tipo || !String(entrada.cliente || '').trim() || !String(entrada.destino || '').trim()) return RESULTADO_TABELA_VAZIO;
  const tabelasCliente = await carregarTabelasDoCliente(sb, entrada.cliente);
  const fornecedor = String(entrada.fornecedor || '').trim();
  const tabelasFornecedor = fornecedor ? await carregarTabelasDoFornecedor(sb, fornecedor) : [];
  const historico = await carregarHistoricoAprovado(sb, entrada.cliente, entrada.signal);
  const base = {
    tipoMissao: tipo,
    cliente: entrada.cliente,
    fornecedor,
    origem: entrada.origem,
    destino: entrada.destino,
    tabelasCliente,
    tabelasFornecedor,
    historico,
  };
  const primeira = resolverTabelaProgressiva({ ...base, distanciaKm: entrada.distanciaKm ?? null });
  if (primeira.origem !== 'nenhuma' || entrada.distanciaKm != null || !tabelasCliente.length || destinoEspecial(entrada.destino)) {
    return primeira;
  }
  const distancia = await computeRouteDistanceKm(entrada.origem, entrada.destino);
  const km = distancia.success && Number(distancia.distanceKm) > 0 ? Number(distancia.distanceKm) : null;
  if (!km) return primeira;
  return resolverTabelaProgressiva({ ...base, distanciaKm: km });
}
