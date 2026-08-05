/**
 * Uso único / operacional: sincroniza clientes Ativos → Asaas (3 CNPJs).
 *
 *   npx tsx --env-file=.env scripts/sync-clients-to-asaas.ts
 *   npx tsx --env-file=.env scripts/sync-clients-to-asaas.ts --dry-run
 *   npx tsx --env-file=.env scripts/sync-clients-to-asaas.ts --client=123
 */
import { runAsaasSyncCustomers } from '../lib/asaasSyncCustomersCore.ts';

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | undefined {
  const pref = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const clientId = argValue('--client');
  const batchSize = Math.min(Math.max(Number(argValue('--limit') || 25), 1), 50);

  console.log(`[sync-asaas] Início | dryRun=${dryRun} | batch=${batchSize}${clientId ? ` | client=${clientId}` : ''}`);

  let offset = 0;
  let totalProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const failed: Array<{ clientId: string; name: string; company?: string; error: string }> = [];
  const skippedList: Array<{ clientId: string; name: string; reason: string }> = [];

  for (;;) {
    const batch = await runAsaasSyncCustomers({
      clientId,
      limit: batchSize,
      offset,
      dryRun,
    });

    totalProcessed += batch.processed;
    totalCreated += batch.created;
    totalUpdated += batch.updated;
    totalSkipped += batch.skipped;
    totalErrors += batch.errors;

    for (const r of batch.results) {
      if (r.skipped) {
        skippedList.push({ clientId: r.clientId, name: r.name, reason: r.skipReason || '—' });
        console.log(`  SKIP #${r.clientId} ${r.name}: ${r.skipReason}`);
        continue;
      }
      for (const c of r.companies) {
        if (!c.ok) {
          failed.push({
            clientId: r.clientId,
            name: r.name,
            company: c.company,
            error: c.error || 'erro',
          });
          console.log(`  ERR  #${r.clientId} ${r.name} @ ${c.company}: ${c.error}`);
        } else {
          console.log(`  OK   #${r.clientId} ${r.name} @ ${c.company} → ${c.customerId}`);
        }
      }
    }

    if (clientId || batch.nextOffset == null) break;
    offset = batch.nextOffset;
  }

  console.log('\n[sync-asaas] Resumo');
  console.log(`  processados: ${totalProcessed}`);
  console.log(`  criados (conta×cliente): ${totalCreated}`);
  console.log(`  atualizados (conta×cliente): ${totalUpdated}`);
  console.log(`  pulados: ${totalSkipped}`);
  console.log(`  erros: ${totalErrors}`);
  if (skippedList.length) {
    console.log('\nPulados:');
    for (const s of skippedList) console.log(`  - #${s.clientId} ${s.name}: ${s.reason}`);
  }
  if (failed.length) {
    console.log('\nFalhas:');
    for (const f of failed) console.log(`  - #${f.clientId} ${f.name} @ ${f.company}: ${f.error}`);
    process.exitCode = 1;
  } else {
    console.log('\nConcluído sem erros de API.');
  }
}

main().catch((e) => {
  console.error('[sync-asaas] FATAL:', e?.message || e);
  process.exit(1);
});
