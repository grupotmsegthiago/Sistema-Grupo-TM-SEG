/**
 * Rota da missão TORRES na comissão.
 * A quinzena segue a data da missão. Missão cancelada continua na comissão.
 * Só missão recusada fica de fora. Fatura antiga cancelada não é a missão.
 */
import { roundMoney } from './comissaoCalc.js';
import { normalizeClienteNome } from './sincronizarComissoesFaturas.js';
import { quinzenaDeDataFaturamento, type QuinzenaFiltro } from '../comercial/tabelaPrecosRegionais.js';

export type RotaMissaoComissao = {
  osId: string;
  osNumero: string;
  origem: string | null;
  destino: string | null;
  dataMissao: string | null;
  statusOs: string | null;
  statusMissao: string | null;
  invoiceId: string | null;
  cliente: string | null;
  valor: number;
};

export type OsExibidaComissao = {
  osId: string;
  osNumero: string;
  origem: string | null;
  destino: string | null;
  dataMissao: string | null;
};

export type DecoracaoComissao = {
  os: OsExibidaComissao[];
  datasMissao: string[];
  substituida: boolean;
  faturaViva: string | null;
  jaNaFatura: string | null;
  concluida: boolean;
  recusada: boolean;
};

const VAZIA: DecoracaoComissao = {
  os: [],
  datasMissao: [],
  substituida: false,
  faturaViva: null,
  jaNaFatura: null,
  concluida: false,
  recusada: false,
};

export function missaoRecusada(...status: Array<string | null | undefined>): boolean {
  return status.some((item) => /RECUS/.test(String(item || '').toUpperCase()));
}

export function missaoConcluida(...status: Array<string | null | undefined>): boolean {
  const blob = status.map((item) => String(item || '').toUpperCase()).join(' ');
  return /CONCLU/.test(blob) || /FINALIZ/.test(blob);
}

export function dataIsoCivil(raw: string | null | undefined): string | null {
  const data = String(raw || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

export function resumoLocal(texto: string | null | undefined): string {
  const bruto = String(texto || '').trim();
  if (!bruto) return '';
  const cabeca = bruto.split(' - ')[0].trim() || bruto;
  return cabeca.length > 42 ? `${cabeca.slice(0, 40)}…` : cabeca;
}

export function mesCivilDoIntervalo(inicio: string): { start: string; end: string } {
  const mes = /^(\d{4})-(\d{2})/.exec(String(inicio || '').slice(0, 10));
  if (!mes) return { start: String(inicio || '').slice(0, 10), end: String(inicio || '').slice(0, 10) };
  const ultimo = new Date(Number(mes[1]), Number(mes[2]), 0).getDate();
  return {
    start: `${mes[1]}-${mes[2]}-01`,
    end: `${mes[1]}-${mes[2]}-${String(ultimo).padStart(2, '0')}`,
  };
}

function chaveRota(rota: RotaMissaoComissao): string {
  return `${rota.osId}|${rota.invoiceId || ''}`;
}

function exibir(rota: RotaMissaoComissao): OsExibidaComissao {
  return {
    osId: rota.osId,
    osNumero: rota.osNumero || `OS ${rota.osId}`,
    origem: rota.origem,
    destino: rota.destino,
    dataMissao: rota.dataMissao,
  };
}

function montarDecoracao(rotas: RotaMissaoComissao[], extra: Partial<DecoracaoComissao>): DecoracaoComissao {
  const vistas = new Set<string>();
  const os: OsExibidaComissao[] = [];
  for (const rota of rotas) {
    const chave = rota.osId || rota.osNumero;
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    os.push(exibir(rota));
  }
  os.sort((a, b) => String(a.dataMissao || '').localeCompare(String(b.dataMissao || '')));
  const datasMissao = os.map((item) => item.dataMissao).filter((data): data is string => !!data);
  return {
    ...VAZIA,
    ...extra,
    os,
    datasMissao,
    concluida: extra.concluida ?? rotas.some((rota) => missaoConcluida(rota.statusOs, rota.statusMissao)),
    recusada: extra.recusada ?? rotas.some((rota) => missaoRecusada(rota.statusOs, rota.statusMissao)),
  };
}

function gruposPorFatura(rotas: RotaMissaoComissao[]): Map<string, RotaMissaoComissao[]> {
  const grupos = new Map<string, RotaMissaoComissao[]>();
  for (const rota of rotas) {
    const fatura = String(rota.invoiceId || '').trim();
    if (!fatura) continue;
    const prev = grupos.get(fatura) || [];
    prev.push(rota);
    grupos.set(fatura, prev);
  }
  return grupos;
}

/** Casa fatura cancelada com a OS que a TORRES reemitiu, pelo cliente e pelo valor exato. */
export function casarFaturaSubstituida(
  cliente: string | null | undefined,
  valor: number,
  rotas: RotaMissaoComissao[],
): { fatura: string; rotas: RotaMissaoComissao[] } | null {
  const nome = normalizeClienteNome(cliente);
  const alvo = roundMoney(Number(valor) || 0);
  if (!nome || alvo <= 0) return null;
  const doCliente = rotas.filter((rota) => normalizeClienteNome(rota.cliente) === nome);
  const achados: Array<{ fatura: string; rotas: RotaMissaoComissao[] }> = [];
  for (const [fatura, grupo] of gruposPorFatura(doCliente)) {
    const soma = roundMoney(grupo.reduce((total, rota) => total + (Number(rota.valor) || 0), 0));
    if (Math.abs(soma - alvo) < 0.02) achados.push({ fatura, rotas: grupo });
  }
  if (achados.length !== 1) return null;
  return achados[0];
}

export function decorarComissaoTorres(
  row: {
    empresa_origem?: string | null;
    status?: string | null;
    origem_fatura_id?: string | null;
    fatura_numero?: string | null;
    ordem_servico_id?: string | null;
    cliente_nome?: string | null;
    valor_faturamento?: number | null;
  },
  rotas: RotaMissaoComissao[],
): DecoracaoComissao {
  if (String(row.empresa_origem || '').toUpperCase() !== 'TORRES' || !rotas.length) return VAZIA;
  const origem = String(row.origem_fatura_id || '').trim();
  const numero = String(row.fatura_numero || '').trim();
  const osDireta = origem.startsWith('os:') ? origem.slice(3) : '';
  const chaves = new Set(
    [osDireta, String(row.ordem_servico_id || '').trim(), numero, origem].filter(Boolean),
  );
  const diretas = rotas.filter((rota) => {
    if (chaves.has(rota.osId) || chaves.has(rota.osNumero)) return true;
    return !!rota.invoiceId && (chaves.has(rota.invoiceId) || chaves.has(`inv:${rota.invoiceId}`));
  });
  const unicas = new Map<string, RotaMissaoComissao>();
  for (const rota of diretas) unicas.set(chaveRota(rota), rota);
  const lista = [...unicas.values()];
  if (lista.length) {
    const fatura = String(lista.find((rota) => rota.invoiceId)?.invoiceId || '').trim() || null;
    const linhaDaOs = origem.startsWith('os:') || (!!osDireta && numero === osDireta);
    const jaNaFatura = linhaDaOs && fatura && fatura !== numero && fatura !== origem ? fatura : null;
    return montarDecoracao(lista, { jaNaFatura });
  }
  if (String(row.status || '').toUpperCase() !== 'CANCELADO') return VAZIA;
  const troca = casarFaturaSubstituida(row.cliente_nome, Number(row.valor_faturamento) || 0, rotas);
  if (!troca) return VAZIA;
  return montarDecoracao(troca.rotas, {
    substituida: true,
    faturaViva: troca.fatura,
  });
}

export function linhaNaQuinzenaComissao(
  datasMissao: string[],
  dataDocumento: string | null | undefined,
  filtro: QuinzenaFiltro,
): boolean {
  if (filtro === 'todas') return true;
  const datas = datasMissao.length ? datasMissao : [dataIsoCivil(dataDocumento) || ''];
  return datas.some((data) => quinzenaDeDataFaturamento(data) === filtro);
}

/** Fatura cancelada que já foi reemitida, ou OS que já entrou na fatura visível, não soma de novo. */
export function comissaoDuplicadaNoPeriodo(
  decoracao: DecoracaoComissao | null | undefined,
  faturasVisiveis: Set<string>,
): boolean {
  if (!decoracao) return false;
  if (decoracao.substituida) return true;
  return !!decoracao.jaNaFatura && faturasVisiveis.has(decoracao.jaNaFatura);
}
