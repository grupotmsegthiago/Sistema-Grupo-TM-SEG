/** Cotação do portal. Não entra em OS, NF, Asaas nem no motor de faturamento. */

import {
  ehLinhaPadraoRegional,
  FAIXAS_REGIONAIS,
  getRegionFromLocation,
  nomeLinhaPadrao,
  valorKmDaFaixa,
  versaoDaLinhaTarifaria,
  type RegiaoTabela,
  type VersaoTabelaRegional,
} from '../precificacao/tabela2027';

export const KM_MINIMO_COTACAO = 100;
export const HORAS_MINIMAS_COTACAO = 3;
export const KM_POR_HORA_COTACAO = 40;

export const REGIOES_COTACAO = ['NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'] as const;

export type RegiaoBotaoCotacao = (typeof REGIOES_COTACAO)[number];

/** O botão da tela junta SP/RJ e MG/ES em SUDESTE. O card mostra a faixa da UF. */
export function botaoDaRegiaoTabela(region: RegiaoTabela | null): RegiaoBotaoCotacao | null {
  if (region === 'sudeste_sp_rj' || region === 'sudeste_mg_es') return 'SUDESTE';
  if (region === 'sul') return 'SUL';
  if (region === 'centro_oeste') return 'CENTRO-OESTE';
  if (region === 'nordeste') return 'NORDESTE';
  if (region === 'norte') return 'NORTE';
  return null;
}

export function rotuloRegiaoVisivel(region: RegiaoTabela | null): string {
  if (region === 'sudeste_sp_rj') return 'Sudeste SP/RJ';
  if (region === 'sudeste_mg_es') return 'Sudeste MG/ES';
  if (region === 'centro_oeste') return 'Centro-Oeste';
  if (region === 'nordeste') return 'Nordeste';
  if (region === 'norte') return 'Norte';
  if (region === 'sul') return 'Sul';
  return '';
}

export function regiaoAcompanhaOrigem(origem: string, cliente: string, atual: string): string {
  if (!String(origem || '').trim()) return atual;
  const local = getRegionFromLocation(origem, '', cliente);
  if (local.clienteContratual || !local.region) return atual;
  return botaoDaRegiaoTabela(local.region) || atual;
}

export function textoCardRegiao(origem: string, cliente: string, botao: string): string {
  const local = getRegionFromLocation(origem, '', cliente);
  if (!local.clienteContratual && local.region) return rotuloRegiaoVisivel(local.region);
  if (botao === 'CENTRO-OESTE') return 'Centro-Oeste';
  if (!botao) return '';
  return `${botao.charAt(0)}${botao.slice(1).toLowerCase()}`;
}

export type TabelaCotacao = {
  id: string;
  operacao: string;
  regiao: string;
  acionamento: number;
  franquiaHoras: number;
  franquiaKm: number;
  kmExtra: number;
  horaExtra: number;
};

export type ResultadoCotacao = {
  kmRota: number;
  km: number;
  horas: number;
  kmExtra: number;
  horasExtra: number;
  valorKm: number;
  valorHoras: number;
  acionamento: number;
  total: number;
};

export function regiaoDaOperacao(operacao: string): string {
  const nome = operacao.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^TABELA 20(?:26|27)\s*-\s*/, '');
  if (nome.startsWith('CENTRO-OESTE') || nome.startsWith('CENTRO OESTE')) return 'CENTRO-OESTE';
  if (nome.startsWith('NORDESTE')) return 'NORDESTE';
  if (nome.startsWith('SUDESTE')) return 'SUDESTE';
  if (nome.startsWith('NORTE')) return 'NORTE';
  if (nome.startsWith('SUL')) return 'SUL';
  return 'OUTRAS';
}

const PARADA_NOME = ['LTDA', 'LTDA.', 'S.A.', 'S.A', 'SA', 'S/A', 'S/A.', 'DO', 'DE', 'DA', 'E', 'DAS', 'DOS'];

function citarFiltroCliente(valor: string): string {
  return /[(),.:]/.test(valor) ? `"${valor.replace(/"/g, '\\"')}"` : valor;
}

/** Mesmo recorte do cadastro: nome inteiro ou as primeiras letras do segundo nome. A consulta fica neste arquivo. */
export function consultaDoCliente(nome: string): string {
  const limpo = String(nome || '').trim();
  if (!limpo) return 'client.eq.';
  const palavras = limpo.split(/\s+/).filter((parte) => !PARADA_NOME.includes(parte.toUpperCase()));
  const curto = palavras.length >= 2
    ? `${palavras[0]} ${palavras[1].slice(0, Math.min(6, palavras[1].length))}`
    : (palavras[0] || limpo);
  return `client.eq.${citarFiltroCliente(limpo)},client.ilike.${citarFiltroCliente(`%${curto}%`)}`;
}

export type TarifaResolvida = {
  tabela: TabelaCotacao;
  vigencia: VersaoTabelaRegional;
};

const FAIXA_DO_BOTAO: Partial<Record<RegiaoBotaoCotacao, RegiaoTabela>> = {
  NORTE: 'norte',
  NORDESTE: 'nordeste',
  'CENTRO-OESTE': 'centro_oeste',
  SUL: 'sul',
};

function catalogoDoBotao(regiao: string, versao: VersaoTabelaRegional): TabelaCotacao | null {
  const id = FAIXA_DO_BOTAO[regiao as RegiaoBotaoCotacao];
  if (!id) return null;
  const faixa = FAIXAS_REGIONAIS.find((item) => item.region === id);
  if (!faixa) return null;
  const km = valorKmDaFaixa(faixa, versao);
  return {
    id: regiao,
    operacao: nomeLinhaPadrao(versao, faixa),
    regiao,
    acionamento: centavos(KM_MINIMO_COTACAO * km),
    franquiaHoras: HORAS_MINIMAS_COTACAO,
    franquiaKm: KM_MINIMO_COTACAO,
    kmExtra: km,
    horaExtra: faixa.hora2026,
  };
}

function escolherLinhaDaVersao(lista: TabelaCotacao[], regiao: string, versao: VersaoTabelaRegional): TabelaCotacao | null {
  const daVersao = lista.filter((item) => item.regiao === regiao && versaoDaLinhaTarifaria(item.operacao) === versao);
  const padrao = daVersao.filter((item) => ehLinhaPadraoRegional(item.operacao) && item.kmExtra > 0);
  if (regiao === 'SUDESTE' && padrao.length > 1) return null;
  if (padrao.length > 0) return [...padrao].sort((a, b) => a.operacao.localeCompare(b.operacao, 'pt-BR'))[0];
  return valoresDaRegiao(daVersao);
}

/**
 * Tabela 2027 do cliente vem primeiro. Sem essa linha, usa a 2026 do cliente.
 * Sem as duas, usa a faixa regional. No seletor 2026, a linha 2027 não entra.
 * SUDESTE com SP/RJ e MG/ES ao mesmo tempo espera a UF da origem.
 */
export function tarifaDoBotao(lista: TabelaCotacao[], regiao: string, versao: VersaoTabelaRegional): TarifaResolvida | null {
  if (!regiao) return null;
  if (versao === '2026') {
    const linha = escolherLinhaDaVersao(lista, regiao, '2026');
    if (linha) return { tabela: linha, vigencia: '2026' };
    const catalogo = catalogoDoBotao(regiao, '2026');
    return catalogo ? { tabela: catalogo, vigencia: '2026' } : null;
  }
  const padrao2027 = lista.filter((item) => item.regiao === regiao && versaoDaLinhaTarifaria(item.operacao) === '2027' && ehLinhaPadraoRegional(item.operacao) && item.kmExtra > 0);
  if (regiao === 'SUDESTE' && padrao2027.length > 1) return null;
  const linha2027 = escolherLinhaDaVersao(lista, regiao, '2027');
  if (linha2027) return { tabela: linha2027, vigencia: '2027' };
  const linha2026 = escolherLinhaDaVersao(lista, regiao, '2026');
  if (linha2026) return { tabela: linha2026, vigencia: '2026' };
  const catalogo = catalogoDoBotao(regiao, '2027');
  return catalogo ? { tabela: catalogo, vigencia: '2027' } : null;
}

export function regiaoTemLinha(lista: TabelaCotacao[], regiao: string, versao: VersaoTabelaRegional): boolean {
  const versoes: VersaoTabelaRegional[] = versao === '2027' ? ['2027', '2026'] : ['2026'];
  return lista.some((item) => item.regiao === regiao && versoes.includes(versaoDaLinhaTarifaria(item.operacao)) && item.kmExtra > 0);
}

export function primeiraRegiaoComTarifa(lista: TabelaCotacao[], versao: VersaoTabelaRegional): string {
  if (versao === '2027') {
    const com2027 = REGIOES_COTACAO.find((item) => lista.some((tabela) => tabela.regiao === item && versaoDaLinhaTarifaria(tabela.operacao) === '2027' && tabela.kmExtra > 0));
    if (com2027) return com2027;
  }
  return REGIOES_COTACAO.find((item) => regiaoTemLinha(lista, item, versao)) || '';
}

function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function centavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function tabelaDeLinha(row: {
  id?: unknown;
  operation_type?: unknown;
  activation_fee?: unknown;
  franchise_hours?: unknown;
  franchise_km?: unknown;
  price_per_extra_km?: unknown;
  price_per_extra_hour?: unknown;
}): TabelaCotacao | null {
  const operacao = String(row.operation_type || '').trim();
  if (!operacao) return null;
  return {
    id: String(row.id || operacao),
    operacao,
    regiao: regiaoDaOperacao(operacao),
    acionamento: numero(row.activation_fee),
    franquiaHoras: numero(row.franchise_hours),
    franquiaKm: numero(row.franchise_km),
    kmExtra: numero(row.price_per_extra_km),
    horaExtra: numero(row.price_per_extra_hour),
  };
}

/** 502,5 km sobe para 503. 950 km ÷ 40 = 23,75, que conta como 24 h. Abaixo de 100 km e 3 h, vale o mínimo. */
export function horasDaRota(kmRota: number): { kmRota: number; km: number; horas: number } {
  const percorrido = Math.max(0, kmRota);
  const kmCheio = percorrido > 0 ? Math.ceil(percorrido - 1e-9) : 0;
  const km = Math.max(KM_MINIMO_COTACAO, kmCheio);
  const brutas = km / KM_POR_HORA_COTACAO;
  const horas = Math.max(HORAS_MINIMAS_COTACAO, Math.ceil(brutas - 1e-9));
  return { kmRota: percorrido, km, horas };
}

export function cidadeDaRota(endereco: string): string {
  const parte = endereco.split(',')[0]?.split('-')[0] || endereco;
  return parte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function mesmaRota(operacao: string, origem: string, destino: string): boolean {
  const nome = operacao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const saida = cidadeDaRota(origem);
  const chegada = cidadeDaRota(destino);
  if (saida.length < 3 || chegada.length < 3) return false;
  return nome.includes(`${saida} X ${chegada}`);
}

export function rotaAcordada(lista: TabelaCotacao[], regiao: string, origem: string, destino: string): TabelaCotacao | null {
  const achados = lista.filter((item) => item.regiao === regiao && mesmaRota(item.operacao, origem, destino) && !/AUTO_MASTER/i.test(item.operacao));
  if (!achados.length) return null;
  return [...achados].sort((a, b) => a.operacao.length - b.operacao.length)[0];
}

export type PropostaPortal = {
  acordada: boolean;
  regiao: string;
  origem: string;
  destino: string;
  paradas: string[];
  acionamento: number;
  kmFranquia: number;
  horasFranquia: number;
  kmExtra: number;
  horaExtra: number;
  operacao: string;
  /** Vigência do snapshot. Sem marca, a proposta fica em 2026. */
  vigencia?: '2026' | '2027' | null;
  /** Km percorrido na rota. A franquia faturada continua em kmFranquia. */
  kmRota?: number | null;
  duracaoMin?: number | null;
  /** Número visível da cotação. Não substitui o id técnico da linha. */
  numero?: number | null;
};

/** Primeiro trecho do endereço, como a pessoa vê na proposta. */
export function lugarDaProposta(endereco: string): string {
  const parte = String(endereco || '').split(',')[0]?.trim() || '';
  return parte || '—';
}

/**
 * Nomes da proposta e da OS nascida dela.
 * O sufixo literal é (2026-) ou (2027-). Sem marca, fica 2026.
 * Não altera o nome de uma linha de preço já gravada.
 */
/** Rótulos impressos no PDF, sem o ano da vigência. A OS continua com o sufixo. */
export function rotulosSemAno(origem: string, destino: string): { tabela: string; rota: string } {
  const trecho = `${lugarDaProposta(origem)} x ${lugarDaProposta(destino)}`;
  return { tabela: `Tabela: ${trecho}`, rota: `Rota: ${trecho}` };
}

export function nomesDaVigencia(
  origem: string,
  destino: string,
  vigencia: string | null | undefined,
): { tabela: string; rota: string; sufixo: '(2026-)' | '(2027-)' } {
  const sufixo = vigencia === '2027' ? '(2027-)' : '(2026-)';
  const trecho = `${lugarDaProposta(origem)} x ${lugarDaProposta(destino)} ${sufixo}`;
  return { tabela: `Tabela: ${trecho}`, rota: `Rota: ${trecho}`, sufixo };
}

export function montarProposta(entrada: {
  tabelas: TabelaCotacao[];
  regiao: string;
  origem: string;
  destino: string;
  paradas: string[];
  kmRota: number;
  tabelaRegiao: Pick<TabelaCotacao, 'acionamento' | 'franquiaHoras' | 'franquiaKm' | 'kmExtra' | 'horaExtra'>;
}): PropostaPortal {
  const paradas = entrada.paradas.map((item) => item.trim()).filter(Boolean);
  const acordada = paradas.length ? null : rotaAcordada(entrada.tabelas, entrada.regiao, entrada.origem, entrada.destino);
  if (acordada) {
    return {
      acordada: true,
      regiao: entrada.regiao,
      origem: entrada.origem,
      destino: entrada.destino,
      paradas,
      acionamento: acordada.acionamento,
      kmFranquia: acordada.franquiaKm,
      horasFranquia: acordada.franquiaHoras,
      kmExtra: acordada.kmExtra,
      horaExtra: acordada.horaExtra,
      operacao: acordada.operacao,
    };
  }
  const conta = calcularCotacaoPortal(entrada.tabelaRegiao, entrada.kmRota);
  return {
    acordada: false,
    regiao: entrada.regiao,
    origem: entrada.origem,
    destino: entrada.destino,
    paradas,
    acionamento: conta.total,
    kmFranquia: conta.km,
    horasFranquia: conta.horas,
    kmExtra: entrada.tabelaRegiao.kmExtra,
    horaExtra: entrada.tabelaRegiao.horaExtra,
    operacao: `${entrada.regiao} - ${cidadeDaRota(entrada.origem)} X ${cidadeDaRota(entrada.destino)}`,
  };
}

export function calcularCotacaoPortal(
  tabela: Pick<TabelaCotacao, 'acionamento' | 'franquiaHoras' | 'franquiaKm' | 'kmExtra' | 'horaExtra'>,
  kmRota: number,
): ResultadoCotacao {
  const base = horasDaRota(kmRota);
  const kmExtra = Math.max(0, centavos(base.km - tabela.franquiaKm));
  const horasExtra = Math.max(0, base.horas - tabela.franquiaHoras);
  const valorKm = centavos(kmExtra * tabela.kmExtra);
  const valorHoras = centavos(horasExtra * tabela.horaExtra);
  const acionamento = centavos(tabela.acionamento);
  return {
    kmRota: base.kmRota,
    km: base.km,
    horas: base.horas,
    kmExtra,
    horasExtra,
    valorKm,
    valorHoras,
    acionamento,
    total: centavos(acionamento + valorKm + valorHoras),
  };
}

export function tabelaPadraoDaRegiao<T extends { franquiaKm: number; franquiaHoras: number; operacao: string }>(lista: T[]): T | null {
  if (!lista.length) return null;
  const piso = lista.filter((item) => item.franquiaKm === KM_MINIMO_COTACAO && item.franquiaHoras === HORAS_MINIMAS_COTACAO);
  const pool = piso.length ? piso : lista;
  return [...pool].sort((a, b) => a.operacao.localeCompare(b.operacao, 'pt-BR'))[0];
}

function moda(valores: number[]): number {
  const contagem = new Map<number, number>();
  for (const valor of valores) contagem.set(valor, (contagem.get(valor) || 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** Uma linha por região: o valor por km mais usado na franquia de 100 km e 3 h. Rotas prontas não entram na escolha. */
export function valoresDaRegiao(lista: TabelaCotacao[]): TabelaCotacao | null {
  const semMotor = lista.filter((item) => !/AUTO_MASTER/i.test(item.operacao) && item.kmExtra > 0);
  const piso = semMotor.filter((item) => item.franquiaKm === KM_MINIMO_COTACAO && item.franquiaHoras === HORAS_MINIMAS_COTACAO);
  const pool = piso.length ? piso : semMotor;
  if (!pool.length) return null;
  const porKm = new Map<number, TabelaCotacao[]>();
  for (const item of pool) {
    const chave = centavos(item.kmExtra);
    porKm.set(chave, [...(porKm.get(chave) || []), item]);
  }
  const grupo = [...porKm.values()].sort((a, b) => b.length - a.length || a[0].kmExtra - b[0].kmExtra)[0];
  const regiao = grupo[0].regiao;
  return {
    id: regiao,
    operacao: regiao,
    regiao,
    acionamento: moda(grupo.map((item) => item.acionamento)),
    franquiaHoras: HORAS_MINIMAS_COTACAO,
    franquiaKm: KM_MINIMO_COTACAO,
    kmExtra: centavos(grupo[0].kmExtra),
    horaExtra: moda(grupo.map((item) => item.horaExtra)),
  };
}
