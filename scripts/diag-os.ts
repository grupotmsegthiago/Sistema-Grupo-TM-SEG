import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key, { auth: { persistSession: false } });
(async () => {
  // try to find by id-like field
  let { data, error } = await sb.from('missions').select('*').or('id.eq.GTM-5498,os_number.eq.GTM-5498,os.eq.GTM-5498').limit(3);
  if (error) console.log('or-err', error.message);
  if (!data || !data.length) {
    const r2 = await sb.from('missions').select('*').ilike('id','%5498%').limit(3);
    data = r2.data || [];
  }
  if (!data || !data.length) { console.log('NADA encontrado'); return; }
  for (const m of data) {
    const keys = Object.keys(m);
    const finKeys = keys.filter(k=>/value|cost|revenue|toll|snapshot|total|base|km|hora|hour|deslocom|displacement|amount|valor/i.test(k));
    console.log('=== MISSION', m.id, '| client:', m.client, '| provider:', m.provider);
    finKeys.forEach(k=>{
      let v = m[k];
      if (k==='snapshot_data' && v) { console.log('  snapshot_data:', typeof v==='string'? v.slice(0,800): JSON.stringify(v).slice(0,800)); return; }
      console.log('  ', k, '=', v);
    });
    console.log('  cost_edit_reason=', m.cost_edit_reason);
    console.log('  revenue_edit_reason=', m.revenue_edit_reason);
    console.log('  billing_approved=', m.billing_approved, '| billing_verified_by=', m.billing_verified_by);
  }
})();
