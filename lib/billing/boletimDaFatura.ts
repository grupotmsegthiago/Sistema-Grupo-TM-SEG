/**
 * Boletim das OS já vinculadas à fatura.
 * Usa só os valores gravados em missions. Não chama o motor de cálculo.
 */
import * as XLSX from 'xlsx';

export type OsDoBoletimDaFatura = {
  id?: string | null;
  origin?: string | null;
  destination?: string | null;
  start_time?: string | null;
  revenue_value?: number | null;
  toll_value?: number | null;
  displacement_value?: number | null;
};

export type LinhaBoletimDaFatura = {
  os: string;
  origem: string;
  destino: string;
  data: string;
  receita: number;
  pedagio: number;
  deslocamento: number;
  total: number;
};

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function dataCurta(iso: string | null | undefined): string {
  const texto = String(iso || '').slice(0, 10);
  const [ano, mes, dia] = texto.split('-');
  if (!ano || !mes || !dia) return '';
  return `${dia}/${mes}/${ano}`;
}

export function linhasDoBoletimDaFatura(os: OsDoBoletimDaFatura[]): LinhaBoletimDaFatura[] {
  return os.map((item) => {
    const receita = numero(item.revenue_value);
    const pedagio = numero(item.toll_value);
    const deslocamento = numero(item.displacement_value);
    return {
      os: String(item.id || '').trim(),
      origem: String(item.origin || '').trim(),
      destino: String(item.destination || '').trim(),
      data: dataCurta(item.start_time),
      receita,
      pedagio,
      deslocamento,
      total: Math.round((receita + pedagio + deslocamento) * 100) / 100,
    };
  }).filter((linha) => linha.os);
}

export function planilhaBoletimDaFatura(cliente: string, linhas: LinhaBoletimDaFatura[]): Buffer {
  const cabecalho = ['OS', 'Origem', 'Destino', 'Data', 'Receita', 'Pedágio', 'Deslocamento', 'Total'];
  const corpo = linhas.map((linha) => [
    linha.os,
    linha.origem,
    linha.destino,
    linha.data,
    linha.receita,
    linha.pedagio,
    linha.deslocamento,
    linha.total,
  ]);
  const totais = linhas.reduce((acc, linha) => ({
    receita: acc.receita + linha.receita,
    pedagio: acc.pedagio + linha.pedagio,
    deslocamento: acc.deslocamento + linha.deslocamento,
    total: acc.total + linha.total,
  }), { receita: 0, pedagio: 0, deslocamento: 0, total: 0 });
  const planilha = XLSX.utils.aoa_to_sheet([
    [`Boletim de medição — ${cliente}`],
    [],
    cabecalho,
    ...corpo,
    ['', '', '', 'Total', totais.receita, totais.pedagio, totais.deslocamento, Math.round(totais.total * 100) / 100],
  ]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Boletim');
  return XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
