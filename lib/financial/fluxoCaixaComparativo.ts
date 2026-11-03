/**
 * Agrega títulos já carregados para o gráfico Receber x Pagar.
 * Não grava, não recalcula OS e não chama o banco.
 * Data civil AAAA-MM-DD permanece no dia de Brasília.
 */
import { formatDateBR } from '../dateUtils';
import type { FinancialTransaction } from '../../types';

export type GranularidadeFluxo = 'ano' | 'mes' | 'quinzena' | 'semana' | 'dia';

export type CursorFluxo = {
  ano: number;
  mes: number;
  dia: number;
  quinzena: 1 | 2;
};

export type PontoFluxoCaixa = {
  chave: string;
  rotulo: string;
  rotuloTooltip: string;
  receber: number;
  pagar: number;
  saldo: number;
};

export type SerieFluxoCaixa = {
  pontos: PontoFluxoCaixa[];
  receber: number;
  pagar: number;
  saldo: number;
  quantidade: number;
  vazio: boolean;
  periodo: string;
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function reais(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function partesDataCivil(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export function isoDia(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

export function diaSemanaCivil(y: number, m: number, d: number): number {
  return new Date(`${isoDia(y, m, d)}T12:00:00-03:00`).getUTCDay();
}

export function cursorDeHoje(agora = new Date()): CursorFluxo {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const ler = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value || '0');
  const dia = ler('day');
  return { ano: ler('year'), mes: ler('month'), dia, quinzena: dia <= 15 ? 1 : 2 };
}

function dataBR(iso: string): string {
  return formatDateBR(iso);
}

function temHora(iso: string): boolean {
  return /T\d{2}:\d{2}/.test(String(iso || ''));
}

function horaBrasilia(iso: string): number | null {
  if (!temHora(iso)) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(partes.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(h) ? h : null;
}

function ponto(chave: string, rotulo: string, rotuloTooltip: string): PontoFluxoCaixa {
  return { chave, rotulo, rotuloTooltip, receber: 0, pagar: 0, saldo: 0 };
}

function fechar(pontos: PontoFluxoCaixa[], quantidade: number, periodo: string): SerieFluxoCaixa {
  let receber = 0;
  let pagar = 0;
  for (const p of pontos) {
    p.receber = reais(p.receber);
    p.pagar = reais(p.pagar);
    p.saldo = reais(p.receber - p.pagar);
    receber += p.receber;
    pagar += p.pagar;
  }
  receber = reais(receber);
  pagar = reais(pagar);
  return {
    pontos,
    receber,
    pagar,
    saldo: reais(receber - pagar),
    quantidade,
    vazio: quantidade === 0,
    periodo,
  };
}

function grade(
  granularidade: GranularidadeFluxo,
  cursor: CursorFluxo,
): { pontos: PontoFluxoCaixa[]; periodo: string; contem: (iso: string) => string | null } {
  if (granularidade === 'ano') {
    const pontos = MESES.map((nome, i) => {
      const mes = i + 1;
      const fim = diasNoMes(cursor.ano, mes);
      return ponto(
        isoDia(cursor.ano, mes, 1),
        nome,
        `${dataBR(isoDia(cursor.ano, mes, 1))} a ${dataBR(isoDia(cursor.ano, mes, fim))}`,
      );
    });
    return {
      pontos,
      periodo: `${dataBR(isoDia(cursor.ano, 1, 1))} a ${dataBR(isoDia(cursor.ano, 12, 31))}`,
      contem: (iso) => {
        const p = partesDataCivil(iso);
        if (!p || p.y !== cursor.ano) return null;
        return isoDia(cursor.ano, p.m, 1);
      },
    };
  }

  if (granularidade === 'mes' || granularidade === 'quinzena') {
    const ultimo = diasNoMes(cursor.ano, cursor.mes);
    const inicio = granularidade === 'quinzena' && cursor.quinzena === 2 ? 16 : 1;
    const fim = granularidade === 'quinzena' && cursor.quinzena === 1 ? Math.min(15, ultimo) : ultimo;
    const pontos: PontoFluxoCaixa[] = [];
    for (let d = inicio; d <= fim; d += 1) {
      const iso = isoDia(cursor.ano, cursor.mes, d);
      pontos.push(ponto(iso, dataBR(iso).slice(0, 5), dataBR(iso)));
    }
    return {
      pontos,
      periodo: `${dataBR(isoDia(cursor.ano, cursor.mes, inicio))} a ${dataBR(isoDia(cursor.ano, cursor.mes, fim))}`,
      contem: (iso) => {
        const p = partesDataCivil(iso);
        if (!p || p.y !== cursor.ano || p.m !== cursor.mes || p.d < inicio || p.d > fim) return null;
        return isoDia(p.y, p.m, p.d);
      },
    };
  }

  if (granularidade === 'semana') {
    const desloca = diaSemanaCivil(cursor.ano, cursor.mes, cursor.dia);
    const ancora = new Date(`${isoDia(cursor.ano, cursor.mes, cursor.dia)}T12:00:00-03:00`);
    ancora.setUTCDate(ancora.getUTCDate() - desloca);
    const pontos: PontoFluxoCaixa[] = [];
    const chaves = new Set<string>();
    for (let i = 0; i < 7; i += 1) {
      const dia = new Date(ancora);
      dia.setUTCDate(ancora.getUTCDate() + i);
      const iso = dia.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      chaves.add(iso);
      pontos.push(ponto(iso, dataBR(iso).slice(0, 5), dataBR(iso)));
    }
    return {
      pontos,
      periodo: `${pontos[0].rotuloTooltip} a ${pontos[6].rotuloTooltip}`,
      contem: (iso) => {
        const p = partesDataCivil(iso);
        if (!p) return null;
        const chave = isoDia(p.y, p.m, p.d);
        return chaves.has(chave) ? chave : null;
      },
    };
  }

  const isoDiaSel = isoDia(cursor.ano, cursor.mes, Math.min(cursor.dia, diasNoMes(cursor.ano, cursor.mes)));
  const pontos = [ponto(isoDiaSel, dataBR(isoDiaSel), dataBR(isoDiaSel))];
  return {
    pontos,
    periodo: dataBR(isoDiaSel),
    contem: (iso) => {
      const p = partesDataCivil(iso);
      if (!p) return null;
      return isoDia(p.y, p.m, p.d) === isoDiaSel ? isoDiaSel : null;
    },
  };
}

function tituloEntra(t: Pick<FinancialTransaction, 'type' | 'status' | 'due_date' | 'amount'>): boolean {
  if (t.status === 'CANCELLED') return false;
  if (t.type !== 'INCOME' && t.type !== 'EXPENSE') return false;
  if (!partesDataCivil(t.due_date)) return false;
  return Number.isFinite(Number(t.amount));
}

export function serieFluxoCaixa(
  lancamentos: Array<Pick<FinancialTransaction, 'type' | 'status' | 'due_date' | 'amount'>>,
  granularidade: GranularidadeFluxo,
  cursor: CursorFluxo,
): SerieFluxoCaixa {
  const base = grade(granularidade, cursor);
  const mapa = new Map(base.pontos.map((p) => [p.chave, p]));
  const doPeriodo = lancamentos.filter((t) => tituloEntra(t) && base.contem(t.due_date));

  if (granularidade === 'dia' && doPeriodo.length > 0 && doPeriodo.every((t) => temHora(t.due_date))) {
    const iso = base.pontos[0].chave;
    const horas = Array.from({ length: 24 }, (_, h) => {
      const hh = String(h).padStart(2, '0');
      return ponto(`${iso}T${hh}`, `${hh}h`, `${dataBR(iso)} ${hh}:00`);
    });
    const porHora = new Map(horas.map((p) => [p.chave, p]));
    for (const t of doPeriodo) {
      const h = horaBrasilia(t.due_date);
      if (h == null) continue;
      const alvo = porHora.get(`${iso}T${String(h).padStart(2, '0')}`);
      if (!alvo) continue;
      const valor = reais(Number(t.amount));
      if (t.type === 'INCOME') alvo.receber += valor;
      else alvo.pagar += valor;
    }
    return fechar(horas, doPeriodo.length, dataBR(iso));
  }

  for (const t of doPeriodo) {
    const chave = base.contem(t.due_date);
    if (!chave) continue;
    const alvo = mapa.get(chave);
    if (!alvo) continue;
    const valor = reais(Number(t.amount));
    if (t.type === 'INCOME') alvo.receber += valor;
    else alvo.pagar += valor;
  }
  return fechar(base.pontos, doPeriodo.length, base.periodo);
}

export function moverCursor(cursor: CursorFluxo, granularidade: GranularidadeFluxo, delta: number): CursorFluxo {
  const proximo = { ...cursor };
  if (granularidade === 'ano') {
    proximo.ano += delta;
    return proximo;
  }
  if (granularidade === 'mes' || granularidade === 'quinzena') {
    let mes = cursor.mes + delta;
    let ano = cursor.ano;
    while (mes < 1) {
      mes += 12;
      ano -= 1;
    }
    while (mes > 12) {
      mes -= 12;
      ano += 1;
    }
    const ultimo = diasNoMes(ano, mes);
    return { ...proximo, ano, mes, dia: Math.min(cursor.dia, ultimo) };
  }
  const passo = granularidade === 'semana' ? 7 : 1;
  const ancora = new Date(`${isoDia(cursor.ano, cursor.mes, cursor.dia)}T12:00:00-03:00`);
  ancora.setUTCDate(ancora.getUTCDate() + delta * passo);
  const iso = ancora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const p = partesDataCivil(iso);
  if (!p) return cursor;
  return { ano: p.y, mes: p.m, dia: p.d, quinzena: p.d <= 15 ? 1 : 2 };
}
