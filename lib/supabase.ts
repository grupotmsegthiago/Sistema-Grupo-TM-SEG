import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Atenção: Verifique se as chaves VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão no painel de Secrets.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
