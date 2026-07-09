import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveStatusForSaveSubmit,
  statusToRestoreOnFinalizeCancel,
  MISSION_PRE_FLIGHT_STATUSES,
} from '../lib/missionSaveStatus';
import { MissionStatus } from '../types';

test('MISSION_PRE_FLIGHT_STATUSES cobre fase de documentação/agendamento', () => {
  assert.deepEqual(MISSION_PRE_FLIGHT_STATUSES, [
    MissionStatus.SOLICITED,
    MissionStatus.DOCUMENTATION,
    MissionStatus.SCHEDULED,
  ]);
});

test('Salvar em Documentação com Concluída selecionada por engano preserva status', () => {
  const resolved = resolveStatusForSaveSubmit({
    missionStatus: MissionStatus.DOCUMENTATION,
    editStatus: MissionStatus.COMPLETED,
    originalStatus: MissionStatus.DOCUMENTATION,
    finalizeConfirmed: false,
  });
  assert.equal(resolved, MissionStatus.DOCUMENTATION);
});

test('Salvar em Agendada com Cancelada selecionada preserva Agendada', () => {
  const resolved = resolveStatusForSaveSubmit({
    missionStatus: MissionStatus.SCHEDULED,
    editStatus: MissionStatus.CANCELLED,
    originalStatus: MissionStatus.SCHEDULED,
    finalizeConfirmed: false,
  });
  assert.equal(resolved, MissionStatus.SCHEDULED);
});

test('Após confirmar checklist, Salvar respeita status terminal escolhido', () => {
  const resolved = resolveStatusForSaveSubmit({
    missionStatus: MissionStatus.DOCUMENTATION,
    editStatus: MissionStatus.COMPLETED,
    originalStatus: MissionStatus.DOCUMENTATION,
    finalizeConfirmed: true,
  });
  assert.equal(resolved, MissionStatus.COMPLETED);
});

test('OS Em Viagem com Concluída não é alterada pelo resolver de save', () => {
  const resolved = resolveStatusForSaveSubmit({
    missionStatus: MissionStatus.IN_TRANSIT,
    editStatus: MissionStatus.COMPLETED,
    originalStatus: MissionStatus.IN_TRANSIT,
    finalizeConfirmed: false,
  });
  assert.equal(resolved, MissionStatus.COMPLETED);
});

test('cancelar finalização restaura status original da OS', () => {
  assert.equal(
    statusToRestoreOnFinalizeCancel({
      originalStatus: MissionStatus.DOCUMENTATION,
      missionStatus: MissionStatus.SCHEDULED,
    }),
    MissionStatus.DOCUMENTATION,
  );
});
