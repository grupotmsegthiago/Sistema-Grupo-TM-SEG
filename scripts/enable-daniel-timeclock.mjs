#!/usr/bin/env node
/**
 * @deprecated Use scripts/disable-daniel-timeclock.mjs
 * Daniel (auditor) não bate ponto — este script agora apenas desativa a flag no RH.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const disable = path.join(process.cwd(), 'scripts', 'disable-daniel-timeclock.mjs');
const r = spawnSync(process.execPath, [disable], { stdio: 'inherit' });
process.exit(r.status ?? 1);
