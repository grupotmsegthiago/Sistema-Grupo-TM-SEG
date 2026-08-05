/**
 * Dispara o sync de clientes no Asaas em PRODUÇÃO (chaves válidas na Vercel).
 *
 *   npx tsx --env-file=.env scripts/run-prod-asaas-customer-sync.ts
 *
 * Usa CRON_SECRET do .env (mesmo valor da Vercel).
 */
function loadCronSecret(): string {
  return String(process.env.CRON_SECRET || '').trim();
}

async function main() {
  const secret = loadCronSecret();
  if (!secret) {
    console.error('CRON_SECRET ausente no .env');
    process.exit(1);
  }
  const base = String(process.env.TMSEG_PUBLIC_URL || 'https://sistema.grupotmseg.com.br').replace(/\/$/, '');
  const limit = 2;
  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const failures: string[] = [];
  const skipped: string[] = [];

  console.log(`[prod-sync] ${base}/api/asaas/sync-customers`);

  for (let round = 0; round < 100; round++) {
    const res = await fetch(`${base}/api/asaas/sync-customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-cron-secret': secret,
      },
      body: JSON.stringify({ limit, offset }),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      console.error(`[prod-sync] Resposta inválida HTTP ${res.status}: ${text.slice(0, 200)}`);
      process.exit(1);
    }
    if (res.status === 401 || res.status === 403) {
      console.error(`[prod-sync] Auth falhou (${res.status}): ${data.error || text}`);
      process.exit(1);
    }
    if (res.status === 404) {
      console.error('[prod-sync] Endpoint ainda não publicado na Vercel. Publique e rode de novo.');
      process.exit(1);
    }

    totalProcessed += Number(data.processed || 0);
    totalUpdated += Number(data.updated || 0);
    totalSkipped += Number(data.skipped || 0);
    totalErrors += Number(data.errors || 0);

    for (const r of data.results || []) {
      if (r.skipped) skipped.push(`#${r.clientId} ${r.name}: ${r.skipReason}`);
      for (const c of r.companies || []) {
        if (!c.ok) failures.push(`#${r.clientId} ${r.name} @ ${c.company}: ${c.error}`);
        else console.log(`  OK #${r.clientId} ${r.name} @ ${c.company} → ${c.customerId}`);
      }
      if (r.skipped) console.log(`  SKIP #${r.clientId} ${r.name}: ${r.skipReason}`);
    }

    console.log(
      `[prod-sync] lote offset=${offset} http=${res.status} processed=${data.processed} errors=${data.errors} next=${data.nextOffset}`,
    );

    if (data.nextOffset == null) break;
    offset = Number(data.nextOffset);
  }

  console.log('\n[prod-sync] Resumo');
  console.log(`  processados: ${totalProcessed}`);
  console.log(`  sincronizados (conta×cliente): ${totalUpdated}`);
  console.log(`  pulados: ${totalSkipped}`);
  console.log(`  erros: ${totalErrors}`);
  if (skipped.length) {
    console.log('\nPulados:');
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (failures.length) {
    console.log('\nFalhas:');
    for (const f of failures.slice(0, 40)) console.log(`  - ${f}`);
    if (failures.length > 40) console.log(`  … +${failures.length - 40} falhas`);
    process.exitCode = 1;
  } else {
    console.log('\nConcluído sem erros de API.');
  }
}

main().catch((e) => {
  console.error('[prod-sync] FATAL:', e?.message || e);
  process.exit(1);
});
