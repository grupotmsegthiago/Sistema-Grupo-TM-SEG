import { createClient } from '@supabase/supabase-js';
import { protegerCliente } from './financeiro/clienteGuardado';
import { resolveSupabasePublicConfig } from './resolveSupabasePublicConfig';

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabasePublicConfig();

const supabaseBase = createClient(supabaseUrl, supabaseAnonKey);
export const supabase = typeof window === 'undefined' ? supabaseBase : protegerCliente(supabaseBase);

/** Canal broadcast compartilhado: quem envia e quem escuta devem usar o mesmo nome. */
export const MISSION_UPDATES_BROADCAST_CHANNEL = 'mission-updates';

/** Popup global bot WhatsApp offline — lock e status em tempo real. */
export const WHATSAPP_BOT_BROADCAST_CHANNEL = 'whatsapp-bot-status';
