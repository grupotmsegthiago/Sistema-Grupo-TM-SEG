import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('components/MissionTable.tsx', 'utf8');

test('MissionTable importa MissionOperationalReport usado no JSX', () => {
  assert.match(source, /import MissionOperationalReport from '\.\/MissionOperationalReport';/);
  assert.match(source, /<MissionOperationalReport\b/);
});
