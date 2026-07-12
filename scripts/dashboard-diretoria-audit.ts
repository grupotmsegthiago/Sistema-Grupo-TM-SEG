import { createClient } from '@supabase/supabase-js';
import { filterMissionsByPeriod, sumCanonical } from '../lib/missionFinancialsCanonical';

const url = 'https://ajhmmjuewdsukecaimik.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';
const sb = createClient(url, key);

async function pages(q: any) {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const now = new Date();
  const start = new Date(2026, 6, 1, 0, 0, 0, 0);
  const end = now.getFullYear() === 2026 && now.getMonth() === 6
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    : new Date(2026, 6, 31, 23, 59, 59, 999);
  const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;
  const endIso = end.toISOString().slice(0, 19);
  const rangeOr = `and(start_time.gte.${startIso},start_time.lte.${endIso}),and(start_time.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`;
  const endDate = end.toISOString().slice(0, 10);

  const [missions, clientTables, providerTables, clients, trans, cats] = await Promise.all([
    pages(sb.from('missions').select('*').or(rangeOr)),
    sb.from('client_price_tables').select('*'),
    sb.from('provider_cost_tables').select('*'),
    sb.from('clients').select('*'),
    pages(sb.from('financial_transactions').select('*').gte('due_date', '2026-07-01').lte('due_date', endDate)),
    sb.from('financial_categories').select('*'),
  ]);

  const refs = {
    clientTables: clientTables.data || [],
    providerTables: providerTables.data || [],
    clientsData: clients.data || [],
  };
  const inPeriod = filterMissionsByPeriod(missions, start, end);
  const totals = sumCanonical(inPeriod, refs);
  const margin = totals.rev > 0 ? (totals.profit / totals.rev) * 100 : 0;

  const investmentIds = new Set((cats.data || []).filter((c: any) => c.group === 'INVESTIMENTOS').map((c: any) => c.id));
  const paidExp = trans
    .filter((t: any) => t.type === 'EXPENSE' && t.status === 'PAID' && !investmentIds.has(t.category_id))
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const paidInc = trans.filter((t: any) => t.type === 'INCOME' && t.status === 'PAID').reduce((s: number, t: any) => s + Number(t.amount), 0);

  const pendingRecv = trans.filter((t: any) => t.type === 'INCOME' && ['PENDING', 'SCHEDULED', 'OVERDUE'].includes(t.status)).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const pendingPay = trans.filter((t: any) => t.type === 'EXPENSE' && ['PENDING', 'SCHEDULED', 'OVERDUE'].includes(t.status)).reduce((s: number, t: any) => s + Number(t.amount), 0);

  console.log(JSON.stringify({
    periodEnd: endDate,
    missionsInPeriod: inPeriod.length,
    rev: Math.round(totals.rev),
    cost: Math.round(totals.cost),
    profit: Math.round(totals.profit),
    marginPct: Math.round(margin * 10) / 10,
    paidIncome: Math.round(paidInc),
    paidExpense: Math.round(paidExp),
    operationalProfit: Math.round(totals.profit),
    wrongMixedNet: Math.round(totals.profit - paidExp),
    pendingReceivable: Math.round(pendingRecv),
    pendingPayable: Math.round(pendingPay),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
