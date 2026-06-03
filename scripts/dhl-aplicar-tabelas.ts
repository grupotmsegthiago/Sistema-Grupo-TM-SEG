/**
 * DHL — Aplicar tabelas de cliente (RECEITA) em massa.
 *
 * Para TODAS as OS dos clientes DHL (todas as razões sociais em
 * DHL_AUTO_CLIENT_NAMES), roda o motor selectDhlClientTable (região da
 * origem + faixa KM + rota, com memória do auditor) e recalcula a receita
 * via calculateMissionFinancials, aplicando a tabela DHL correspondente.
 *
 * Regras de segurança (espelham o padrão do padlock-recalcular-auto.ts):
 *   - Pula OS congeladas: snapshot_approved_by preenchido OU billing_approved=true
 *     (snapshot imutável — Gotcha "Immutable Financial Snapshots").
 *   - Pula OS "Mesma OS" (is_same_os=true) e OS com valor_zero_motivo.
 *   - Pula OS canceladas (status contém CANCEL) — o motor genérico zera
 *     canceladas; elas precisam de tratamento dedicado (memória DHL).
 *   - Pula OS sem tabela DHL correspondente (matchLevel='none').
 *   - Pula OS sem diferença relevante (|delta| < R$ 0,01).
 *   - Pedágio (toll_value) é preservado; só a receita base é atualizada.
 *   - Registra cada alteração em system_logs (entity = MissionDhlTableApply).
 *
 * Execução:
 *   tsx scripts/dhl-aplicar-tabelas.ts                 # dry-run (só lista)
 *   tsx scripts/dhl-aplicar-tabelas.ts --apply         # aplica de verdade
 *   tsx scripts/dhl-aplicar-tabelas.ts --os GTM-4883 [--apply]   # uma OS
 */

import { createClient } from '@supabase/supabase-js';
import {
  selectDhlClientTable,
  findDhlAutoClient,
  DHL_AUTO_CLIENT_NAMES,
  setDhlCorrectionsCache,
  type DhlCorrectionRecord,
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

const APPLY = process.argv.includes('--apply');
const osArgIdx = process.argv.indexOf('--os');
const ONLY_OS = osArgIdx >= 0 ? process.argv[osArgIdx + 1] : null;

const fmtBR = (n: number) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const isCancelled = (status?: string | null): boolean =>
  (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('CANCEL');

async function main() {
  console.log(`\n=== DHL Aplicar Tabelas (RECEITA) — ${APPLY ? 'APLICAR' : 'DRY-RUN'}${ONLY_OS ? ` — OS=${ONLY_OS}` : ''} ===\n`);

  // 1) Tabelas DHL de todas as razões sociais cobertas.
  const { data: tablesRaw, error: errT } = await sb
    .from('client_price_tables')
    .select('*')
    .ilike('client', '%DHL%');
  if (errT) { console.error('Erro lendo client_price_tables:', errT.message); process.exit(1); }
  const tables = (tablesRaw || []).filter((t: any) => !!findDhlAutoClient(t.client));
  console.log(`Tabelas DHL: ${tables.length} (razões: ${DHL_AUTO_CLIENT_NAMES.length})`);

  // 2) Memória do auditor (system_logs entity=DhlTableCorrection, 90 dias).
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: corrRaw } = await sb
    .from('system_logs')
    .select('id, details, created_at, user_name, entity_id')
    .eq('entity', 'DhlTableCorrection')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1000);
  const corrections: DhlCorrectionRecord[] = [];
  for (const row of (corrRaw || []) as any[]) {
    try {
      const d = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      if (!d || !d.chosenTableId) continue;
      corrections.push({
        region: String(d.region || ''),
        band: Number(d.band || 0),
        originCity: String(d.originCity || ''),
        destCity: String(d.destCity || ''),
        chosenTableId: String(d.chosenTableId),
        createdAt: row.created_at || new Date().toISOString(),
        logId: row.id ?? null,
        missionId: d.missionId ? String(d.missionId) : (row.entity_id ? String(row.entity_id) : null),
        userName: row.user_name ? String(row.user_name) : null,
      });
    } catch { /* ignore */ }
  }
  setDhlCorrectionsCache(corrections);
  console.log(`Memória do auditor: ${corrections.length} correção(ões) carregada(s).`);

  // 3) Missões DHL.
  let q = sb
    .from('missions')
    .select('*')
    .ilike('client', '%DHL%')
    .order('start_time', { ascending: false })
    .limit(10000);
  if (ONLY_OS) q = q.eq('os_number', ONLY_OS);
  const { data: missionsRaw, error: errM } = await q;
  if (errM) { console.error('Erro lendo missions:', errM.message); process.exit(1); }
  const missions = (missionsRaw || []).filter((m: any) => !!findDhlAutoClient(m.client));
  console.log(`Missões DHL: ${missions.length}\n`);

  const skipped: { os: string; reason: string }[] = [];
  const updates: {
    id: string; os: string; client: string; region: string; band: number;
    matchLevel: string; tableName: string; oldRevenue: number; newRevenue: number;
    toll: number; delta: number; chosenTableId: string;
  }[] = [];

  for (const m of missions as any[]) {
    const os = m.os_number || m.id;
    if (m.snapshot_approved_by || m.billing_approved === true) { skipped.push({ os, reason: 'congelada (snapshot imutável)' }); continue; }
    if (m.is_same_os) { skipped.push({ os, reason: 'Mesma OS (valor herdado)' }); continue; }
    if (m.valor_zero_motivo) { skipped.push({ os, reason: `valor zero (${m.valor_zero_motivo})` }); continue; }
    if (isCancelled(m.status)) { skipped.push({ os, reason: 'cancelada (tratamento dedicado)' }); continue; }

    const clientCanon = findDhlAutoClient(m.client) || m.client;
    const km = Number(m.total_distance || 0);
    const sel = selectDhlClientTable(tables as any, { origin: m.origin || '', destination: m.destination || '' }, km, { clientName: clientCanon });
    if (!sel.table) { skipped.push({ os, reason: `sem tabela DHL (${sel.detectedRegion || '?'} ${sel.band}km)` }); continue; }

    const oldRevenue = Number(m.revenue_value || 0);
    const toll = Number(m.toll_value || 0);
    let newRevenue = 0;
    try {
      const missionTyped: any = {
        ...m,
        totalDistance: km,
        startKm: m.start_km,
        endKm: m.end_km,
        startTime: m.start_time,
        endTime: m.end_time,
      };
      const calc = calculateMissionFinancials(
        missionTyped, tables as any, [], undefined, new Date(),
        { clientTableId: String(sel.table.id) },
      );
      // IMPORTANTE: calc.client.total = serviço + pedágio. revenue_value guarda
      // só o serviço (pedágio fica em toll_value), então usamos serviceTotal.
      newRevenue = Math.round((Number(calc.client?.serviceTotal || 0)) * 100) / 100;
    } catch (e: any) {
      skipped.push({ os, reason: `erro de cálculo: ${e?.message || e}` });
      continue;
    }

    const delta = newRevenue - oldRevenue;
    if (Math.abs(delta) < 0.01) { skipped.push({ os, reason: 'sem diferença' }); continue; }

    updates.push({
      id: m.id, os, client: clientCanon, region: sel.detectedRegion, band: sel.band,
      matchLevel: sel.matchLevel, tableName: sel.table.operation_type || '', oldRevenue,
      newRevenue, toll, delta, chosenTableId: String(sel.table.id),
    });
  }

  // Maiores impactos primeiro.
  updates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const totalDelta = updates.reduce((s, u) => s + u.delta, 0);
  const byLevel: Record<string, number> = {};
  for (const u of updates) byLevel[u.matchLevel] = (byLevel[u.matchLevel] || 0) + 1;

  console.log(`Resumo:\n  aplicar:  ${updates.length}\n  pular:    ${skipped.length}\n  delta R$: ${fmtBR(totalDelta)}`);
  console.log(`  níveis:   ${Object.entries(byLevel).map(([k, v]) => `${k}=${v}`).join(' | ') || '—'}\n`);

  if (updates.length > 0) {
    console.log('OS              | Região      | Fx   | Nível        | Tabela                              | Receita atual | Receita nova | Δ');
    console.log('----------------|-------------|------|--------------|-------------------------------------|---------------|--------------|----------');
    for (const u of updates.slice(0, 80)) {
      console.log(
        `${String(u.os).padEnd(15)} | ${String(u.region).padEnd(11)} | ${String(u.band).padStart(4)} | ${u.matchLevel.padEnd(12)} | ${u.tableName.slice(0, 35).padEnd(35)} | ${fmtBR(u.oldRevenue).padStart(13)} | ${fmtBR(u.newRevenue).padStart(12)} | ${fmtBR(u.delta)}`,
      );
    }
    if (updates.length > 80) console.log(`  ... e mais ${updates.length - 80} OS.`);
  }

  // Agrupa motivos de skip para um resumo legível.
  const skipReasons: Record<string, number> = {};
  for (const s of skipped) {
    const k = s.reason.replace(/\(.*\)/, '').trim();
    skipReasons[k] = (skipReasons[k] || 0) + 1;
  }
  if (skipped.length > 0) {
    console.log('\nPuladas (por motivo):');
    for (const [k, v] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(5)}  ${k}`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run. Nada foi gravado. Adicione --apply para gravar.');
    return;
  }

  console.log('\nAplicando...');
  let ok = 0, fail = 0;
  for (const u of updates) {
    const { error: uErr } = await sb
      .from('missions')
      .update({ revenue_value: u.newRevenue })
      .eq('id', u.id);
    if (uErr) { console.error(`  ✗ ${u.os}: ${uErr.message}`); fail++; continue; }
    await sb.from('system_logs').insert([{
      user_name: 'SISTEMA',
      action_type: 'FINANCIAL_RECALC',
      entity: 'MissionDhlTableApply',
      entity_id: u.id,
      details: JSON.stringify({
        os: u.os,
        client: u.client,
        region: u.region,
        band: u.band,
        matchLevel: u.matchLevel,
        chosenTableId: u.chosenTableId,
        tabela_aplicada: u.tableName,
        revenue_anterior: u.oldRevenue,
        revenue_novo: u.newRevenue,
        toll_preservado: u.toll,
        timestamp: new Date().toISOString(),
      }),
    }]);
    ok++;
  }
  console.log(`\nFeito. ${ok} atualizada(s), ${fail} falha(s).`);
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
