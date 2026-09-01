import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeMedicaoPdfLayout, MEDICAO_PDF_MARGIN_MM } from '../lib/billing/medicaoPdfExport';

describe('computeMedicaoPdfLayout', () => {
  it('encaixa a largura inteira e não reduz pela altura (evita cortar colunas)', () => {
    const pageW = 297;
    const pageH = 210;
    const usableW = pageW - MEDICAO_PDF_MARGIN_MM * 2;
    const layout = computeMedicaoPdfLayout(3000, 800, pageW, pageH);

    assert.ok(Math.abs(layout.drawW - usableW) < 0.001);
    assert.equal(layout.pageCount, 1);
    assert.ok(layout.ratio > 0);
  });

  it('pagina a altura quando o boletim é mais alto que uma folha', () => {
    const layout = computeMedicaoPdfLayout(2000, 6000, 297, 210);
    assert.ok(layout.pageCount >= 2);
    assert.ok(layout.sliceHeightPx < 6000);
    assert.ok(layout.drawW > 280);
  });

  it('nunca usa razão baseada na altura (que esmagava a tabela numa página)', () => {
    const wideAndTall = computeMedicaoPdfLayout(4000, 8000, 297, 210);
    const widthOnly = (297 - MEDICAO_PDF_MARGIN_MM * 2) / 4000;
    assert.ok(Math.abs(wideAndTall.ratio - widthOnly) < 0.0001);
    assert.ok(wideAndTall.pageCount > 1);
  });
});
