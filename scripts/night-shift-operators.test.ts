import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNightShiftOperatorName,
  resolveShiftTypeForEmployee,
} from '../lib/timeclock/nightShiftOperators.ts';

test('isNightShiftOperatorName reconhece Moacir e Cristiane Aurora', () => {
  assert.equal(isNightShiftOperatorName('MOACIR SILVA'), true);
  assert.equal(isNightShiftOperatorName('CRISTIANE AURORA DA SILVA'), true);
  assert.equal(isNightShiftOperatorName('BEATRIZ DE CARVALHO'), false);
});

test('isNightShiftOperatorName ignora acento', () => {
  assert.equal(isNightShiftOperatorName('Moacir José'), true);
});

test('isNightShiftOperatorName não confunde Michelle Cristiane (diurno)', () => {
  assert.equal(isNightShiftOperatorName('MICHELLE CRISTIANE MONTEIRO'), false);
});

test('resolveShiftTypeForEmployee força noturno para plantão mesmo com RH diurno', () => {
  assert.equal(
    resolveShiftTypeForEmployee({ full_name: 'MOACIR SILVA', shift_type: 'diurno' }),
    'noturno',
  );
  assert.equal(
    resolveShiftTypeForEmployee({ full_name: 'CRISTIANE AURORA DA SILVA', shift_type: 'diurno' }),
    'noturno',
  );
  assert.equal(
    resolveShiftTypeForEmployee({ full_name: 'MICHELLE CRISTIANE MONTEIRO', shift_type: 'diurno' }),
    'diurno',
  );
});
