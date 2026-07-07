#!/usr/bin/env npx tsx
/**
 * Verifica SMTP e lista canais de e-mail do sistema.
 * Uso: npx tsx scripts/email-health-check.ts [--send=email@exemplo.com]
 */
import { runEmailHealthCheck } from '../server/emailHealth';

const sendArg = process.argv.find((a) => a.startsWith('--send='));
const sendTestTo = sendArg ? sendArg.split('=')[1] : undefined;

runEmailHealthCheck(sendTestTo ? { sendTestTo } : undefined)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
