/**
 * Corrige snapshots com clientTableId divergente do tableName/activationFee congelados.
 * Cenário: OS aprovada com tableName correto (ex. ITAJAI R$ 12.200) mas ID apontando
 * para outra tabela (ex. SÃO JOSÉ R$ 35.000) — auditoria falso ERRO.
 *
 * Uso:
 *   npx tsx scripts/fix-snapshot-table-ids.ts           # dry-run (lista)
 *   npx tsx scripts/fix-snapshot-table-ids.ts --apply   # grava no Supabase
 */
import { createClient } from '@supabase/supabase-js';
import {
  auditMissionsBatch,
  clearMissionBillingAuditCache,
  computeMissionBillingAudit,
  getSnapshotClientTableCorrection,
} from '../lib/missionBillingAudit';
import type { Mission } from '../types';

const cfg = {
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co',
  key:
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk',
};

const APPLY = process.argv.includes('--apply');
const SCRIPT_TAG = 'SCRIPT_FIX_SNAPSHOT_TABLE';

async function fetchAll<T>(sb: ReturnType<typeof createClient>, table: string): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select('*').range(from, from + pageSize - 1);
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

function buildCorrectedSnapshot(
  snap: Record<string, unknown>,
  table: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...snap,
    clientTableId: table.id,
    tableName: table.operation_type ?? snap.tableName,
    activationFee: table.activation_fee ?? snap.activationFee,
    franchiseKm: table.franchise_km ?? snap.franchiseKm,
    franchiseHours: table.franchise_hours ?? snap.franchiseHours,
    unitKm: table.price_per_extra_km ?? snap.unitKm,
    unitHr: table.price_per_extra_hour ?? snap.unitHr,
    snapshot_resynced_at: new Date().toISOString(),
    snapshot_resynced_by: SCRIPT_TAG,
  };
}

async function main() {
  const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: false } });

  console.log(`\n▶ Modo: ${APPLY ? 'APLICAR (--apply)' : 'DRY-RUN (adicione --apply para gravar)'}\n`);

  const [missionsRaw, clientTables, providerTables, clients, providers] = await Promise.all([
    fetchAll<Record<string, unknown>>(sb, 'missions'),
    fetchAll(sb, 'client_price_tables'),
    fetchAll(sb, 'provider_cost_tables'),
    fetchAll(sb, 'clients'),
    fetchAll(sb, 'providers'),
  ]);

  const missions = missionsRaw.map(mapMission);
  const withSnap = missions.filter((m) => {
    const snap = (m as any).snapshot_data;
    return snap && typeof snap === 'object' && snap.clientTableId;
  });

  console.log(`   ${missions.length} missões | ${withSnap.length} com snapshot clientTableId\n`);

  clearMissionBillingAuditCache();
  const auditBefore = auditMissionsBatch(
    withSnap,
    clientTables as any,
    providerTables as any,
    clients as any,
    providers as any,
  );

  const fixes: Array<{
    mission: Mission;
    correction: ReturnType<typeof getSnapshotClientTableCorrection>;
    auditBefore: string;
    auditAfter?: string;
    updatedSnap: Record<string, unknown>;
  }> = [];

  for (const m of withSnap) {
    const correction = getSnapshotClientTableCorrection(m, clientTables as any);
    if (!correction.needsFix || !correction.correctedTable) continue;

    const before = auditBefore.get(m.id!)?.overallStatus || '?';
    const updatedSnap = buildCorrectedSnapshot(
      (m as any).snapshot_data as Record<string, unknown>,
      correction.correctedTable as any,
    );

    fixes.push({
      mission: m,
      correction,
      auditBefore: before,
      updatedSnap,
    });
  }

  console.log('══════════════════════════════════════════');
  console.log(`  SNAPSHOT clientTableId — correções: ${fixes.length}`);
  console.log('══════════════════════════════════════════\n');

  if (fixes.length === 0) {
    console.log('✓ Nenhuma OS com divergência clientTableId x tableName.\n');
    return;
  }

  fixes.slice(0, 30).forEach(({ mission: m, correction: c, auditBefore: ab }) => {
    const oldTable = clientTables.find((t) => String(t.id) === c.currentId);
    console.log(`  ${m.id} | audit antes: ${ab}`);
    console.log(`    DE:  ${oldTable?.operation_type || c.currentId} (fee ${oldTable?.activation_fee ?? '?'})`);
    console.log(`    PARA: ${c.correctedTable?.operation_type} (fee ${c.correctedTable?.activation_fee})`);
    console.log(`    Motivo: ${c.reason}`);
    console.log('');
  });
  if (fixes.length > 30) console.log(`  ... +${fixes.length - 30} OS\n`);

  if (!APPLY) {
    console.log('Dry-run concluído. Rode com --apply para gravar.\n');
    return;
  }

  let ok = 0;
  let fail = 0;
  const auditAfterMap = new Map<string, string>();

  for (const fix of fixes) {
    const { error } = await sb
      .from('missions')
      .update({ snapshot_data: fix.updatedSnap, last_update: new Date().toISOString() })
      .eq('id', fix.mission.id);

    if (error) {
      fail++;
      console.error(`  ✗ ${fix.mission.id}: ${error.message}`);
      continue;
    }

    ok++;
    const patched = {
      ...fix.mission,
      snapshot_data: fix.updatedSnap,
    } as Mission;
    clearMissionBillingAuditCache(fix.mission.id!);
    const clientMatch = (clients as any[]).find(
      (c) => c.name === (fix.mission as any).originalClientName || c.name === fix.mission.client,
    );
    const auditAfter = computeMissionBillingAudit(
      patched,
      clientTables as any,
      providerTables as any,
      clientMatch,
      providers as any,
    );
    auditAfterMap.set(fix.mission.id!, auditAfter.overallStatus);
    fix.auditAfter = auditAfter.overallStatus;
  }

  let improved = 0;
  fixes.forEach((f) => {
    if (f.auditBefore !== 'validado' && f.auditAfter === 'validado') improved++;
  });

  console.log('\n══════════════════════════════════════════');
  console.log(`  Aplicadas: ${ok} | Falhas: ${fail}`);
  console.log(`  Audit 🟢 melhorou: ${improved} OS (erro/atencao → validado)`);
  console.log('══════════════════════════════════════════\n');

  if (fail > 0) {
    console.error('Algumas OS não foram atualizadas (verifique SUPABASE_SERVICE_ROLE_KEY para escrita em massa).');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Falha:', e);
  process.exit(2);
});
