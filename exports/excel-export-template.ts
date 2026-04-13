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

export async function exportFormattedExcel(config: ExcelExportConfig): Promise<Blob> {
  const {
    title,
    subtitle,
    headers,
    headerGroups,
    colWidths,
    rows,
    totalsRow,
    currencyColumns = [],
    fileName,
    sheetName = 'Relatório',
    sheetPassword,
    companyName = 'GRUPO TM SEG',
    companyCnpj,
    logoBase64,
    footerLeft,
    footerRight,
  } = config;

  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
  });

  const totalCols = Math.max(headers.length, 1);

  ws.columns = headers.map((_, i) => ({
    width: colWidths?.[i] ?? 15,
  }));

  let currentRow = 1;

  const darkBarRow = ws.getRow(currentRow);
  darkBarRow.height = 40;
  for (let c = 1; c <= totalCols; c++) {
    const cell = darkBarRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.darkBar } };
  }

  if (logoBase64) {
    try {
      const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
      ws.addImage(logoId, {
        tl: { col: 0.2, row: 0.15 },
        ext: { width: 100, height: 30 },
      });
    } catch {}
  }

  const titleCell = darkBarRow.getCell(Math.max(1, Math.floor(totalCols / 2) - 1));
  titleCell.value = '';
  currentRow++;

  const titleRow = ws.getRow(currentRow);
  titleRow.height = 28;
  ws.mergeCells(currentRow, 1, currentRow, totalCols);
  const titleMerged = titleRow.getCell(1);
  titleMerged.value = title;
  titleMerged.font = { bold: true, size: 14, color: { argb: COLORS.darkBar } };
  titleMerged.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= totalCols; c++) {
    titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
  }
  currentRow++;

  if (subtitle) {
    const subRow = ws.getRow(currentRow);
    subRow.height = 18;
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const subCell = subRow.getCell(1);
    subCell.value = subtitle;
    subCell.font = { size: 9, color: { argb: COLORS.textMuted }, italic: true };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;
  }

  const spacer1 = ws.getRow(currentRow);
  spacer1.height = 6;
  currentRow++;

  if (headerGroups && headerGroups.length > 0) {
    const groupRow = ws.getRow(currentRow);
    groupRow.height = 22;
    let colOffset = 1;
    for (const group of headerGroups) {
      if (group.span > 1) {
        ws.mergeCells(currentRow, colOffset, currentRow, colOffset + group.span - 1);
      }
      const cell = groupRow.getCell(colOffset);
      cell.value = group.label;
      cell.font = { bold: true, size: 9, color: { argb: COLORS.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerGroupBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
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
  headerRow.height = 24;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBorder(cell, COLORS.darkBar);
  });
  currentRow++;

  rows.forEach((rowData, rowIdx) => {
    const dataRow = ws.getRow(currentRow);
    dataRow.height = 20;
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

      cell.font = { size: 9, color: { argb: COLORS.textDark } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = {
        horizontal: isCurrency ? 'right' : (typeof val === 'number' ? 'center' : 'left'),
        vertical: 'middle',
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
    tRow.height = 26;
    totalsRow.forEach((val, colIdx) => {
      const cell = tRow.getCell(colIdx + 1);
      const isCurrency = currencyColumns.includes(colIdx);

      if (isCurrency && typeof val === 'number') {
        cell.value = val;
        cell.numFmt = '"R$ "#,##0.00';
      } else {
        cell.value = val ?? '';
      }

      cell.font = { bold: true, size: 10, color: { argb: COLORS.darkBar } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
      cell.alignment = {
        horizontal: isCurrency ? 'right' : (typeof val === 'number' ? 'center' : (colIdx === 0 ? 'right' : 'center')),
        vertical: 'middle',
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
      leftCell.font = { size: 8, color: { argb: COLORS.textMuted }, bold: true };
      leftCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      leftCell.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } } };
    }

    if (footerRight) {
      ws.mergeCells(currentRow, midCol + 1, currentRow, totalCols);
      const rightCell = footRow.getCell(midCol + 1);
      rightCell.value = footerRight;
      rightCell.font = { size: 8, color: { argb: COLORS.textMuted } };
      rightCell.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
      rightCell.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } } };
    }
  }

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
