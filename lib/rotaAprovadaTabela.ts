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
  /** Quilometragem já gravada nessa OS. Ausente não entra no grupo de KM parecido. */
  km?: number | null;
  /** Nota já emitida ou número de fatura preenchido. */
  faturada?: boolean;
  /** Velada ou Caracterizada, como gravado em missions.mission_type. */
  tipoMissao?: string | null;
  /** Valor real do pedágio (o que o operador digitou). Nulo quando a OS não tinha o campo. */
  pedagioReal?: number | null;
}

export interface EscolhaRotaAprovada {
  rota: string;
  clientTableId: string;
  providerTableId?: string;
  votos: number;
  faturadas: number;
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

/**
 * Curinga do LIKE. A vogal vira _, então FLORIANÓPOLIS e FLORIANOPOLIS
 * passam no mesmo filtro. A conferência fina continua em osEstaNaRota.
 */
export function curingaDaCidade(cidade: string): string {
  const base = normalizar(cidade);
  if (!base) return '';
  return base.replace(/[AEIOU]/g, '_');
}

const PREFIXO_LOGRADOURO = /^(RUA|AV|AVENIDA|ROD|RODOVIA|PASSAGEM|TRAVESSA|TV|ALAMEDA|ESTRADA|EST|PRACA|PCA)\b/;

const NOME_DE_ESTADO = new Set([
  'ACRE', 'ALAGOAS', 'AMAPA', 'AMAZONAS', 'BAHIA', 'CEARA', 'DISTRITO FEDERAL',
  'ESPIRITO SANTO', 'GOIAS', 'MARANHAO', 'MATO GROSSO', 'MATO GROSSO DO SUL',
  'MINAS GERAIS', 'PARA', 'PARAIBA', 'PARANA', 'PERNAMBUCO', 'PIAUI',
  'RIO DE JANEIRO', 'RIO GRANDE DO NORTE', 'RIO GRANDE DO SUL', 'RONDONIA',
  'RORAIMA', 'SANTA CATARINA', 'SAO PAULO', 'SERGIPE', 'TOCANTINS', 'BRASIL', 'BRAZIL',
]);

function pedacoDeCidade(pedaco: string): string {
  const limpo = pedaco.replace(/\s*-\s*[A-Z]{2}$/, '').trim();
  if (limpo.length <= 3 || limpo.length > 40 || /^\d/.test(limpo) || PREFIXO_LOGRADOURO.test(limpo) || NOME_DE_ESTADO.has(limpo)) return '';
  return limpo;
}

/** Cidade conhecida no endereço. Prefere o nome mais longo que aparecer no texto. */
export function cidadeNoEndereco(endereco: string): string {
  const texto = normalizar(endereco);
  const conhecidas = [...TABLE_SPECIFIC_CITY_KEYWORDS].sort((a, b) => b.length - a.length);
  const achou = conhecidas.find((cidade) => texto.includes(cidade));
  if (achou) return achou;
  const extraida = normalizar(extractCityFromAddress(endereco || ''));
  if (pedacoDeCidade(extraida)) return extraida;
  const partes = texto.split(',').map((parte) => parte.trim()).filter(Boolean);
  for (const parte of partes) {
    const cidade = pedacoDeCidade(parte);
    if (!cidade) continue;
    if (cidade === 'SERRA' && texto.includes('TABOAO')) continue;
    return cidade;
  }
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

/** O endereço cita a cidade. Serra não absorve Taboão da Serra, e a UF separa homônimos. */
export function enderecoNaCidade(endereco: string, cidade: string, uf?: string): boolean {
  const texto = normalizar(endereco);
  const alvo = normalizar(cidade);
  if (!alvo) return false;
  const palavra = new RegExp(`(?:^|[^A-Z])${alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^A-Z]|$)`);
  if (!palavra.test(texto)) return false;
  if (alvo === 'SERRA' && texto.includes('TABOAO')) return false;
  const ufEndereco = extractUF(endereco);
  if (uf && ufEndereco && ufEndereco !== uf) return false;
  return true;
}

/** A OS antiga é a mesma rota da nova, mesmo quando o endereço vem completo. */
export function osEstaNaRota(osOrigem: string, osDestino: string, origem: string, destino: string): boolean {
  const rota = rotaDaOs(origem, destino);
  if (!rota) return false;
  const rotaOs = rotaDaOs(osOrigem, osDestino);
  if (rotaOs && rotaOs.origem === rota.origem && rotaOs.destino === rota.destino) return true;
  return enderecoNaCidade(osOrigem, rota.origem, extractUF(origem))
    && enderecoNaCidade(osDestino, rota.destino, extractUF(destino));
}

export function algumaTabelaCobreCidade(tabelas: LinhaTabelaRota[], cidade: string): boolean {
  const alvo = normalizar(cidade);
  if (alvo.length < 4) return false;
  return tabelas.some((tabela) => normalizar(tabela.operation_type || '').includes(alvo));
}

/** KM da OS: diferença dos hodômetros quando os dois existem; senão a distância total. */
export function quilometragemRegistrada(inicio?: number | null, fim?: number | null, total?: number | null): number | null {
  const start = Number(inicio);
  const end = Number(fim);
  if (Number.isFinite(end) && Number.isFinite(start) && end > start && start > 0) return end - start;
  const distancia = Number(total);
  if (Number.isFinite(distancia) && distancia > 0) return distancia;
  return null;
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

function margemKm(kmAtual: number): number {
  return Math.max(40, kmAtual * 0.5);
}

function kmParecido(kmOs: number | null | undefined, kmAtual: number): boolean {
  if (!(kmAtual > 0)) return false;
  if (kmOs == null || !(kmOs > 0)) return false;
  return Math.abs(kmOs - kmAtual) <= margemKm(kmAtual);
}

interface Contagem {
  peso: number;
  votos: number;
  faturadas: number;
  proximas: number;
  recente: number;
  exemplo: string;
}

function acumular(tally: Map<string, Contagem>, id: string, os: OsRotaAprovada, kmAtual: number) {
  const em = Date.parse(os.aprovadaEm || '') || 0;
  const faturada = os.faturada === true;
  const perto = kmParecido(os.km, kmAtual);
  const atual = tally.get(id);
  if (!atual) {
    tally.set(id, {
      peso: 1 + (faturada ? 1 : 0),
      votos: 1,
      faturadas: faturada ? 1 : 0,
      proximas: perto ? 1 : 0,
      recente: em,
      exemplo: String(os.id),
    });
    return;
  }
  atual.peso += 1 + (faturada ? 1 : 0);
  atual.votos += 1;
  if (faturada) atual.faturadas += 1;
  if (perto) atual.proximas += 1;
  if (em >= atual.recente) {
    atual.recente = em;
    atual.exemplo = String(os.id);
  }
}

function ordenar(tally: Map<string, Contagem>, regiao: string, nomePorId: Map<string, string>) {
  const alvo = normalizar(regiao);
  return [...tally.entries()].sort((a, b) => {
    if (b[1].peso !== a[1].peso) return b[1].peso - a[1].peso;
    if (b[1].votos !== a[1].votos) return b[1].votos - a[1].votos;
    if (b[1].proximas !== a[1].proximas) return b[1].proximas - a[1].proximas;
    if (alvo) {
      const regA = normalizar(nomePorId.get(a[0]) || '').includes(alvo) ? 1 : 0;
      const regB = normalizar(nomePorId.get(b[0]) || '').includes(alvo) ? 1 : 0;
      if (regB !== regA) return regB - regA;
    }
    return b[1].recente - a[1].recente;
  })[0];
}

/**
 * A escolha principal é o histórico já aprovado (e, com peso maior, faturado)
 * do mesmo cliente, na mesma rota cidade-cidade. Quilometragem parecida entra
 * na frente. Se não houver histórico, devolve null e o motor da OS segue.
 */
export function escolherTabelasDaRotaAprovada(entrada: {
  osAtualId?: string;
  cliente: string;
  origem: string;
  destino: string;
  fornecedorAtual?: string | null;
  kmAtual?: number | null;
  regiao?: string | null;
  historico: OsRotaAprovada[];
  tabelasCliente: LinhaTabelaRota[];
  tabelasFornecedor: LinhaTabelaRota[];
}): EscolhaRotaAprovada | null {
  const rota = rotaDaOs(entrada.origem, entrada.destino);
  if (!rota) return null;

  const kmAtual = Number(entrada.kmAtual) > 0 ? Number(entrada.kmAtual) : 0;
  const idsCliente = new Set(entrada.tabelasCliente.map((tabela) => String(tabela.id)));
  const nomeCliente = new Map(entrada.tabelasCliente.map((tabela) => [String(tabela.id), tabela.operation_type || '']));
  const fornecedorPorId = new Map(entrada.tabelasFornecedor.map((tabela) => [String(tabela.id), tabela]));
  const nomeFornecedor = new Map(entrada.tabelasFornecedor.map((tabela) => [String(tabela.id), tabela.provider || '']));
  const iguais = entrada.historico.filter((os) => {
    if (entrada.osAtualId && String(os.id) === String(entrada.osAtualId)) return false;
    if (!os.clientTableId || !idsCliente.has(String(os.clientTableId))) return false;
    if (!mesmoCliente(os.cliente, entrada.cliente)) return false;
    const rotaOs = rotaDaOs(os.origem, os.destino);
    return !!rotaOs && rotaOs.origem === rota.origem && rotaOs.destino === rota.destino;
  });
  if (iguais.length === 0) return null;

  const perto = kmAtual > 0 ? iguais.filter((os) => kmParecido(os.km, kmAtual)) : [];
  const usadas = perto.length > 0 ? perto : iguais;

  const tally = new Map<string, Contagem>();
  for (const os of usadas) acumular(tally, String(os.clientTableId), os, kmAtual);
  const vencedor = ordenar(tally, entrada.regiao || '', nomeCliente);
  if (!vencedor) return null;

  const doCliente = usadas.filter((os) => String(os.clientTableId) === vencedor[0]);
  const votosFornecedor = new Map<string, Contagem>();
  for (const os of doCliente) {
    const id = os.providerTableId ? String(os.providerTableId) : '';
    const tabela = id ? fornecedorPorId.get(id) : undefined;
    if (!tabela) continue;
    const nomeTabela = tabela.provider || '';
    const nomeOs = os.fornecedor || '';
    const atual = entrada.fornecedorAtual || '';
    if (atual && !mesmoFornecedor(nomeTabela, atual) && !mesmoFornecedor(nomeOs, atual)) continue;
    acumular(votosFornecedor, id, os, kmAtual);
  }
  const fornecedor = ordenar(votosFornecedor, entrada.regiao || '', nomeFornecedor);

  return {
    rota: `${rota.origem} → ${rota.destino}`,
    clientTableId: vencedor[0],
    providerTableId: fornecedor?.[0],
    votos: vencedor[1].votos,
    faturadas: vencedor[1].faturadas,
    osExemplo: vencedor[1].exemplo,
  };
}

export interface EscolhaTabelaProxima {
  clientTableId: string;
  providerTableId?: string;
  osExemplo: string;
  mesmaRota: boolean;
}

/** Maior frequência. Empate fica com o created_at mais recente. */
export function getTopTabelaId(ordens: { tabela_id: string | null | undefined; created_at: string | null | undefined }[]): string | null {
  const contagem = new Map<string, { total: number; maisRecente: string }>();
  for (const os of ordens) {
    const id = os.tabela_id ? String(os.tabela_id) : '';
    if (!id) continue;
    const criado = os.created_at || '';
    const atual = contagem.get(id) || { total: 0, maisRecente: criado };
    contagem.set(id, {
      total: atual.total + 1,
      maisRecente: criado > atual.maisRecente ? criado : atual.maisRecente,
    });
  }
  const ordenado = [...contagem.entries()].sort((a, b) => {
    if (b[1].total !== a[1].total) return b[1].total - a[1].total;
    return new Date(b[1].maisRecente).getTime() - new Date(a[1].maisRecente).getTime();
  });
  return ordenado[0]?.[0] || null;
}

export interface SugestaoTabelas {
  tabelaClienteSugeridaId: string | null;
  tabelaFornecedorSugeridaId: string | null;
  /** OS aprovada de onde saíram os dois ids. Só a Nova OS preenche. */
  osOrigemId?: string | null;
  osOrigemEm?: string | null;
  /** Valor real do pedágio dessa OS. Nulo: o formulário segue o cálculo atual. */
  pedagioReal?: number | null;
}

/** Velada não herda tabela de Caracterizada, e o contrário também vale. */
export function mesmoTipoMissao(gravado: string | null | undefined, atual: string | null | undefined): boolean {
  const a = normalizar(gravado || '');
  const b = normalizar(atual || '');
  if (!a || !b) return false;
  const velada = (valor: string) => valor.includes('VELAD');
  const caracterizada = (valor: string) => valor.includes('CARACTER');
  if (velada(a) || velada(b)) return velada(a) && velada(b);
  if (caracterizada(a) || caracterizada(b)) return caracterizada(a) && caracterizada(b);
  return a === b;
}

/**
 * Top 1 da amostra (até 10 OS aprovadas da mesma rota).
 * Com fornecedor, o par vem na frente. Sem esse par, a tabela de cliente
 * sai do grupo inteiro e a de custo fica vazia.
 */
export function resolverSugestaoTop1(entrada: {
  cliente: string;
  fornecedor?: string | null;
  origem: string;
  destino: string;
  historico: OsRotaAprovada[];
}): SugestaoTabelas {
  const vazio: SugestaoTabelas = { tabelaClienteSugeridaId: null, tabelaFornecedorSugeridaId: null };
  const rota = rotaDaOs(entrada.origem, entrada.destino);
  if (!rota) return vazio;
  const amostra = entrada.historico.filter((os) => (
    !!os.clientTableId
    && mesmoCliente(os.cliente, entrada.cliente)
    && osEstaNaRota(os.origem, os.destino, entrada.origem, entrada.destino)
  ));
  if (!amostra.length) return vazio;

  const linhas = (lista: OsRotaAprovada[], campo: 'clientTableId' | 'providerTableId') => (
    lista.map((os) => ({ tabela_id: os[campo], created_at: os.aprovadaEm || '' }))
  );
  const fornecedor = String(entrada.fornecedor || '').trim();
  if (fornecedor) {
    const doPar = amostra.filter((os) => mesmoFornecedor(os.fornecedor || '', fornecedor));
    if (doPar.length) {
      return {
        tabelaClienteSugeridaId: getTopTabelaId(linhas(doPar, 'clientTableId')),
        tabelaFornecedorSugeridaId: getTopTabelaId(linhas(doPar, 'providerTableId')),
      };
    }
  }
  return {
    tabelaClienteSugeridaId: getTopTabelaId(linhas(amostra, 'clientTableId')),
    tabelaFornecedorSugeridaId: null,
  };
}

const SUGESTAO_ULTIMA_VAZIA: SugestaoTabelas = {
  tabelaClienteSugeridaId: null,
  tabelaFornecedorSugeridaId: null,
  osOrigemId: null,
  osOrigemEm: null,
  pedagioReal: null,
};

/**
 * A Nova OS herda as duas tabelas da OS aprovada mais recente da mesma
 * combinação. Com fornecedor, o par tem de ser dessa OS. Sem fornecedor,
 * só a tabela do cliente entra. A frequência das 10 continua em
 * resolverSugestaoTop1, usada pelo portal e pelo modal financeiro.
 */
export function resolverSugestaoUltimaAprovada(entrada: {
  cliente: string;
  fornecedor?: string | null;
  origem: string;
  destino: string;
  tipoMissao?: string | null;
  historico: OsRotaAprovada[];
}): SugestaoTabelas {
  const rota = rotaDaOs(entrada.origem, entrada.destino);
  const tipo = String(entrada.tipoMissao || '').trim();
  if (!rota || !tipo) return SUGESTAO_ULTIMA_VAZIA;
  const amostra = entrada.historico.filter((os) => (
    !!os.clientTableId
    && mesmoCliente(os.cliente, entrada.cliente)
    && osEstaNaRota(os.origem, os.destino, entrada.origem, entrada.destino)
    && mesmoTipoMissao(os.tipoMissao, tipo)
  ));
  if (!amostra.length) return SUGESTAO_ULTIMA_VAZIA;
  const ordenada = [...amostra].sort((a, b) => {
    const dataA = Date.parse(a.aprovadaEm || '') || 0;
    const dataB = Date.parse(b.aprovadaEm || '') || 0;
    return dataB - dataA;
  });
  const fornecedor = String(entrada.fornecedor || '').trim();
  const escolhida = fornecedor
    ? ordenada.find((os) => mesmoFornecedor(os.fornecedor || '', fornecedor))
    : ordenada[0];
  if (!escolhida?.clientTableId) return SUGESTAO_ULTIMA_VAZIA;
  return {
    tabelaClienteSugeridaId: String(escolhida.clientTableId),
    tabelaFornecedorSugeridaId: fornecedor && escolhida.providerTableId ? String(escolhida.providerTableId) : null,
    osOrigemId: String(escolhida.id),
    osOrigemEm: escolhida.aprovadaEm || null,
    pedagioReal: escolhida.pedagioReal == null || !Number.isFinite(Number(escolhida.pedagioReal))
      ? null
      : Math.round(Number(escolhida.pedagioReal) * 100) / 100,
  };
}

function maisAplicada(lista: OsRotaAprovada[], campo: 'clientTableId' | 'providerTableId'): OsRotaAprovada | null {
  const contagem = new Map<string, { vezes: number; recente: number; os: OsRotaAprovada }>();
  for (const os of lista) {
    const id = os[campo] ? String(os[campo]) : '';
    if (!id) continue;
    const recente = Date.parse(os.aprovadaEm || '') || 0;
    const atual = contagem.get(id);
    if (!atual) {
      contagem.set(id, { vezes: 1, recente, os });
      continue;
    }
    atual.vezes += 1;
    if (recente >= atual.recente) {
      atual.recente = recente;
      atual.os = os;
    }
  }
  return [...contagem.values()].sort((a, b) => b.vezes - a.vezes || b.recente - a.recente)[0]?.os || null;
}

/**
 * Nas últimas OS da mesma origem e do mesmo destino, a tabela que mais
 * se repetiu é a escolhida. Empate fica com a mais recente. Sem fornecedor
 * na OS nova, a tabela do fornecedor não entra. Com fornecedor, vale a
 * tabela dele que mais se repetiu nessa mesma rota.
 */
export function escolherTabelaProxima(entrada: {
  cliente: string;
  origem: string;
  destino: string;
  fornecedorAtual?: string | null;
  kmAtual?: number | null;
  historico: OsRotaAprovada[];
}): EscolhaTabelaProxima | null {
  const rota = rotaDaOs(entrada.origem, entrada.destino);
  if (!rota) return null;
  const doCliente = entrada.historico.filter((os) => !!os.clientTableId && mesmoCliente(os.cliente, entrada.cliente));
  if (!doCliente.length) return null;

  const daRota = doCliente.filter((os) => osEstaNaRota(os.origem, os.destino, entrada.origem, entrada.destino));
  const vencedora = maisAplicada(daRota, 'clientTableId');
  if (!vencedora?.clientTableId) return null;

  let providerTableId: string | undefined;
  const fornecedor = String(entrada.fornecedorAtual || '').trim();
  if (fornecedor) {
    const doFornecedor = daRota.filter((os) => String(os.clientTableId) === String(vencedora.clientTableId) && !!os.providerTableId && mesmoFornecedor(os.fornecedor || '', fornecedor));
    const fornecedorVencedor = maisAplicada(doFornecedor, 'providerTableId');
    if (fornecedorVencedor?.providerTableId) providerTableId = String(fornecedorVencedor.providerTableId);
  }

  return {
    clientTableId: String(vencedora.clientTableId),
    providerTableId,
    osExemplo: String(vencedora.id),
    mesmaRota: true,
  };
}
