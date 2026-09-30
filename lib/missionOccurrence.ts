/** Texto do aviso no cartão quando a OS já tem ocorrência salva. */
export const OCCURRENCE_BANNER = 'Essa OS possui ocorrências, verificar..';

const MIN_LENGTH = 5;
const MAX_LENGTH = 2000;

export function normalizeOccurrenceText(raw: string): string {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

export function occurrenceTextError(raw: string): string | null {
  const text = normalizeOccurrenceText(raw);
  if (text.length < MIN_LENGTH) return 'Descreva o problema para a auditoria poder verificar.';
  if (text.length > MAX_LENGTH) return 'A ocorrência passou de 2000 caracteres.';
  return null;
}

export function missionHasOccurrence(count: number | null | undefined): boolean {
  return Number(count) > 0;
}

export function isOccurrenceOpen(row: { resolved_at?: string | null }): boolean {
  return !String(row.resolved_at || '').trim();
}

export function countOpenOccurrences(rows: { resolved_at?: string | null }[]): number {
  return rows.filter(isOccurrenceOpen).length;
}

export function resolutionTextError(raw: string): string | null {
  const text = normalizeOccurrenceText(raw);
  if (text.length < MIN_LENGTH) return 'Descreva o que foi resolvido.';
  if (text.length > MAX_LENGTH) return 'A resolução passou de 2000 caracteres.';
  return null;
}

export type OpenOccurrenceSource = {
  id: string;
  mission_id: string;
  description: string;
  created_by?: string | null;
  created_at: string;
  evidence_url?: string | null;
  resolved_at?: string | null;
};

export type OpenOccurrenceMission = {
  id: string;
  client?: string | null;
  origin?: string | null;
  destination?: string | null;
};

export type OpenOccurrenceView = {
  id: string;
  missionId: string;
  description: string;
  createdBy: string;
  createdAt: string;
  evidenceUrl: string | null;
  client: string;
  route: string;
};

/** Junta a ocorrência em aberto com a OS. OS ausente não vira cliente vazio. */
export function buildOpenOccurrenceViews(
  occurrences: OpenOccurrenceSource[],
  missions: OpenOccurrenceMission[],
): OpenOccurrenceView[] {
  const byId = new Map(missions.map((mission) => [String(mission.id), mission]));
  return occurrences.filter(isOccurrenceOpen).map((row) => {
    const mission = byId.get(String(row.mission_id));
    const origin = String(mission?.origin || '').trim();
    const destination = String(mission?.destination || '').trim();
    return {
      id: row.id,
      missionId: String(row.mission_id),
      description: row.description,
      createdBy: String(row.created_by || '').trim() || 'Operador',
      createdAt: row.created_at,
      evidenceUrl: row.evidence_url || null,
      client: mission ? (String(mission.client || '').trim() || 'NÃO INFORMADO') : 'NÃO CARREGADO',
      route: mission ? ([origin, destination].filter(Boolean).join(' → ') || 'NÃO INFORMADO') : 'NÃO CARREGADO',
    };
  });
}
