/**
 * Passagem das OS em que o custo gravado supera a receita.
 * Sem --aplicar, só lista. Não mexe em OS aprovada, conferida, com ajuste manual,
 * com prejuízo travado ou ligada a fatura paga.
 *
 * Uso:
 *   npx tsx scripts/sincronizar-prejuizo-card.ts
 *   npx tsx scripts/sincronizar-prejuizo-card.ts --periodo=hoje
 *   npx tsx scripts/sincronizar-prejuizo-card.ts --aplicar
 */
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from '../lib/supabaseDefaults.ts';
import { computeCanonicalRevenueCost, filterMissionsByPeriod } from '../lib/missionFinancialsCanonical.ts';
import { calcularValoresOficiais, colunasDoMotor, osImpedeSincronia } from '../lib/billing/sincronizarValoresOs.ts';

const aplicar = process.argv.includes('--aplicar');
const periodo = process.argv.find((arg) => arg.startsWith('--periodo='))?.split('=')[1] || 'mes';
const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_ANON_KEY;

if (!url.includes('ajhmmjuewdsukecaimik')) {
  console.error('Este script só roda no Supabase da TM SEG.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function limites(): [Date, Date] {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (periodo === 'hoje') {
    return [new Date(`${hoje}T00:00:00-03:00`), new Date(`${hoje}T23:59:59-03:00`)];
  }
  const [ano, mes] = hoje.split('-');
  return [new Date(`${ano}-${mes}-01T00:00:00-03:00`), new Date(`${hoje}T23:59:59-03:00`)];
}

async function paginas(tabela: string, colunas: string) {
  const saida: any[] = [];
  let de = 0;
  while (true) {
    const { data, error } = await sb.from(tabela).select(colunas).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    saida.push(...(data || []));
    if (!data || data.length < 1000) break;
    de += 1000;
  }
  return saida;
}

async function faturasPagas(ids: string[]): Promise<Set<string>> {
  const pagas = new Set<string>();
  for (let i = 0; i < ids.length; i += 40) {
    const lote = ids.slice(i, i + 40);
    const { data, error } = await sb.from('financial_invoice_missions').select('mission_id, invoice_id').in('mission_id', lote);
    if (error) throw new Error(`Vínculo de fatura: ${error.message}`);
    const porFatura = new Map<string, string[]>();
    for (const linha of data || []) {
      const fatura = String(linha.invoice_id || '');
      const os = String(linha.mission_id || '');
      if (!fatura || !os) continue;
      const lista = porFatura.get(fatura) || [];
      lista.push(os);
      porFatura.set(fatura, lista);
    }
    const faturaIds = [...porFatura.keys()];
    if (faturaIds.length === 0) continue;
    const { data: faturas, error: fatErr } = await sb.from('financial_invoices').select('id, status').in('id', faturaIds);
    if (fatErr) throw new Error(`Fatura: ${fatErr.message}`);
    for (const fatura of faturas || []) {
      if (String(fatura.status || '').toUpperCase() !== 'PAGA') continue;
      for (const os of porFatura.get(String(fatura.id)) || []) pagas.add(os);
    }
  }
  return pagas;
}

async function main() {
  const [inicio, fim] = limites();
  const [missoes, clientes, tabelasCliente, tabelasFornecedor] = await Promise.all([
    paginas('missions', '*'),
    paginas('clients', 'id, name, trading_name'),
    paginas('client_price_tables', '*'),
    paginas('provider_cost_tables', '*'),
  ]);
  const noPeriodo = filterMissionsByPeriod(missoes, inicio, fim);
  const refs = { clientTables: tabelasCliente, providerTables: tabelasFornecedor, clientsData: clientes };
  const prejuizo = noPeriodo.filter((os) => {
    if (os.status === 'Recusada') return false;
    const conta = computeCanonicalRevenueCost(os, refs);
    if (conta.rev <= 0 && conta.cost <= 0) return false;
    return conta.cost - conta.rev > 0;
  });
  const pagas = await faturasPagas(prejuizo.map((os) => String(os.id)));
  const relatorio: any[] = [];
  for (const os of prejuizo) {
    const motivo = pagas.has(String(os.id))
      ? 'Fatura paga.'
      : osImpedeSincronia(os, { incluirTravaPrejuizo: true });
    if (motivo) {
      relatorio.push({ id: os.id, acao: 'mantida', motivo });
      continue;
    }
    const cliente = clientes.find((c) => c.name === os.client || c.trading_name === os.client);
    const oficial = calcularValoresOficiais({
      mission: {
        ...os,
        startKm: os.start_km,
        endKm: os.end_km,
        startTime: os.start_time,
        endTime: os.end_time,
        totalDistance: os.total_distance,
        createdAt: os.created_at,
      },
      clientTables: tabelasCliente,
      providerTables: tabelasFornecedor,
      clientData: cliente,
    });
    const colunas = colunasDoMotor(
      { revenue: os.revenue_value, cost: os.cost_value },
      oficial,
      !!os.is_same_os,
    );
    if (!colunas) {
      relatorio.push({ id: os.id, acao: 'sem_ajuste', receita: os.revenue_value, custo: os.cost_value });
      continue;
    }
    relatorio.push({ id: os.id, acao: aplicar ? 'gravada' : 'seria_gravada', antes: { receita: os.revenue_value, custo: os.cost_value }, depois: colunas });
    if (aplicar) {
      const { error } = await sb.from('missions').update({ ...colunas, last_update: new Date().toISOString() }).eq('id', os.id);
      if (error) relatorio[relatorio.length - 1] = { id: os.id, acao: 'erro', erro: error.message };
    }
  }
  console.log(JSON.stringify({
    periodo,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    noCard: prejuizo.length,
    aplicar,
    relatorio,
  }, null, 2));
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
