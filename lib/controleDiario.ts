/**
 * Controle diário — mesmas colunas da planilha operacional.
 * Os dados saem da OS; a tela só organiza o dia.
 */
import { formatDateBR, formatTimeBR } from './dateUtils';
import { extractUF, UF_TO_REGION } from './financialUtils';

export const CONTROLE_DIARIO_COLUMNS = [
  'OS',
  'STATUS',
  'DATA INICIAL',
  'HORA AGENDADA',
  'HORA ORIGEM',
  'CLIENTE',
  'ROTA',
  'FORNECEDOR',
  'VIATURA',
  'VEICULO ESCOLTADO',
  'DATA FINAL',
  'HORA FINAL',
  'INICIAL',
  'FINAL',
  'TOTAL KM',
  'EQUIPE',
  'OBSERVAÇÃO',
] as const;

export type ControleDiarioRow = {
  id: string;
  os: string;
  dataInicial: string;
  horaAgendada: string;
  horaOrigem: string;
  cliente: string;
  rota: string;
  fornecedor: string;
  viatura: string;
  veiculoEscoltado: string;
  dataFinal: string;
  horaFinal: string;
  kmInicial: string;
  kmFinal: string;
  totalKm: number | null;
  status: string;
  equipe: string;
  observacao: string;
  /** Última atualização gravada na OS. Aparece ao passar o mouse no status. */
  ultimaAtualizacao: string;
  mapa: string;
  motorista: string;
  origem: string;
  destino: string;
  ocorrencias: number;
  /** Começou antes do dia da folha e ainda não encerrou. */
  diaAnterior: boolean;
  /** Concluída e o faturamento ainda não foi aprovado. */
  aprovacaoPendente: boolean;
  inicioOrdem: number;
  /** Número da SE DHL como foi gravado. Vazio quando não há SE. */
  se: string;
  /** Só os dígitos da SE, para juntar a mesma SE escrita de formas diferentes. */
  seKey: string;
};

export type ControleDiarioSheetLine = {
  row: ControleDiarioRow;
  seKey: string;
  groupSize: number;
  isLeader: boolean;
  isChild: boolean;
};

export type ControleDiarioSource = {
  id?: string | null;
  client?: string | null;
  provider?: string | null;
  origin?: string | null;
  destination?: string | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  estimated_time?: string | null;
  start_km?: number | null;
  end_km?: number | null;
  agent1?: string | null;
  agent2?: string | null;
  mission_type?: string | null;
  special_operation_type?: string | null;
  dhl_se_number?: string | null;
  reference_number?: string | null;
  current_location?: string | null;
  map_link?: string | null;
  toll_value?: number | null;
  billing_approved?: boolean | null;
  revenue_value?: number | null;
  cost_value?: number | null;
  vehiclePlate?: string | null;
  cargoPlate?: string | null;
  originAt?: string | null;
  driver_name?: string | null;
  occurrence_count?: number | null;
};

const TERMINAL = new Set(['Concluída', 'Concluida', 'Cancelada', 'Recusada']);

export function brazilDayKey(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function missionOnControlDay(
  mission: { start_time?: string | null; end_time?: string | null; status?: string | null },
  dayIso: string,
): boolean {
  const start = brazilDayKey(mission.start_time);
  const end = brazilDayKey(mission.end_time);
  if (start === dayIso || end === dayIso) return true;
  const status = String(mission.status || '');
  if (!TERMINAL.has(status) && start && start < dayIso) return true;
  return false;
}

const VALID_UF = new Set(Object.keys(UF_TO_REGION));
const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const STATE_NAMES: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

function stateNameUf(token: string): string {
  const name = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return STATE_NAMES[name] || '';
}

function titleCity(city: string): string {
  return city
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
    })
    .join(' ');
}

/** Código de mapa (plus code) ou token só de letras e números, sem nome de cidade. */
function isPlaceCode(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/[A-Z0-9]{3,}\+[A-Z0-9]{2,}/i.test(text)) return true;
  return /[A-Za-zÀ-ÿ]/.test(text) && /\d/.test(text);
}

function refineCity(city: string): string {
  const stripped = city.replace(/^[A-Z0-9]{3,}\+[A-Z0-9]{2,}\s*[-–]\s*/i, '').trim();
  const pieces = stripped.split(/\s*[-–]\s*/).map((part) => part.trim()).filter(Boolean);
  const road = /^(rod\.?|rodovia|rua|r\.|av\.?|avenida|estr\.?|estrada|est\.|praça|praca|alameda|tv\.?|travessa|br)\b/i;
  if (pieces.length >= 2 && road.test(pieces[0])) return pieces[pieces.length - 1];
  return stripped;
}

function readPlace(address: string | null | undefined): { city: string; uf: string } {
  const raw = String(address || '').trim();
  if (!raw) return { city: '', uf: '' };
  if (/a definir|^raio\b/i.test(raw)) return { city: 'A definir', uf: '' };

  const uf = extractUF(raw).toUpperCase();
  let city = '';
  const dashMatches = [...raw.matchAll(/([A-Za-zÀ-ú][^,\n]*?)\s*[-–]\s*([A-Za-z]{2})\b/g)];
  for (let i = dashMatches.length - 1; i >= 0; i -= 1) {
    const code = dashMatches[i][2].toUpperCase();
    if (!VALID_UF.has(code)) continue;
    city = dashMatches[i][1].trim();
    const comma = city.lastIndexOf(',');
    if (comma >= 0) city = city.slice(comma + 1).trim();
    break;
  }
  if (!city) {
    const simple = raw.match(/^\s*([^,]+?)\s*,\s*([A-Za-z]{2})\s*$/);
    if (simple && VALID_UF.has(simple[2].toUpperCase())) city = simple[1].trim();
  }
  if (!city) {
    const named = raw.match(/cidade de\s+([^,]+)/i);
    if (named) city = named[1].trim();
  }
  if (!city) {
    const bits = raw.split(/\s*[-–]\s*/).map((part) => part.trim()).filter(Boolean);
    for (let i = bits.length - 1; i >= 1; i -= 1) {
      if (!stateNameUf(bits[i])) continue;
      const previous = bits[i - 1];
      if (previous && !stateNameUf(previous) && !isPlaceCode(previous)) {
        city = previous;
        break;
      }
    }
  }
  city = refineCity(city);
  if (isPlaceCode(city)) city = '';
  if (city && uf) return { city: titleCity(city), uf };
  if (uf) return { city: '', uf };
  if (city) return { city: titleCity(city), uf: '' };
  return { city: '', uf: '' };
}

function placeLabel(address: string | null | undefined): string {
  const place = readPlace(address);
  if (place.city === 'A definir') return 'A definir';
  if (place.city && place.uf) return `${place.city} - ${place.uf}`;
  return place.city || place.uf;
}

function osLabel(id: string): string {
  return id.replace(/^GTM-/i, '');
}

/** SE DHL com pelo menos 4 dígitos. Texto curto demais não agrupa a folha. */
export function controleDiarioSeKey(value: string | null | undefined): { se: string; seKey: string } {
  const se = String(value || '').trim().toUpperCase();
  const seKey = se.replace(/\D/g, '');
  if (seKey.length < 4) return { se: '', seKey: '' };
  return { se, seKey };
}

/**
 * Junta as OS da mesma SE. Fechado, fica só a primeira. Aberto, as outras
 * sobem para logo abaixo dela, na ordem em que já estavam na folha.
 */
export function buildControleDiarioSheet(
  rows: ControleDiarioRow[],
  expanded: ReadonlySet<string> | 'all',
): ControleDiarioSheetLine[] {
  const buckets = new Map<string, ControleDiarioRow[]>();
  for (const row of rows) {
    if (!row.seKey) continue;
    const list = buckets.get(row.seKey) || [];
    list.push(row);
    buckets.set(row.seKey, list);
  }
  const emitted = new Set<string>();
  const out: ControleDiarioSheetLine[] = [];
  for (const row of rows) {
    if (emitted.has(row.id)) continue;
    const group = row.seKey ? buckets.get(row.seKey) : undefined;
    if (!group || group.length < 2) {
      out.push({ row, seKey: '', groupSize: 1, isLeader: false, isChild: false });
      emitted.add(row.id);
      continue;
    }
    const open = expanded === 'all' || expanded.has(row.seKey);
    const members = open ? group : [group[0]];
    members.forEach((member, index) => {
      if (emitted.has(member.id)) return;
      out.push({
        row: member,
        seKey: row.seKey,
        groupSize: group.length,
        isLeader: index === 0,
        isChild: index > 0,
      });
      emitted.add(member.id);
    });
    if (!open) {
      for (const member of group) emitted.add(member.id);
    }
  }
  return out;
}

function kmText(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n));
}

export function isControleDiarioCarryover(mission: ControleDiarioSource, dayIso: string): boolean {
  const start = brazilDayKey(mission.start_time);
  const status = String(mission.status || '');
  return Boolean(start && start < dayIso && !TERMINAL.has(status));
}

export function controleDiarioOpensAudit(name?: string | null): boolean {
  const n = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (n.includes('giovanna')) return true;
  if (n.includes('beatriz') && (n.includes('rocha') || n.includes('machado'))) return true;
  if (n.includes('thiago') && n.includes('moreira')) return true;
  return false;
}

export function daysOfMonth(monthIso: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIso);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    days.push(`${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`);
  }
  return days;
}

export function sortControleDiarioRows(rows: ControleDiarioRow[]): ControleDiarioRow[] {
  return [...rows].sort((a, b) => {
    const aDone = a.status === 'FINALIZADO';
    const bDone = b.status === 'FINALIZADO';
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.diaAnterior !== b.diaAnterior) return a.diaAnterior ? -1 : 1;
    if (a.inicioOrdem !== b.inicioOrdem) return a.inicioOrdem - b.inicioOrdem;
    return a.os.localeCompare(b.os, 'pt-BR', { numeric: true });
  });
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function controleDiarioStatus(mission: ControleDiarioSource, dayIso: string): string {
  const status = String(mission.status || '').trim();
  const special = String(mission.special_operation_type || '').toUpperCase();
  if (status === 'Recusada') return 'RECUSADA';
  if (status === 'Cancelada') return 'CANCELADA';
  if (special.includes('PRESERV') || String(mission.mission_type || '').toUpperCase().includes('PRESERV')) return 'PRESERVAÇÃO';
  if (status === 'Documentação') return 'FALTA DOC';
  if (status === 'Concluída' || status === 'Concluida') return 'FINALIZADO';
  const start = brazilDayKey(mission.start_time);
  if (start && start < dayIso && !TERMINAL.has(status)) return 'PERNOITE';
  if (status === 'Em Viagem') return 'EM VIAGEM';
  if (status === 'Origem') return 'NA ORIGEM';
  if (status === 'Agendada') return 'AGENDADA';
  if (status === 'Solicitada') return 'SOLICITADA';
  if (status === 'Pendente') return 'PENDENTE';
  return status ? status.toUpperCase() : '—';
}

export function controleDiarioTotalKm(startKm: number | null | undefined, endKm: number | null | undefined): number | null {
  const start = Number(startKm);
  const end = Number(endKm);
  const hasStart = Number.isFinite(start) && start > 0;
  const hasEnd = Number.isFinite(end) && end > 0;
  if (hasStart && hasEnd) return Math.round(end - start);
  if (hasStart && !hasEnd) return -Math.round(start);
  return null;
}

function clockLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hm = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`;
  return formatTimeBR(raw, '');
}

function teamLabel(agent1?: string | null, agent2?: string | null): string {
  const a = String(agent1 || '').trim();
  const b = String(agent2 || '').trim();
  if (a && b) return `${a} X ${b}`;
  return a || b || '';
}

function routeLabel(mission: ControleDiarioSource): string {
  const origin = placeLabel(mission.origin);
  const destination = placeLabel(mission.destination);
  if (origin && destination) return `${origin} x ${destination}`;
  return origin || destination;
}

function observation(mission: ControleDiarioSource): string {
  const parts: string[] = [];
  const note = String(mission.current_location || '').trim();
  if (note && !/^LAT\s/i.test(note)) parts.push(note);
  const toll = Number(mission.toll_value);
  if (Number.isFinite(toll) && toll > 0) {
    parts.push(`pedágio ${toll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
  return parts.join(' · ');
}

export function toControleDiarioRow(mission: ControleDiarioSource, dayIso: string): ControleDiarioRow {
  const id = String(mission.id || '');
  const totalKm = controleDiarioTotalKm(mission.start_km, mission.end_km);
  const scheduled = mission.estimated_time || mission.start_time;
  const started = mission.start_time ? new Date(mission.start_time).getTime() : 0;
  const seParts = controleDiarioSeKey(mission.dhl_se_number);
  return {
    id,
    os: osLabel(id),
    dataInicial: mission.start_time ? formatDateBR(mission.start_time) : '',
    horaAgendada: clockLabel(scheduled),
    horaOrigem: clockLabel(mission.originAt),
    cliente: oneLine(String(mission.client || '').toUpperCase()),
    rota: oneLine(routeLabel(mission)),
    fornecedor: oneLine(String(mission.provider || '').toUpperCase()),
    viatura: String(mission.vehiclePlate || '').trim() || '---',
    veiculoEscoltado: String(mission.cargoPlate || '').trim() || '---',
    dataFinal: mission.end_time ? formatDateBR(mission.end_time) : '',
    horaFinal: mission.end_time ? formatTimeBR(mission.end_time, '') : '',
    kmInicial: kmText(mission.start_km),
    kmFinal: kmText(mission.end_km),
    totalKm,
    status: controleDiarioStatus(mission, dayIso),
    equipe: oneLine(teamLabel(mission.agent1, mission.agent2).toUpperCase()),
    observacao: oneLine(observation(mission)),
    ultimaAtualizacao: oneLine(String(mission.current_location || '').trim()),
    mapa: String(mission.map_link || '').trim(),
    motorista: oneLine(String(mission.driver_name || '')),
    origem: placeLabel(mission.origin),
    destino: placeLabel(mission.destination),
    ocorrencias: Number(mission.occurrence_count) > 0 ? Number(mission.occurrence_count) : 0,
    aprovacaoPendente: (mission.status === 'Concluída' || mission.status === 'Concluida') && mission.billing_approved !== true,
    diaAnterior: isControleDiarioCarryover(mission, dayIso),
    inicioOrdem: Number.isFinite(started) ? started : 0,
    se: seParts.se,
    seKey: seParts.seKey,
  };
}

/** Status cru da OS na lista de pendências. A folha do dia continua com o status operacional. */
function valorEmReaisZerado(raw: unknown): boolean {
  if (raw == null || raw === '') return true;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  return !Number.isFinite(n) || Math.abs(n) < 0.005;
}

/** Já aprovada no sistema. O histórico do Financeiro grava isso em billing_approved. Não é pendência. */
export function aprovadaNoSistemaForaDaPendencia(mission: { billing_approved?: boolean | null }): boolean {
  return mission.billing_approved === true;
}

/** Recusada com cliente e fornecedor em R$ 0,00 já está encerrada. Não entra na fila de aprovação. */
export function recusadaZeradaForaDaPendencia(mission: {
  status?: string | null;
  revenue_value?: number | null;
  cost_value?: number | null;
}): boolean {
  if (String(mission.status || '').trim() !== 'Recusada') return false;
  return valorEmReaisZerado(mission.revenue_value) && valorEmReaisZerado(mission.cost_value);
}

export function pendingListStatusLabel(raw: unknown): string {
  const status = String(raw || '').trim();
  if (status === 'Concluída' || status === 'Concluida') return 'CONCLUÍDA';
  if (status === 'Cancelada') return 'CANCELADA';
  if (status === 'Recusada') return 'RECUSADA';
  if (status === 'Pendente') return 'PENDENTE';
  return '';
}

function pendingListRank(status: string): number {
  return status === 'PENDENTE' ? 0 : 1;
}

export function comparePendingApprovalRows(
  aStatus: string,
  bStatus: string,
  a: { inicioOrdem: number; os: string },
  b: { inicioOrdem: number; os: string },
): number {
  const ar = pendingListRank(aStatus);
  const br = pendingListRank(bStatus);
  if (ar !== br) return ar - br;
  if (a.inicioOrdem !== b.inicioOrdem) return a.inicioOrdem - b.inicioOrdem;
  return a.os.localeCompare(b.os, 'pt-BR', { numeric: true });
}
