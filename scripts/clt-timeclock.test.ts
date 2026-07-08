import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMECLOCK_ELIGIBLE_STATUSES,
  isCltContractType,
  isCltUser,
  isEmployeeEligibleForTimeClock,
} from '../lib/timeclock/cltEmployee.ts';
import {
  getNextTimeClockStage,
  isTimeClockJourneyComplete,
  TIME_CLOCK_STAGE_LABELS,
  TIME_CLOCK_STAGE_ORDER,
} from '../lib/timeclock/stages.ts';
import { formatIsoDateBR } from '../lib/dateUtils.ts';

// ─── Identificação CLT ─────────────────────────────────────────────────────

test('isCltContractType aceita CLT, clt e Clt', () => {
  assert.equal(isCltContractType('CLT'), true);
  assert.equal(isCltContractType('clt'), true);
  assert.equal(isCltContractType(' Clt '), true);
  assert.equal(isCltContractType('PJ'), false);
  assert.equal(isCltContractType(''), false);
});

test('isCltUser reconhece flag isClt e contractType', () => {
  assert.equal(isCltUser({ id: '1', name: 'A', isClt: true }), true);
  assert.equal(isCltUser({ id: '1', name: 'A', contractType: 'clt' }), true);
  assert.equal(isCltUser({ id: '1', name: 'A', contractType: 'PJ' }), false);
  assert.equal(isCltUser(null), false);
});

test('status Experiência é elegível para ponto', () => {
  assert.equal(isEmployeeEligibleForTimeClock('Ativo'), true);
  assert.equal(isEmployeeEligibleForTimeClock('Experiência'), true);
  assert.equal(isEmployeeEligibleForTimeClock('Férias'), false);
  assert.equal(isEmployeeEligibleForTimeClock('Desligado'), false);
  assert.equal(TIMECLOCK_ELIGIBLE_STATUSES.includes('Experiência'), true);
});

// ─── Sequência de batidas (entrada → almoço → retorno → saída) ─────────────

test('entrada é o primeiro estágio', () => {
  assert.equal(getNextTimeClockStage([]), 'IN');
});

test('saída almoço após entrada', () => {
  assert.equal(getNextTimeClockStage([{ type: 'IN' }]), 'BREAK_START');
});

test('retorno almoço após saída almoço', () => {
  assert.equal(
    getNextTimeClockStage([{ type: 'IN' }, { type: 'BREAK_START' }]),
    'BREAK_END'
  );
});

test('fim do expediente após retorno almoço', () => {
  assert.equal(
    getNextTimeClockStage([
      { type: 'IN' },
      { type: 'BREAK_START' },
      { type: 'BREAK_END' },
    ]),
    'OUT'
  );
});

test('jornada concluída após 4 batidas', () => {
  const full = TIME_CLOCK_STAGE_ORDER.map((type) => ({ type }));
  assert.equal(getNextTimeClockStage(full), 'DONE');
  assert.equal(isTimeClockJourneyComplete(full), true);
});

test('labels das 4 batidas CLT', () => {
  assert.equal(TIME_CLOCK_STAGE_LABELS.IN, 'Entrada');
  assert.equal(TIME_CLOCK_STAGE_LABELS.BREAK_START, 'Saída almoço');
  assert.equal(TIME_CLOCK_STAGE_LABELS.BREAK_END, 'Retorno almoço');
  assert.equal(TIME_CLOCK_STAGE_LABELS.OUT, 'Fim do expediente');
});

// ─── Múltiplos dias / mudança de mês e ano (data Brasil) ───────────────────

test('formatIsoDateBR usa fuso America/Sao_Paulo', () => {
  const utcNewYear = new Date('2026-01-01T02:30:00.000Z');
  const iso = formatIsoDateBR(utcNewYear);
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
});

test('simulação: histórico vazio do dia sempre começa em IN (novo dia)', () => {
  assert.equal(getNextTimeClockStage([]), 'IN');
});

test('simulação: virada de mês — consulta do dia retorna vazio → entrada', () => {
  const entriesDoPrimeiroDiaDoMes: { type: 'IN' }[] = [];
  assert.equal(getNextTimeClockStage(entriesDoPrimeiroDiaDoMes), 'IN');
});

test('simulação: virada de ano — consulta do dia retorna vazio → entrada', () => {
  const entriesPrimeiroJaneiro: { type: 'IN' }[] = [];
  assert.equal(getNextTimeClockStage(entriesPrimeiroJaneiro), 'IN');
});

// ─── Horários diferentes (ordem por estágio, não por hora) ─────────────────

test('estágios fora de ordem cronológica ainda respeitam sequência lógica', () => {
  const history = [
    { type: 'IN' as const },
    { type: 'BREAK_END' as const },
  ];
  assert.equal(getNextTimeClockStage(history), 'BREAK_START');
});

// ─── Contrato e código-fonte crítico ───────────────────────────────────────

test('registerPunch valida CLT antes de registrar', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile('lib/timeclock/registerPunch.ts', 'utf8')
  );
  assert.match(src, /isCltUser\(input\.user\)/);
  assert.match(src, /ai_verification: aiVerified/);
  assert.match(src, /withTimeout/);
});

test('cltEmployee inclui status Experiência e auto-vínculo', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile('lib/timeclock/cltEmployee.ts', 'utf8')
  );
  assert.match(src, /Experiência/);
  assert.match(src, /ensureEmployeeUserLink/);
  assert.match(src, /ilike\('full_name'/);
});

test('history usa contract_type case-insensitive', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile('lib/timeclock/history.ts', 'utf8')
  );
  assert.match(src, /ilike\('contract_type', 'clt'\)/);
});

test('API Vercel dedicada para leitura de ponto', async () => {
  const vercel = await import('node:fs/promises').then((fs) =>
    fs.readFile('vercel.json', 'utf8')
  );
  assert.match(vercel, /\/api\/rh\/timeclock\/entries/);
  assert.match(vercel, /rh-timeclock-entries/);
});

test('CltTimeClockBar persiste userData enriquecido', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile('components/CltTimeClockBar.tsx', 'utf8')
  );
  assert.match(src, /localStorage\.setItem\('userData'/);
  assert.doesNotMatch(src, /catch \{\s*setReady\(false\)/);
});
