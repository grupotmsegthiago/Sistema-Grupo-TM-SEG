/** Texto da linha "Última atualização" do card.
 * O log antigo não pode esconder uma atualização mais nova já gravada na OS.
 */
export type LiveUpdateSource = {
  created_at?: string | null;
  description?: string | null;
};

export function pickLiveMissionUpdate(
  lastLog: LiveUpdateSource | null | undefined,
  mission: { lastUpdate?: string | null; currentLocation?: string | null },
): { at: string | null; text: string } {
  const logMs = lastLog?.created_at ? new Date(lastLog.created_at).getTime() : NaN;
  const missionMs = mission.lastUpdate ? new Date(mission.lastUpdate).getTime() : NaN;
  const logOk = Number.isFinite(logMs);
  const missionOk = Number.isFinite(missionMs);
  const useMission = missionOk && (!logOk || missionMs >= logMs);
  const raw = useMission
    ? (mission.currentLocation || lastLog?.description || '')
    : (lastLog?.description || mission.currentLocation || '');
  const text = raw.includes('|') ? raw.split('|')[0].trim() : raw.trim();
  const at = useMission
    ? (mission.lastUpdate || null)
    : (lastLog?.created_at || mission.lastUpdate || null);
  return { at: at || null, text };
}

/** Campos que mudam a OS de lugar no painel ou o texto do cartão. */
export function missionBoardSnapshotChanged(
  current: {
    status?: string | null;
    lastUpdate?: string | null;
    currentLocation?: string | null;
    updatedBy?: string | null;
    occurrence_count?: number | null;
    mapLink?: string | null;
  },
  row: {
    status?: string | null;
    last_update?: string | null;
    current_location?: string | null;
    updated_by?: string | null;
    occurrence_count?: number | null;
    map_link?: string | null;
  },
): boolean {
  return String(current.status || '') !== String(row.status || '')
    || String(current.lastUpdate || '') !== String(row.last_update || '')
    || String(current.currentLocation || '') !== String(row.current_location || '')
    || String(current.updatedBy || '') !== String(row.updated_by || '')
    || Number(current.occurrence_count || 0) !== Number(row.occurrence_count || 0)
    || String(current.mapLink || '') !== String(row.map_link || '');
}
