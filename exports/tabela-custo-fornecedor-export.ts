import ExcelJS from 'exceljs';
import { formatDateBR, formatIsoDateBR } from '../lib/dateUtils';

/** Linha da tabela de custo do fornecedor, como a tela mostra. */
export interface LinhaCustoFornecedorExport {
  operation_type?: string | null;
  activation_cost?: number | null;
  franchise_km?: number | null;
  franchise_hours?: number | null;
  cost_per_extra_km?: number | null;
  cost_per_extra_hour?: number | null;
  adjustment_status?: string | null;
  last_adjustment_date?: string | null;
}

const PALETA = {
  faixa: '111827',
  faixaTexto: 'FFFFFF',
  cabecalho: 'F3F4F6',
  cabecalhoTexto: '4B5563',
  branco: 'FFFFFF',
  zebra: 'F9FAFB',
  borda: 'E5E7EB',
  texto: '374151',
  franquia: '6B7280',
  custo: 'DC2626',
  custoAjustado: '15803D',
  rotaAjustada: '166534',
  pendente: '9CA3AF',
  ativoFundo: '16A34A',
  ativoTexto: 'FFFFFF',
};

const CABECALHOS = ['OPERAÇÃO / ROTA', 'CUSTO BASE', 'FRANQUIAS', 'KM EXTRA', 'HORA EXTRA', 'REAJUSTE'];

function borda(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: PALETA.borda } },
    bottom: { style: 'thin', color: { argb: PALETA.borda } },
    left: { style: 'thin', color: { argb: PALETA.borda } },
    right: { style: 'thin', color: { argb: PALETA.borda } },
  };
}

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function reais(valor: number | null | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function nomeArquivo(fornecedor: string): string {
  const limpo = String(fornecedor || 'fornecedor')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'fornecedor';
  return `tabela-custo-${limpo}-${formatIsoDateBR()}.xlsx`;
}

export async function exportarTabelaCustoFornecedor(input: {
  fornecedor: string;
  linhas: LinhaCustoFornecedorExport[];
  autoDownload?: boolean;
}): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GRUPO TM SEG';
  const ws = wb.addWorksheet('Tabela de custo', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = [
    { width: 42 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
  ];

  ws.mergeCells(1, 1, 1, CABECALHOS.length);
  const faixa = ws.getCell(1, 1);
  faixa.value = `TABELA DE CUSTO — ${(input.fornecedor || 'FORNECEDOR').toUpperCase()}`;
  faixa.font = { bold: true, size: 14, color: { argb: PALETA.faixaTexto } };
  faixa.alignment = { vertical: 'middle', horizontal: 'left' };
  fill(faixa, PALETA.faixa);
  ws.getRow(1).height = 28;
  for (let c = 1; c <= CABECALHOS.length; c += 1) fill(ws.getCell(1, c), PALETA.faixa);

  const cab = ws.getRow(2);
  cab.height = 22;
  CABECALHOS.forEach((titulo, i) => {
    const cell = cab.getCell(i + 1);
    cell.value = titulo;
    cell.font = { bold: true, size: 9, color: { argb: PALETA.cabecalhoTexto } };
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : i === 2 || i === 5 ? 'center' : 'right' };
    fill(cell, PALETA.cabecalho);
    borda(cell);
  });

  input.linhas.forEach((linha, index) => {
    const row = ws.getRow(index + 3);
    const ajustado = Boolean(linha.adjustment_status);
    const fundo = index % 2 === 0 ? PALETA.branco : PALETA.zebra;
    const rota = String(linha.operation_type || '').toUpperCase();
    const franquia = `${Number(linha.franchise_km) || 0}KM / ${Number(linha.franchise_hours) || 0}H`;
    const reajuste = ajustado
      ? `ATIVO${linha.last_adjustment_date ? ` · ${formatDateBR(linha.last_adjustment_date)}` : ''}`
      : 'PENDENTE';

    const valores: Array<string | number> = [
      rota,
      reais(linha.activation_cost),
      franquia,
      reais(linha.cost_per_extra_km),
      reais(linha.cost_per_extra_hour),
      reajuste,
    ];

    valores.forEach((valor, i) => {
      const cell = row.getCell(i + 1);
      cell.value = valor;
      fill(cell, i === 5 && ajustado ? PALETA.ativoFundo : fundo);
      borda(cell);
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : i === 2 || i === 5 ? 'center' : 'right' };
      if (i === 1 || i === 3 || i === 4) cell.numFmt = '"R$" #,##0.00';
      if (i === 0) cell.font = { bold: true, size: 10, color: { argb: ajustado ? PALETA.rotaAjustada : PALETA.texto } };
      else if (i === 1) cell.font = { bold: true, size: 10, color: { argb: ajustado ? PALETA.custoAjustado : PALETA.custo } };
      else if (i === 2) cell.font = { size: 10, color: { argb: PALETA.franquia } };
      else if (i === 5) cell.font = { bold: true, size: 9, color: { argb: ajustado ? PALETA.ativoTexto : PALETA.pendente } };
      else cell.font = { bold: true, size: 10, color: { argb: PALETA.texto } };
    });
  });

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, input.linhas.length + 2), column: CABECALHOS.length } };
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (input.autoDownload !== false && typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo(input.fornecedor);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }
  return blob;
}
