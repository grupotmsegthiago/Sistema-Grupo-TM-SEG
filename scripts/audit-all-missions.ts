/**
 * Audita OS no período configurado (jun/2026 até hoje por padrão).
 * Uso: npx tsx scripts/audit-all-missions.ts
 *      npx tsx scripts/audit-all-missions.ts --all   # ignora filtro de período
 */
import { createClient } from '@supabase/supabase-js';
import {
  clearMissionBillingAuditCache,
  computeMissionBillingAudit,
  computePricingTablesHash,
  indexBillingAdjustments,
  type MissionBillingAuditResult,
} from '../lib/missionBillingAudit';
import {
  BILLING_AUDIT_MIN_START,
  filterMissionsForBillingAudit,
  getBillingAuditBatchDateRange,
} from '../lib/missionBillingAuditConfig';
import type { Mission } from '../types';

const AUDIT_ALL = process.argv.includes('--all');

const cfg = {
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co',
  anonKey:
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk',
};

async function fetchAll<T>(sb: ReturnType<typeof createClient>, table: string, select = '*'): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw error;
    if (data) all = all.concat(data as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function mapMission(m: Record<string, unknown>): Mission {
  return {
    ...m,
    startKm: m.start_km,
    endKm: m.end_km,
    startTime: m.start_time,
    endTime: m.end_time,
    originalClientName: m.client,
  } as Mission;
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function main() {
  const sb = createClient(cfg.url, cfg.anonKey);

  console.log('▶ Carregando dados do Supabase...');
  const [missionsRaw, clientTables, providerTables, clients, providers] = await Promise.all([
    fetchAll<Record<string, unknown>>(sb, 'missions'),
    fetchAll(sb, 'client_price_tables'),
    fetchAll(sb, 'provider_cost_tables'),
    fetchAll(sb, 'clients'),
    fetchAll(sb, 'providers'),
  ]);

  const fetchBillingAdjustments = async () => {
    let all: Array<{ entity_id?: string; details?: unknown; created_at?: string }> = [];
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('system_logs')
        .select('entity_id, details, created_at')
        .eq('entity', 'BillingAdjustment')
        .order('created_at', { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      if (data) all = all.concat(data as any);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    return indexBillingAdjustments(all);
  };
  const billingAdjustmentsMap = await fetchBillingAdjustments();
  console.log(`   BillingAdjustment carregados: ${billingAdjustmentsMap.size}`);

  const missionsAll = missionsRaw.map(mapMission);
  const asOf = new Date();
  const [periodStart, periodEnd] = getBillingAuditBatchDateRange(asOf);
  const missions = AUDIT_ALL
    ? missionsAll
    : filterMissionsForBillingAudit(missionsAll, asOf);

  console.log(`   ${missionsAll.length} missões no banco`);
  if (AUDIT_ALL) {
    console.log('   Modo --all: auditando todas (sem filtro de período)');
  } else {
    console.log(
      `   Período auditoria: ${periodStart.toLocaleDateString('pt-BR')} → ${periodEnd.toLocaleDateString('pt-BR')} (${missions.length} OS)`,
    );
    console.log(`   (OS anteriores a ${BILLING_AUDIT_MIN_START} ficam fora — regra permanente para novas OS)`);
  }

  clearMissionBillingAuditCache();

  const tablesHash = computePricingTablesHash(clientTables as any, providerTables as any);
  const auditMap = new Map<string, MissionBillingAuditResult>();
  const total = missions.length;
  let done = 0;

  for (const m of missions) {
    const clientMatch = (clients as any[]).find(
      (c) => c.name === (m as any).originalClientName || c.name === m.client,
    );
    auditMap.set(
      m.id!,
      computeMissionBillingAudit(
        m,
        clientTables as any,
        providerTables as any,
        clientMatch,
        providers as any,
        tablesHash,
        m.id ? billingAdjustmentsMap.get(m.id) : undefined,
      ),
    );
    done++;
    if (done % 250 === 0 || done === total) {
      console.log(`   Auditoria: ${done}/${total} (${Math.round((done / total) * 100)}%)`);
    }
  }

  const stats = { validado: 0, atencao: 0, erro: 0, pendente: 0, skipped: 0 };
  const erros: Array<{ id: string; audit: MissionBillingAuditResult; mission: Mission }> = [];
  const atencoes: typeof erros = [];
  const orphanTables: string[] = [];

  for (const m of missions) {
    const audit = auditMap.get(m.id!);
    if (!audit) continue;

    if (audit.skipped) stats.skipped++;
    else stats[audit.overallStatus]++;

    const snap = (m as any).snapshot_data;
    if (snap?.clientTableId && !(clientTables as any[]).some((t) => String(t.id) === String(snap.clientTableId))) {
      orphanTables.push(`${m.id}: clientTableId órfão`);
    }
    if (snap?.providerTableId && !(providerTables as any[]).some((t) => String(t.id) === String(snap.providerTableId))) {
      orphanTables.push(`${m.id}: providerTableId órfão`);
    }

    if (audit.overallStatus === 'erro' && !audit.skipped) {
      erros.push({ id: m.id!, audit, mission: m });
    } else if (audit.overallStatus === 'atencao') {
      atencoes.push({ id: m.id!, audit, mission: m });
    }
  }

  const comparavel = missions.filter((m) => {
    const a = auditMap.get(m.id!);
    return a && !a.skipped;
  });

  console.log('\n══════════════════════════════════════════');
  console.log(AUDIT_ALL ? '  RELATÓRIO AUDITORIA — TODAS AS OS' : '  RELATÓRIO AUDITORIA — JUN/2026 ATÉ HOJE');
  console.log('══════════════════════════════════════════');
  console.log(`Total missões no banco:     ${missionsAll.length}`);
  console.log(`No período auditado:        ${missions.length}`);
  console.log(`Auditáveis (com valores):   ${comparavel.length}`);
  console.log(`Pendentes / sem dados:      ${stats.skipped}`);
  console.log('');
  console.log(`🟢 VALIDADO:  ${stats.validado}`);
  console.log(`🟡 ATENÇÃO:   ${stats.atencao}`);
  console.log(`🔴 ERRO:      ${stats.erro}`);
  console.log('');

  if (orphanTables.length > 0) {
    console.log(`⚠ Tabelas órfãs no snapshot: ${orphanTables.length}`);
    orphanTables.slice(0, 15).forEach((l) => console.log(`   ${l}`));
    if (orphanTables.length > 15) console.log(`   ... +${orphanTables.length - 15} mais`);
    console.log('');
  }

  if (atencoes.length > 0) {
    console.log('── ATENÇÃO (< R$ 1,00) ──');
    atencoes.slice(0, 10).forEach(({ id, audit }) => {
      console.log(
        `  ${id} | cliente Δ ${fmt(audit.client.diferenca)} | fornecedor Δ ${fmt(audit.provider.diferenca)}`,
      );
    });
    if (atencoes.length > 10) console.log(`  ... +${atencoes.length - 10} mais`);
    console.log('');
  }

  if (erros.length > 0) {
    console.log('── ERROS (primeiras 25) ──');
    erros.slice(0, 25).forEach(({ id, audit, mission }) => {
      console.log(`\n  ${id} | ${mission.client} | ${mission.status}`);
      console.log(`  Conclusão: ${audit.resumo.conclusao}`);
      audit.resumo.pontos.slice(0, 4).forEach((p) => console.log(`    • ${p}`));
      if (audit.client.motivos.length) console.log(`    Motivos cliente: ${audit.client.motivos.join('; ')}`);
      if (audit.provider.motivos.length) console.log(`    Motivos fornec.: ${audit.provider.motivos.join('; ')}`);
    });
    if (erros.length > 25) console.log(`\n  ... +${erros.length - 25} OS com erro`);
  } else {
    console.log('✓ Nenhuma OS com ERRO entre as auditáveis.');
  }

  // Amostra: revalidar 3 OS aprovadas com snapshot (regra principal)
  const comSnapshot = missions.filter(
    (m) => (m as any).billing_approved && (m as any).snapshot_data?.clientTableId,
  );
  let snapshotOk = 0;
  let snapshotFail = 0;
  for (const m of comSnapshot) {
    const a = auditMap.get(m.id!);
    if (!a || a.skipped) continue;
    if (a.overallStatus === 'validado') snapshotOk++;
    else snapshotFail++;
  }

  console.log('\n── OS APROVADAS COM SNAPSHOT ──');
  console.log(`  Total: ${comSnapshot.length}`);
  console.log(`  🟢 VALIDADO: ${snapshotOk}`);
  console.log(`  🔴/🟡 divergentes: ${snapshotFail}`);

  console.log('\n══════════════════════════════════════════');
  const taxaOk = comparavel.length > 0 ? ((stats.validado / comparavel.length) * 100).toFixed(1) : '0';
  console.log(`Taxa VALIDADO: ${taxaOk}% (${stats.validado}/${comparavel.length})`);
  console.log('══════════════════════════════════════════\n');

  process.exit(erros.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Falha:', e);
  process.exit(2);
});
