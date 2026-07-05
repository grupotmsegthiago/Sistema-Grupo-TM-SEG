import { createClient } from '@supabase/supabase-js';
import { resolveSupabasePublicConfig } from './resolveSupabasePublicConfig';

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabasePublicConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Canal broadcast compartilhado: quem envia e quem escuta devem usar o mesmo nome. */
export const MISSION_UPDATES_BROADCAST_CHANNEL = 'mission-updates';
