import {
  TABLE_SPECIFIC_CITY_KEYWORDS,
  clientTableMatchesMission,
  extractCityFromAddress,
  extractUF,
} from './financialUtils';

export interface LinhaTabelaRota {
  id: string;
  operation_type?: string | null;
  client?: string | null;
  provider?: string | null;
}

export interface OsRotaAprovada {
  id: string;
  cliente: string;
  origem: string;
  destino: string;
  fornecedor?: string | null;
  clientTableId?: string | null;
  providerTableId?: string | null;
  aprovadaEm?: string | null;
}

export interface EscolhaRotaAprovada {
  rota: string;
  clientTableId: string;
  providerTableId?: string;
  votos: number;
  osExemplo: string;
}

function normalizar(valor: string): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PREFIXO_LOGRADOURO = /^(RUA|AV|AVENIDA|ROD|RODOVIA|PASSAGEM|TRAVESSA|TV|ALAMEDA|ESTRADA|EST|PRACA|PCA)\b/;

/** Cidade conhecida no endereço. Prefere o nome mais longo que aparecer no texto. */
export function cidadeNoEndereco(endereco: string): string {
  const texto = normalizar(endereco);
  const conhecidas = [...TABLE_SPECIFIC_CITY_KEYWORDS].sort((a, b) => b.length - a.length);
  const achou = conhecidas.find((cidade) => texto.includes(cidade));
  if (achou) return achou;
  const extraida = normalizar(extractCityFromAddress(endereco || ''));
  if (extraida.length > 3 && extraida.length <= 40 && !/^\d/.test(extraida) && !PREFIXO_LOGRADOURO.test(extraida)) return extraida;
  return '';
}

/**
 * Rota da OS pelas cidades. Se o destino não nomeia outra cidade e a UF é a
 * mesma da origem, a rota fica cidade-cidade (Belém-Belém).
 */
export function rotaDaOs(origem: string, destino: string): { origem: string; destino: string } | null {
  const cidadeOrigem = cidadeNoEndereco(origem);
  if (!cidadeOrigem) return null;
  let cidadeDestino = cidadeNoEndereco(destino);
  if (!cidadeDestino) {
    const ufOrigem = extractUF(origem);
    const ufDestino = extractUF(destino);
    if (ufOrigem && ufDestino && ufOrigem === ufDestino) cidadeDestino = cidadeOrigem;
  }
  if (!cidadeDestino) return null;
  return { origem: cidadeOrigem, destino: cidadeDestino };
}

export function algumaTabelaCobreCidade(tabelas: LinhaTabelaRota[], cidade: string): boolean {
  const alvo = normalizar(cidade);
  if (alvo.length < 4) return false;
  return tabelas.some((tabela) => normalizar(tabela.operation_type || '').includes(alvo));
}

function mesmoCliente(candidato: string, atual: string): boolean {
  return clientTableMatchesMission(candidato, atual) || clientTableMatchesMission(atual, candidato);
}

function mesmoFornecedor(candidato: string, atual: string): boolean {
  const a = normalizar(candidato);
  const b = normalizar(atual);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Quando a cidade não está na tabela, a escolha é a tabela mais vezes
 * aprovada na mesma rota (cidade de origem e cidade de destino) desse cliente.
 * A tabela do fornecedor sai das mesmas OS, só se o fornecedor for o atual.
 */
export function escolherTabelasDaRotaAprovada(entrada: {
  osAtualId?: string;
  cliente: string;
  origem: string;
  destino: string;
  fornecedorAtual?: string | null;
  historico: OsRotaAprovada[];
  tabelasCliente: LinhaTabelaRota[];
  tabelasFornecedor: LinhaTabelaRota[];
}): EscolhaRotaAprovada | null {
  const rota = rotaDaOs(entrada.origem, entrada.destino);
  if (!rota) return null;
  if (algumaTabelaCobreCidade(entrada.tabelasCliente, rota.origem)) return null;

  const idsCliente = new Set(entrada.tabelasCliente.map((tabela) => String(tabela.id)));
  const fornecedorPorId = new Map(entrada.tabelasFornecedor.map((tabela) => [String(tabela.id), tabela]));
  const iguais = entrada.historico.filter((os) => {
    if (entrada.osAtualId && String(os.id) === String(entrada.osAtualId)) return false;
    if (!os.clientTableId || !idsCliente.has(String(os.clientTableId))) return false;
    if (!mesmoCliente(os.cliente, entrada.cliente)) return false;
    const rotaOs = rotaDaOs(os.origem, os.destino);
    return !!rotaOs && rotaOs.origem === rota.origem && rotaOs.destino === rota.destino;
  });
  if (iguais.length === 0) return null;

  const tally = new Map<string, { votos: number; recente: number; exemplo: string }>();
  for (const os of iguais) {
    const id = String(os.clientTableId);
    const em = Date.parse(os.aprovadaEm || '') || 0;
    const atual = tally.get(id);
    if (!atual) {
      tally.set(id, { votos: 1, recente: em, exemplo: String(os.id) });
      continue;
    }
    atual.votos += 1;
    if (em >= atual.recente) {
      atual.recente = em;
      atual.exemplo = String(os.id);
    }
  }
  const vencedor = [...tally.entries()].sort((a, b) => {
    if (b[1].votos !== a[1].votos) return b[1].votos - a[1].votos;
    return b[1].recente - a[1].recente;
  })[0];
  if (!vencedor) return null;

  const doCliente = iguais.filter((os) => String(os.clientTableId) === vencedor[0]);
  const votosFornecedor = new Map<string, { votos: number; recente: number }>();
  for (const os of doCliente) {
    const id = os.providerTableId ? String(os.providerTableId) : '';
    const tabela = id ? fornecedorPorId.get(id) : undefined;
    if (!tabela) continue;
    const nomeTabela = tabela.provider || '';
    const nomeOs = os.fornecedor || '';
    const atual = entrada.fornecedorAtual || '';
    if (atual && !mesmoFornecedor(nomeTabela, atual) && !mesmoFornecedor(nomeOs, atual)) continue;
    const em = Date.parse(os.aprovadaEm || '') || 0;
    const item = votosFornecedor.get(id);
    if (!item) votosFornecedor.set(id, { votos: 1, recente: em });
    else {
      item.votos += 1;
      if (em >= item.recente) item.recente = em;
    }
  }
  const fornecedor = [...votosFornecedor.entries()].sort((a, b) => {
    if (b[1].votos !== a[1].votos) return b[1].votos - a[1].votos;
    return b[1].recente - a[1].recente;
  })[0];

  return {
    rota: `${rota.origem} → ${rota.destino}`,
    clientTableId: vencedor[0],
    providerTableId: fornecedor?.[0],
    votos: vencedor[1].votos,
    osExemplo: vencedor[1].exemplo,
  };
}
