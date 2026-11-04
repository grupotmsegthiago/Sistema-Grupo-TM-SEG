import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolvePublicAppUrl } from '../publicAppUrl.js';
import { LIVE_TRACK_LGPD_FULL, LIVE_TRACK_LGPD_SUMMARY, LIVE_TRACK_LGPD_VERSION } from './lgpd.js';
import { geocodeAddress, reverseGeocode } from '../../api/geocode-address.js';
import { isTerminalMissionStatus, isVeladaMission, fornecedorAtiva, rastreioOsAberta } from './isVeladaMission.js';
import {
  buildLiveTrackClientUrl,
  buildLiveTrackPublicUrl,
  buildLiveTrackWhatsappText,
  clampAccuracy,
  clampOptionalNumber,
  etapasDaTrilha,
  haversineMeters,
  LIVE_TRACK_PING_MIN_MS,
  LIVE_TRACK_TRAIL_MIN_METERS,
  LIVE_TRACK_TRAIL_MIN_MS,
  type LiveTrackStatus,
  validateCoords,
} from './pure.js';
import { ensureLiveTrackSchema, getLiveTrackSupabase } from './schema.js';

const ACTIVE_STATUSES: LiveTrackStatus[] = ['pending', 'consented', 'sharing', 'paused'];
const cacheEndereco = new Map<string, { texto: string; expira: number }>();

async function enderecoDaPosicao(lat: number, lng: number): Promise<string | null> {
  const chave = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  const salvo = cacheEndereco.get(chave);
  if (salvo && salvo.expira > Date.now()) return salvo.texto;
  const texto = await reverseGeocode(Number(lat), Number(lng));
  if (!texto) return null;
  cacheEndereco.set(chave, { texto, expira: Date.now() + 30 * 60 * 1000 });
  return texto;
}

function segredoDoCliente(): string {
  return String(process.env.LIVE_TRACK_CLIENT_SECRET || 'tmseg-rastreio-cliente-v1');
}

function assinarCliente(trackId: string): string {
  return createHmac('sha256', segredoDoCliente()).update(String(trackId)).digest('base64url').slice(0, 32);
}

export function credencialDoCliente(trackId: string): string {
  return `${trackId}.${assinarCliente(trackId)}`;
}

export function idPeloLinkDoCliente(credencial: string): string | null {
  const bruto = String(credencial || '').trim();
  const ponto = bruto.lastIndexOf('.');
  if (ponto <= 0) return null;
  const id = bruto.slice(0, ponto);
  const assinatura = bruto.slice(ponto + 1);
  const esperada = assinarCliente(id);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
    .select('id, client, provider, origin, destination, status, mission_type, agent1, agent2, driver_name, client_vehicle')
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

async function viaturaDaMissao(vehicleId: unknown): Promise<{ plate: string; model: string }> {
  const id = Number(vehicleId);
  if (!Number.isFinite(id) || id <= 0) return { plate: '', model: '' };
  try {
    const sb = await getLiveTrackSupabase();
    const { data } = await sb.from('client_vehicles').select('plate, model').eq('id', id).maybeSingle();
    return { plate: String(data?.plate || ''), model: String(data?.model || '') };
  } catch {
    return { plate: '', model: '' };
  }
}

function fichaDoCliente(mission: any, viatura: { plate: string; model: string }) {
  return {
    osNumber: mission.id,
    client: mission.client || '',
    provider: mission.provider || '',
    origin: mission.origin || '',
    destination: mission.destination || '',
    status: mission.status || '',
    agent: mission.agent1 || mission.driver_name || '',
    agent2: mission.agent2 || '',
    plate: viatura.plate,
    vehicleModel: viatura.model,
    ativa: fornecedorAtiva(mission.provider),
  };
}

function linksDoRastreio(track: { id: string; token: string }, origin: string, osNumber: string) {
  const url = buildLiveTrackPublicUrl(track.token, origin);
  return {
    url,
    clientUrl: buildLiveTrackClientUrl(credencialDoCliente(track.id), origin),
    whatsappText: buildLiveTrackWhatsappText({ osNumber, url }),
  };
}

function publicMissionView(mission: any, pontos?: { originPoint: { lat: number; lng: number } | null; destinationPoint: { lat: number; lng: number } | null }) {
  return {
    osNumber: mission.id,
    origin: mission.origin || '',
    destination: mission.destination || '',
    status: mission.status || '',
    agentHint: mission.agent1 ? String(mission.agent1).split(' ')[0] : '',
    ativa: fornecedorAtiva(mission.provider),
    originPoint: pontos?.originPoint || null,
    destinationPoint: pontos?.destinationPoint || null,
  };
}

const cacheRota = new Map<string, { at: number; originPoint: { lat: number; lng: number } | null; destinationPoint: { lat: number; lng: number } | null }>();

function enderecoParaMapa(valor: unknown): string {
  return String(valor || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\([^)]*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pontosDaRota(mission: any): Promise<{ originPoint: { lat: number; lng: number } | null; destinationPoint: { lat: number; lng: number } | null }> {
  const origem = enderecoParaMapa(mission?.origin);
  const destino = enderecoParaMapa(mission?.destination);
  const chave = `${origem}\n${destino}`;
  const salvo = cacheRota.get(chave);
  if (salvo && Date.now() - salvo.at < 30 * 60 * 1000) {
    return { originPoint: salvo.originPoint, destinationPoint: salvo.destinationPoint };
  }
  try {
    const [originPoint, destinationPoint] = await Promise.all([
      geocodeAddress(origem),
      geocodeAddress(destino),
    ]);
    const pontos = { originPoint, destinationPoint };
    cacheRota.set(chave, { at: Date.now(), ...pontos });
    return pontos;
  } catch {
    return { originPoint: null, destinationPoint: null };
  }
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
  if (!rastreioOsAberta(mission.status)) {
    const erro = isTerminalMissionStatus(mission.status)
      ? 'A OS já foi encerrada. O link de rastreio parou.'
      : 'O link fica indisponível enquanto a OS está pendente.';
    return { status: 409, body: { error: erro } };
  }

  const existing = await getActiveTrack(missionId);
  const origin = resolvePublicAppUrl(opts.req);
  if (existing) {
    const links = linksDoRastreio(existing, origin, mission.id);
    return {
      status: 200,
      body: {
        reused: true,
        trackId: existing.id,
        token: existing.token,
        ...links,
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
        const links = linksDoRastreio(raced, origin, mission.id);
        return {
          status: 200,
          body: {
            reused: true,
            trackId: raced.id,
            token: raced.token,
            ...links,
            trackStatus: raced.status,
            osNumber: mission.id,
          },
        };
      }
    }
    throw new Error(error.message);
  }
  const links = linksDoRastreio(data, origin, mission.id);
  return {
    status: 201,
    body: {
      reused: false,
      trackId: data.id,
      token,
      ...links,
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
  const links = linksDoRastreio(track, origin, mission.id);
  return {
    status: 200,
    body: {
      enabled: true,
      hasTrack: true,
      osNumber: mission.id,
      missionStatus: mission.status,
      ...links,
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

async function getTrackById(id: string) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb.from('mission_live_tracks').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function publicGetLiveTrack(opts: {
  token?: string;
  clientCredential?: string;
  contarAbertura?: boolean;
  req?: { headers?: Record<string, unknown> } | null;
}): Promise<{ status: number; body: any }> {
  await ensureLiveTrackSchema();
  const credencial = String(opts.clientCredential || '').trim();
  const token = String(opts.token || '').trim();
  const papel = credencial ? 'cliente' : 'agente';
  let track = null;
  if (credencial) {
    const id = idPeloLinkDoCliente(credencial);
    if (!id) return { status: 404, body: { error: 'Link inválido ou expirado.' } };
    track = await getTrackById(id);
  } else if (token) {
    track = await getTrackByToken(token);
  } else {
    return { status: 400, body: { error: 'token é obrigatório' } };
  }
  if (!track) return { status: 404, body: { error: 'Link inválido ou expirado.' } };

  const mission = await loadMission(track.mission_id);
  if (!mission) return { status: 404, body: { error: 'OS não encontrada.' } };

  if (!rastreioOsAberta(mission.status)) {
    if (isTerminalMissionStatus(mission.status) && track.status !== 'ended') {
      const sbFim = await getLiveTrackSupabase();
      await sbFim
        .from('mission_live_tracks')
        .update({ status: 'ended', ended_at: new Date().toISOString(), ended_reason: 'mission_terminal' })
        .eq('id', track.id);
      track.status = 'ended';
    }
    if (track.status !== 'ended') {
      return { status: 403, body: { error: 'O link fica indisponível enquanto a OS está pendente.' } };
    }
  }

  const sb = await getLiveTrackSupabase();
  if (opts.contarAbertura !== false) {
    await sb
      .from('mission_live_tracks')
      .update({
        opened_at: track.opened_at || new Date().toISOString(),
        open_count: Number(track.open_count || 0) + 1,
      })
      .eq('id', track.id);
  }

  let trail: Array<{ lat: number; lng: number; recorded_at: string }> = [];
  let ficha = null;
  const pontos = await pontosDaRota(mission);
  if (papel === 'cliente') {
    const viatura = await viaturaDaMissao(mission.client_vehicle);
    ficha = { ...fichaDoCliente(mission, viatura), ...pontos };
    const { data: pts } = await sb
      .from('mission_live_positions')
      .select('lat, lng, recorded_at')
      .eq('track_id', track.id)
      .order('recorded_at', { ascending: false })
      .limit(250);
    trail = (pts || []).slice().reverse();
  }

  let endereco: string | null = null;
  let etapas: Array<{ lat: number; lng: number; at: string; endereco: string | null }> = [];
  if (papel === 'cliente' && track.last_lat != null && track.last_lng != null) {
    endereco = await enderecoDaPosicao(Number(track.last_lat), Number(track.last_lng));
  }
  if (papel === 'cliente' && trail.length) {
    for (const etapa of etapasDaTrilha(trail)) {
      etapas.push({ ...etapa, endereco: await enderecoDaPosicao(etapa.lat, etapa.lng) });
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      papel,
      status: track.status,
      ended: track.status === 'ended',
      lgpdVersion: LIVE_TRACK_LGPD_VERSION,
      lgpdSummary: LIVE_TRACK_LGPD_SUMMARY,
      lgpdFull: LIVE_TRACK_LGPD_FULL,
      mission: papel === 'cliente' ? ficha : publicMissionView(mission, pontos),
      position: track.last_lat != null ? {
        lat: track.last_lat,
        lng: track.last_lng,
        accuracy: track.last_accuracy,
        speed: track.last_speed,
        at: track.last_seen_at,
        address: endereco,
      } : null,
      trail,
      etapas,
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
  if (!rastreioOsAberta(mission.status)) {
    const erro = isTerminalMissionStatus(mission.status)
      ? 'A missão já foi encerrada. O rastreio não é mais necessário.'
      : 'O link fica indisponível enquanto a OS está pendente.';
    return { status: isTerminalMissionStatus(mission.status) ? 410 : 403, body: { error: erro } };
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
  if (!rastreioOsAberta(mission.status)) {
    return { status: 403, body: { error: 'O link fica indisponível enquanto a OS está pendente.' } };
  }

  const coords = validateCoords(opts.body?.lat, opts.body?.lng);
  if (!coords) return { status: 400, body: { error: 'Coordenadas GPS inválidas.' } };

  const now = Date.now();
  const lastSeen = track.last_seen_at ? new Date(track.last_seen_at).getTime() : 0;
  if (lastSeen && now - lastSeen < LIVE_TRACK_PING_MIN_MS - 200) {
    return { status: 200, body: { ok: true, throttled: true, status: track.status, ended: false } };
  }

  const accuracy = clampAccuracy(opts.body?.accuracy);
  const speed = clampOptionalNumber(opts.body?.speed, -1, 80);
  const heading = clampOptionalNumber(opts.body?.heading, 0, 360);
  const battery = clampOptionalNumber(opts.body?.battery, 0, 100);
  const nextStatus: LiveTrackStatus = 'sharing';
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
