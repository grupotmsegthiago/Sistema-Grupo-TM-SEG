import ExcelJS from 'exceljs';

export interface ExcelExportConfig {
  title: string;
  subtitle?: string;
  headers: string[];
  headerGroups?: { label: string; span: number }[];
  colWidths?: number[];
  rows: (string | number | null | undefined)[][];
  totalsRow?: (string | number | null | undefined)[];
  currencyColumns?: number[];
  fileName: string;
  sheetName?: string;
  sheetPassword?: string;
  companyName?: string;
  companyCnpj?: string;
  logoBase64?: string;
  logoPath?: string;
  footerLeft?: string;
  footerRight?: string;
}

const COLORS = {
  darkBar: '7F1D1D',
  headerBg: '991B1B',
  headerGroupBg: 'B91C1C',
  white: 'FFFFFF',
  zebraLight: 'FFFFFF',
  zebraDark: 'F5F5F5',
  totalBg: 'FEF2F2',
  totalBorder: 'DC2626',
  textDark: '1F2937',
  textMuted: '6B7280',
  borderLight: 'E5E7EB',
};

function applyBorder(cell: ExcelJS.Cell, color = COLORS.borderLight) {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

async function fetchLogoBase64(logoPath: string): Promise<string | null> {
  try {
    const resp = await fetch(logoPath);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function computeAutoWidths(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  totalsRow?: (string | number | null | undefined)[],
  currencyColumns: number[] = [],
): number[] {
  const widths: number[] = headers.map(h => h.length + 2);

  for (const row of rows) {
    row.forEach((val, i) => {
      if (i >= widths.length) return;
      let len = 0;
      if (val == null) {
        len = 1;
      } else if (typeof val === 'number' && currencyColumns.includes(i)) {
        len = `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`.length + 1;
      } else {
        len = String(val).length + 1;
      }
      if (len > widths[i]) widths[i] = len;
    });
  }

  if (totalsRow) {
    totalsRow.forEach((val, i) => {
      if (i >= widths.length || val == null) return;
      let len = 0;
      if (typeof val === 'number' && currencyColumns.includes(i)) {
        len = `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`.length + 2;
      } else {
        len = String(val).length + 2;
      }
      if (len > widths[i]) widths[i] = len;
    });
  }

  return widths.map(w => Math.max(w, 4));
}

export async function exportFormattedExcel(config: ExcelExportConfig): Promise<Blob> {
  const {
    title,
    subtitle,
    headers,
    headerGroups,
    colWidths: manualColWidths,
    rows,
    totalsRow,
    currencyColumns = [],
    fileName,
    sheetName = 'Relatório',
    sheetPassword,
    companyName = 'GRUPO TM SEG',
    companyCnpj,
    footerLeft,
    footerRight,
  } = config;

  let { logoBase64, logoPath } = config;

  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();

  const totalCols = Math.max(headers.length, 1);

  const autoWidths = computeAutoWidths(headers, rows, totalsRow, currencyColumns);
  const finalWidths = headers.map((_, i) => {
    const manual = manualColWidths?.[i];
    const auto = autoWidths[i];
    return Math.max(manual ?? 0, auto);
  });

  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      paperSize: 9,
      margins: {
        left: 0.3, right: 0.3,
        top: 0.4, bottom: 0.4,
        header: 0.2, footer: 0.2,
      },
    },
  });

  ws.columns = finalWidths.map(w => ({ width: w }));

  let currentRow = 1;

  if (!logoBase64 && !logoPath) {
    logoPath = '/logo.png';
  }
  if (!logoBase64 && logoPath) {
    logoBase64 = await fetchLogoBase64(logoPath);
  }

  const row1 = ws.getRow(currentRow);
  row1.height = 50;
  for (let c = 1; c <= totalCols; c++) {
    const cell = row1.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
  }

  if (logoBase64) {
    try {
      const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
      ws.addImage(logoId, {
        tl: { col: 0.05, row: 0.05 },
        ext: { width: 65, height: 60 },
      });
    } catch {}
  }

  ws.mergeCells(currentRow, 3, currentRow, totalCols);
  const titleCell1 = row1.getCell(3);
  titleCell1.value = title;
  titleCell1.font = { bold: true, size: 14, color: { argb: COLORS.darkBar } };
  titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow++;

  if (subtitle) {
    const subRow = ws.getRow(currentRow);
    subRow.height = 14;
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const subCell = subRow.getCell(1);
    subCell.value = subtitle;
    subCell.font = { size: 7, color: { argb: COLORS.textMuted }, italic: true };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= totalCols; c++) {
      subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
    }
    currentRow++;
  }

  const spacer1 = ws.getRow(currentRow);
  spacer1.height = 4;
  currentRow++;

  if (headerGroups && headerGroups.length > 0) {
    const groupRow = ws.getRow(currentRow);
    groupRow.height = 20;
    let colOffset = 1;
    for (const group of headerGroups) {
      if (group.span > 1) {
        ws.mergeCells(currentRow, colOffset, currentRow, colOffset + group.span - 1);
      }
      const cell = groupRow.getCell(colOffset);
      cell.value = group.label;
      cell.font = { bold: true, size: 8, color: { argb: COLORS.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerGroupBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      for (let c = colOffset; c < colOffset + group.span; c++) {
        const gc = groupRow.getCell(c);
        gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerGroupBg } };
        applyBorder(gc, COLORS.darkBar);
      }
      colOffset += group.span;
    }
    currentRow++;
  }

  const headerRow = ws.getRow(currentRow);
  headerRow.height = 22;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 8, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    applyBorder(cell, COLORS.darkBar);
  });
  currentRow++;

  rows.forEach((rowData, rowIdx) => {
    const dataRow = ws.getRow(currentRow);
    dataRow.height = 18;
    const isZebra = rowIdx % 2 === 1;
    const bgColor = isZebra ? COLORS.zebraDark : COLORS.zebraLight;

    rowData.forEach((val, colIdx) => {
      const cell = dataRow.getCell(colIdx + 1);
      const isCurrency = currencyColumns.includes(colIdx);

      if (isCurrency && typeof val === 'number') {
        cell.value = val;
        cell.numFmt = '"R$ "#,##0.00';
      } else {
        cell.value = val ?? '';
      }

      cell.font = { size: 8, color: { argb: COLORS.textDark } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = {
        horizontal: isCurrency ? 'right' : (typeof val === 'number' ? 'center' : 'left'),
        vertical: 'middle',
        wrapText: false,
      };
      applyBorder(cell);
    });

    for (let c = rowData.length + 1; c <= totalCols; c++) {
      const cell = dataRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      applyBorder(cell);
    }
    currentRow++;
  });

  if (totalsRow) {
    const spacer2 = ws.getRow(currentRow);
    spacer2.height = 4;
    currentRow++;

    const tRow = ws.getRow(currentRow);
    tRow.height = 24;
    totalsRow.forEach((val, colIdx) => {
      const cell = tRow.getCell(colIdx + 1);
      const isCurrency = currencyColumns.includes(colIdx);

      if (isCurrency && typeof val === 'number') {
        cell.value = val;
        cell.numFmt = '"R$ "#,##0.00';
      } else {
        cell.value = val ?? '';
      }

      cell.font = { bold: true, size: 9, color: { argb: COLORS.darkBar } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
      cell.alignment = {
        horizontal: isCurrency ? 'right' : (typeof val === 'number' ? 'center' : (colIdx === 0 ? 'right' : 'center')),
        vertical: 'middle',
        wrapText: false,
      };
      applyBorder(cell, COLORS.totalBorder);
    });
    currentRow++;
  }

  currentRow += 2;

  if (footerLeft || footerRight || companyName) {
    const footRow = ws.getRow(currentRow);
    footRow.height = 40;
    const midCol = Math.ceil(totalCols / 2);

    if (footerLeft || companyName) {
      ws.mergeCells(currentRow, 1, currentRow, midCol);
      const leftCell = footRow.getCell(1);
      const lines: string[] = [];
      if (companyName) lines.push(companyName);
      if (companyCnpj) lines.push(`CNPJ: ${companyCnpj}`);
      if (footerLeft) lines.push(footerLeft);
      leftCell.value = lines.join('\n');
      leftCell.font = { size: 7, color: { argb: COLORS.textMuted }, bold: true };
      leftCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      leftCell.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } } };
    }

    if (footerRight) {
      ws.mergeCells(currentRow, midCol + 1, currentRow, totalCols);
      const rightCell = footRow.getCell(midCol + 1);
      rightCell.value = footerRight;
      rightCell.font = { size: 7, color: { argb: COLORS.textMuted } };
      rightCell.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
      rightCell.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } } };
    }
  }

  const lastDataRow = currentRow;
  for (let r = currentRow + 1; r <= currentRow + 20; r++) {
    for (let c = 1; c <= totalCols + 5; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
    }
  }
  for (let r = 1; r <= currentRow; r++) {
    for (let c = totalCols + 1; c <= totalCols + 5; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
    }
  }

  const lastColLetter = String.fromCharCode(64 + Math.min(totalCols, 26));
  ws.pageSetup.printArea = `A1:${lastColLetter}${lastDataRow}`;

  if (sheetPassword) {
    await ws.protect(sheetPassword, {
      selectLockedCells: true,
      selectUnlockedCells: true,
      sort: true,
      autoFilter: true,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  return blob;
}
