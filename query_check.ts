import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');
(async () => {
  const { data: m } = await sb.from('missions').select('revenue_value, cost_value, toll_value, toll_value_provider, billing_verified_by, cost_edit_reason, revenue_edit_reason, snapshot_approved_by, last_update, is_same_os').eq('id', 'GTM-3828').maybeSingle();
  console.log('=== GTM-3828 ===');
  console.log(JSON.stringify(m, null, 2));

  const { data: logs } = await sb.from('system_logs').select('created_at, entity, user_name, details').eq('entity_id', 'GTM-3828').order('created_at', { ascending: false }).limit(3);
  console.log('\n=== ÚLTIMOS LOGS ===');
  if (logs) {
    for (const l of logs) {
      const dt = new Date(l.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const d = typeof l.details === 'string' ? l.details : JSON.stringify(l.details);
      console.log(`${dt} | ${l.entity} | ${l.user_name}`);
      console.log('  ', d.substring(0, 400));
    }
  }
  process.exit(0);
})();
