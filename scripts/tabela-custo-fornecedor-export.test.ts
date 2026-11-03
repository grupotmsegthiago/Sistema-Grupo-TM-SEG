import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { exportarTabelaCustoFornecedor } from '../exports/tabela-custo-fornecedor-export.ts';

describe('excel da tabela de custo do fornecedor', () => {
  it('pinta custo em vermelho e reajuste ativo em verde', async () => {
    const blob = await exportarTabelaCustoFornecedor({
      fornecedor: 'Apoio Teste',
      autoDownload: false,
      linhas: [
        { operation_type: 'AUTO 100KM', activation_cost: 500, franchise_km: 100, franchise_hours: 3, cost_per_extra_km: 5, cost_per_extra_hour: 100 },
        { operation_type: 'ITAJAI', activation_cost: 2400, franchise_km: 550, franchise_hours: 18, cost_per_extra_km: 5, cost_per_extra_hour: 100, adjustment_status: 'ativo', last_adjustment_date: '2026-10-28' },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet('Tabela de custo');
    assert.ok(ws);
    assert.equal(ws.getCell('A1').value, 'TABELA DE CUSTO — APOIO TESTE');
    assert.equal(String((ws.getCell('A1').fill as ExcelJS.FillPattern).fgColor?.argb), '111827');
    assert.equal(ws.getCell('B3').value, 500);
    assert.equal(String((ws.getCell('B3').font as ExcelJS.Font).color?.argb), 'DC2626');
    assert.equal(ws.getCell('C3').value, '100KM / 3H');
    assert.equal(ws.getCell('F3').value, 'PENDENTE');
    assert.equal(String((ws.getCell('F3').font as ExcelJS.Font).color?.argb), '9CA3AF');
    assert.equal(ws.getCell('F4').value, 'ATIVO · 28/10/2026');
    assert.equal(String((ws.getCell('F4').fill as ExcelJS.FillPattern).fgColor?.argb), '16A34A');
    assert.equal(String((ws.getCell('B4').font as ExcelJS.Font).color?.argb), '15803D');
  });
});
