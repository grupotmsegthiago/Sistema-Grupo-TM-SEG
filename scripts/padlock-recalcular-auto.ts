/**
 * PADLOCK — recálculo de custo automático por UF de origem.
 *
 * Pega TODAS as missões em que o fornecedor é PADLOCK (qualquer variação:
 * "PADLOCK", "PADLOCK SEGURANCA PRIVADA LTDA", etc.), identifica a UF da
 * origem (esperado: SP ou ES), e aplica a tabela de custo correspondente
 * à faixa de KM da missão.
 *
 * Regras:
 *   - Pula OS já aprovadas (billing_approved=true) — snapshot é imutável.
 *   - Pula OS "Mesma OS" (is_same_os=true) e OS de valor zero.
 *   - Quando a UF da origem não bate SP nem ES, lista como "ignorada".
 *   - Seleciona a tabela cujo prefixo bate com a UF (ex: "SP - 100KM",
 *     "ES - 200KM") e cujo franchise_km cobre a distância da missão.
 *   - Atualiza cost_value e registra system_logs (entity = MissionPadlockRecalc).
 *
 * Execução:
 *   tsx scripts/padlock-recalcular-auto.ts            # dry-run (só lista)
 *   tsx scripts/padlock-recalcular-auto.ts --apply    # aplica de verdade
 *   tsx scripts/padlock-recalcular-auto.ts --os GTM-4883 [--apply]   # só uma OS
 */

import { createClient } from '@supabase/supabase-js';
import {
  calculateProviderCostAuto,
  extractAutoMasterConfigFromProvider,
  selectAutoBandKm,
} from '../lib/providerAutoPricing';
import { extractUF, UF_TO_REGION } from '../lib/financialUtils';

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

// Normaliza nome do fornecedor para casamento case/trim-insensível.
const norm = (s: string) => (s || '').toUpperCase().replace(/\s+/g, ' ').trim();

async function main() {
  console.log(`\n=== PADLOCK Recalc Auto (${APPLY ? 'APLICAR' : 'DRY-RUN'})${ONLY_OS ? ` — OS=${ONLY_OS}` : ''} ===\n`);

  // 1) Localiza o(s) fornecedor(es) PADLOCK em providers.
  const { data: provs, error: pErr } = await sb
    .from('providers')
    .select('id, name, trading_name, auto_calc_enabled, auto_base_value, auto_base_km, auto_base_hr, auto_extra_km, auto_extra_hr, auto_region');
  if (pErr) { console.error('Erro lendo providers:', pErr.message); process.exit(1); }
  const padlocks = (provs || []).filter(p =>
    norm(p.name).includes('PADLOCK') || norm(p.trading_name || '').includes('PADLOCK')
  );
  if (padlocks.length === 0) { console.error('Nenhum fornecedor PADLOCK encontrado.'); process.exit(1); }
  console.log(`Fornecedor(es) PADLOCK encontrados: ${padlocks.length}`);
  for (const p of padlocks) {
    console.log(`  • ${p.name}  | motor_auto=${p.auto_calc_enabled}  | filtro=${p.auto_region || 'TODAS'}  | base=${p.auto_base_value} kmFx=${p.auto_base_km} hFx=${p.auto_base_hr} +km=${p.auto_extra_km} +h=${p.auto_extra_hr}`);
  }
  const padlockNames = new Set(padlocks.map(p => norm(p.name)));
  padlocks.forEach(p => p.trading_name && padlockNames.add(norm(p.trading_name)));

  // 2) Lê todas as tabelas de custo dos fornecedores PADLOCK.
  const provNamesArr = padlocks.map(p => p.name).filter(Boolean);
  const { data: tables, error: tErr } = await sb
    .from('provider_cost_tables')
    .select('id, provider, operation_type, activation_cost, franchise_km, franchise_hours, cost_per_extra_km, cost_per_extra_hour')
    .in('provider', provNamesArr);
  if (tErr) { console.error('Erro lendo provider_cost_tables:', tErr.message); process.exit(1); }
  console.log(`\nTabelas manuais PADLOCK: ${tables?.length || 0}`);

  // Agrupa tabelas por UF prefixada no operation_type ("SP - 100KM").
  type Row = (typeof tables) extends (infer T)[] | null ? T : any;
  const tablesByUF: Record<string, any[]> = {};
  const prefixRe = /^\s*([A-Z]{2})\s*-\s*(\d+)\s*KM\s*$/i;
  for (const t of (tables || []) as any[]) {
    const m = prefixRe.exec(t.operation_type || '');
    if (!m) continue;
    const uf = m[1].toUpperCase();
    (tablesByUF[uf] = tablesByUF[uf] || []).push({ ...t, _km: parseInt(m[2], 10) });
  }
  for (const uf of Object.keys(tablesByUF)) {
    tablesByUF[uf].sort((a, b) => a._km - b._km);
    console.log(`  UF ${uf}: ${tablesByUF[uf].length} faixas (${tablesByUF[uf].map(t => t._km + 'KM').join(', ')})`);
  }

  // 3) Busca as missões PADLOCK candidatas.
  let q = sb
    .from('missions')
    .select('id, ordem_servico, provider, origin, destination, total_distance_km, distance_to_cargo_km, cost_value, scheduled_time, start_time, end_time, is_same_os, billing_approved, status, valor_zero_motivo')
    .in('provider', provNamesArr);
  if (ONLY_OS) q = q.eq('ordem_servico', ONLY_OS);
  const { data: missions, error: mErr } = await q;
  if (mErr) { console.error('Erro lendo missions:', mErr.message); process.exit(1); }
  console.log(`\nMissões PADLOCK encontradas: ${missions?.length || 0}\n`);

  const skipped: { os: string; reason: string }[] = [];
  const updates: { id: string; os: string; uf: string; km: number; bandKm: number; oldCost: number; newCost: number; tableName: string }[] = [];

  for (const m of (missions || []) as any[]) {
    const os = m.ordem_servico || m.id;
    if (m.billing_approved) { skipped.push({ os, reason: 'já aprovada (snapshot imutável)' }); continue; }
    if (m.is_same_os) { skipped.push({ os, reason: 'Mesma OS (custo herdado)' }); continue; }
    if (m.valor_zero_motivo) { skipped.push({ os, reason: `valor zero (${m.valor_zero_motivo})` }); continue; }

    const uf = extractUF(m.origin || '');
    if (uf !== 'SP' && uf !== 'ES') {
      skipped.push({ os, reason: `UF da origem = "${uf || '?'}" (não é SP nem ES)` });
      continue;
    }

    const km = Math.max(Number(m.total_distance_km) || 0, Number(m.distance_to_cargo_km) || 0);
    if (km <= 0) { skipped.push({ os, reason: 'distância 0' }); continue; }

    const ufTables = tablesByUF[uf];
    if (!ufTables || ufTables.length === 0) {
      skipped.push({ os, reason: `sem tabelas materializadas para UF ${uf} (rode "Salvar Faixas como Tabelas" com filtro=${uf})` });
      continue;
    }

    // Seleciona faixa (mesma regra do motor: arredonda para a faixa,
    // corte em 51 km). Usa selectAutoBandKm com a config do PADLOCK como
    // referência (baseKmAllowance vem da configuração mestre).
    const cfg = extractAutoMasterConfigFromProvider(padlocks[0]);
    const bandKm = selectAutoBandKm(km, cfg || undefined);

    // Procura a tabela do UF cujo _km === bandKm.
    let chosen = ufTables.find(t => t._km === bandKm);
    if (!chosen) {
      // Fallback: maior faixa <= bandKm; senão a maior disponível.
      const lower = ufTables.filter(t => t._km <= bandKm).sort((a, b) => b._km - a._km)[0];
      chosen = lower || ufTables[ufTables.length - 1];
    }

    // Calcula o custo final (acionamento + horas extras pela Regra de Ouro).
    // Usa a config do PADLOCK quando disponível pra somar +h extras; se a
    // config não tiver +km/+h, usa os campos da própria tabela escolhida.
    let totalCost = Number(chosen.activation_cost) || 0;
    if (cfg) {
      const breakdown = calculateProviderCostAuto(km, cfg, m.scheduled_time, m.start_time, m.end_time);
      // O motor já calcula base + extras. Aqui sobrescrevemos a "base" para
      // refletir o acionamento da tabela materializada, mas mantemos a
      // soma de extras de horas/km da config.
      totalCost = Number(chosen.activation_cost) + Number(breakdown.extraKmValue || 0) + Number(breakdown.extraHourValue || 0);
      totalCost = Math.round(totalCost * 100) / 100;
    }

    updates.push({
      id: m.id,
      os,
      uf,
      km,
      bandKm,
      oldCost: Number(m.cost_value) || 0,
      newCost: totalCost,
      tableName: chosen.operation_type,
    });
  }

  console.log(`Resumo:\n  atualizar: ${updates.length}\n  pular:     ${skipped.length}\n`);

  if (updates.length > 0) {
    console.log('Atualizações previstas:');
    console.log('OS              | UF | KM real | faixa | tabela            | custo atual | custo novo');
    console.log('----------------|----|---------|-------|-------------------|-------------|-----------');
    for (const u of updates) {
      console.log(
        `${u.os.padEnd(15)} | ${u.uf} | ${String(u.km).padStart(7)} | ${String(u.bandKm).padStart(5)} | ${u.tableName.padEnd(17)} | ${fmtBR(u.oldCost).padStart(11)} | ${fmtBR(u.newCost).padStart(10)}`
      );
    }
  }

  if (skipped.length > 0) {
    console.log('\nMissões puladas:');
    for (const s of skipped) console.log(`  ${s.os.padEnd(15)} → ${s.reason}`);
  }

  if (!APPLY) {
    console.log('\nDry-run. Adicione --apply para gravar.');
    return;
  }

  console.log('\nAplicando...');
  let ok = 0, fail = 0;
  for (const u of updates) {
    const { error: uErr } = await sb
      .from('missions')
      .update({ cost_value: u.newCost })
      .eq('id', u.id);
    if (uErr) { console.error(`  ✗ ${u.os}: ${uErr.message}`); fail++; continue; }
    await sb.from('system_logs').insert([{
      user_name: 'SISTEMA',
      action_type: 'FINANCIAL_RECALC',
      entity: 'MissionPadlockRecalc',
      entity_id: u.id,
      details: JSON.stringify({
        os: u.os,
        uf: u.uf,
        km_real: u.km,
        faixa_km: u.bandKm,
        tabela_aplicada: u.tableName,
        cost_anterior: u.oldCost,
        cost_novo: u.newCost,
        timestamp: new Date().toISOString(),
      }),
    }]);
    ok++;
  }
  console.log(`\nFeito. ${ok} atualizada(s), ${fail} falha(s).`);
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
