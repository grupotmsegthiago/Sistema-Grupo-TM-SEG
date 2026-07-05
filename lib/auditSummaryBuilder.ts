import { supabase } from './supabase';
import { generateContent } from './gemini';
import { formatDateTimeBR, formatTimeBR } from './dateUtils';
import { clientNameShort } from './financialUtils';
import { isDhlSupplyClient } from './dhlAutoTableSelector';
import type { Mission } from '../types';

export interface AuditSummaryOptions {
  mission: Mission;
  providerTradingName?: string;
  clientTableLabel?: string;
  providerTableLabel?: string;
  includeDirectorSection?: boolean;
  withAiSummary?: boolean;
  revenueTotal?: number;
  costTotal?: number;
  marginPct?: number;
}

interface StatusMarks {
  originArrival?: string;
  operationStart?: string;
  operationEnd?: string;
  completedAt?: string;
}

interface AuditTrail {
  openedBy: string;
  tablesBy: string;
  statusTimesBy: string;
  kmBy: string;
  statusEntries: Array<{ status: string; at: string; by: string }>;
  kmEntries: Array<{ field: string; at: string; by: string; value: string }>;
}

const dash = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : '—');

const formatAgentName = (name?: string | null): string => {
  if (!name || name === '---') return '—';
  return name.trim().toUpperCase();
};

const formatDurationBetween = (startIso?: string, endIso?: string): string => {
  if (!startIso || !endIso) return '—';
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return '—';
  const totalMin = Math.floor((b - a) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
};

async function fetchStatusMarks(missionId: string): Promise<StatusMarks> {
  const marks: StatusMarks = {};
  try {
    const { data } = await supabase
      .from('mission_history')
      .select('changed_at,new_value,changed_by')
      .eq('mission_id', missionId)
      .eq('field_name', 'status')
      .order('changed_at', { ascending: false });
    if (!data) return marks;
    const lastOf = (val: string) => (data as any[]).find(h => h.new_value === val)?.changed_at as string | undefined;
    marks.originArrival = lastOf('Origem');
    marks.operationStart = lastOf('Em Viagem');
    marks.operationEnd = lastOf('Concluída') || lastOf('Pendente');
    marks.completedAt = lastOf('Concluída');
  } catch {
    /* mantém vazio */
  }
  return marks;
}

async function fetchCarretaPlate(mission: Mission): Promise<string> {
  if (mission.clientVehicle2?.plate) return mission.clientVehicle2.plate;
  const raw = (mission as any).client_vehicle_2;
  if (!raw) return '';
  try {
    const { data } = await supabase.from('client_vehicles').select('plate').eq('id', raw).maybeSingle();
    return data?.plate || '';
  } catch {
    return '';
  }
}

async function fetchAuditTrail(mission: Mission, clientTableLabel?: string, providerTableLabel?: string): Promise<AuditTrail> {
  const missionId = mission.id;
  const [createLogs, historyRows, sysLogs] = await Promise.all([
    supabase
      .from('system_logs')
      .select('user_name,created_at,details')
      .eq('entity', 'Mission')
      .eq('entity_id', missionId)
      .in('action_type', ['CREATE', 'INSERT'])
      .order('created_at', { ascending: true })
      .limit(3),
    supabase
      .from('mission_history')
      .select('changed_at,changed_by,field_name,new_value,old_value')
      .eq('mission_id', missionId)
      .order('changed_at', { ascending: true }),
    supabase
      .from('system_logs')
      .select('user_name,created_at,action_type,entity,details')
      .eq('entity_id', missionId)
      .order('created_at', { ascending: true }),
  ]);

  const openedBy =
    createLogs.data?.[0]?.user_name ||
    (historyRows.data || []).find(h => h.field_name === 'status' && h.new_value === 'Solicitada')?.changed_by ||
    mission.updatedBy ||
    '—';

  const tableLogs = (sysLogs.data || []).filter(l =>
    ['BillingAdjustment', 'Mission', 'MissionEditHistory'].includes(l.entity || '') &&
    /table|tabela|clientTable|providerTable|price|cost/i.test(String(l.details || '') + String(l.action_type || ''))
  );
  const firstTableLog = tableLogs[0];
  let tablesBy = '—';
  if (firstTableLog?.user_name) {
    tablesBy = `${firstTableLog.user_name} (${formatDateTimeBR(firstTableLog.created_at)})`;
  } else if (clientTableLabel || providerTableLabel) {
    tablesBy = `Tabelas atuais — Cliente: ${dash(clientTableLabel)} | Fornecedor: ${dash(providerTableLabel)}`;
  }

  const statusEntries = (historyRows.data || [])
    .filter(h => h.field_name === 'status')
    .map(h => ({
      status: String(h.new_value || '—'),
      at: formatDateTimeBR(h.changed_at),
      by: dash(h.changed_by),
    }));

  const kmFields = new Set(['start_km', 'end_km', 'start_time', 'end_time', 'provider_start_km', 'provider_end_km']);
  const kmEntries = (historyRows.data || [])
    .filter(h => kmFields.has(String(h.field_name)))
    .map(h => ({
      field: String(h.field_name),
      at: formatDateTimeBR(h.changed_at),
      by: dash(h.changed_by),
      value: dash(h.new_value),
    }));

  const statusTimesBy = statusEntries.length
    ? statusEntries.map(s => `${s.status}: ${s.by} em ${s.at}`).join(' | ')
    : '—';

  const kmBy = kmEntries.length
    ? kmEntries.slice(-6).map(k => `${k.field}=${k.value} (${k.by}, ${k.at})`).join(' | ')
    : '—';

  return { openedBy: dash(openedBy), tablesBy, statusTimesBy, kmBy, statusEntries, kmEntries };
}

export function buildAuditSummaryBody(
  mission: Mission,
  marks: StatusMarks,
  providerTradingName: string,
  carretaPlate: string,
): string {
  const isDhl = isDhlSupplyClient(mission.originalClientName || mission.client);
  const seNum = String((mission as any).dhl_se_number || '').trim().toUpperCase();
  const scheduledStart = mission.startTime || mission.createdAt;
  const operationEnd = marks.operationEnd || mission.endTime || marks.completedAt;

  const osLine = isDhl && seNum
    ? `🗒️ SE: ${seNum}  / 🗒️ ${mission.id}`
    : `🗒️ ${mission.id}`;

  const viaturaPlate =
    mission.vehicleData?.plate ||
    (typeof mission.vehicleId === 'string' && !mission.vehicleId.includes('-') ? mission.vehicleId : '') ||
    '—';

  const clientLabel = isDhl ? 'DHL' : clientNameShort(mission.originalClientName || mission.client || '—');
  const destination = (mission.destination || '—').toUpperCase().replace(/\s*[—-]\s*DESTINO\s+A\s+DEFINIR\s*$/i, '').trim();

  const startKm = mission.startKm != null && mission.startKm !== '' ? String(mission.startKm) : '—';
  const endKm = mission.endKm != null && mission.endKm !== '' ? String(mission.endKm) : '—';
  const sKm = Number(mission.startKm);
  const eKm = Number(mission.endKm);
  const totalKm = Number.isFinite(sKm) && Number.isFinite(eKm) && eKm > sKm ? String(Math.round((eKm - sKm) * 10) / 10) : '—';

  const finalizeTime = marks.completedAt || mission.endTime;
  const finalizeLine = finalizeTime
    ? `MISSÃO FINALIZA AS ${formatTimeBR(finalizeTime)} AUTO SEGUIU EM SEGURANÇA`
    : '';

  const lines = [
    '*RESUMO DA AUDITORIA*⚡️',
    '',
    osLine,
    `🚔 VIATURA: ${viaturaPlate} - (FORNECEDOR: ${providerTradingName || '—'})`,
    `🥷 AGT 1: ${formatAgentName(mission.agent1)}`,
    `🥷 AGT 2: ${formatAgentName(mission.agent2)}`,
    '',
    `👔 CLIENTE: ${clientLabel}`,
    `🏦 ORIGEM: ${(mission.origin || '—').toUpperCase()}`,
    `🏭 DESTINO: ${destination}`,
    '',
    `👨‍🦰 MOTORISTA: ${formatAgentName(mission.driver_name)}`,
    `📞 FONE: ${dash(mission.driver_phone)}`,
    '',
    `🚛 CAVALO: ${dash(mission.clientVehicle?.plate)}`,
    `🚛 CARRETA: ${dash(carretaPlate)}`,
    '',
    `🕑 INÍCIO PREVISTO: ${formatDateTimeBR(scheduledStart)}`,
    `🕑 CHEGADA NA ORIGEM: ${formatDateTimeBR(marks.originArrival)}`,
    `🧭 INÍCIO DE OPERAÇÃO: ${formatDateTimeBR(marks.operationStart)}`,
    `🧭 FIM DE OPERAÇÃO: ${formatDateTimeBR(operationEnd)}`,
    `🧭 TOTAL DA MISSÃO: ${formatDurationBetween(scheduledStart, operationEnd)}`,
    '',
    `📍 KM INICIAL: ${startKm}`,
    `📍 KM FINAL: ${endKm}`,
    `📍 TOTAL RODADO: ${totalKm}${totalKm !== '—' ? ' KM' : ''}`,
    '',
    `🖋️ STATUS: ${String(mission.status || '—').toUpperCase()}`,
  ];

  if (finalizeLine) {
    lines.push('', finalizeLine);
  }

  return lines.join('\n');
}

export function buildDirectorAuditSection(trail: AuditTrail, aiSummary?: string): string {
  const lines = [
    '',
    '=====================================================',
    'SOMENTE DIRETORIA TEM ACESSO',
    '=====================================================',
    '',
    `Quem abriu a OS? ${trail.openedBy}`,
    `Quem incluiu a tabela na criação da OS? ${trail.tablesBy}`,
    `Quem incluiu os horários de cada status? ${trail.statusTimesBy}`,
    `Quem incluiu os KM? ${trail.kmBy}`,
  ];

  if (aiSummary?.trim()) {
    lines.push('', '🤖 RESUMO IA (OBJETIVO):', aiSummary.trim());
  }

  return lines.join('\n');
}

export async function generateAuditAiSummary(
  mission: Mission,
  trail: AuditTrail,
  extras?: { revenueTotal?: number; costTotal?: number; marginPct?: number },
): Promise<string> {
  const payload = {
    os: mission.id,
    cliente: mission.client,
    fornecedor: mission.provider,
    origem: mission.origin,
    destino: mission.destination,
    status: mission.status,
    receita: extras?.revenueTotal,
    custo: extras?.costTotal,
    margemPct: extras?.marginPct,
    abertura: trail.openedBy,
    tabelas: trail.tablesBy,
    marcosStatus: trail.statusEntries.slice(-8),
    alteracoesKm: trail.kmEntries.slice(-8),
  };

  const text = await generateContent({
    contents: [{
      role: 'user',
      parts: [{
        type: 'text',
        text: `Você é auditor financeiro-operacional da TM SEG. Com base nos dados JSON abaixo, escreva um parágrafo único (máx. 6 frases) em português do Brasil, objetivo, profissional e prático, resumindo a OS para a diretoria. Cite riscos, pendências e pontos de atenção se existirem. Não use markdown.\n\n${JSON.stringify(payload)}`,
      }],
    }],
    config: { temperature: 0.3, maxOutputTokens: 400 },
  });

  return text.trim();
}

export async function buildFullAuditSummary(options: AuditSummaryOptions): Promise<string> {
  const {
    mission,
    providerTradingName = '',
    clientTableLabel,
    providerTableLabel,
    includeDirectorSection = false,
    withAiSummary = false,
    revenueTotal,
    costTotal,
    marginPct,
  } = options;

  const [marks, carretaPlate, trail] = await Promise.all([
    fetchStatusMarks(mission.id),
    fetchCarretaPlate(mission),
    fetchAuditTrail(mission, clientTableLabel, providerTableLabel),
  ]);

  let body = buildAuditSummaryBody(mission, marks, providerTradingName, carretaPlate);

  if (includeDirectorSection) {
    let aiSummary = '';
    if (withAiSummary) {
      try {
        aiSummary = await generateAuditAiSummary(mission, trail, { revenueTotal, costTotal, marginPct });
      } catch (e) {
        console.warn('[auditSummary] IA indisponível:', e);
        aiSummary = 'Resumo IA indisponível no momento. Utilize os dados operacionais acima.';
      }
    }
    body += buildDirectorAuditSection(trail, aiSummary);
  }

  return body;
}
