import { createClient } from '@supabase/supabase-js';
import { calculateMissionFinancials } from '../lib/financialUtils';
import { MissionStatus } from '../types';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
if (!url || !key) { console.error('Faltam SUPABASE_URL/KEY'); process.exit(1); }
const sb = createClient(url, key);

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const [{ data: missions, error: mErr }, { data: clientTables }, { data: providerTables }, { data: clientsData }] = await Promise.all([
    sb.from('missions').select('*').gte('start_time', startOfDay).lte('start_time', endOfDay).order('id'),
    sb.from('client_price_tables').select('*'),
    sb.from('provider_cost_tables').select('*'),
    sb.from('clients').select('*'),
  ]);
  if (mErr) { console.error(mErr); process.exit(1); }
  if (!missions || missions.length === 0) { console.log('Nenhuma OS hoje.'); return; }

  console.log(`\nOS de hoje (${missions.length}):\n`);
  const header = ['OS', 'STATUS', 'CLIENTE', 'INIC', 'FIM', 'DUR_h', 'KM', 'REV_SALVO', 'REV_CALC', 'DIFF', 'COST_SALVO', 'COST_CALC', 'COST_DIFF', 'TRAVA'];
  console.log(header.join('\t'));

  let totalRevSaved = 0, totalRevCalc = 0, totalCostSaved = 0, totalCostCalc = 0;

  for (const m of missions) {
    const mission: any = {
      ...m,
      startKm: m.start_km, endKm: m.end_km,
      startTime: m.start_time, endTime: m.end_time,
      createdAt: m.created_at, lastUpdate: m.last_update,
      totalDistance: m.total_distance,
    };
    const matchedClient = (clientsData || []).find((c: any) => c.name === m.client);

    let revCalc = 0, costCalc = 0, durH = 0, kmFinal = 0;
    try {
      const fin = calculateMissionFinancials(mission, clientTables || [], providerTables || [], matchedClient, now);
      revCalc = Number(fin.client.total || 0);
      costCalc = Number(fin.provider.total || 0);
      durH = Number((fin as any).durationHours || 0);
      kmFinal = Number((fin as any).distanceForCalculation || 0);
    } catch (e: any) {
      console.error(`  erro em ${m.id}: ${e?.message}`);
    }

    const revSaved = Number(m.revenue_value || 0);
    const costSaved = Number(m.cost_value || 0);
    const diff = revCalc - revSaved;
    const costDiff = costCalc - costSaved;
    const trava = m.billing_approved ? 'APROV' : m.billing_verified_by ? 'SALVO' : '';

    totalRevSaved += revSaved; totalRevCalc += revCalc;
    totalCostSaved += costSaved; totalCostCalc += costCalc;

    const startStr = m.start_time ? new Date(m.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--';
    const endStr = m.end_time ? new Date(m.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--';
    const flag = Math.abs(diff) > 1 ? ' <<<' : '';
    console.log([
      m.id, m.status?.slice(0, 4), (m.client || '').slice(0, 14),
      startStr, endStr, durH.toFixed(2), kmFinal.toFixed(0),
      fmt(revSaved), fmt(revCalc), fmt(diff),
      fmt(costSaved), fmt(costCalc), fmt(costDiff),
      trava,
    ].join('\t') + flag);
  }

  console.log(`\nTOTAIS — REV salvo: R$ ${fmt(totalRevSaved)}  REV calc: R$ ${fmt(totalRevCalc)}  DIFF: R$ ${fmt(totalRevCalc - totalRevSaved)}`);
  console.log(`         COST salvo: R$ ${fmt(totalCostSaved)}  COST calc: R$ ${fmt(totalCostCalc)}  DIFF: R$ ${fmt(totalCostCalc - totalCostSaved)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
