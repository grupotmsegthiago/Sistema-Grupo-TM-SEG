/**
 * Coleta só-leitura dos dados da OS para o relatório analítico.
 * Não altera missão, faturamento, Asaas nem cálculos.
 */
import { supabase } from '../supabase';
import { authFetch } from '../authFetch';
import { fetchAgentsByNames } from '../agents/fetchAgentsByNames';
import { findAgentByName } from '../agents/agentNameMatch';
import { googleMapsApiKey } from '../maps';
import { isImageEvidenceUrl } from '../dhlOccurrenceReport/photoUtils';
import type { Agent, Mission, MissionHistory, MissionLog, Vehicle } from '../../types';
import {
  buildStaticMapUrl,
  distanciaTotalPontos,
  montarPontosRota,
  type RoutePoint,
} from './routePoints';

export type AnalyticalPhoto = {
  url: string;
  caption: string;
  at: string | null;
};

export type AnalyticalAgent = {
  role: string;
  name: string;
  cpf?: string | null;
  cnh?: string | null;
  cnv?: string | null;
  phone?: string | null;
};

export type StatusMark = {
  status: string;
  at: string | null;
  by: string | null;
};

export type MissionAnalyticalReportData = {
  missionId: string;
  status: string;
  client: string;
  clientCnpj: string | null;
  clientContact?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  provider: string;
  origin: string;
  destination: string;
  missionType: string;
  specialOperation?: string | null;
  grEspelhamento?: string | null;
  createdAt: string | null;
  lastUpdate?: string | null;
  startTime: string | null;
  endTime: string | null;
  estimatedTime?: string | null;
  startKm: number | null;
  endKm: number | null;
  kmRodado: number | null;
  totalDistance: number | null;
  traveledDistance?: number | null;
  durationLabel: string;
  arrivalOrigin?: string | null;
  operationStart?: string | null;
  operationEnd?: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverName2: string | null;
  driverPhone2: string | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  vehicleType: string | null;
  vehicleYear?: string | null;
  vehicleColor?: string | null;
  clientVehicle: string | null;
  clientVehicle2: string | null;
  agents: AnalyticalAgent[];
  currentLocation: string | null;
  seNumber: string | null;
  smNumber: string | null;
  vendorOsNumber?: string | null;
  referenceNumber?: string | null;
  invoiceNumber: string | null;
  billingApproved: boolean;
  revenueStored: number | null;
  costStored: number | null;
  tollStored: number | null;
  providerStartKm?: number | null;
  providerEndKm?: number | null;
  providerStartTime?: string | null;
  providerEndTime?: string | null;
  statusTimeline?: StatusMark[];
  logs: MissionLog[];
  history: MissionHistory[];
  photos: AnalyticalPhoto[];
  points: RoutePoint[];
  mapUrl: string | null;
  directionsLink: string | null;
  routeKmEstimado: number;
  generatedAt: string;
};

function pick(m: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = m[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function durationLabel(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!(ms > 0)) return '—';
  const h = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(min).padStart(2, '0')}min`;
}

function vehicleLabel(v?: { plate?: string | null; model?: string | null; brand?: string | null } | null): string | null {
  if (!v) return null;
  const plate = String(v.plate || '').trim();
  const model = [v.brand, v.model].filter(Boolean).join(' ').trim();
  if (plate && model) return `${plate} — ${model}`;
  return plate || model || null;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = String(address || '').trim();
  if (q.length < 3) return null;
  try {
    const res = await authFetch(`/api/geocode-address?address=${encodeURIComponent(q)}`);
    const json = await res.json().catch(() => ({}));
    const loc = json?.location;
    if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
      return { lat: Number(loc.lat), lng: Number(loc.lng) };
    }
  } catch {
    /* fail-soft: relatório segue sem mapa */
  }
  return null;
}

function pushPhoto(photos: AnalyticalPhoto[], photo: AnalyticalPhoto | null) {
  if (!photo?.url) return;
  if (photos.some((p) => p.url === photo.url)) return;
  photos.push(photo);
}

function extractPhotoUrlsFromText(text: string, at: string | null, caption: string): AnalyticalPhoto[] {
  const found: AnalyticalPhoto[] = [];
  const re = /https?:\/\/[^\s"'<>]+/gi;
  for (const match of String(text || '').match(re) || []) {
    if (!isImageEvidenceUrl(match)) continue;
    found.push({ url: match, caption, at });
  }
  return found;
}

function parseEvidenceDetails(raw: unknown): AnalyticalPhoto | null {
  let details: Record<string, unknown> = {};
  if (raw && typeof raw === 'object') details = raw as Record<string, unknown>;
  else {
    try { details = JSON.parse(String(raw || '{}')); } catch { return null; }
  }
  const url = String(details.publicUrl || details.evidenceUrl || details.url || details.imageUrl || '').trim();
  if (!url || !isImageEvidenceUrl(url)) return null;
  return {
    url,
    caption: String(details.caption || details.context || details.uploadedBy || 'Evidência da OS'),
    at: String(details.uploadedAt || details.at || '') || null,
  };
}

export async function collectMissionAnalyticalReport(mission: Mission): Promise<MissionAnalyticalReportData> {
  const raw = mission as unknown as Record<string, unknown>;
  const id = String(mission.id);
  const origin = String(pick(raw, 'origin') || '');
  const destination = String(pick(raw, 'destination') || '');
  const startTime = String(pick(raw, 'startTime', 'start_time') || '') || null;
  const endTime = String(pick(raw, 'endTime', 'end_time') || '') || null;
  const startKm = num(pick(raw, 'startKm', 'start_km'));
  const endKm = num(pick(raw, 'endKm', 'end_km'));
  const mapLink = String(pick(raw, 'mapLink', 'map_link') || '') || null;

  const [logsRes, historyRes, agentsRows, evidenceRes, vehicleRes] = await Promise.all([
    supabase.from('mission_logs').select('*').eq('mission_id', id).order('created_at', { ascending: true }),
    supabase.from('mission_history').select('*').eq('mission_id', id).order('changed_at', { ascending: true }),
    fetchAgentsByNames(supabase, [mission.agent1, mission.agent2]),
    supabase.from('system_logs').select('details, created_at').eq('entity', 'MissionEvidence').eq('entity_id', id),
    mission.vehicleId
      ? (!Number.isNaN(Number(mission.vehicleId))
        ? supabase.from('vehicles').select('*').eq('id', mission.vehicleId).maybeSingle()
        : supabase.from('vehicles').select('*').eq('plate', mission.vehicleId).maybeSingle())
      : Promise.resolve({ data: null }),
  ]);

  let clientCnpj: string | null = null;
  let clientContact: string | null = null;
  let clientPhone: string | null = null;
  let clientEmail: string | null = null;
  let clientAddress: string | null = null;
  try {
    const cols = 'cnpj, trading_name, contact_name, email, operational_email, phone, address, city, state';
    let row: Record<string, unknown> | null = null;
    const { data: cliByName } = await supabase.from('clients').select(cols).eq('name', mission.client).limit(1);
    row = (cliByName?.[0] as Record<string, unknown>) || null;
    if (!row) {
      const { data: cliByTrading } = await supabase.from('clients').select(cols).eq('trading_name', mission.client).limit(1);
      row = (cliByTrading?.[0] as Record<string, unknown>) || null;
    }
    if (row) {
      clientCnpj = row.cnpj ? String(row.cnpj) : null;
      clientContact = row.contact_name ? String(row.contact_name) : null;
      clientPhone = row.phone ? String(row.phone) : null;
      clientEmail = String(row.operational_email || row.email || '') || null;
      const addr = [row.address, row.city, row.state].filter(Boolean).join(' — ');
      clientAddress = addr || null;
    }
  } catch {
    /* cadastro opcional */
  }

  const photos: AnalyticalPhoto[] = [];
  const mirror = String(pick(raw, 'mirroring_evidence_url') || '');
  if (mirror && isImageEvidenceUrl(mirror)) {
    pushPhoto(photos, { url: mirror, caption: 'Espelhamento na origem', at: startTime });
  }
  for (const row of evidenceRes.data || []) {
    const photo = parseEvidenceDetails((row as { details?: unknown }).details);
    pushPhoto(photos, photo ? { ...photo, at: photo.at || (row as { created_at?: string }).created_at || null } : null);
  }
  try {
    const { data: files } = await supabase.storage.from('mission-evidence').list(id, { limit: 40 });
    for (const f of files || []) {
      if (!f?.name) continue;
      const { data } = supabase.storage.from('mission-evidence').getPublicUrl(`${id}/${f.name}`);
      const url = data?.publicUrl;
      if (url && isImageEvidenceUrl(url)) {
        pushPhoto(photos, { url, caption: f.name, at: f.updated_at || null });
      }
    }
  } catch {
    /* storage pode estar restrito no browser */
  }

  const vehicle = (vehicleRes as { data?: Vehicle | null }).data || mission.vehicle || mission.vehicleData || null;
  const logs = (logsRes.data || []) as MissionLog[];
  const history = (historyRes.data || []) as MissionHistory[];
  for (const log of logs) {
    for (const photo of extractPhotoUrlsFromText(log.description, log.created_at, 'Foto na atualização da OS')) {
      pushPhoto(photos, photo);
    }
  }

  const statusTimeline: StatusMark[] = history
    .filter((h) => h.field_name === 'status')
    .map((h) => ({ status: String(h.new_value || '—'), at: h.changed_at || null, by: h.changed_by || null }));
  const lastOf = (val: string) => [...statusTimeline].reverse().find((s) => s.status === val)?.at || null;

  const [originCoord, destCoord] = await Promise.all([
    geocodeAddress(origin),
    geocodeAddress(destination),
  ]);
  const points = montarPontosRota({
    origin,
    destination,
    originCoord,
    destCoord,
    logs,
    historyMapLinks: history.filter((h) => h.field_name === 'map_link').map((h) => ({
      new_value: h.new_value,
      changed_at: h.changed_at,
    })),
    currentMapLink: mapLink,
  });

  const agent1 = findAgentByName(agentsRows as Agent[], mission.agent1);
  const agent2 = findAgentByName(agentsRows as Agent[], mission.agent2);
  const agents: AnalyticalAgent[] = [];
  if (mission.agent1) {
    agents.push({
      role: 'Agente 01',
      name: String(mission.agent1),
      cpf: agent1?.cpf || null,
      cnh: agent1?.cnh || null,
      cnv: agent1?.cnv || null,
      phone: agent1?.phone || null,
    });
  }
  if (mission.agent2) {
    agents.push({
      role: 'Agente 02',
      name: String(mission.agent2),
      cpf: agent2?.cpf || null,
      cnh: agent2?.cnh || null,
      cnv: agent2?.cnv || null,
      phone: agent2?.phone || null,
    });
  }

  const cv = mission.clientVehicle;
  const cv2 = mission.clientVehicle2;
  const oEnc = encodeURIComponent(origin);
  const dEnc = encodeURIComponent(destination);

  return {
    missionId: id,
    status: String(mission.status || ''),
    client: String(mission.client || ''),
    clientCnpj,
    clientContact,
    clientPhone,
    clientEmail,
    clientAddress,
    provider: String(mission.provider || ''),
    origin,
    destination,
    missionType: String(pick(raw, 'mission_type') || 'Caracterizada'),
    specialOperation: String(pick(raw, 'special_operation_type') || '') || null,
    grEspelhamento: String(pick(raw, 'gr_espelhamento') || '') || null,
    createdAt: String(pick(raw, 'createdAt', 'created_at') || '') || null,
    lastUpdate: String(pick(raw, 'lastUpdate', 'last_update') || '') || null,
    startTime,
    endTime,
    estimatedTime: String(pick(raw, 'estimatedTime', 'estimated_time') || '') || null,
    startKm,
    endKm,
    kmRodado: startKm != null && endKm != null && endKm >= startKm ? Math.round((endKm - startKm) * 10) / 10 : null,
    totalDistance: num(pick(raw, 'totalDistance', 'total_distance')),
    traveledDistance: num(pick(raw, 'traveledDistance', 'traveled_distance')),
    durationLabel: durationLabel(startTime, endTime),
    arrivalOrigin: lastOf('Origem'),
    operationStart: lastOf('Em Viagem'),
    operationEnd: lastOf('Concluída') || lastOf('Pendente'),
    driverName: String(pick(raw, 'driver_name') || '') || null,
    driverPhone: String(pick(raw, 'driver_phone') || '') || null,
    driverName2: String(pick(raw, 'driver_name_2') || '') || null,
    driverPhone2: String(pick(raw, 'driver_phone_2') || '') || null,
    vehiclePlate: vehicle?.plate || String(mission.vehicleId || '') || null,
    vehicleModel: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || null : null,
    vehicleType: String(pick(raw, 'vehicleType', 'vehicle_type') || vehicle?.type || '') || null,
    vehicleYear: vehicle?.year || null,
    vehicleColor: vehicle?.color || null,
    clientVehicle: vehicleLabel(cv),
    clientVehicle2: vehicleLabel(cv2),
    agents,
    currentLocation: String(pick(raw, 'currentLocation', 'current_location') || '') || null,
    seNumber: String(pick(raw, 'dhl_se_number') || '') || null,
    smNumber: String(pick(raw, 'dhl_sm_number') || '') || null,
    vendorOsNumber: String(pick(raw, 'vendor_os_number') || '') || null,
    referenceNumber: String(pick(raw, 'reference_number') || '') || null,
    invoiceNumber: String(pick(raw, 'invoice_number') || '') || null,
    billingApproved: Boolean(pick(raw, 'billing_approved')),
    revenueStored: num(pick(raw, 'revenue_value')),
    costStored: num(pick(raw, 'cost_value')),
    tollStored: num(pick(raw, 'toll_value')),
    providerStartKm: num(pick(raw, 'provider_start_km')),
    providerEndKm: num(pick(raw, 'provider_end_km')),
    providerStartTime: String(pick(raw, 'provider_start_time') || '') || null,
    providerEndTime: String(pick(raw, 'provider_end_time') || '') || null,
    statusTimeline,
    logs,
    history,
    photos,
    points,
    mapUrl: buildStaticMapUrl(points, googleMapsApiKey),
    directionsLink: origin && destination ? `https://www.google.com/maps/dir/${oEnc}/${dEnc}` : null,
    routeKmEstimado: distanciaTotalPontos(points),
    generatedAt: new Date().toISOString(),
  };
}
