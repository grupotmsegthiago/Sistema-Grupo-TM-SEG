/** Re-exporta de lib/ para compatibilidade com imports existentes no servidor. */
export {
  createSupabaseAdminClient,
  getSupabaseAnonKey,
  getSupabaseServerKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  resolveServerSupabaseFromProcessEnv,
} from '../lib/supabaseAdmin.js';
