import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boxToPixels,
  fillRegionFromEdges,
  regionAreaRatio,
  removeOverlaysFromBuffer,
  filterOverlayBoxes,
} from '../lib/printInpainting';
import { isSupportedPrintMime, normalizePrintMime } from '../lib/printPipelineTypes';

test('normalizePrintMime aceita jpg e webp', () => {
  assert.equal(normalizePrintMime('image/jpg'), 'image/jpeg');
  assert.equal(isSupportedPrintMime('image/webp'), true);
  assert.equal(isSupportedPrintMime('image/gif'), false);
});

test('boxToPixels converte coordenadas 0-1000', () => {
  const { x0, y0, x1, y1 } = boxToPixels([100, 200, 300, 400], 1000, 800);
  assert.ok(x0 >= 0 && y0 >= 0);
  assert.ok(x1 > x0 && y1 > y0);
  assert.ok(x1 <= 1000 && y1 <= 800);
});

test('regionAreaRatio calcula fração da imagem', () => {
  const ratio = regionAreaRatio({ box_2d: [0, 0, 500, 500] }, 1000, 1000);
  assert.ok(ratio > 0.2 && ratio < 0.3);
});

test('fillRegionFromEdges substitui overlay vermelho no centro', () => {
  const w = 20;
  const h = 20;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = x * 10;
      data[i + 1] = y * 10;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  for (let y = 6; y <= 13; y++) {
    for (let x = 6; x <= 13; x++) {
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
  fillRegionFromEdges(data, w, h, 6, 6, 13, 13);
  const mid = (10 * w + 10) * 4;
  assert.notEqual(data[mid + 1], 0);
});

test('filterOverlayBoxes ignora placas e mantém timestamps', () => {
  const w = 1000;
  const h = 800;
  const filtered = filterOverlayBoxes([
    { box_2d: [700, 200, 780, 700], label: 'license plate ABC1234', kind: 'text' },
    { box_2d: [20, 20, 120, 400], label: 'camera timestamp', kind: 'timestamp' },
  ], w, h);
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].label || '', /timestamp/i);
});

test('removeOverlaysFromBuffer ignora caixas enormes', () => {
  const w = 100;
  const h = 100;
  const data = new Uint8ClampedArray(w * h * 4).fill(200);
  const removed = removeOverlaysFromBuffer(data, w, h, [
    { box_2d: [0, 0, 900, 900], label: 'huge overlay', kind: 'logo' },
    { box_2d: [10, 10, 80, 80], label: 'timestamp', kind: 'timestamp' },
  ]);
  assert.equal(removed, 1);
});
