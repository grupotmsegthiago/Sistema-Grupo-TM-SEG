/**
 * Task #108 — Relatório Antes × Depois do motor DHL
 *
 * Lê todas as missões do cliente DHL SUPPLY CHAIN (BRAZIL) LTDA,
 * compara o valor / tabela ATUAL (já salvo no banco) com a sugestão do
 * NOVO motor automático e calcula a diferença em reais. Gera um .xlsx
 * em /tmp/dhl-antes-depois-<timestamp>.xlsx.
 *
 * Execução:
 *   tsx scripts/dhl-antes-depois.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import {
  selectDhlClientTable,
  DHL_CLIENT_NAME,
  isDhlSupplyClient,
} from '../lib/dhlAutoTableSelector';
import { calculateMissionFinancials } from '../lib/financialUtils';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_*_KEY no ambiente.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const fmtBR = (n: number) =>
  (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

(async () => {
  console.log('[1/4] Buscando tabelas DHL...');
  const { data: tablesRaw, error: errT } = await sb
    .from('client_price_tables')
    .select('*')
    .ilike('client', '%DHL SUPPLY CHAIN%');
  if (errT) throw errT;
  const tables = (tablesRaw || []).filter((t: any) => isDhlSupplyClient(t.client));
  console.log(`     ${tables.length} tabelas DHL encontradas.`);

  console.log('[2/4] Buscando missões DHL...');
  const { data: missionsRaw, error: errM } = await sb
    .from('missions')
    .select('*')
    .ilike('client', '%DHL SUPPLY CHAIN%')
    .order('start_time', { ascending: false })
    .limit(5000);
  if (errM) throw errM;
  const missions = (missionsRaw || []).filter((m: any) => isDhlSupplyClient(m.client));
  console.log(`     ${missions.length} missões DHL encontradas.`);

  console.log('[3/4] Comparando ANTES × DEPOIS...');
  const rows: any[] = [];
  let countExact = 0,
    countRegion = 0,
    countNone = 0,
    countSame = 0,
    countDiff = 0,
    totalDelta = 0;

  for (const m of missions) {
    const origin = m.origin || '';
    const destination = m.destination || '';
    const km = Number(m.total_distance || 0);

    // ANTES: valor já salvo no banco
    const currentRevenue = Number(m.revenue_value || 0);
    const currentToll = Number(m.toll_value || 0);
    const currentTotal = currentRevenue + currentToll;

    // Tabela atual: tenta extrair do snapshot, senão fica vazio
    let currentTableName = '';
    try {
      const snap = m.snapshot_data;
      const snapObj = typeof snap === 'string' ? JSON.parse(snap) : snap;
      const tid = snapObj?.client?.tableId || snapObj?.clientTableId;
      if (tid) {
        const t = tables.find((x: any) => String(x.id) === String(tid));
        if (t) currentTableName = t.operation_type;
      }
    } catch {}

    // DEPOIS: roda o motor novo
    const sel = selectDhlClientTable(tables as any, { origin, destination }, km);
    if (sel.matchLevel === 'exact_route') countExact++;
    else if (sel.matchLevel === 'region_band') countRegion++;
    else countNone++;

    // Calcula a receita projetada com a tabela sugerida pelo motor
    let newRevenue = 0;
    let newCalcErr = '';
    if (sel.table) {
      try {
        const missionTyped: any = {
          ...m,
          totalDistance: km,
          startKm: m.start_km,
          endKm: m.end_km,
          startTime: m.start_time,
          endTime: m.end_time,
          revenue_value: m.revenue_value,
          cost_value: m.cost_value,
          toll_value: m.toll_value,
        };
        const calc = calculateMissionFinancials(
          missionTyped,
          tables as any,
          [],
          undefined,
          new Date(),
          { clientTableId: String(sel.table.id) },
        );
        newRevenue = Number(calc.client?.total || 0);
      } catch (e: any) {
        newCalcErr = e?.message || String(e);
      }
    }
    const newTotal = newRevenue + currentToll;
    const delta = newTotal - currentTotal;

    if (Math.abs(delta) < 0.01) countSame++;
    else countDiff++;
    totalDelta += delta;

    rows.push({
      OS: m.os_number || m.id,
      Status: m.status,
      Data: m.start_time || m.scheduled_time || '',
      Origem: origin,
      Destino: destination,
      'KM Google': km,
      'Tabela ATUAL': currentTableName || '(não identificada)',
      'Receita ATUAL (R$)': Number(currentRevenue.toFixed(2)),
      'Pedágio (R$)': Number(currentToll.toFixed(2)),
      'TOTAL ATUAL (R$)': Number(currentTotal.toFixed(2)),
      'Sugestão MOTOR': sel.table?.operation_type || '(nenhuma)',
      'Nível Match': sel.matchLevel,
      'Região Detectada': sel.detectedRegion || '',
      'Faixa KM': sel.band,
      'Receita NOVA (R$)': Number(newRevenue.toFixed(2)),
      'TOTAL NOVO (R$)': Number(newTotal.toFixed(2)),
      'Diferença (R$)': Number(delta.toFixed(2)),
      Motivo: sel.reason,
      'Erro Cálculo': newCalcErr,
    });
  }

  // Ordena por |diferença| desc para colocar os maiores impactos no topo
  rows.sort((a, b) => Math.abs(b['Diferença (R$)']) - Math.abs(a['Diferença (R$)']));

  console.log('[4/4] Gerando planilha...');
  const wb = XLSX.utils.book_new();

  // Aba 1: Resumo
  const resumo = [
    { Indicador: 'Total de missões DHL', Valor: missions.length },
    { Indicador: 'Tabelas DHL cadastradas', Valor: tables.length },
    { Indicador: 'Sugeriu ROTA EXATA (azul)', Valor: countExact },
    { Indicador: 'Sugeriu REGIÃO + FAIXA (verde)', Valor: countRegion },
    { Indicador: 'SEM sugestão (cinza)', Valor: countNone },
    { Indicador: 'Missões com valor igual', Valor: countSame },
    { Indicador: 'Missões com diferença', Valor: countDiff },
    { Indicador: 'Diferença total (R$)', Valor: fmtBR(totalDelta) },
  ];
  const wsResumo = XLSX.utils.json_to_sheet(resumo);
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // Aba 2: Antes × Depois (uma linha por missão)
  const wsRows = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsRows, 'Antes x Depois');

  // Aba 3: Tabelas DHL atuais (referência)
  const wsTables = XLSX.utils.json_to_sheet(
    tables.map((t: any) => ({
      ID: t.id,
      'Operation Type': t.operation_type,
      'Franquia KM': t.franchise_km,
      'Franquia Horas': t.franchise_hours,
      'Acionamento (R$)': t.activation_fee,
      'KM Extra (R$)': t.price_per_extra_km,
      'Hora Extra (R$)': t.price_per_extra_hour,
    })),
  );
  XLSX.utils.book_append_sheet(wb, wsTables, 'Tabelas DHL');

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = `/tmp/dhl-antes-depois-${ts}.xlsx`;
  XLSX.writeFile(wb, outPath);
  console.log(`\nPlanilha gerada: ${outPath}`);
  console.log(`Resumo: ${missions.length} missões | rota exata: ${countExact} | região+faixa: ${countRegion} | sem sugestão: ${countNone}`);
  console.log(`Diferença total: R$ ${fmtBR(totalDelta)}`);

  // Sai limpo
  process.exit(0);
})().catch((e) => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
