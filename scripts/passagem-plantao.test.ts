import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPassagemPlantao } from '../lib/passagemPlantao';

test('passagem de plantão soma os status do exemplo', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => ({ status: 'NA ORIGEM' })),
    ...Array.from({ length: 5 }, () => ({ status: 'EM VIAGEM' })),
    ...Array.from({ length: 2 }, () => ({ status: 'PERNOITE' })),
    ...Array.from({ length: 2 }, () => ({ status: 'FINALIZADO' })),
    ...Array.from({ length: 8 }, () => ({ status: 'AGENDADA' })),
  ];
  const passagem = buildPassagemPlantao(rows, '29/09/2026', 'Moacir');
  assert.equal(passagem.total, 23);
  assert.equal(passagem.linhas.find((line) => line.label === 'CANCELADAS')?.total, 0);
  assert.equal(passagem.linhas.find((line) => line.label === 'NA ORIGEM')?.total, 6);
  assert.match(passagem.texto, /\*PASSAGEM DE PLANTÃO\*/);
  assert.match(passagem.texto, /📍 \*NA ORIGEM:\* 6/);
  assert.match(passagem.texto, /📊 \*TOTAL:\* 23/);
  assert.match(passagem.texto, /Moacir/);
  assert.equal(passagem.texto.includes('OUTROS'), false);
});
