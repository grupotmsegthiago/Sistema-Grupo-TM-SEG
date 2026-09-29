/** Fotos do fim da missão precisam terminar de carregar antes do operador salvar. */

export function canSaveFinalizeEvidence(input: {
  tripUrl?: string | null;
  kmUrl?: string | null;
  tripUploading?: boolean;
  kmUploading?: boolean;
  timeConfirmed?: boolean;
}): boolean {
  return Boolean(
    input.tripUrl
    && input.kmUrl
    && !input.tripUploading
    && !input.kmUploading
    && input.timeConfirmed,
  );
}

export function endEvidencePendingPatch(operator: string) {
  return {
    end_evidence_pending: true,
    end_evidence_operator: operator,
  };
}

export function endEvidenceSavedPatch(operator: string, tripUrl: string, kmUrl: string) {
  return {
    end_trip_evidence_url: tripUrl,
    end_km_evidence_url: kmUrl,
    end_photo_time_confirmed: true,
    end_evidence_pending: false,
    end_evidence_operator: operator,
  };
}

export type OperatorEvidenceRow = {
  operator: string;
  withEvidence: number;
  pending: number;
};

function personKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function summarizeEvidenceByOperator(rows: Array<{
  operator?: string | null;
  pending?: boolean | null;
  tripUrl?: string | null;
  kmUrl?: string | null;
}>): OperatorEvidenceRow[] {
  const map = new Map<string, OperatorEvidenceRow>();
  for (const row of rows) {
    const operator = String(row.operator || '').trim() || 'Sem operador';
    const key = personKey(operator);
    const current = map.get(key) || { operator, withEvidence: 0, pending: 0 };
    const hasEvidence = Boolean(row.tripUrl && row.kmUrl);
    if (hasEvidence) current.withEvidence += 1;
    if (row.pending && !hasEvidence) current.pending += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => (b.pending - a.pending) || (b.withEvidence - a.withEvidence) || a.operator.localeCompare(b.operator, 'pt-BR'));
}

export function sameOperator(a?: string | null, b?: string | null): boolean {
  return personKey(String(a || '')) !== '' && personKey(String(a || '')) === personKey(String(b || ''));
}
