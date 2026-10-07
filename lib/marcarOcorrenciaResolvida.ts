import { publishMissionLive } from './missionLiveBroadcast';
import { normalizeOccurrenceText, resolutionTextError } from './missionOccurrence';
import { supabase } from './supabase';

export type ResultadoResolucaoOcorrencia =
  | { ok: true; openCount: number; auditFailed: boolean }
  | { ok: false; error: string; already?: boolean };

/** Marca a ocorrência como resolvida. A linha continua na OS, só sai da lista em aberto. */
export async function marcarOcorrenciaResolvida(input: {
  occurrenceId: string;
  missionId: string;
  note: string;
  author: string;
}): Promise<ResultadoResolucaoOcorrencia> {
  const message = resolutionTextError(input.note);
  if (message) return { ok: false, error: message };
  const note = normalizeOccurrenceText(input.note);
  const author = String(input.author || '').trim() || 'Financeiro';
  const resolvedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('mission_occurrences')
    .update({ resolved_at: resolvedAt, resolved_by: author, resolution_note: note })
    .eq('id', input.occurrenceId)
    .eq('mission_id', input.missionId)
    .is('resolved_at', null)
    .select('id')
    .maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated) return { ok: false, error: 'Essa ocorrência já foi resolvida.', already: true };

  const { count, error: countError } = await supabase
    .from('mission_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('mission_id', input.missionId)
    .is('resolved_at', null);
  if (countError) return { ok: false, error: countError.message };
  const openCount = count ?? 0;
  const { error: missionError } = await supabase
    .from('missions')
    .update({ occurrence_count: openCount })
    .eq('id', input.missionId);
  if (missionError) return { ok: false, error: missionError.message };

  const { error: logError } = await supabase.from('system_logs').insert([{
    user_name: author,
    action_type: 'OTHER',
    entity: 'MissionOccurrence',
    entity_id: input.missionId,
    details: JSON.stringify({
      ocorrencia: input.occurrenceId,
      resolvido: note,
      aviso: 'Ocorrência marcada como resolvida.',
    }),
  }]);

  void publishMissionLive('occurrence', { mission_id: input.missionId, occurrence_count: openCount });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshMissions'));
  return { ok: true, openCount, auditFailed: !!logError };
}
