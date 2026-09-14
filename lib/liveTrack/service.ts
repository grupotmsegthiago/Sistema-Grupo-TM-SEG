import { randomBytes } from 'node:crypto';
import { resolvePublicAppUrl } from '../publicAppUrl.js';
import { LIVE_TRACK_LGPD_FULL, LIVE_TRACK_LGPD_SUMMARY, LIVE_TRACK_LGPD_VERSION } from './lgpd.js';
import { isTerminalMissionStatus, isVeladaMission } from './isVeladaMission.js';
import {
  buildLiveTrackPublicUrl,
  buildLiveTrackWhatsappText,
  clampAccuracy,
  clampOptionalNumber,
  haversineMeters,
  LIVE_TRACK_PING_MIN_MS,
  LIVE_TRACK_TRAIL_MIN_METERS,
  LIVE_TRACK_TRAIL_MIN_MS,
  type LiveTrackStatus,
  validateCoords,
} from './pure.js';
import { ensureLiveTrackSchema, getLiveTrackSupabase } from './schema.js';

const ACTIVE_STATUSES: LiveTrackStatus[] = ['pending', 'consented', 'sharing', 'paused'];

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function clientIp(req: { headers?: Record<string, unknown> } | null | undefined): string {
  const xf = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  if (xf) return xf.slice(0, 80);
  return String(req?.headers?.['x-real-ip'] || '').slice(0, 80);
}

function clientUa(req: { headers?: Record<string, unknown> } | null | undefined): string {
  return String(req?.headers?.['user-agent'] || '').slice(0, 400);
}

async function loadMission(missionId: string) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb
    .from('missions')
    .select('id, client, provider, origin, destination, status, mission_type, agent1, agent2')
    .eq('id', missionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getActiveTrack(missionId: string) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb
    .from('mission_live_tracks')
    .select('*')
    .eq('mission_id', missionId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getTrackByToken(token: string) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb
    .from('mission_live_tracks')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function publicMissionView(mission: any) {
  return {
    osNumber: mission.id,
    origin: mission.origin || '',
    destination: mission.destination || '',
    status: mission.status || '',
    agentHint: mission.agent1 ? String(mission.agent1).split(' ')[0] : '',
  };
}

export async function generateLiveTrack(opts: {
  missionId: string;
  createdBy?: string;
  req?: { headers?: Record<string, unknown> } | null;
}): Promise<{ status: number; body: any }> {
  await ensureLiveTrackSchema();
  const missionId = String(opts.missionId || '').trim();
  if (!missionId) return { status: 400, body: { error: 'missionId é obrigatório' } };

  const mission = await loadMission(missionId);
  if (!mission) return { status: 404, body: { error: 'OS não encontrada' } };
  if (!isVeladaMission(mission)) {
    return { status: 400, body: { error: 'Link de localização ao vivo só está disponível para missão velada.' } };
  }
  if (isTerminalMissionStatus(mission.status)) {
    return { status: 409, body: { error: 'A OS já foi encerrada. Não é possível gerar rastreio ao vivo.' } };
  }

  const existing = await getActiveTrack(missionId);
  const origin = resolvePublicAppUrl(opts.req);
  if (existing) {
    const url = buildLiveTrackPublicUrl(existing.token, origin);
    return {
      status: 200,
      body: {
        reused: true,
        trackId: existing.id,
        token: existing.token,
        url,
        whatsappText: buildLiveTrackWhatsappText({ osNumber: mission.id, url }),
        trackStatus: existing.status,
        osNumber: mission.id,
      },
    };
  }

  const sb = await getLiveTrackSupabase();
  const token = newToken();
  const { data, error } = await sb
    .from('mission_live_tracks')
    .insert({
      mission_id: missionId,
      token,
      status: 'pending',
      created_by: opts.createdBy || null,
    })
    .select('*')
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const raced = await getActiveTrack(missionId);
      if (raced) {
        const url = buildLiveTrackPublicUrl(raced.token, origin);
        return {
          status: 200,
          body: {
            reused: true,
            trackId: raced.id,
            token: raced.token,
            url,
            whatsappText: buildLiveTrackWhatsappText({ osNumber: mission.id, url }),
            trackStatus: raced.status,
            osNumber: mission.id,
          },
        };
      }
    }
    throw new Error(error.message);
  }
  const url = buildLiveTrackPublicUrl(token, origin);
  return {
    status: 201,
    body: {
      reused: false,
      trackId: data.id,
      token,
      url,
      whatsappText: buildLiveTrackWhatsappText({ osNumber: mission.id, url }),
      trackStatus: 'pending',
      osNumber: mission.id,
    },
  };
}

export async function endLiveTrack(opts: {
  missionId: string;
  reason?: string;
}): Promise<{ status: number; body: any }> {
  await ensureLiveTrackSchema();
  const missionId = String(opts.missionId || '').trim();
  if (!missionId) return { status: 400, body: { error: 'missionId é obrigatório' } };
  const track = await getActiveTrack(missionId);
  if (!track) return { status: 200, body: { ok: true, ended: false } };
  const sb = await getLiveTrackSupabase();
  const { error } = await sb
    .from('mission_live_tracks')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      ended_reason: opts.reason || 'operator_end',
    })
    .eq('id', track.id);
  if (error) throw new Error(error.message);
  return { status: 200, body: { ok: true, ended: true } };
}

export async function watchLiveTrack(opts: {
  missionId: string;
  includeTrail?: boolean;
}): Promise<{ status: number; body: any }> {
  await ensureLiveTrackSchema();
  const missionId = String(opts.missionId || '').trim();
  if (!missionId) return { status: 400, body: { error: 'missionId é obrigatório' } };

  const mission = await loadMission(missionId);
  if (!mission) return { status: 404, body: { error: 'OS não encontrada' } };
  if (!isVeladaMission(mission)) {
    return { status: 200, body: { enabled: false, reason: 'not_velada' } };
  }

  const sb = await getLiveTrackSupabase();
  const { data: track } = await sb
    .from('mission_live_tracks')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!track) {
    return { status: 200, body: { enabled: true, hasTrack: false, osNumber: mission.id, missionStatus: mission.status } };
  }

  if (isTerminalMissionStatus(mission.status) && ACTIVE_STATUSES.includes(track.status)) {
    await sb
      .from('mission_live_tracks')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        ended_reason: 'mission_terminal',
      })
      .eq('id', track.id);
    track.status = 'ended';
    track.ended_reason = 'mission_terminal';
  }

  let trail: Array<{ lat: number; lng: number; recorded_at: string }> = [];
  if (opts.includeTrail && track.id) {
    const { data: pts } = await sb
      .from('mission_live_positions')
      .select('lat, lng, recorded_at')
      .eq('track_id', track.id)
      .order('recorded_at', { ascending: false })
      .limit(250);
    trail = (pts || []).slice().reverse();
  }

  const origin = resolvePublicAppUrl();
  const url = buildLiveTrackPublicUrl(track.token, origin);
  return {
    status: 200,
    body: {
      enabled: true,
      hasTrack: true,
      osNumber: mission.id,
      missionStatus: mission.status,
      url,
      whatsappText: buildLiveTrackWhatsappText({ osNumber: mission.id, url }),
      track: {
        id: track.id,
        status: track.status,
        consent_at: track.consent_at,
        opened_at: track.opened_at,
        open_count: track.open_count,
        sharing_started_at: track.sharing_started_at,
        last_seen_at: track.last_seen_at,
        last_lat: track.last_lat,
        last_lng: track.last_lng,
        last_accuracy: track.last_accuracy,
        last_speed: track.last_speed,
        last_heading: track.last_heading,
        ended_at: track.ended_at,
        ended_reason: track.ended_reason,
      },
      trail,
    },
  };
}

export async function publicGetLiveTrack(opts: {
  token: string;
  req?: { headers?: Record<string, unknown> } | null;
}): Promise<{ status: number; body: any }> {
  await ensureLiveTrackSchema();
  const token = String(opts.token || '').trim();
  if (!token) return { status: 400, body: { error: 'token é obrigatório' } };
  const track = await getTrackByToken(token);
  if (!track) return { status: 404, body: { error: 'Link inválido ou expirado.' } };

  const mission = await loadMission(track.mission_id);
  if (!mission) return { status: 404, body: { error: 'OS não encontrada.' } };

  if (isTerminalMissionStatus(mission.status) && track.status !== 'ended') {
    const sb = await getLiveTrackSupabase();
    await sb
      .from('mission_live_tracks')
      .update({ status: 'ended', ended_at: new Date().toISOString(), ended_reason: 'mission_terminal' })
      .eq('id', track.id);
    track.status = 'ended';
  }

  const sb = await getLiveTrackSupabase();
  await sb
    .from('mission_live_tracks')
    .update({
      opened_at: track.opened_at || new Date().toISOString(),
      open_count: Number(track.open_count || 0) + 1,
    })
    .eq('id', track.id);

  return {
    status: 200,
    body: {
      ok: true,
      status: track.status,
      ended: track.status === 'ended',
      lgpdVersion: LIVE_TRACK_LGPD_VERSION,
      lgpdSummary: LIVE_TRACK_LGPD_SUMMARY,
      lgpdFull: LIVE_TRACK_LGPD_FULL,
      mission: publicMissionView(mission),
    },
  };
}

export async function publicConsentLiveTrack(opts: {
  token: string;
  accepted: boolean;
  req?: { headers?: Record<string, unknown> } | null;
}): Promise<{ status: number; body: any }> {
  await ensureLiveTrackSchema();
  const token = String(opts.token || '').trim();
  if (!token) return { status: 400, body: { error: 'token é obrigatório' } };
  if (!opts.accepted) return { status: 400, body: { error: 'É necessário aceitar o compartilhamento para continuar.' } };

  const track = await getTrackByToken(token);
  if (!track) return { status: 404, body: { error: 'Link inválido ou expirado.' } };
  if (track.status === 'ended') return { status: 410, body: { error: 'Este acompanhamento já foi encerrado.' } };

  const mission = await loadMission(track.mission_id);
  if (!mission) return { status: 404, body: { error: 'OS não encontrada.' } };
  if (isTerminalMissionStatus(mission.status)) {
    return { status: 410, body: { error: 'A missão já foi encerrada. O rastreio não é mais necessário.' } };
  }

  const sb = await getLiveTrackSupabase();
  const nextStatus = track.status === 'sharing' ? 'sharing' : 'consented';
  const { error } = await sb
    .from('mission_live_tracks')
    .update({
      status: nextStatus,
      consent_at: track.consent_at || new Date().toISOString(),
      consent_ip: clientIp(opts.req),
      consent_user_agent: clientUa(opts.req),
      lgpd_version: LIVE_TRACK_LGPD_VERSION,
    })
    .eq('id', track.id);
  if (error) throw new Error(error.message);
  return { status: 200, body: { ok: true, status: nextStatus, pingIntervalMs: LIVE_TRACK_PING_MIN_MS } };
}

export async function publicPingLiveTrack(opts: {
  token: string;
  body: any;
  req?: { headers?: Record<string, unknown> } | null;
}): Promise<{ status: number; body: any }> {
  await ensureLiveTrackSchema();
  const token = String(opts.token || '').trim();
  if (!token) return { status: 400, body: { error: 'token é obrigatório' } };

  const track = await getTrackByToken(token);
  if (!track) return { status: 404, body: { error: 'Link inválido ou expirado.' } };
  if (track.status === 'ended') {
    return { status: 410, body: { ok: false, ended: true, error: 'Acompanhamento encerrado.' } };
  }
  if (!track.consent_at && track.status === 'pending') {
    return { status: 403, body: { error: 'Aceite o compartilhamento antes de enviar GPS.' } };
  }

  const mission = await loadMission(track.mission_id);
  if (!mission) return { status: 404, body: { error: 'OS não encontrada.' } };
  if (isTerminalMissionStatus(mission.status)) {
    const sbEnd = await getLiveTrackSupabase();
    await sbEnd
      .from('mission_live_tracks')
      .update({ status: 'ended', ended_at: new Date().toISOString(), ended_reason: 'mission_terminal' })
      .eq('id', track.id);
    return { status: 410, body: { ok: false, ended: true, error: 'A missão foi encerrada. O rastreio parou.' } };
  }

  const coords = validateCoords(opts.body?.lat, opts.body?.lng);
  if (!coords) return { status: 400, body: { error: 'Coordenadas GPS inválidas.' } };

  const now = Date.now();
  const lastSeen = track.last_seen_at ? new Date(track.last_seen_at).getTime() : 0;
  if (lastSeen && now - lastSeen < LIVE_TRACK_PING_MIN_MS - 200) {
    return { status: 200, body: { ok: true, throttled: true, status: track.status, ended: false } };
  }

  const visibility = String(opts.body?.visibility || 'visible');
  const hidden = visibility === 'hidden';
  const accuracy = clampAccuracy(opts.body?.accuracy);
  const speed = clampOptionalNumber(opts.body?.speed, -1, 80);
  const heading = clampOptionalNumber(opts.body?.heading, 0, 360);
  const battery = clampOptionalNumber(opts.body?.battery, 0, 100);
  const nextStatus: LiveTrackStatus = hidden ? 'paused' : 'sharing';
  const nowIso = new Date(now).toISOString();

  const sb = await getLiveTrackSupabase();
  const patch: Record<string, unknown> = {
    status: nextStatus,
    last_seen_at: nowIso,
    last_lat: coords.lat,
    last_lng: coords.lng,
    last_accuracy: accuracy,
    last_speed: speed,
    last_heading: heading,
    last_battery: battery,
  };
  if (!track.sharing_started_at) patch.sharing_started_at = nowIso;

  const { error: upErr } = await sb.from('mission_live_tracks').update(patch).eq('id', track.id);
  if (upErr) throw new Error(upErr.message);

  let insertTrail = true;
  if (track.last_lat != null && track.last_lng != null && track.last_seen_at) {
    const dist = haversineMeters(
      { lat: Number(track.last_lat), lng: Number(track.last_lng) },
      coords,
    );
    const dt = now - lastSeen;
    insertTrail = dist >= LIVE_TRACK_TRAIL_MIN_METERS || dt >= LIVE_TRACK_TRAIL_MIN_MS;
  }
  if (insertTrail) {
    await sb.from('mission_live_positions').insert({
      track_id: track.id,
      mission_id: track.mission_id,
      lat: coords.lat,
      lng: coords.lng,
      accuracy,
      speed,
      heading,
      battery,
      recorded_at: nowIso,
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      ended: false,
      status: nextStatus,
      missionStatus: mission.status,
    },
  };
}
