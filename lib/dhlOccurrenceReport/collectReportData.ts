import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDateBR, formatDateTimeBR, formatTimeBR } from '../dateUtils';
import { isImageEvidenceUrl } from './photoUtils';
import type {
  DhlOccurrenceReportData,
  DhlOccurrenceReportInput,
  DhlReportEvidenceItem,
  DhlReportPhase,
  DhlReportPhasePhoto,
  DhlReportOperationalMark,
} from './types';

type EvidenceRow = {
  url: string;
  at: string;
  context: string;
  actionType: string;
  filePath: string;
};

const PHASE_LABELS: Record<DhlReportPhase, string> = {
  origem: 'Origem',
  em_viagem: 'Em viagem',
  destino: 'Chegada no destino',
  conclusao: 'Conclusão da OS — KM final',
};

function parseDetails(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function pickUrl(details: Record<string, unknown>): string | null {
  const url = details.publicUrl || details.evidenceUrl || details.url || details.imageUrl;
  return url ? String(url) : null;
}

function formatKm(value: unknown): string | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} km`;
}

function evidenceLabel(item: EvidenceRow): string {
  const map: Record<string, string> = {
    mirroring: 'Espelhamento na origem',
    mirror_proof: 'Comprovante espelhamento (intake DHL)',
    dhl_deslocamento_print: 'Print aprovação deslocamento DHL',
    odometer_print: 'Hodômetro — print KM final',
    odometer_storage: 'Hodômetro (storage)',
    evidence_upload: 'Evidência — criação/atualização OS',
    terminal_status_confirmed: 'Confirmação status terminal (Atualizar OS)',
    refused_status_evidence: 'Evidência — recusa da OS',
    cancel_status_evidence: 'Evidência — cancelamento da OS',
    storage: 'Arquivo mission-evidence',
  };
  const ctx = String(item.context || '').trim();
  if (ctx) return ctx;
  return map[item.actionType] || item.actionType || 'Evidência fotográfica';
}

function evidenceSource(item: EvidenceRow): string {
  if (item.filePath) return `Storage: ${item.filePath}`;
  if (item.actionType === 'mirroring' || item.actionType === 'mirror_proof') return 'missions / dhl_supplier_intakes';
  if (item.actionType) return `system_logs — ${item.actionType}`;
  return 'mission-evidence';
}

function buildAllEvidencePhotos(pool: EvidenceRow[]): DhlReportEvidenceItem[] {
  return [...pool]
    .sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      return ta - tb;
    })
    .map((item) => ({
      url: item.url,
      label: evidenceLabel(item),
      actionType: item.actionType,
      at: item.at || null,
      source: evidenceSource(item),
    }));
}

function pushEvidence(pool: EvidenceRow[], item: { url: string; at?: string; context?: string; actionType?: string; filePath?: string }): void {
  const url = String(item.url || '').trim();
  if (!url || !isImageEvidenceUrl(url) || pool.some((p) => p.url === url)) return;
  pool.push({
    url,
    at: item.at || '',
    context: item.context || '',
    actionType: item.actionType || '',
    filePath: item.filePath || '',
  });
}

async function listStorageFiles(
  sb: SupabaseClient,
  folderPath: string,
): Promise<Array<{ name: string; created_at: string; fullPath: string }>> {
  try {
    const { data, error } = await sb.storage.from('mission-evidence').list(folderPath, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error || !data) return [];
    return data
      .filter((f) => f.name && !f.name.endsWith('/'))
      .map((f) => ({
        name: f.name,
        created_at: f.created_at || f.updated_at || '',
        fullPath: folderPath ? `${folderPath}/${f.name}` : f.name,
      }));
  } catch {
    return [];
  }
}

function publicStorageUrl(storagePath: string): string {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co';
  const clean = storagePath.replace(/^\/+/, '');
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/mission-evidence/${clean}`;
}

async function collectMissionEvidence(
  sb: SupabaseClient,
  missionId: string,
  mission: Record<string, unknown>,
): Promise<EvidenceRow[]> {
  const pool: EvidenceRow[] = [];

  const mirroringUrl = String(mission.mirroring_evidence_url || '').trim();
  if (mirroringUrl) {
    pushEvidence(pool, { url: mirroringUrl, context: 'Espelhamento', actionType: 'mirroring' });
  }

  const deslocUrl = String(mission.dhl_deslocamento_approval_url || '').trim();
  if (deslocUrl) {
    pushEvidence(pool, { url: deslocUrl, context: 'Deslocamento DHL', actionType: 'dhl_deslocamento_print' });
  }

  try {
    const { data: intake } = await sb
      .from('dhl_supplier_intakes')
      .select('mirror_proof_url, updated_at')
      .eq('mission_id', missionId)
      .maybeSingle();
    if (intake?.mirror_proof_url) {
      pushEvidence(pool, {
        url: String(intake.mirror_proof_url),
        at: String(intake.updated_at || ''),
        context: 'Espelhamento intake DHL',
        actionType: 'mirror_proof',
      });
    }
  } catch {
    /* intake opcional */
  }

  const storagePrefixes = [
    missionId,
    `odometer/${missionId}`,
    `refused/${missionId}`,
    `cancelled/${missionId}`,
    `dhl-mirror-proof/${missionId}`,
    'espelhamento',
  ];
  for (const prefix of storagePrefixes) {
    const files = await listStorageFiles(sb, prefix);
    for (const file of files) {
      if (prefix === 'espelhamento' && !file.name.includes(missionId)) continue;
      let actionType = 'storage';
      let context = 'Arquivo mission-evidence';
      if (file.fullPath.includes('/odometer/')) {
        actionType = 'odometer_storage';
        context = 'Hodômetro — KM final (Atualizar OS)';
      } else if (file.fullPath.includes('/refused/')) {
        actionType = 'refused_status_evidence';
        context = 'Evidência — recusa da OS (Atualizar OS)';
      } else if (file.fullPath.includes('/cancelled/')) {
        actionType = 'cancel_status_evidence';
        context = 'Evidência — cancelamento da OS (Atualizar OS)';
      } else if (file.fullPath.includes('/dhl-mirror-proof/')) {
        actionType = 'mirror_proof';
        context = 'Comprovante espelhamento (intake DHL)';
      } else if (file.fullPath.includes('/deslocamento_')) {
        actionType = 'dhl_deslocamento_print';
        context = 'Print aprovação deslocamento DHL';
      } else if (file.fullPath.includes('/espelhamento/')) {
        actionType = 'mirroring';
        context = 'Espelhamento na origem (Atualizar OS)';
      } else if (file.fullPath.startsWith(`${missionId}/`)) {
        actionType = 'evidence_upload';
        context = 'Evidência — pasta da OS (criação/atualização)';
      }
      pushEvidence(pool, {
        url: publicStorageUrl(file.fullPath),
        at: file.created_at,
        context,
        actionType,
        filePath: file.fullPath,
      });
    }
  }

  return pool;
}

function nearestEvidence(
  items: EvidenceRow[],
  targetIso: string | null,
  used: Set<string>,
): EvidenceRow | null {
  if (!targetIso || !items.length) return null;
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return null;

  let best: EvidenceRow | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (used.has(item.url)) continue;
    const t = new Date(item.at).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }
  if (best && bestDiff <= 3 * 60 * 60 * 1000) {
    used.add(best.url);
    return best;
  }
  return null;
}

function buildPhasePhotos(input: {
  marks: Record<string, string | null>;
  evidence: EvidenceRow[];
  mirroringUrl: string | null;
  deslocUrl: string | null;
}): DhlReportPhasePhoto[] {
  const used = new Set<string>();
  const pool = [...input.evidence];

  const pickBy = (predicate: (e: EvidenceRow) => boolean): EvidenceRow | null => {
    const found = pool.find((e) => !used.has(e.url) && predicate(e));
    if (found) {
      used.add(found.url);
      return found;
    }
    return null;
  };

  const pickChronological = (): EvidenceRow | null => {
    const sorted = [...pool]
      .filter((e) => !used.has(e.url))
      .sort((a, b) => {
        const ta = new Date(a.at).getTime();
        const tb = new Date(b.at).getTime();
        if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
        if (!Number.isFinite(ta)) return 1;
        if (!Number.isFinite(tb)) return -1;
        return ta - tb;
      });
    const found = sorted[0] || null;
    if (found) used.add(found.url);
    return found;
  };

  const pickMirroring = (): EvidenceRow | null => {
    if (input.mirroringUrl && isImageEvidenceUrl(input.mirroringUrl) && !used.has(input.mirroringUrl)) {
      used.add(input.mirroringUrl);
      return { url: input.mirroringUrl, at: '', context: 'Espelhamento', actionType: 'mirroring', filePath: '' };
    }
    return pickBy((e) => e.actionType === 'mirroring' || e.actionType === 'mirror_proof')
      || pickBy((e) => /espelh|origem|solicita/i.test(`${e.context} ${e.actionType} ${e.filePath}`));
  };

  const pickDeslocamento = (): EvidenceRow | null => {
    if (input.deslocUrl && isImageEvidenceUrl(input.deslocUrl) && !used.has(input.deslocUrl)) {
      used.add(input.deslocUrl);
      return { url: input.deslocUrl, at: '', context: 'Deslocamento DHL', actionType: 'dhl_deslocamento_print', filePath: '' };
    }
    return pickBy((e) => e.actionType === 'dhl_deslocamento_print')
      || pickBy((e) => /desloc/i.test(`${e.context} ${e.actionType} ${e.filePath}`));
  };

  const pickOdometerFinal = (): EvidenceRow | null =>
    pickBy((e) => e.actionType === 'terminal_status_confirmed')
    || pickBy((e) => e.actionType === 'odometer_print' || e.actionType === 'odometer_storage')
    || pickBy((e) => /\/odometer\//i.test(e.url) || /\/odometer\//i.test(e.filePath))
    || pickBy((e) => /hod[oô]metr|km final|conclus|terminal/i.test(`${e.context} ${e.actionType}`));

  const phases: Array<{ phase: DhlReportPhase; at: string | null; pick: () => EvidenceRow | null }> = [
    { phase: 'origem', at: input.marks.originArrival || null, pick: pickMirroring },
    {
      phase: 'em_viagem',
      at: input.marks.inTransit || null,
      pick: () => pickDeslocamento() || nearestEvidence(pool, input.marks.inTransit, used) || pickChronological(),
    },
    {
      phase: 'destino',
      at: input.marks.destinationArrival || null,
      pick: () =>
        pickBy((e) => /destino|chegada/i.test(`${e.context} ${e.actionType}`))
        || nearestEvidence(pool, input.marks.destinationArrival, used)
        || pickChronological(),
    },
    {
      phase: 'conclusao',
      at: input.marks.completed || null,
      pick: () => pickOdometerFinal() || nearestEvidence(pool, input.marks.completed, used) || pickChronological(),
    },
  ];

  const result = phases.map(({ phase, at, pick }) => {
    const picked = pick();
    return {
      phase,
      label: PHASE_LABELS[phase],
      at,
      url: picked?.url || null,
      note: picked ? picked.context : 'Evidência não registrada no sistema para esta etapa.',
    };
  });

  for (const photo of result) {
    if (photo.url) continue;
    const leftover = pool.find((e) => !used.has(e.url));
    if (leftover) {
      used.add(leftover.url);
      photo.url = leftover.url;
      photo.note = leftover.context;
    }
  }

  return result;
}

export async function collectDhlOccurrenceReportData(
  sb: SupabaseClient,
  input: DhlOccurrenceReportInput,
): Promise<DhlOccurrenceReportData | null> {
  try {
    const missionId = String(input.missionId || '').trim();
    if (!missionId) return null;

    const { data: mission } = await sb.from('missions').select('*').eq('id', missionId).maybeSingle();
    if (!mission) return null;

    const seNumber = String(mission.dhl_se_number || '').trim();
    if (!seNumber) return null;

    const [{ data: history }, { data: logs }, { data: evidenceLogs }] = await Promise.all([
      sb
        .from('mission_history')
        .select('changed_at,field_name,new_value')
        .eq('mission_id', missionId)
        .order('changed_at', { ascending: true }),
      sb
        .from('system_logs')
        .select('created_at,action_type,details,entity')
        .eq('entity_id', missionId)
        .order('created_at', { ascending: true }),
      sb
        .from('system_logs')
        .select('created_at,action_type,details,entity')
        .eq('entity', 'MissionEvidence')
        .eq('entity_id', missionId)
        .order('created_at', { ascending: true }),
    ]);

    const evidence = await collectMissionEvidence(sb, missionId, mission as Record<string, unknown>);

    const rows = history || [];
    const lastStatus = (val: string) =>
      [...rows].reverse().find((h) => h.field_name === 'status' && h.new_value === val)?.changed_at || null;

    const originArrival = lastStatus('Origem');
    const inTransit = lastStatus('Em Viagem');
    const completed = lastStatus('Concluída');

    const destinationArrival =
      [...rows]
        .reverse()
        .find(
          (h) =>
            h.field_name === 'current_location' &&
            String(h.new_value || '').toUpperCase().includes('CHEGADA NO DESTINO'),
        )?.changed_at || null;

    const destinationOperational =
      [...rows]
        .reverse()
        .find(
          (h) =>
            h.field_name === 'current_location' &&
            String(h.new_value || '').toUpperCase().includes('CHEGADA NO DESTINO'),
        )?.new_value?.split('|').pop()?.trim() || null;

    let clientVehiclePlate: string | null = null;
    let clientVehicleModel: string | null = null;
    const clientVehicleId = mission.client_vehicle || mission.client_vehicle_id;
    if (clientVehicleId) {
      const { data: cv } = await sb
        .from('client_vehicles')
        .select('plate,model')
        .eq('id', clientVehicleId)
        .maybeSingle();
      if (cv?.plate) clientVehiclePlate = cv.plate;
      if (cv?.model) clientVehicleModel = cv.model;
    }

    let escortVehiclePlate: string | null = null;
    let escortVehicleModel: string | null = null;
    if (mission.vehicle_id) {
      const { data: veh } = await sb.from('vehicles').select('plate,model').eq('id', mission.vehicle_id).maybeSingle();
      if (veh?.plate) escortVehiclePlate = veh.plate;
      if (veh?.model) escortVehicleModel = veh.model;
    }

    const scheduledMissionAt =
      rows.find((h) => h.field_name === 'status' && h.new_value === 'Agendada')?.changed_at || null;

    let odometerStartKm: string | null = formatKm(mission.start_km);
    let odometerEndKm: string | null = formatKm(mission.end_km);

    for (const log of [...(logs || []), ...(evidenceLogs || [])]) {
      const details = parseDetails(log.details);
      const url = pickUrl(details);
      if (url) {
        pushEvidence(evidence, {
          url,
          at: String(log.created_at || details.uploadedAt || details.confirmedAt || ''),
          context: String(details.context || log.action_type || ''),
          actionType: String(log.action_type || ''),
          filePath: String(details.filePath || ''),
        });
      }

      const rawKm = details.km ?? details.odometer ?? details.hodometro ?? details.hodômetro;
      if (rawKm != null) {
        const km = String(rawKm).trim();
        const ctx = String(details.context || log.action_type || '').toLowerCase();
        if (!odometerStartKm && (ctx.includes('inicial') || ctx.includes('origem') || String(log.action_type || '').includes('start'))) {
          odometerStartKm = km.includes('km') ? km : `${km} km`;
        }
        if (ctx.includes('final') || ctx.includes('conclus') || ctx.includes('terminal') || String(log.action_type || '').includes('odometer')) {
          odometerEndKm = km.includes('km') ? km : `${km} km`;
        }
      }
    }

    const marks: DhlReportOperationalMark[] = [
      { label: 'Horário programado (origem)', at: mission.start_time || null },
      { label: 'Chegada na origem', at: originArrival },
      { label: 'Início da operação (saída da origem)', at: inTransit },
      { label: 'Chegada no destino', at: destinationArrival },
      { label: 'Fim da missão', at: completed || mission.end_time || null },
    ];

    let delayMinutesAtOrigin: number | null = null;
    if (mission.start_time && originArrival) {
      const scheduled = new Date(mission.start_time).getTime();
      const arrived = new Date(originArrival).getTime();
      if (Number.isFinite(scheduled) && Number.isFinite(arrived) && arrived > scheduled) {
        delayMinutesAtOrigin = Math.round((arrived - scheduled) / 60000);
      }
    }

    const phasePhotos = buildPhasePhotos({
      marks: {
        originArrival,
        inTransit,
        destinationArrival,
        completed: completed || mission.end_time || null,
      },
      evidence,
      mirroringUrl: mission.mirroring_evidence_url || null,
      deslocUrl: mission.dhl_deslocamento_approval_url || null,
    });

    const allEvidencePhotos = buildAllEvidencePhotos(evidence);

    const agents = [mission.agent1, mission.agent2].filter(Boolean).map(String);

    return {
      missionId,
      seNumber,
      client: mission.client || 'DHL Supply Chain',
      provider: mission.provider || '—',
      origin: mission.origin || '—',
      destination: mission.destination || '—',
      destinationOperational,
      clientVehiclePlate,
      escortVehiclePlate,
      clientVehicleModel,
      escortVehicleModel,
      agents,
      scheduledOriginAt: mission.start_time || null,
      scheduledMissionAt,
      missionCreatedAt: mission.created_at || null,
      odometerStartKm,
      odometerEndKm,
      marks,
      phasePhotos,
      allEvidencePhotos,
      delayMinutesAtOrigin,
      factsSummary: input.factsSummary?.trim() || null,
      emailLink: input.emailLink?.trim() || null,
      emailAttachmentText: input.emailAttachmentText?.trim() || null,
      directorName: input.directorName?.trim() || 'Diretoria — Grupo TM SEG',
      generatedAt: input.generatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error('[dhlOccurrenceReport] collect:', err);
    return null;
  }
}

export function formatMarkLine(mark: DhlReportOperationalMark): string {
  if (!mark.at) return `${mark.label}: —`;
  return `${mark.label}: ${formatDateBR(mark.at)} ${formatTimeBR(mark.at)}`;
}
