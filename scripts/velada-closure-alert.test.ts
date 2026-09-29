import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  VELADA_CLOSURE_ESCALATION_MS,
  getVeladaClosureMissing,
  isThiagoVeladaEscalationUser,
  isVeladaClosureOverdue,
  veladaClosureApplies,
  veladaClosureOperatorMatches,
  veladaFinalKmIsValid,
} from '../lib/veladaClosureAlert';

const base = {
  status: 'Concluída',
  provider: 'ATIVA SEGURANÇA',
  mission_type: 'Velada',
  end_km: 0,
  end_time: null as string | null,
  velada_toll_confirmed: false,
};

test('só velada concluída de ATIVA ou TM SEG entra no alerta', () => {
  assert.equal(veladaClosureApplies(base), true);
  assert.equal(veladaClosureApplies({ ...base, provider: 'TM SEGURANÇA' }), true);
  assert.equal(veladaClosureApplies({ ...base, provider: 'DOMAIN' }), false);
  assert.equal(veladaClosureApplies({ ...base, mission_type: 'Caracterizada' }), false);
  assert.equal(veladaClosureApplies({ ...base, status: 'Em Viagem' }), false);
});

test('alerta pede KM final, hora final e pedágio', () => {
  assert.deepEqual(getVeladaClosureMissing(base), ['KM FINAL', 'HORA FINAL', 'PEDÁGIO']);
  assert.deepEqual(
    getVeladaClosureMissing({ ...base, end_km: 1200, end_time: '2026-09-29T18:00:00.000Z' }, true),
    [],
  );
  assert.deepEqual(
    getVeladaClosureMissing({ ...base, end_km: 1200, end_time: '2026-09-29T18:00:00.000Z', velada_toll_confirmed: true }),
    [],
  );
});

test('pedágio zero confirmado tira o item da lista', () => {
  assert.deepEqual(
    getVeladaClosureMissing({ ...base, end_km: 10, end_time: '2026-09-29T18:00:00.000Z' }, true),
    [],
  );
});

test('48 horas sem concluir fica atrasado', () => {
  const opened = '2026-09-27T12:00:00.000Z';
  const before = new Date(opened).getTime() + VELADA_CLOSURE_ESCALATION_MS - 1000;
  const after = new Date(opened).getTime() + VELADA_CLOSURE_ESCALATION_MS;
  assert.equal(isVeladaClosureOverdue(opened, before), false);
  assert.equal(isVeladaClosureOverdue(opened, after), true);
});

test('alerta fica no operador que finalizou', () => {
  assert.equal(veladaClosureOperatorMatches('Lucas Silva', 'lucas silva'), true);
  assert.equal(veladaClosureOperatorMatches('Lucas Silva', 'Beatriz Rocha'), false);
});

test('escalação vermelha é a conta do Thiago', () => {
  assert.equal(isThiagoVeladaEscalationUser({ email: 'thiago@grupotmseg.com.br' }), true);
  assert.equal(isThiagoVeladaEscalationUser({ name: 'Thiago Moreira' }), true);
  assert.equal(isThiagoVeladaEscalationUser({ email: 'thiago.arruda@grupotmseg.com.br', name: 'Thiago Arruda' }), false);
});

test('KM final não pode ser menor que o inicial', () => {
  assert.equal(veladaFinalKmIsValid(100, 80), true);
  assert.equal(veladaFinalKmIsValid(50, 80), false);
  assert.equal(veladaFinalKmIsValid(0, 0), false);
});

test('o aviso da velada fecha e fica pendente até salvar', () => {
  const src = fs.readFileSync('components/VeladaClosureAlert.tsx', 'utf8');
  assert.match(src, /button-velada-closure-close/);
  assert.match(src, /button-velada-closure-dismiss/);
  assert.match(src, /velada-closure-pending-pill/);
  assert.match(src, /setDismissed\(true\)/);
  assert.doesNotMatch(src, /para liberar a tela/);
});
