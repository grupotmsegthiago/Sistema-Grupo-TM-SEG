import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key, { auth: { persistSession: false } });
(async () => {
  const { data: agents } = await sb.from('agents').select('provider');
  const counts: Record<string, number> = {};
  (agents||[]).forEach((a:any)=>{ const p=a.provider||'(vazio)'; counts[p]=(counts[p]||0)+1; });
  console.log('TOTAL agents:', (agents||[]).length);
  console.log('Distinct agent.provider:');
  Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${v}\t${k}`));
})();
