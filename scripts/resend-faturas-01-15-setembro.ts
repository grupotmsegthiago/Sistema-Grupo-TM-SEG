/**
 * Reenvio único das faturas emitidas de 01/09/2026 a 15/09/2026
 * para os 2 primeiros e-mails do responsável financeiro, com cópia
 * para financeiro@ e thiago@.
 *
 * Uso: npx tsx scripts/resend-faturas-01-15-setembro.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  INVOICE_BILLING_EMAIL_RESEND_FROM,
  INVOICE_BILLING_EMAIL_RESEND_TO,
} from '../lib/billing/invoiceBillingEmailPolicy';

function loadEnvFile() {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadEnvFile();
  if (!process.env.EMAIL_PASS && !process.env.SMTP_PASSWORD) {
    console.error('EMAIL_PASS/SMTP_PASSWORD ausente. O reenvio não foi disparado.');
    process.exit(1);
  }
  const { runPendingInvoiceBillingEmails } = await import('../server/invoiceBillingEmail');
  const result = await runPendingInvoiceBillingEmails({
    fromDate: INVOICE_BILLING_EMAIL_RESEND_FROM,
    toDate: INVOICE_BILLING_EMAIL_RESEND_TO,
    limit: 40,
  });
  console.log(JSON.stringify(result));
  if (result.failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
