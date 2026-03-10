import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Atenção: Verifique se as chaves VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão no painel de Secrets.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
