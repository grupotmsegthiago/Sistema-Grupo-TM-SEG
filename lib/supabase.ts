import { createClient } from '@supabase/supabase-js';
import { fetchDasTabelasProtegidas } from './dadosProtegidos/clienteNavegador';
import { resolveSupabasePublicConfig } from './resolveSupabasePublicConfig';

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabasePublicConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchDasTabelasProtegidas(globalThis.fetch.bind(globalThis)) },
});

/** Canal broadcast compartilhado: quem envia e quem escuta devem usar o mesmo nome. */
export const MISSION_UPDATES_BROADCAST_CHANNEL = 'mission-updates';

/** Popup global bot WhatsApp offline — lock e status em tempo real. */
export const WHATSAPP_BOT_BROADCAST_CHANNEL = 'whatsapp-bot-status';
