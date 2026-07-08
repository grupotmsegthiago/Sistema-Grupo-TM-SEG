import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMECLOCK_ELIGIBLE_STATUSES,
  isCltContractType,
  isCltUser,
  isEmployeeEligibleForTimeClock,
} from '../lib/timeclock/cltEmployee.ts';
import {
  isOperationalRole,
  requiresTimeclockUser,
} from '../lib/timeclock/eligibility.ts';
import {
  getNextTimeClockStage,
  isTimeClockJourneyComplete,
  TIME_CLOCK_STAGE_LABELS,
  TIME_CLOCK_STAGE_ORDER,
} from '../lib/timeclock/stages.ts';
import { formatIsoDateBR } from '../lib/dateUtils.ts';
import { extractUserIdFromToken } from '../lib/rh/apiEmployeesAuth.ts';

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

test('requiresTimeclockUser inclui perfis operacionais', () => {
  assert.equal(requiresTimeclockUser({ id: '1', name: 'Op', role: 'Operador' }), true);
  assert.equal(requiresTimeclockUser({ id: '2', name: 'Adv', role: 'AVANÇADO' }), true);
  assert.equal(requiresTimeclockUser({ id: '3', name: 'Dir', role: 'Diretoria' }), false);
  assert.equal(isOperationalRole('operacional'), true);
});

test('namesLikelyMatch vincula Daniel Pinto ao cadastro RH', async () => {
  const { namesLikelyMatch } = await import('../lib/timeclock/nameMatch.ts');
  assert.equal(namesLikelyMatch('DANIEL LUIZ LIMA PINTO', 'Daniel Pinto'), true);
  assert.equal(namesLikelyMatch('BEATRIZ DE CARVALHO SIMÕES', 'Beatriz'), true);
  assert.equal(namesLikelyMatch('FABRÍCIO HONORATO', 'Michelle'), false);
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

test('registerPunch valida elegibilidade antes de registrar', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile('lib/timeclock/registerPunch.ts', 'utf8')
  );
  assert.match(src, /requiresTimeclockUser/);
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

test('extractUserIdFromToken aceita ID numérico e UUID', () => {
  assert.equal(extractUserIdFromToken('tmseg-token-5-1783516873131'), '5');
  assert.equal(
    extractUserIdFromToken('tmseg-token-550e8400-e29b-41d4-a716-446655440000-99'),
    '550e8400-e29b-41d4-a716-446655440000',
  );
  assert.equal(extractUserIdFromToken('impersonation-token-23-1000'), '23');
  assert.equal(extractUserIdFromToken('invalid'), null);
});

test('API Vercel dedicada para leitura de ponto', async () => {
  const vercel = await import('node:fs/promises').then((fs) =>
    fs.readFile('vercel.json', 'utf8')
  );
  assert.match(vercel, /\/api\/rh\/timeclock\/entries/);
  assert.match(vercel, /rh-timeclock-entries/);
  assert.match(vercel, /\/api\/rh\/timeclock\/punch/);
  assert.match(vercel, /rh-timeclock-punch/);
  assert.match(vercel, /\/api\/rh\/timeclock\/init/);
  assert.match(vercel, /rh-timeclock-init/);
});

test('botão de ponto no header persiste userData enriquecido', async () => {
  const hookSrc = await import('node:fs/promises').then((fs) =>
    fs.readFile('lib/services/useTimeClockButton.ts', 'utf8')
  );
  assert.match(hookSrc, /localStorage\.setItem\('userData'/);

  const headerBtn = await import('node:fs/promises').then((fs) =>
    fs.readFile('components/TimeClockHeaderButton.tsx', 'utf8')
  );
  assert.match(headerBtn, /button-bater-ponto-header/);
  assert.match(headerBtn, /useTimeClockButton/);

  const header = await import('node:fs/promises').then((fs) =>
    fs.readFile('components/Header.tsx', 'utf8')
  );
  assert.match(header, /TimeClockHeaderButton/);
});
