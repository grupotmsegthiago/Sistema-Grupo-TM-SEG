import { createClient } from '@supabase/supabase-js';
import { resolveSupabasePublicConfig } from '../lib/resolveSupabasePublicConfig';

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabasePublicConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
