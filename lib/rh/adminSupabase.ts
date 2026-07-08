import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SUPABASE_URL, TMSEG_SUPABASE_PROJECT_REF } from '../supabaseDefaults';

function decodeRef(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

export function createRhAdminClient(): SupabaseClient {
  const envUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const url = envUrl.includes(TMSEG_SUPABASE_PROJECT_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  if (!key || decodeRef(key) !== TMSEG_SUPABASE_PROJECT_REF) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY indisponível neste ambiente');
  }
  return createClient(url, key);
}
