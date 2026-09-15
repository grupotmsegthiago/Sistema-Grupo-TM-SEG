import { createSupabaseAdminClient } from '../supabaseAdmin.js';

let ready = false;

export async function getLiveTrackSupabase() {
  const sb = createSupabaseAdminClient();
  if (!sb) {
    throw new Error('Supabase admin indisponível para o rastreio ao vivo.');
  }
  return sb;
}

/** Confirma que as tabelas existem (fail-closed). A DDL fica na migration SQL. */
export async function ensureLiveTrackSchema(): Promise<void> {
  if (ready) return;
  const sb = await getLiveTrackSupabase();
  const { error } = await sb.from('mission_live_tracks').select('id').limit(1);
  if (error) {
    const msg = String(error.message || error);
    if (/does not exist|schema cache|could not find/i.test(msg)) {
      throw new Error('Rastreio ao vivo ainda não está no banco. Aplique migrations/2026_09_14_mission_live_track.sql.');
    }
    throw new Error(msg);
  }
  ready = true;
}
