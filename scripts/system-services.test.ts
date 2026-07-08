import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roleCanAccessSystemDiagnostics,
} from '../lib/services/systemAccess.ts';
import {
  serializeTeamPunchLookup,
  deserializeTeamPunchLookup,
} from '../lib/services/teamPunchService.ts';
import { buildTeamPunchLookup } from '../lib/timeclock/teamPunchBoard.ts';

test('roleCanAccessSystemDiagnostics permite diretoria, administrador, rh e ceo', () => {
  assert.equal(roleCanAccessSystemDiagnostics('diretoria'), true);
  assert.equal(roleCanAccessSystemDiagnostics('administrador'), true);
  assert.equal(roleCanAccessSystemDiagnostics('rh'), true);
  assert.equal(roleCanAccessSystemDiagnostics('ceo'), true);
  assert.equal(roleCanAccessSystemDiagnostics('operador'), false);
  assert.equal(roleCanAccessSystemDiagnostics('comercial'), false);
});

test('serialize/deserialize TeamPunchLookup mantém batidas por usuário', () => {
  const lookup = buildTeamPunchLookup([
    {
      user_id: '5',
      user_name: 'Michelle Cristiane',
      type: 'IN',
      timestamp: '2026-07-08T10:00:00.000Z',
    },
    {
      user_id: '5',
      user_name: 'Michelle Cristiane',
      type: 'BREAK_START',
      timestamp: '2026-07-08T13:00:00.000Z',
    },
  ]);
  const raw = serializeTeamPunchLookup(lookup);
  const restored = deserializeTeamPunchLookup(raw);
  assert.equal(restored.byUserId.get('5')?.length, 2);
  assert.equal(restored.byUserId.get('5')?.[0].type, 'IN');
});

test('API system-diagnostics e rh-team-presence-board existem', async () => {
  const fs = await import('node:fs/promises');
  const diag = await fs.readFile('api/system-diagnostics.ts', 'utf8');
  const board = await fs.readFile('api/rh-team-presence-board.ts', 'utf8');
  assert.match(diag, /diagnosticoIntegracoes/);
  assert.match(diag, /assertSystemDiagnosticsAccess/);
  assert.match(board, /loadTeamPresenceBoardData/);
  assert.match(board, /createRhAdminClient/);
});

test('MissionTeamPresenceBoard usa hook unificado useTeamPresenceBoard', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile('components/MissionTeamPresenceBoard.tsx', 'utf8'),
  );
  assert.match(src, /useTeamPresenceBoard/);
  assert.doesNotMatch(src, /useTeamPunchToday/);
});
