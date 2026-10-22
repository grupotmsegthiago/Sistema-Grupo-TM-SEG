/** Cotação do portal. Não entra em OS, NF, Asaas nem no motor de faturamento. */

export const KM_MINIMO_COTACAO = 100;
export const HORAS_MINIMAS_COTACAO = 3;
export const KM_POR_HORA_COTACAO = 40;

export const REGIOES_COTACAO = ['NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'] as const;

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
  const nome = operacao.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (nome.startsWith('CENTRO-OESTE') || nome.startsWith('CENTRO OESTE')) return 'CENTRO-OESTE';
  if (nome.startsWith('NORDESTE')) return 'NORDESTE';
  if (nome.startsWith('SUDESTE')) return 'SUDESTE';
  if (nome.startsWith('NORTE')) return 'NORTE';
  if (nome.startsWith('SUL')) return 'SUL';
  return 'OUTRAS';
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
};

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
