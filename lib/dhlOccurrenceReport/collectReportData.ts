import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDateBR, formatDateTimeBR, formatTimeBR } from '../dateUtils';
import type {
  DhlOccurrenceReportData,
  DhlOccurrenceReportInput,
  DhlReportPhase,
  DhlReportPhasePhoto,
  DhlReportOperationalMark,
} from './types';

type EvidenceRow = {
  url: string;
  at: string;
  context: string;
  actionType: string;
};

const PHASE_LABELS: Record<DhlReportPhase, string> = {
  origem: 'Origem',
  em_viagem: 'Em viagem',
  destino: 'Chegada no destino',
  conclusao: 'Conclusão da OS',
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
  const url = details.publicUrl || details.evidenceUrl || details.url;
  return url ? String(url) : null;
}

async function listStorageFiles(
  sb: SupabaseClient,
  missionId: string,
): Promise<Array<{ name: string; created_at: string }>> {
  try {
    const { data, error } = await sb.storage.from('mission-evidence').list(missionId, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error || !data) return [];
    return data
      .filter((f) => f.name && !f.name.endsWith('/'))
      .map((f) => ({
        name: f.name,
        created_at: f.created_at || f.updated_at || '',
      }));
  } catch {
    return [];
  }
}

function publicStorageUrl(missionId: string, fileName: string): string {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co';
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/mission-evidence/${missionId}/${fileName}`;
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
  missionId: string;
  storageFiles: Array<{ name: string; created_at: string }>;
}): DhlReportPhasePhoto[] {
  const used = new Set<string>();
  const pool = [...input.evidence];

  for (const file of input.storageFiles) {
    const url = publicStorageUrl(input.missionId, file.name);
    if (pool.some((p) => p.url === url)) continue;
    pool.push({
      url,
      at: file.created_at,
      context: 'Arquivo mission-evidence',
      actionType: 'storage',
    });
  }

  const phases: Array<{ phase: DhlReportPhase; at: string | null; prefer?: (e: EvidenceRow) => boolean }> = [
    { phase: 'origem', at: input.marks.originArrival || null },
    { phase: 'em_viagem', at: input.marks.inTransit || null },
    { phase: 'destino', at: input.marks.destinationArrival || null },
    { phase: 'conclusao', at: input.marks.completed || null },
  ];

  return phases.map(({ phase, at }) => {
    let picked: EvidenceRow | null = null;

    if (phase === 'origem' && input.mirroringUrl) {
      picked = {
        url: input.mirroringUrl,
        at: at || '',
        context: 'Evidência de espelhamento',
        actionType: 'mirroring',
      };
      used.add(input.mirroringUrl);
    }

    if (!picked) {
      const prefer = (e: EvidenceRow) => {
        const ctx = e.context.toLowerCase();
        if (phase === 'conclusao') {
          return e.actionType.includes('odometer') || e.actionType.includes('terminal') || ctx.includes('hodômetro') || ctx.includes('hodometro') || ctx.includes('conclus');
        }
        if (phase === 'origem') return ctx.includes('origem') || ctx.includes('espelh') || ctx.includes('solicita');
        if (phase === 'destino') return ctx.includes('destino') || ctx.includes('chegada');
        if (phase === 'em_viagem') return ctx.includes('viagem') || ctx.includes('percurso');
        return false;
      };
      picked = pool.find((e) => !used.has(e.url) && prefer(e)) || nearestEvidence(pool, at, used);
    }

    return {
      phase,
      label: PHASE_LABELS[phase],
      at,
      url: picked?.url || null,
      note: picked ? picked.context : 'Evidência não registrada no sistema para esta etapa.',
    };
  });
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

    const [{ data: history }, { data: logs }, storageFiles] = await Promise.all([
      sb
        .from('mission_history')
        .select('changed_at,field_name,new_value')
        .eq('mission_id', missionId)
        .order('changed_at', { ascending: true }),
      sb
        .from('system_logs')
        .select('created_at,action_type,details')
        .eq('entity_id', missionId)
        .order('created_at', { ascending: true }),
      listStorageFiles(sb, missionId),
    ]);

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

    let odometerStartKm: string | null = null;
    let odometerEndKm: string | null = null;
    const evidence: EvidenceRow[] = [];
    for (const log of logs || []) {
      const details = parseDetails(log.details);
      const rawKm = details.km ?? details.odometer ?? details.hodometro ?? details.hodômetro;
      if (rawKm != null) {
        const km = String(rawKm).trim();
        const ctx = String(details.context || log.action_type || '').toLowerCase();
        if (!odometerStartKm && (ctx.includes('inicial') || ctx.includes('origem') || log.action_type?.includes('start'))) {
          odometerStartKm = km.includes('km') ? km : `${km} km`;
        }
        if (ctx.includes('final') || ctx.includes('conclus') || ctx.includes('terminal') || log.action_type?.includes('odometer')) {
          odometerEndKm = km.includes('km') ? km : `${km} km`;
        }
      }
      const url = pickUrl(details);
      if (!url) continue;
      evidence.push({
        url,
        at: String(log.created_at || details.uploadedAt || ''),
        context: String(details.context || log.action_type || ''),
        actionType: String(log.action_type || ''),
      });
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
      missionId,
      storageFiles,
    });

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
