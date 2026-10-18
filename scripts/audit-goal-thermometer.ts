/**
 * Audita os 3 cards "Meta Agendada (Hoje)" do DailyGoalThermometer.
 * Reconcilia sumCanonical vs auditMissionFinancials e valida partição geral+DHL=TOTAL.
 *
 * Uso: npx tsx scripts/audit-goal-thermometer.ts
 *      npx tsx scripts/audit-goal-thermometer.ts --date=2026-07-08
 */
import { createClient } from '@supabase/supabase-js';
import {
  computeCanonicalRevenueCost,
  getCanonicalDateRange,
  sumCanonical,
} from '../lib/missionFinancialsCanonical';
import { auditMissionFinancials } from '../lib/financialUtils';
import { MissionStatus } from '../types';

const cfg = {
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co',
  anonKey:
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk',
};

const dateArg = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1];

const isDhl = (name: string) => {
  const n = (name || '').toUpperCase();
  return n.includes('DHL SUPPLY CHAIN') || n.includes('DHL LOGISTICS');
};

const isGeral = (name: string) => !isDhl(name);

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const r2 = (v: number) => Math.round(v * 100) / 100;

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

function getTodayRange(): [Date, Date] {
  if (dateArg) {
    const d = new Date(dateArg + 'T12:00:00');
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return [start, end];
  }
  return getCanonicalDateRange('TODAY');
}

function filterToday(missions: any[], start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return missions.filter((m) => {
    const ref = m.start_time || m.created_at;
    if (!ref) return false;
    const t = new Date(ref).getTime();
    return t >= startMs && t <= endMs;
  });
}

function torresCost(missions: any[], refs: Parameters<typeof sumCanonical>[1], now: Date) {
  const torres = missions.filter((m) => {
    const p = (m.provider || m.provider_name || '').toString().toUpperCase();
    return p.includes('TORRES');
  });
  return sumCanonical(torres, refs, now).cost;
}

async function main() {
  const sb = createClient(cfg.url, cfg.anonKey);
  const [start, end] = getTodayRange();
  const now = new Date();

  console.log('▶ Carregando dados...');
  const [missionsRaw, clientTables, providerTables, clients] = await Promise.all([
    fetchAll<any>(sb, 'missions'),
    fetchAll(sb, 'client_price_tables'),
    fetchAll(sb, 'provider_cost_tables'),
    fetchAll(sb, 'clients'),
  ]);

  const refs = { clientTables: clientTables as any, providerTables: providerTables as any, clientsData: clients as any };
  const todayAll = filterToday(missionsRaw, start, end);
  const todayGeral = todayAll.filter((m) => isGeral(m.client || ''));
  const todayDhl = todayAll.filter((m) => isDhl(m.client || ''));
  const todayNeither = todayAll.filter((m) => !isGeral(m.client || '') && !isDhl(m.client || ''));

  const buckets = [
    { key: 'GERAL', label: 'Meta Agendada (Hoje)', missions: todayGeral, goal: 35000 },
    { key: 'DHL', label: 'Meta Agendada DHL (Hoje)', missions: todayDhl, goal: 40000 },
    { key: 'TOTAL', label: 'Meta Agendada TOTAL (Hoje)', missions: todayAll, goal: 75000 },
  ];

  console.log(`\n📅 Período: ${start.toLocaleString('pt-BR')} → ${end.toLocaleString('pt-BR')}`);
  console.log(`   Missões hoje (todas): ${todayAll.length}`);
  if (todayNeither.length) console.log(`   ⚠ Fora da partição geral/DHL: ${todayNeither.length}`);

  const results: Record<string, ReturnType<typeof sumCanonical> & { torres: number; other: number; goalPct: number }> = {};

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  CARDS — RECONCILIAÇÃO (sumCanonical = fonte do termômetro)');
  console.log('══════════════════════════════════════════════════════════');

  for (const b of buckets) {
    const sums = sumCanonical(b.missions, refs, now);
    const torres = torresCost(b.missions, refs, now);
    const other = Math.max(0, sums.cost - torres);
    const goalPct = b.goal > 0 ? (sums.rev / b.goal) * 100 : 0;
    results[b.key] = { ...sums, torres, other, goalPct };

    console.log(`\n── ${b.label} ──`);
    console.log(`   Missões:           ${sums.count}`);
    console.log(`   Receita:           ${fmt(sums.rev)} (${goalPct.toFixed(1)}% da meta ${fmt(b.goal)})`);
    console.log(`   Custos operac.:    ${fmt(sums.cost)}`);
    console.log(`   Lucro líquido:     ${fmt(sums.profit)} (${sums.rev > 0 ? ((sums.profit / sums.rev) * 100).toFixed(1) : '0.0'}%)`);
    console.log(`   Custo Torres:      ${fmt(torres)}`);
    console.log(`   Custo forneced.:   ${fmt(other)}`);
    console.log(`   Torres+Forneced.:  ${fmt(torres + other)} ${Math.abs(torres + other - sums.cost) < 0.02 ? '✓' : '✗ DIVERGE'}`);
    console.log(`   Rev = base+pedágio: ${fmt(sums.revBase + sums.tollRev)} (disp não somado no tollRev)`);
  }

  // Validação geral + DHL = TOTAL
  const g = results.GERAL;
  const d = results.DHL;
  const t = results.TOTAL;
  const sumRev = r2(g.rev + d.rev);
  const sumCost = r2(g.cost + d.cost);
  const sumCount = g.count + d.count;

  console.log('\n── VALIDAÇÃO PARTIÇÃO GERAL + DHL = TOTAL ──');
  console.log(`   Missões:  ${sumCount} vs TOTAL ${t.count} ${sumCount === t.count ? '✓' : '✗'}`);
  console.log(`   Receita:  ${fmt(sumRev)} vs TOTAL ${fmt(t.rev)} ${Math.abs(sumRev - t.rev) < 0.02 ? '✓' : '✗'}`);
  console.log(`   Custos:   ${fmt(sumCost)} vs TOTAL ${fmt(t.cost)} ${Math.abs(sumCost - t.cost) < 0.02 ? '✓' : '✗'}`);
  console.log(`   Lucro:    ${fmt(r2(sumRev - sumCost))} vs TOTAL ${fmt(t.profit)} ${Math.abs(r2(sumRev - sumCost) - t.profit) < 0.02 ? '✓' : '✗'}`);

  // is_same_os — gap conhecido no computeCanonicalRevenueCost
  const sameOsIssues: any[] = [];
  for (const m of todayAll) {
    if (!m.is_same_os) continue;
    const c = computeCanonicalRevenueCost(m, refs, now);
    if (c.cost > 0.01) {
      sameOsIssues.push({
        id: m.id,
        client: m.client,
        cost_value: m.cost_value,
        canonicalCost: c.cost,
        toll_provider: m.toll_value_provider,
        disp_provider: m.displacement_value_provider,
      });
    }
  }

  console.log('\n── MESMA OS (is_same_os) — custo deveria ser zero ──');
  const sameOsAll = todayAll.filter((m) => m.is_same_os);
  console.log(`   Missões mesma OS hoje: ${sameOsAll.length}`);
  if (sameOsIssues.length === 0) {
    console.log('   ✓ Nenhuma mesma OS com custo canônico > 0');
  } else {
    console.log(`   ✗ ${sameOsIssues.length} missão(ões) com custo inflado no termômetro:`);
    sameOsIssues.slice(0, 10).forEach((x) => {
      console.log(`     ${x.id} | ${x.client} | cost_value=${x.cost_value} → canônico ${fmt(x.canonicalCost)}`);
    });
  }

  // auditMissionFinancials vs sumCanonical por missão
  const auditGaps: Array<{ id: string; client: string; revDiff: number; costDiff: number; reason: string; source: string }> = [];
  let estimated = 0;
  let saved = 0;
  let mixed = 0;
  let refused = 0;

  for (const m of todayAll) {
    if (m.status === MissionStatus.REFUSED) {
      refused++;
      continue;
    }
    const canon = computeCanonicalRevenueCost(m, refs, now);
    if (canon.source === 'estimated') estimated++;
    else if (canon.source === 'saved') saved++;
    else mixed++;

    const clientMatch = clients.find((c: any) => c.name === m.client);
    const audit = auditMissionFinancials(m as any, refs.clientTables, refs.providerTables, clientMatch);
    const revDiff = Math.abs(canon.rev - audit.storedRevenue);
    const costDiff = Math.abs(canon.cost - audit.storedCost);

    // audit usa stored quando há override manual; canon pode estimar
    if (audit.isInconsistent || revDiff > 5 || costDiff > 5) {
      auditGaps.push({
        id: m.id,
        client: m.client,
        revDiff,
        costDiff,
        reason: audit.reason || `canon ${canon.source}`,
        source: canon.source,
      });
    }
  }

  console.log('\n── FONTES DE DADOS (missões hoje, exceto recusadas) ──');
  console.log(`   Salvas (banco):     ${saved}`);
  console.log(`   Estimadas (tabela): ${estimated}`);
  console.log(`   Mistas:             ${mixed}`);
  console.log(`   Recusadas:          ${refused}`);

  console.log('\n── DIVERGÊNCIAS auditMissionFinancials vs termômetro ──');
  if (auditGaps.length === 0) {
    console.log('   ✓ Nenhuma divergência > R$ 5,00');
  } else {
    console.log(`   ⚠ ${auditGaps.length} missão(ões) com diferença relevante:`);
    auditGaps
      .sort((a, b) => Math.max(b.revDiff, b.costDiff) - Math.max(a.revDiff, a.costDiff))
      .slice(0, 15)
      .forEach((x) => {
        console.log(
          `     ${x.id} | ${x.client} | Δrev ${fmt(x.revDiff)} Δcost ${fmt(x.costDiff)} | ${x.source} | ${x.reason || '-'}`,
        );
      });
  }

  // Status breakdown
  const byStatus = new Map<string, number>();
  for (const m of todayAll) {
    const s = m.status || 'SEM STATUS';
    byStatus.set(s, (byStatus.get(s) || 0) + 1);
  }
  console.log('\n── STATUS DAS MISSÕES HOJE ──');
  [...byStatus.entries()].sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`   ${s}: ${n}`));

  console.log('\n══════════════════════════════════════════════════════════\n');

  if (process.argv.includes('--detail') && auditGaps.length > 0) {
    console.log('── DETALHE DAS DIVERGÊNCIAS ──');
    for (const x of auditGaps) {
      const m = todayAll.find((t) => t.id === x.id);
      if (!m) continue;
      console.log(
        JSON.stringify({
          id: m.id,
          client: m.client,
          status: m.status,
          revenue_value: m.revenue_value,
          cost_value: m.cost_value,
          billing_approved: m.billing_approved,
          billing_verified_by: m.billing_verified_by,
          toll_value: m.toll_value,
          toll_value_provider: m.toll_value_provider,
          displacement_value: m.displacement_value,
          displacement_value_provider: m.displacement_value_provider,
          revenue_edit_reason: m.revenue_edit_reason,
          cost_edit_reason: m.cost_edit_reason,
        }),
      );
    }
  }

  const hasPartitionError =
    sumCount !== t.count ||
    Math.abs(sumRev - t.rev) >= 0.02 ||
    Math.abs(sumCost - t.cost) >= 0.02;
  process.exit(hasPartitionError || sameOsIssues.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Falha:', e);
  process.exit(2);
});
