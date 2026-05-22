/**
 * Zera valores (cliente, fornecedor, pedágio) de TODAS as OS com status
 * "Recusada" — regra prioritária e sem exceções.
 *
 * Campos zerados em cada OS:
 *   - revenue_value           = 0
 *   - cost_value              = 0
 *   - toll_value              = 0
 *   - toll_value_provider     = 0
 *   - snapshot_data           = null
 *   - billing_approved        = false
 *   - valor_zero_motivo       = 'OS Recusada — zerado automaticamente'
 *
 * Cada alteração gera um registro em system_logs (entity = MissionRefusedZero)
 * com os valores anteriores, para rastreabilidade/reversão manual se preciso.
 *
 * Execução:
 *   tsx scripts/zerar-recusadas.ts            # dry-run (só lista)
 *   tsx scripts/zerar-recusadas.ts --apply    # aplica de verdade
 */

import { createClient } from '@supabase/supabase-js';

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

const fmtBR = (n: number) =>
  (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

(async () => {
  console.log(`[1/3] Buscando todas as OS com status = 'Recusada'...`);
  const { data, error } = await sb
    .from('missions')
    .select(
      'id, client, provider, status, revenue_value, cost_value, toll_value, toll_value_provider, snapshot_data, billing_approved, valor_zero_motivo'
    )
    .eq('status', 'Recusada');
  if (error) {
    console.error('ERRO ao buscar:', error.message);
    process.exit(1);
  }
  const rows = data || [];
  console.log(`     ${rows.length} OS recusadas encontradas.`);

  const targets = rows.filter(
    (m: any) =>
      Number(m.revenue_value || 0) > 0 ||
      Number(m.cost_value || 0) > 0 ||
      Number(m.toll_value || 0) > 0 ||
      Number(m.toll_value_provider || 0) > 0 ||
      m.snapshot_data != null ||
      m.billing_approved === true
  );

  console.log(
    `[2/3] ${targets.length} OS recusadas com valor != 0 (precisam ser zeradas).`
  );
  if (targets.length === 0) {
    console.log('Nada a fazer. Saindo.');
    return;
  }

  let totalRevenue = 0;
  let totalCost = 0;
  let totalToll = 0;
  for (const m of targets) {
    totalRevenue += Number(m.revenue_value || 0);
    totalCost += Number(m.cost_value || 0);
    totalToll +=
      Number(m.toll_value || 0) + Number(m.toll_value_provider || 0);
    console.log(
      `   • OS ${m.id} (${m.client || '—'}) → receita R$ ${fmtBR(
        m.revenue_value || 0
      )}, custo R$ ${fmtBR(m.cost_value || 0)}, pedágio R$ ${fmtBR(
        (m.toll_value || 0) + (m.toll_value_provider || 0)
      )}`
    );
  }
  console.log(
    `     TOTAL a zerar: receita R$ ${fmtBR(totalRevenue)} | custo R$ ${fmtBR(
      totalCost
    )} | pedágio R$ ${fmtBR(totalToll)}`
  );

  if (!APPLY) {
    console.log(
      `\n[3/3] DRY-RUN. Rode novamente com '--apply' para aplicar de verdade.`
    );
    return;
  }

  console.log(`[3/3] Aplicando zeragem nas ${targets.length} OS...`);
  let okCount = 0;
  let errCount = 0;
  for (const m of targets) {
    const basePayload: any = {
      revenue_value: 0,
      cost_value: 0,
      toll_value: 0,
      toll_value_provider: 0,
      snapshot_data: null,
      billing_approved: false,
      revenue_edit_reason: 'OS Recusada — zerado automaticamente',
      cost_edit_reason: 'OS Recusada — zerado automaticamente',
      last_update: new Date().toISOString(),
    };
    let { error: updErr } = await sb
      .from('missions')
      .update({ ...basePayload, valor_zero_motivo: 'OS Recusada — zerado automaticamente' })
      .eq('id', m.id);
    if (updErr && updErr.message?.includes('valor_zero_motivo')) {
      const retry = await sb.from('missions').update(basePayload).eq('id', m.id);
      updErr = retry.error as any;
    }
    if (updErr) {
      console.error(`   ✗ OS ${m.id} falhou: ${updErr.message}`);
      errCount++;
      continue;
    }
    await sb.from('system_logs').insert([
      {
        user_name: 'script-zerar-recusadas',
        action_type: 'BULK_REFUSED_ZERO',
        entity: 'MissionRefusedZero',
        entity_id: m.id,
        details: JSON.stringify({
          before: {
            revenue_value: m.revenue_value,
            cost_value: m.cost_value,
            toll_value: m.toll_value,
            toll_value_provider: m.toll_value_provider,
            billing_approved: m.billing_approved,
            had_snapshot: m.snapshot_data != null,
          },
          reason: 'OS Recusada — regra prioritária de zeragem',
          applied_at: new Date().toISOString(),
        }),
      },
    ]);
    okCount++;
  }
  console.log(`     ${okCount} OS zeradas com sucesso, ${errCount} falhas.`);
})();
