import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diretoriaAindaAprova, faturamentoAprovadoSemDiretoria } from '../lib/billing/diretoriaApproval';

test('diretoria aprovada volta a pendente quando ela desaprova por último', () => {
  const logs = [
    { stage: 'diretoria', date: '2026-10-01T17:31:00-03:00' },
    { stage: 'diretoria_revogada', date: '2026-10-01T18:00:00-03:00' },
  ];
  assert.equal(diretoriaAindaAprova(logs), false);
  assert.equal(faturamentoAprovadoSemDiretoria(logs), false);
});

test('reaprovação da diretoria depois da desaprovação vale de novo', () => {
  const logs = [
    { stage: 'diretoria', date: '2026-10-01T17:31:00-03:00' },
    { stage: 'diretoria_revogada', date: '2026-10-01T18:00:00-03:00' },
    { stage: 'diretoria', date: '2026-10-01T18:10:00-03:00' },
  ];
  assert.equal(diretoriaAindaAprova(logs), true);
});

test('financeiro permanece quando só a diretoria desaprova', () => {
  const logs = [
    { stage: 'financeiro', date: '2026-08-04T17:04:00-03:00' },
    { stage: 'diretoria', date: '2026-10-01T17:31:00-03:00' },
    { stage: 'diretoria_revogada', date: '2026-10-01T18:00:00-03:00' },
  ];
  assert.equal(diretoriaAindaAprova(logs), false);
  assert.equal(faturamentoAprovadoSemDiretoria(logs), true);
});

test('o botão não grava valor de cliente nem de fornecedor', () => {
  const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
  assert.match(source, /button-unapprove-diretoria/);
  assert.match(source, /diretoria_revogada/);
  const handler = source.slice(source.indexOf('const desaprovarPelaDiretoria'), source.indexOf('const filteredProviderTables'));
  assert.doesNotMatch(handler, /revenue_value/);
  assert.doesNotMatch(handler, /cost_value/);
});
