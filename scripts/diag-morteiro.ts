import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key, { auth: { persistSession: false } });
(async () => {
  const { data: p1 } = await sb.from('providers').select('name').ilike('name','%mort%');
  console.log('providers ~mort:', JSON.stringify(p1));
  const { data: a1 } = await sb.from('agents').select('provider').ilike('provider','%mort%').limit(5);
  console.log('agents.provider ~mort:', JSON.stringify(a1));
  // full count of agents
  const { count } = await sb.from('agents').select('*', { count: 'exact', head: true });
  console.log('agents count total:', count);
})();
