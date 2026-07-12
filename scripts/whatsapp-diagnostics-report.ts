#!/usr/bin/env npx tsx
/**
 * Relatório diagnóstico do bot WhatsApp (requer SUPABASE_SERVICE_ROLE_KEY + Z-API no .env ou banco).
 * Uso: npx tsx scripts/whatsapp-diagnostics-report.ts [today|7d|15d]
 */
import { buildWhatsappDiagnosticsReport } from "../server/whatsappDiagnostics";
import { runWhatsappTelemetryMigrations } from "../server/whatsappTelemetry";
import { runWhatsappInstanceMigrations } from "../server/whatsapp/instanceStore";

async function main() {
  const range = (process.argv[2] || "15d") as "today" | "7d" | "15d";
  await runWhatsappInstanceMigrations();
  await runWhatsappTelemetryMigrations();
  const report = await buildWhatsappDiagnosticsReport(range);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
