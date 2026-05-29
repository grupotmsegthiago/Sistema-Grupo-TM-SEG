import ExcelJS from 'exceljs';

export interface DhlFaturamentoRow {
  ciaEscolta: string;
  periodo: string;
  operacao: string;
  cancelada: 'SIM' | 'NÃO';
  descricao: string;
  seNumber: string;
  smNumber: string;
  osNumber: string;
  placaViatura: string;
  placaVeiculo: string;
  origem: string;
  ufOrigem: string;
  destino: string;
  ufDestino: string;
  kmInicio: number;
  kmFinal: number;
  kmTotal: number;
  franquiaKm: number;
  kmExcedente: number;
  kmDeslocamento: number;
  horaInicio: string;
  horaFinal: string;
  horaTotal: string;
  franquiaHr: string;
  horaExcedente: string;
  vlrHoraExcedenteTab: number;
  vlrKmExcedenteTab: number;
  vlrTotalHoraExcedente: number;
  vlrTotalKmExcedidos: number;
  vlrDeslocamento: number;
  franquiaTabela: number;
  pedagio: number;
  totalFornecedor: number;
}

export interface DhlFaturamentoConfig {
  periodLabel: string;
  rows: DhlFaturamentoRow[];
  fileName: string;
}

const HEADERS_GROUPS: { label: string; span: number; color: string }[] = [
  { label: 'INFORMACOES DA MISSÃO', span: 27, color: 'D9D9D9' },
  { label: 'COMPOSIÇÃO VALOR FINAL', span: 6, color: 'FFF2CC' },
];

const HEADERS: { title: string; description: string; width: number; type: 'text' | 'number' | 'money' | 'time' }[] = [
  { title: 'CIA DE ESCOLTA', description: 'Nome da empresa de escolta', width: 18, type: 'text' },
  { title: 'PERÍODO', description: 'Período em que as missões ocorreram', width: 18, type: 'text' },
  { title: 'OPERAÇÃO', description: 'Empresa para qual a missão foi prestada: DHL, DOX ou POLAR', width: 16, type: 'text' },
  { title: 'OPERAÇÃO CANCELADA?', description: 'Sim ou Não', width: 12, type: 'text' },
  { title: 'DESCRIÇÃO DA MISSÃO', description: 'Raio / Ponta a Ponta / Urbano / Preservação', width: 18, type: 'text' },
  { title: 'Nº SE', description: 'Nº da SE (sem pontuações, apenas o nº)', width: 12, type: 'text' },
  { title: 'Nº SM', description: 'Nº da SM (sem pontuações, apenas o nº)', width: 14, type: 'text' },
  { title: 'Nº OS', description: 'Nº da OS (sem pontuações, apenas o nº)', width: 10, type: 'text' },
  { title: 'PLACA DA VIATURA', description: 'Placa da viatura da cia de escolta', width: 12, type: 'text' },
  { title: 'PLACA VEÍCULO', description: 'Placa do veículo escoltado', width: 12, type: 'text' },
  { title: 'ORIGEM', description: 'Endereço de onde a missão deu-se início', width: 28, type: 'text' },
  { title: 'UF ORIGEM', description: 'UF de onde a missão deu-se início', width: 8, type: 'text' },
  { title: 'DESTINO', description: 'Endereço de onde a missão foi finalizada', width: 28, type: 'text' },
  { title: 'UF DESTINO', description: 'UF de onde a missão foi finalizada', width: 8, type: 'text' },
  { title: 'KM INÍCIO', description: 'Quilometragem da viatura ao iniciar a missão', width: 11, type: 'number' },
  { title: 'KM FINAL', description: 'Quilometragem da viatura ao finalizar a missão', width: 11, type: 'number' },
  { title: 'KM TOTAL', description: 'Quilometragem total (KM final - KM início)', width: 10, type: 'number' },
  { title: 'FRANQUIA KM', description: 'Franquia de quilometragem pré estabelecido em tabela', width: 11, type: 'number' },
  { title: 'KM EXCEDENTE', description: 'Quilometragem além da franquia (KM total - Franquia KM)', width: 12, type: 'number' },
  { title: 'KM DESLOCAMENTO', description: 'Quilometragem de deslocamento da base da cia de escolta até o local de início', width: 13, type: 'number' },
  { title: 'HORA INÍCIO', description: 'Data e hora em que a missão foi iniciada', width: 17, type: 'text' },
  { title: 'HORA FINAL', description: 'Data e hora em que a missão foi finalizada', width: 17, type: 'text' },
  { title: 'HORA TOTAL', description: 'Quantidade total de horas (Hora final - Hora início)', width: 11, type: 'time' },
  { title: 'FRANQUIA HR', description: 'Franquia de horas pré estabelecido em tabela (Formato em 00:00:00)', width: 11, type: 'time' },
  { title: 'HORA EXCEDENTE', description: 'Quantidade de horas além da franquia (Hora total - Franquia HR)', width: 12, type: 'time' },
  { title: 'VALOR H. EXCEDENTE TABELADO', description: 'Valor de cada hora excedente pré estabelecido em tabela', width: 14, type: 'money' },
  { title: 'VLR KM EXCEDENTE TABELADO', description: 'Valor de cada KM excedente pré estabelecido em tabela', width: 14, type: 'money' },
  { title: 'VLR TOTAL HORA EXCEDENTE', description: 'Valor total das horas excedentes (Hora Excedente X Valor H. Excedente Tabelado X 24)', width: 14, type: 'money' },
  { title: 'VLR TOTAL DOS KM\'S EXCEDIDOS', description: 'Valor total dos KMs excedentes (KM Excedente X Valor KM Excedente Tabelado)', width: 14, type: 'money' },
  { title: 'VALOR DESLOCAMENTO', description: 'Valor total dos KMs de deslocamento (KM Deslocamento X Valor KM Excedente Tabelado)', width: 14, type: 'money' },
  { title: 'FRANQUIA TABELA / PRESERVAÇÃO', description: 'Valor padrão de cada missão pré estabelecido em tabela', width: 14, type: 'money' },
  { title: 'PEDÁGIO', description: 'Valor total dos pedágios durante o percurso da missão', width: 12, type: 'money' },
  { title: 'TOTAL FORNECEDOR', description: 'Soma final de todos os valores gerados durante a missão', width: 14, type: 'money' },
];

function applyBorder(cell: ExcelJS.Cell, color = 'BFBFBF') {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

export async function exportDhlFaturamento(config: DhlFaturamentoConfig): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Grupo TM SEG';
  wb.created = new Date();
  const ws = wb.addWorksheet('ESCOLTA', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 3, showGridLines: false }],
  });

  HEADERS.forEach((h, i) => { ws.getColumn(i + 1).width = h.width; });

  const groupRow = ws.getRow(1);
  let colStart = 1;
  HEADERS_GROUPS.forEach(g => {
    const colEnd = colStart + g.span - 1;
    ws.mergeCells(1, colStart, 1, colEnd);
    const cell = groupRow.getCell(colStart);
    cell.value = g.label;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.font = { bold: true, size: 11, color: { argb: '000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.color } };
    applyBorder(cell, '808080');
    for (let c = colStart; c <= colEnd; c++) applyBorder(groupRow.getCell(c), '808080');
    colStart = colEnd + 1;
  });
  groupRow.height = 22;

  const titleRow = ws.getRow(2);
  HEADERS.forEach((h, i) => {
    const c = titleRow.getCell(i + 1);
    c.value = h.title;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D40511' } };
    applyBorder(c, '808080');
  });
  titleRow.height = 38;

  const descRow = ws.getRow(3);
  HEADERS.forEach((h, i) => {
    const c = descRow.getCell(i + 1);
    c.value = h.description;
    c.font = { italic: true, size: 8, color: { argb: '4B5563' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8DC' } };
    applyBorder(c, 'D1D5DB');
  });
  descRow.height = 56;

  config.rows.forEach((r, idx) => {
    const rowNum = 4 + idx;
    const values: any[] = [
      r.ciaEscolta,
      r.periodo,
      r.operacao,
      r.cancelada,
      r.descricao,
      r.seNumber,
      r.smNumber,
      r.osNumber,
      r.placaViatura,
      r.placaVeiculo,
      r.origem,
      r.ufOrigem,
      r.destino,
      r.ufDestino,
      r.kmInicio || 0,
      r.kmFinal || 0,
      r.kmTotal || 0,
      r.franquiaKm || 0,
      r.kmExcedente || 0,
      r.kmDeslocamento || 0,
      r.horaInicio,
      r.horaFinal,
      r.horaTotal,
      r.franquiaHr,
      r.horaExcedente,
      r.vlrHoraExcedenteTab || 0,
      r.vlrKmExcedenteTab || 0,
      r.vlrTotalHoraExcedente || 0,
      r.vlrTotalKmExcedidos || 0,
      r.vlrDeslocamento || 0,
      r.franquiaTabela || 0,
      r.pedagio || 0,
      r.totalFornecedor || 0,
    ];
    const row = ws.getRow(rowNum);
    const isCancel = r.cancelada === 'SIM';
    const zebraBg = isCancel ? 'FEE2E2' : (idx % 2 === 0 ? 'FFFFFF' : 'F9FAFB');
    HEADERS.forEach((h, i) => {
      const c = row.getCell(i + 1);
      c.value = values[i] as any;
      c.alignment = { horizontal: h.type === 'text' ? (i >= 10 && i <= 13 ? 'left' : 'center') : 'right', vertical: 'middle', wrapText: false };
      c.font = { size: 9, color: { argb: isCancel ? '991B1B' : '111827' }, bold: i === 32 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } };
      applyBorder(c, 'E5E7EB');
      if (h.type === 'number') c.numFmt = '#,##0';
      else if (h.type === 'money') c.numFmt = 'R$ #,##0.00';
    });
    row.height = 20;
  });

  const totalRowNum = 4 + config.rows.length;
  const sumCols = [15, 16, 17, 18, 19, 20, 26, 27, 28, 29, 30, 31, 32, 33];
  const totRow = ws.getRow(totalRowNum);
  totRow.getCell(1).value = 'TOTAL';
  totRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
  totRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  for (let c = 1; c <= 14; c++) {
    const cell = totRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7F1D1D' } };
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
    if (c > 1) cell.value = '';
    applyBorder(cell, '991B1B');
  }
  ws.mergeCells(totalRowNum, 1, totalRowNum, 14);
  totRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

  sumCols.forEach(col => {
    const sum = config.rows.reduce((s, r) => {
      const v = [
        r.kmInicio, r.kmFinal, r.kmTotal, r.franquiaKm, r.kmExcedente, r.kmDeslocamento,
        r.vlrHoraExcedenteTab, r.vlrKmExcedenteTab, r.vlrTotalHoraExcedente,
        r.vlrTotalKmExcedidos, r.vlrDeslocamento, r.franquiaTabela, r.pedagio, r.totalFornecedor
      ];
      const map: Record<number, number> = { 15: v[0], 16: v[1], 17: v[2], 18: v[3], 19: v[4], 20: v[5], 26: v[6], 27: v[7], 28: v[8], 29: v[9], 30: v[10], 31: v[11], 32: v[12], 33: v[13] };
      return s + (Number(map[col]) || 0);
    }, 0);
    const c = totRow.getCell(col);
    c.value = sum;
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '991B1B' } };
    c.alignment = { horizontal: 'right', vertical: 'middle' };
    const isMoney = col >= 26;
    c.numFmt = isMoney ? 'R$ #,##0.00' : '#,##0';
    applyBorder(c, '7F1D1D');
  });
  for (let c = 15; c <= 33; c++) {
    if (sumCols.indexOf(c) === -1) {
      const cell = totRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '991B1B' } };
      applyBorder(cell, '7F1D1D');
    }
  }
  totRow.height = 22;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ===========================================================================
// PREENCHIMENTO DE PLANILHA-MODELO DHL (Task: preencher planilha virgem por SE)
// ---------------------------------------------------------------------------
// Gera a planilha no MESMO formato do modelo do cliente (cabecalho unico na
// linha 1, dados a partir da linha 2), porem SEM cores. As colunas de formula
// (em vermelho no modelo) sao escritas como FORMULAS reais (preservando a regra
// do cliente). As colunas de dados (em amarelo no modelo) sao preenchidas com
// os valores buscados no sistema.
// ===========================================================================

export interface DhlFilledRow {
  ciaEscolta: string;
  periodo: string;
  operacao: string;
  cancelada: string;
  descricao: string;
  seNumber: string;
  smNumber: string;
  osNumber: string;
  placaViatura: string;
  placaVeiculo: string;
  origem: string;
  ufOrigem: string;
  destino: string;
  ufDestino: string;
  kmInicio: number;
  kmFinal: number;
  franquiaKm: number;
  kmDeslocamento: number;
  rawStart: string; // ISO datetime (HORA INICIO)
  rawEnd: string;   // ISO datetime (HORA FINAL)
  franquiaHrDays: number; // franquia de horas em fracao de dia (ex.: 3h = 0.125)
  vlrHoraExcedenteTab: number;
  vlrKmExcedenteTab: number;
  franquiaTabela: number;
  pedagio: number;
}

export interface DhlFilledConfig {
  rows: DhlFilledRow[];
}

const FILLED_HEADERS: string[] = [
  'CIA DE ESCOLTA ', 'PERÍODO', 'OPERAÇÃO', 'OPERAÇÃO CANCELADA?', 'DESCRIÇÃO DA MISSÃO',
  'Nº SE', 'Nº SM', 'Nº OS', 'PLACA DA VIATURA', 'PLACA VEÍCULO',
  'ORIGEM ', 'UF ORIGEM', 'DESTINO', 'UF DESTINO', 'KM INÍCIO',
  'KM FINAL', 'KM TOTAL ', 'FRANQUIA KM', 'KM EXCEDENTE', 'KM DESLOCAMENTO',
  'HORA INÍCIO', 'HORA FINAL', 'HORA TOTAL', 'FRANQUIA HR', 'HORA EXCEDENTE',
  'VALOR H. EXCEDENTE TABELADO', 'VLR KM EXDECENTE TABELADO', 'VLR TOTAL HORA EXCEDENTE',
  "VLR TOTAL DOS KM'S EXCEDIDOS", 'VALOR DESLOCAMENTO', 'FRANQUIA TABELA / PRESERVAÇÃO',
  'PEDÁGIO', 'TOTAL FORNECEDOR', 'HORA E KM', 'VALOR', 'KM EXCEDENTE ', 'VALIDAÇÃO CLP', 'T.M SEG',
];

// Converte um ISO datetime para o serial do Excel usando a hora de parede
// (America/Sao_Paulo), evitando ambiguidade de fuso ao escrever a celula.
function isoToExcelSerial(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || '0');
  const utcMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return utcMs / 86400000 + 25569;
}

export async function exportDhlFaturamentoFilled(config: DhlFilledConfig): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Grupo TM SEG';
  wb.created = new Date();
  const ws = wb.addWorksheet('ESCOLTA', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
  });

  // Cabecalho (linha 1) - sem preenchimento de cor.
  const headerRow = ws.getRow(1);
  FILLED_HEADERS.forEach((title, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = title.trim();
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBorder(c, 'BFBFBF');
  });
  // Colunas que o cliente preenche/valida (R, X, Z, AA, AE): fundo vermelho,
  // letras brancas — no cabecalho e nos dados.
  const RED_COLS = [18, 24, 26, 27, 31];
  RED_COLS.forEach(col => {
    const c = headerRow.getCell(col);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0000' } };
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
  });
  headerRow.height = 30;

  const moneyFmt = 'R$ #,##0.00';
  const intFmt = '#,##0';
  const timeFmt = '[h]:mm:ss';
  const dtFmt = 'dd/mm/yyyy hh:mm:ss';

  config.rows.forEach((r, idx) => {
    const n = 2 + idx; // dados a partir da linha 2
    const row = ws.getRow(n);
    const set = (col: number, value: any) => { row.getCell(col).value = value; };

    set(1, r.ciaEscolta);
    set(2, r.periodo);
    set(3, r.operacao);
    set(4, r.cancelada);
    set(5, r.descricao);
    set(6, r.seNumber);
    set(7, r.smNumber);
    set(8, r.osNumber);
    set(9, r.placaViatura);
    set(10, r.placaVeiculo);
    set(11, r.origem);
    set(12, r.ufOrigem);
    set(13, r.destino);
    set(14, r.ufDestino);
    // O, P = KM inicio / final (dados)
    set(15, r.kmInicio || 0);
    set(16, r.kmFinal || 0);
    // Q = KM TOTAL (formula =P-O)
    row.getCell(17).value = { formula: `P${n}-O${n}` } as any;
    // R = FRANQUIA KM (dado)
    set(18, r.franquiaKm || 0);
    // S = KM EXCEDENTE (formula)
    row.getCell(19).value = { formula: `IF(Q${n}-R${n}<0,"0",Q${n}-R${n})` } as any;
    // T = KM DESLOCAMENTO (dado)
    set(20, r.kmDeslocamento || 0);
    // U, V = HORA INICIO / FINAL (datas seriais)
    const su = isoToExcelSerial(r.rawStart);
    const sv = isoToExcelSerial(r.rawEnd);
    if (su != null) set(21, su); else set(21, '');
    if (sv != null) set(22, sv); else set(22, '');
    // W = HORA TOTAL (formula =V-U)
    row.getCell(23).value = { formula: `V${n}-U${n}` } as any;
    // X = FRANQUIA HR (dado, fracao de dia)
    set(24, r.franquiaHrDays || 0);
    // Y = HORA EXCEDENTE (formula)
    row.getCell(25).value = { formula: `IF(W${n}-X${n}<0,"00:00:00",W${n}-X${n})` } as any;
    // Z, AA = valores tabelados (dados)
    set(26, r.vlrHoraExcedenteTab || 0);
    set(27, r.vlrKmExcedenteTab || 0);
    // AB = VLR TOTAL HORA EXCEDENTE (formula =Y*Z*24)
    row.getCell(28).value = { formula: `Y${n}*Z${n}*24` } as any;
    // AC = VLR TOTAL KM EXCEDIDOS (formula =S*AA)
    row.getCell(29).value = { formula: `S${n}*AA${n}` } as any;
    // AD = VALOR DESLOCAMENTO (formula =T*AA)
    row.getCell(30).value = { formula: `T${n}*AA${n}` } as any;
    // AE = FRANQUIA TABELA (dado)
    set(31, r.franquiaTabela || 0);
    // AF = PEDAGIO (dado)
    set(32, r.pedagio || 0);
    // AG = TOTAL FORNECEDOR (formula =SOMA(AB:AF))
    row.getCell(33).value = { formula: `SUM(AB${n}:AF${n})` } as any;
    // AH..AL = colunas de validacao do cliente (deixar vazias)

    // Formatos numericos / data / hora
    [15, 16, 17, 18, 19, 20].forEach(col => { row.getCell(col).numFmt = intFmt; });
    row.getCell(21).numFmt = dtFmt;
    row.getCell(22).numFmt = dtFmt;
    [23, 24, 25].forEach(col => { row.getCell(col).numFmt = timeFmt; });
    [26, 27, 28, 29, 30, 31, 32, 33].forEach(col => { row.getCell(col).numFmt = moneyFmt; });

    for (let c = 1; c <= FILLED_HEADERS.length; c++) {
      const cell = row.getCell(c);
      cell.font = { size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: (c >= 11 && c <= 13) ? 'left' : 'center', wrapText: false };
      applyBorder(cell, 'E5E7EB');
    }
    RED_COLS.forEach(col => {
      const cell = row.getCell(col);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0000' } };
      cell.font = { size: 10, color: { argb: 'FFFFFF' }, bold: true };
    });
    row.height = 18;
  });

  // Larguras aproximadas
  const widths = [16, 12, 10, 14, 18, 12, 14, 10, 14, 14, 28, 9, 28, 9, 11, 11, 11, 11, 12, 13, 18, 18, 12, 11, 12, 14, 14, 14, 14, 14, 16, 12, 14, 12, 12, 14, 14, 12];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
