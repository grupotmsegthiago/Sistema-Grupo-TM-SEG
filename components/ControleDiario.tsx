import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AlertTriangle, Ban, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, FileSearch, MapPin, Maximize2, MessageCircle, Moon, Pencil, Radio, RefreshCw, Search, Truck, X, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { publishMissionLive, MISSION_LIVE_WINDOW_EVENT } from '../lib/missionLiveBroadcast';
import { authFetch } from '../lib/authFetch';
import { fetchAllPages } from '../lib/supabasePaging';
import { formatCivilDateBR, formatIsoDateBR, getBrazilDayBounds } from '../lib/dateUtils';
import {
  CONTROLE_DIARIO_COLUMNS,
  controleDiarioOpensAudit,
  daysOfMonth,
  missionOnControlDay,
  sortControleDiarioRows,
  toControleDiarioRow,
  buildControleDiarioSheet,
  type ControleDiarioRow,
  type ControleDiarioSource,
} from '../lib/controleDiario';
import { Mission, User as UserType } from '../types';
import UpdateMissionModal from './UpdateMissionModal';
import MissionFinancialModal from './MissionFinancialModal';
import MissionOccurrenceDialog from './MissionOccurrenceDialog';
import { buildPassagemPlantao, type PassagemPlantao } from '../lib/passagemPlantao';
import { SEM_APROVACAO_DESDE, SEM_APROVACAO_POR_PAGINA, canViewAprovacoesPendentes } from '../lib/aprovacoesPendentesAccess';

const OPEN_STATUSES = ['Solicitada', 'Documentação', 'Agendada', 'Origem', 'Em Viagem', 'Pendente'];
const LOOKBACK_DAYS = 90;
const MISSION_COLUMNS = [
  'id', 'client', 'provider', 'origin', 'destination', 'status',
  'start_time', 'end_time', 'estimated_time', 'start_km', 'end_km',
  'agent1', 'agent2', 'vehicle_id', 'client_vehicle', 'mission_type',
  'special_operation_type', 'dhl_se_number', 'reference_number',
  'current_location', 'map_link', 'toll_value', 'billing_approved', 'driver_name', 'occurrence_count',
].join(', ');

type RawMission = ControleDiarioSource & {
  vehicle_id?: string | null;
  client_vehicle?: string | null;
};

const STATUS_TONE: Record<string, string> = {
  FINALIZADO: 'bg-emerald-100 text-emerald-800',
  PERNOITE: 'bg-amber-100 text-amber-900',
  'EM VIAGEM': 'bg-sky-100 text-sky-900',
  'NA ORIGEM': 'bg-indigo-100 text-indigo-900',
  AGENDADA: 'bg-slate-100 text-slate-700',
  SOLICITADA: 'bg-slate-100 text-slate-700',
  PENDENTE: 'bg-orange-100 text-orange-900',
  'FALTA DOC': 'bg-orange-100 text-orange-900',
  PRESERVAÇÃO: 'bg-violet-100 text-violet-900',
  CANCELADA: 'bg-zinc-200 text-zinc-600',
  RECUSADA: 'bg-red-100 text-red-800',
};

function mapPreview(link: string): string {
  const raw = link.trim();
  if (!raw) return '';
  const coords = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (coords) return `https://maps.google.com/maps?q=${coords[1]},${coords[2]}&z=14&output=embed`;
  if (/google\.[^/]+\/maps/i.test(raw)) {
    return raw.includes('output=embed') ? raw : `${raw}${raw.includes('?') ? '&' : '?'}output=embed`;
  }
  return '';
}

function whenNote(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

type DiarioNote = {
  id: string;
  mission_id: string;
  note: string;
  kind?: string;
  created_by: string;
  created_at: string;
};

type NoteKind = 'observacao' | 'auditoria';

function noteKindOf(item: DiarioNote): NoteKind {
  return item.kind === 'auditoria' ? 'auditoria' : 'observacao';
}

function latestNoteOf(notes: DiarioNote[] | undefined, kind: NoteKind): DiarioNote | undefined {
  return (notes || []).find((item) => noteKindOf(item) === kind);
}

function notesOfKind(notes: DiarioNote[] | undefined, kind: NoteKind): DiarioNote[] {
  return (notes || []).filter((item) => noteKindOf(item) === kind);
}

const PENDING_ROW_GRID = 'grid grid-cols-[4.75rem_minmax(8.5rem,1.2fr)_minmax(8.5rem,1.1fr)_5.75rem_5.75rem_minmax(7.5rem,1fr)_minmax(8rem,1.15fr)_minmax(7rem,0.85fr)_minmax(8.5rem,1fr)_6.75rem] gap-2';

function tabLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

function monthLabel(monthIso: string): string {
  const [year, monthNumber] = monthIso.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 15)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function plateFrom(raw: string | null | undefined, map: Map<string, string>): string {
  const key = String(raw || '').trim();
  if (!key) return '';
  const found = map.get(key);
  if (found) return found;
  if (/[A-Za-z]/.test(key) && /\d/.test(key) && key.length <= 10) return key.toUpperCase();
  return '';
}

async function loadOccurrencePreview(ids: string[]): Promise<Record<string, string>> {
  const ranked = new Map<string, { text: string; at: string; open: boolean }>();
  for (const batch of chunks(ids, 80)) {
    const { data, error } = await supabase
      .from('mission_occurrences')
      .select('mission_id, description, created_at, resolved_at')
      .in('mission_id', batch)
      .order('created_at', { ascending: false });
    if (error) throw error;
    for (const row of data || []) {
      const id = String(row.mission_id || '');
      const text = String(row.description || '').replace(/\s+/g, ' ').trim();
      if (!id || !text) continue;
      const open = !row.resolved_at;
      const at = String(row.created_at || '');
      const prev = ranked.get(id);
      if (!prev || (open && !prev.open) || (open === prev.open && at > prev.at)) {
        ranked.set(id, { text, at, open });
      }
    }
  }
  const out: Record<string, string> = {};
  for (const [id, item] of ranked) out[id] = item.text;
  return out;
}

async function loadPlateMap(table: 'vehicles' | 'client_vehicles', ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const batch of chunks(ids, 80)) {
    const { data, error } = await supabase.from(table).select('id, plate').in('id', batch);
    if (error) throw error;
    for (const row of data || []) {
      if (row.plate) map.set(String(row.id), String(row.plate).toUpperCase());
    }
  }
  return map;
}

async function loadOriginTimes(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const batch of chunks(ids, 80)) {
    const { data, error } = await supabase
      .from('mission_logs')
      .select('mission_id, created_at, description')
      .in('mission_id', batch);
    if (error) throw error;
    for (const row of data || []) {
      if (!/origem/i.test(String(row.description || ''))) continue;
      const prev = map.get(String(row.mission_id));
      const at = String(row.created_at || '');
      if (!prev || (at && at < prev)) map.set(String(row.mission_id), at);
    }
  }
  return map;
}

function cell(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  return String(value);
}

export default function ControleDiario() {
  const today = formatIsoDateBR();
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editMission, setEditMission] = useState<Mission | null>(null);
  const [auditMission, setAuditMission] = useState<Mission | null>(null);
  const [occurrenceRow, setOccurrenceRow] = useState<ControleDiarioRow | null>(null);
  const [passagem, setPassagem] = useState<(PassagemPlantao & { image: string }) | null>(null);
  const [passagemBusy, setPassagemBusy] = useState(false);
  const [notesByMission, setNotesByMission] = useState<Record<string, DiarioNote[]>>({});
  const [noteRow, setNoteRow] = useState<ControleDiarioRow | null>(null);
  const [noteKind, setNoteKind] = useState<NoteKind>('observacao');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [statusTip, setStatusTip] = useState<string | null>(null);
  const statusTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openStatusTip = (id: string) => {
    if (statusTipTimer.current) clearTimeout(statusTipTimer.current);
    setStatusTip(id);
  };
  const closeStatusTip = () => {
    if (statusTipTimer.current) clearTimeout(statusTipTimer.current);
    statusTipTimer.current = setTimeout(() => setStatusTip(null), 160);
  };
  const [printAll, setPrintAll] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const syncingFromTopRef = useRef(false);
  const syncingFromMainRef = useRef(false);
  const [topMirrorWidth, setTopMirrorWidth] = useState(1680);
  const rawById = useRef(new Map<string, RawMission>());
  const [rows, setRows] = useState<ControleDiarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [incomplete, setIncomplete] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [occurrencePreview, setOccurrencePreview] = useState<Record<string, string>>({});
  const [expandedSe, setExpandedSe] = useState<Set<string>>(() => new Set());
  const loadTicket = useRef(0);

  const days = useMemo(() => daysOfMonth(month), [month]);
  const monthOptions = useMemo(() => {
    const [year, monthNumber] = today.split('-').map(Number);
    const list: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const date = new Date(Date.UTC(year, monthNumber - 1 - i, 1));
      list.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, [today]);
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('userData') || 'null') as UserType | null;
    } catch {
      return null;
    }
  }, []);
  const opensAudit = controleDiarioOpensAudit(currentUser?.name);
  const canSeePendingApproval = canViewAprovacoesPendentes(currentUser);
  const [pendingPage, setPendingPage] = useState(1);

  const openOs = (row: ControleDiarioRow) => {
    const raw = rawById.current.get(row.id);
    const mission = {
      id: row.id,
      client: raw?.client || '',
      provider: raw?.provider || '',
      status: raw?.status,
      origin: raw?.origin,
      destination: raw?.destination,
      start_time: raw?.start_time,
      startTime: raw?.start_time,
      endTime: raw?.end_time,
      originalClientName: raw?.client || '',
    } as Mission;
    if (opensAudit) setAuditMission(mission);
    else setEditMission(mission);
  };

  const openAudit = (row: ControleDiarioRow) => {
    const raw = rawById.current.get(row.id);
    setAuditMission({
      id: row.id,
      client: raw?.client || '',
      provider: raw?.provider || '',
      status: raw?.status,
      origin: raw?.origin,
      destination: raw?.destination,
      start_time: raw?.start_time,
      startTime: raw?.start_time,
      endTime: raw?.end_time,
      originalClientName: raw?.client || '',
    } as Mission);
  };

  const pickMonth = (next: string) => {
    setMonth(next);
    setDay((current) => (current.startsWith(next) ? current : (today.startsWith(next) ? today : `${next}-01`)));
  };

  const load = useCallback(async (selected: string) => {
    const ticket = ++loadTicket.current;
    setLoading(true);
    setError('');
    try {
      const { start, end } = getBrazilDayBounds(selected);
      const lookback = new Date(new Date(start).getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const byId = new Map<string, RawMission>();

      const pull = async (apply: (q: any) => any) => {
        const page = await fetchAllPages<RawMission>(async (from, size) => {
          const q = apply(
            supabase.from('missions').select(MISSION_COLUMNS, { count: 'exact' }),
          )
            .order('start_time', { ascending: true })
            .range(from, from + size - 1);
          return q;
        }, 1000, 20000, { getRowKey: (row) => String(row.id || '') });
        if (!page.complete) setIncomplete(true);
        for (const row of page.rows) {
          if (row.id) byId.set(String(row.id), row);
        }
      };

      setIncomplete(false);
      await pull((q) => q.gte('start_time', start).lte('start_time', end));
      await pull((q) => q.gte('end_time', start).lte('end_time', end));
      await pull((q) => q.in('status', OPEN_STATUSES).gte('start_time', lookback).lte('start_time', end));

      rawById.current = byId;
      const missions = [...byId.values()].filter((m) => missionOnControlDay(m, selected));
      const vehicleIds = [...new Set(missions.map((m) => String(m.vehicle_id || '')).filter(Boolean))];
      const cargoIds = [...new Set(missions.map((m) => String(m.client_vehicle || '')).filter(Boolean))];
      const [vehicleMap, cargoMap, originMap] = await Promise.all([
        loadPlateMap('vehicles', vehicleIds),
        loadPlateMap('client_vehicles', cargoIds),
        loadOriginTimes(missions.map((m) => String(m.id))),
      ]);

      if (ticket !== loadTicket.current) return;
      const next = sortControleDiarioRows(missions
        .map((m) => toControleDiarioRow({
          ...m,
          vehiclePlate: plateFrom(m.vehicle_id, vehicleMap),
          cargoPlate: plateFrom(m.client_vehicle, cargoMap),
          originAt: originMap.get(String(m.id)) || null,
        }, selected)));

      setRows(next);
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }));
    } catch (err) {
      if (ticket !== loadTicket.current) return;
      setError(err instanceof Error ? err.message : 'Não foi possível ler as OS deste dia.');
      setRows([]);
    } finally {
      if (ticket === loadTicket.current) setLoading(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    const ticket = ++loadTicket.current;
    setLoading(true);
    setError('');
    setIncomplete(false);
    try {
      const page = await fetchAllPages<RawMission>(async (from, size) => {
        const q = supabase.from('missions')
          .select(MISSION_COLUMNS, { count: 'exact' })
          .in('status', ['Concluída', 'Concluida'])
          .or('billing_approved.is.null,billing_approved.eq.false')
          .gte('start_time', SEM_APROVACAO_DESDE)
          .order('start_time', { ascending: false })
          .range(from, from + size - 1);
        return q;
      }, 1000, 20000, { getRowKey: (row) => String(row.id || '') });
      if (!page.complete) setIncomplete(true);
      const missions = page.rows.filter((row) => row.id);
      const byId = new Map<string, RawMission>();
      for (const row of missions) byId.set(String(row.id), row);
      rawById.current = byId;
      const vehicleIds = [...new Set(missions.map((m) => String(m.vehicle_id || '')).filter(Boolean))];
      const cargoIds = [...new Set(missions.map((m) => String(m.client_vehicle || '')).filter(Boolean))];
      const ids = missions.map((m) => String(m.id));
      const [vehicleMap, cargoMap, originMap, occurrences] = await Promise.all([
        loadPlateMap('vehicles', vehicleIds),
        loadPlateMap('client_vehicles', cargoIds),
        loadOriginTimes(ids),
        loadOccurrencePreview(ids),
      ]);
      if (ticket !== loadTicket.current) return;
      const sheetDay = formatIsoDateBR();
      const next = missions
        .map((m) => toControleDiarioRow({
          ...m,
          vehiclePlate: plateFrom(m.vehicle_id, vehicleMap),
          cargoPlate: plateFrom(m.client_vehicle, cargoMap),
          originAt: originMap.get(String(m.id)) || null,
        }, sheetDay))
        .sort((a, b) => b.inicioOrdem - a.inicioOrdem || a.os.localeCompare(b.os, 'pt-BR', { numeric: true }));
      setRows(next);
      setOccurrencePreview(occurrences);
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }));
    } catch (err) {
      if (ticket !== loadTicket.current) return;
      setError(err instanceof Error ? err.message : 'Não foi possível ler as OS sem aprovação.');
      setRows([]);
      setOccurrencePreview({});
    } finally {
      if (ticket === loadTicket.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pendingOnly) void loadPending();
    else {
      setOccurrencePreview({});
      void load(day);
    }
  }, [day, load, pendingOnly, loadPending]);

  useEffect(() => {
    const ids = rows.map((row) => row.id).filter(Boolean);
    if (!ids.length) {
      setNotesByMission({});
      return;
    }
    let cancelled = false;
    void authFetch(`/api/controle-diario-notas?ids=${encodeURIComponent(ids.join(','))}`)
      .then(async (res) => (res.ok ? await res.json() : []))
      .then((list: DiarioNote[]) => {
        if (cancelled || !Array.isArray(list)) return;
        const bag: Record<string, DiarioNote[]> = {};
        for (const item of list) {
          const key = String(item.mission_id || '');
          if (!key) continue;
          if (!bag[key]) bag[key] = [];
          bag[key].push(item);
        }
        setNotesByMission(bag);
      })
      .catch(() => { if (!cancelled) setNotesByMission({}); });
    return () => { cancelled = true; };
  }, [rows]);

  useEffect(() => {
    const onLive = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.event !== 'controle_diario_note') return;
      const payload = detail.payload;
      const missionId = String(payload?.mission_id || '');
      if (!missionId || !payload?.note) return;
      setNotesByMission((prev) => {
        const current = prev[missionId] || [];
        if (payload.id && current.some((item) => item.id === payload.id)) return prev;
        return { ...prev, [missionId]: [payload as DiarioNote, ...current] };
      });
    };
    window.addEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
    return () => window.removeEventListener(MISSION_LIVE_WINDOW_EVENT, onLive);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void (pendingOnly ? loadPending() : load(day)); }, 600);
    };
    window.addEventListener('refreshMissions', kick);
    window.addEventListener('supabase:missions:realtime', kick);
    const poll = window.setInterval(kick, 20000);
    return () => {
      if (timer) clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener('refreshMissions', kick);
      window.removeEventListener('supabase:missions:realtime', kick);
    };
  }, [day, load, pendingOnly, loadPending]);

  const counts = useMemo(() => {
    const bag: Record<string, number> = {};
    for (const row of rows) bag[row.status] = (bag[row.status] || 0) + 1;
    return bag;
  }, [rows]);

  const sheetRows = printAll ? rows : null;
  const visible = useMemo(() => {
    if (sheetRows) return sheetRows;
    const q = query.trim().toUpperCase();
    return rows.filter((row) => {
      if (statusFilter !== 'TODOS' && row.status !== statusFilter) return false;
      if (!q) return true;
      return [row.os, row.se, row.cliente, row.rota, row.motorista, row.fornecedor, row.viatura, row.veiculoEscoltado, row.equipe, ...(notesByMission[row.id] || []).map((item) => item.note)]
        .join(' ')
        .toUpperCase()
        .includes(q);
    });
  }, [rows, query, statusFilter, sheetRows, notesByMission]);

  useEffect(() => { setPendingPage(1); }, [pendingOnly, query, statusFilter]);

  const pendingPageCount = Math.max(1, Math.ceil(visible.length / SEM_APROVACAO_POR_PAGINA));
  const safePendingPage = Math.min(Math.max(1, pendingPage), pendingPageCount);
  const sheet = useMemo(() => {
    const source = pendingOnly
      ? visible.slice((safePendingPage - 1) * SEM_APROVACAO_POR_PAGINA, safePendingPage * SEM_APROVACAO_POR_PAGINA)
      : visible;
    return buildControleDiarioSheet(source, printAll ? 'all' : expandedSe);
  }, [visible, pendingOnly, safePendingPage, printAll, expandedSe]);

  useEffect(() => {
    const table = tableRef.current;
    if (!table || typeof ResizeObserver === 'undefined') return;
    const update = () => setTopMirrorWidth(table.scrollWidth || 1680);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(table);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [sheet.length, loading]);

  const toggleSe = (key: string) => {
    setExpandedSe((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openPassagem = async () => {
    setPassagemBusy(true);
    flushSync(() => setPrintAll(true));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const table = tableRef.current;
      if (!table) throw new Error('A folha ainda não está na tela.');
      const html2canvas = (await import('html2canvas')).default;
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;background:#ffffff;padding:16px;pointer-events:none;';
      const heading = document.createElement('p');
      heading.textContent = `Controle diário · ${formatCivilDateBR(day)}`;
      heading.style.cssText = 'font:800 18px sans-serif;margin:0 0 12px;color:#1a0505;';
      host.appendChild(heading);
      host.appendChild(table.cloneNode(true));
      document.body.appendChild(host);
      const width = Math.max(host.scrollWidth, 800);
      const height = Math.max(host.scrollHeight, 200);
      const canvas = await html2canvas(host, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width,
        height,
        windowWidth: width,
        windowHeight: height,
      });
      host.remove();
      const who = currentUser?.name || '';
      const built = buildPassagemPlantao(rows, formatCivilDateBR(day), who);
      setPassagem({ ...built, image: canvas.toDataURL('image/png') });
    } catch (err: any) {
      setError(err?.message || 'Não foi possível gerar a passagem de plantão.');
    } finally {
      setPrintAll(false);
      setPassagemBusy(false);
    }
  };

  const copyPassagem = async () => {
    if (!passagem) return;
    await navigator.clipboard.writeText(passagem.texto);
  };

  const downloadPassagem = () => {
    if (!passagem) return;
    const link = document.createElement('a');
    link.href = passagem.image;
    link.download = `passagem-plantao-${day}.png`;
    link.click();
  };

  const saveNote = async () => {
    if (!noteRow || noteSaving) return;
    const text = noteDraft.trim();
    if (!text) {
      setNoteError(noteKind === 'auditoria' ? 'Escreva o lembrete antes de salvar.' : 'Escreva a observação antes de salvar.');
      return;
    }
    setNoteSaving(true);
    setNoteError('');
    try {
      const res = await authFetch('/api/controle-diario-notas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: noteRow.id, note: text, kind: noteKind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Não foi possível salvar a observação.');
      const saved = data as DiarioNote;
      setNotesByMission((prev) => ({
        ...prev,
        [noteRow.id]: [saved, ...(prev[noteRow.id] || [])],
      }));
      void publishMissionLive('controle_diario_note', saved as unknown as Record<string, unknown>);
      setNoteDraft('');
    } catch (err: any) {
      setNoteError(err?.message || 'Não foi possível salvar a observação.');
    } finally {
      setNoteSaving(false);
    }
  };

  const statuses = useMemo(() => ['TODOS', ...Object.keys(counts).sort()], [counts]);

  const monthChoices = monthOptions.includes(month) ? monthOptions : [month, ...monthOptions];

  return (
    <div className="flex h-[calc(100dvh-1.5rem)] min-h-0 flex-col bg-[#efe8e6] p-3 sm:p-4" data-testid="controle-diario">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-28px_rgba(69,10,10,0.55)] ring-1 ring-red-100">
      <header className="relative overflow-hidden bg-gradient-to-br from-zinc-950 via-[#4a1010] to-red-700 px-5 py-5 text-white">
        <div className="pointer-events-none absolute -right-8 -top-16 h-44 w-44 rounded-full bg-red-400/25 blur-3xl" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-300">Grupo TM SEG</p>
            <h1 className="text-2xl font-black tracking-tight">Controle diário</h1>
            <p className="mt-1 max-w-2xl text-sm text-red-100/80">
              {pendingOnly
                ? 'OS concluídas ainda sem aprovação de faturamento, lidas direto do banco. Ocorrência, observação e a auditoria ficam nesta mesma folha.'
                : `Folha do dia ${formatCivilDateBR(day)}, lida direto das OS. Placa, rota, equipe, KM e status acompanham o banco.`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold">
              <Radio size={13} className={loading ? 'animate-pulse text-amber-300' : 'text-emerald-300'} />
              {loading ? 'Atualizando' : `Ao vivo · ${updatedAt || '—'}`}
            </span>
            <button
              type="button"
              onClick={() => { void (pendingOnly ? loadPending() : load(day)); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 font-bold hover:bg-red-500"
              data-testid="controle-diario-refresh"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => { void openPassagem(); }}
              disabled={passagemBusy || loading}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 font-black text-zinc-950 hover:bg-amber-300 disabled:opacity-60"
              data-testid="controle-diario-passagem"
            >
              <ClipboardList size={13} />
              {passagemBusy ? 'Gerando…' : 'Passagem de plantão'}
            </button>
            {canSeePendingApproval && (
              <button
                type="button"
                onClick={() => setPendingOnly((current) => !current)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-black ${
                  pendingOnly ? 'bg-white text-zinc-950' : 'bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/25'
                }`}
                data-testid="controle-diario-pending-approval"
                title={pendingOnly ? 'Voltar para a folha do dia' : 'OS concluídas sem aprovação de faturamento'}
              >
                <CheckCircle2 size={13} />
                Pendências de Aprovações
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(pendingOnly
            ? [
                ['Sem aprovação', rows.length],
                ['Nesta página', sheet.length],
                ['Com ocorrência', rows.filter((item) => item.ocorrencias > 0).length],
              ]
            : [
                ['Na folha', rows.length],
                ['Finalizadas', counts.FINALIZADO || 0],
                ['Pernoite', counts.PERNOITE || 0],
                ['Em viagem', counts['EM VIAGEM'] || 0],
                ['Preservação', counts['PRESERVAÇÃO'] || 0],
              ]).map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-200">{label}</p>
              <p className="text-lg font-black">{value}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-red-50 bg-[#fffaf9] px-4 py-3">
        {!pendingOnly && <label className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-200">
          <CalendarDays size={14} className="text-red-700" />
          <select
            value={month}
            onChange={(e) => pickMonth(e.target.value)}
            className="bg-transparent capitalize outline-none"
            data-testid="controle-diario-month"
          >
            {monthChoices.map((item) => (
              <option key={item} value={item}>{monthLabel(item)}</option>
            ))}
          </select>
        </label>}
        {!pendingOnly && <input
          type="date"
          value={day}
          onChange={(e) => {
            const next = e.target.value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
            setDay(next);
            setMonth(next.slice(0, 7));
          }}
          className="rounded-full border-0 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm ring-1 ring-zinc-200 outline-none"
          data-testid="controle-diario-date"
        />}
        <label className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar OS, cliente, rota, placa ou equipe"
            className="w-full rounded-full border-0 bg-white py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-zinc-200 outline-none focus:ring-red-400"
            data-testid="controle-diario-search"
          />
        </label>
        {!pendingOnly && <div className="flex flex-wrap gap-1">
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${
                statusFilter === status ? 'bg-red-700 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-red-50'
              }`}
            >
              {status === 'TODOS' ? `Todos (${rows.length})` : `${status} (${counts[status] || 0})`}
            </button>
          ))}
        </div>}
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800" data-testid="controle-diario-error">
          ERRO — {error}
        </div>
      )}
      {incomplete && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          CONSULTA INCOMPLETA — a folha não está com o conjunto inteiro. Atualize antes de usar estes números.
        </div>
      )}

      {pendingOnly && (
        <div
          className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top,rgba(254,226,226,0.55),transparent_46%),linear-gradient(180deg,#fbf8f7_0%,#f1ebe9_100%)] px-4 py-4"
          data-testid="controle-diario-pending-list"
        >
          {visible.length === 0 && !loading && (
            <div className="mx-auto mt-10 max-w-md rounded-[32px] bg-gradient-to-b from-white to-zinc-50 px-6 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_24px_40px_-28px_rgba(69,10,10,0.55)] ring-1 ring-white">
              <p className="text-sm font-black text-zinc-800">Nenhuma OS concluída sem aprovação.</p>
              <p className="mt-1 text-xs text-zinc-500">A lista mostra agosto de 2026 em diante.</p>
            </div>
          )}
          <div className="mx-auto flex min-w-[1180px] max-w-[1480px] flex-col gap-2">
            {sheet.length > 0 && (
              <div
                className={`${PENDING_ROW_GRID} sticky top-0 z-10 items-end rounded-2xl bg-[#f6f1f0]/95 px-1.5 py-2 text-[10px] font-black uppercase leading-tight tracking-wide text-zinc-500 backdrop-blur-sm`}
                data-testid="controle-diario-pending-columns"
              >
                <span>OS</span>
                <span>Cliente</span>
                <span>Fornecedor</span>
                <span>Data inicial</span>
                <span>Data final</span>
                <span>Rota</span>
                <span>Ocorrência</span>
                <span>Observação</span>
                <span>Ocorrência de auditoria</span>
                <span className="text-right">Auditoria</span>
              </div>
            )}
            {sheet.map((line) => {
              const row = line.row;
              const savedNote = latestNoteOf(notesByMission[row.id], 'observacao')?.note || '';
              const latestNote = savedNote || (row.aprovacaoPendente || row.status === 'PENDENTE' ? 'Pendente de aprovação' : '');
              const auditReminder = latestNoteOf(notesByMission[row.id], 'auditoria')?.note || '';
              const occurrence = occurrencePreview[row.id] || (row.ocorrencias > 0 ? 'Ocorrência registrada' : 'Sem ocorrência');
              return (
                <div
                  key={row.id}
                  data-testid={`controle-diario-row-${row.os}`}
                  className={`${PENDING_ROW_GRID} h-14 min-w-0 items-center overflow-hidden rounded-full bg-gradient-to-b from-white via-white to-zinc-50/90 px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_16px_30px_-20px_rgba(69,10,10,0.62),0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-zinc-200/90 transition duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_#fff,0_22px_36px_-18px_rgba(153,27,27,0.48)]`}
                >
                  <button
                    type="button"
                    onClick={() => openOs(row)}
                    className="inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-full bg-gradient-to-b from-red-500 to-red-800 px-2 text-[12px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_14px_-8px_rgba(153,27,27,0.9)]"
                    data-testid={`controle-diario-open-${row.os}`}
                    title={opensAudit ? 'Abrir auditoria da OS' : 'Editar OS'}
                  >
                    {opensAudit ? <FileSearch size={13} /> : <Pencil size={13} />}
                    {row.os}
                  </button>
                  <span className="min-w-0 truncate text-[13px] font-black text-zinc-900" title={row.cliente}>
                    {row.cliente || '—'}
                  </span>
                  <span className="min-w-0 truncate text-[12px] font-semibold text-zinc-700" title={row.fornecedor || 'Fornecedor'}>
                    {row.fornecedor || '—'}
                  </span>
                  <span className="truncate rounded-full bg-zinc-100 px-2 py-1 text-center text-[11px] font-bold text-zinc-600" title="Data inicial">
                    {row.dataInicial || '—'}
                  </span>
                  <span className="truncate rounded-full bg-zinc-100 px-2 py-1 text-center text-[11px] font-bold text-zinc-600" title="Data final">
                    {row.dataFinal || '—'}
                  </span>
                  <span className="min-w-0 truncate text-[12px] font-semibold text-zinc-500" title={row.rota}>
                    {row.rota || '—'}
                  </span>
                  <span
                    className={`min-w-0 truncate text-[12px] font-semibold ${row.ocorrencias > 0 ? 'text-red-700' : 'text-zinc-400'}`}
                    title={occurrence}
                    data-testid={`controle-diario-occurrence-text-${row.os}`}
                  >
                    {row.ocorrencias > 0 && (
                      <button
                        type="button"
                        onClick={() => setOccurrenceRow(row)}
                        className="mr-1 inline-flex items-center gap-0.5 rounded-full bg-red-600 px-1.5 py-0.5 align-middle text-[10px] font-black text-white"
                        style={{ animation: 'blink-pending 1s ease-in-out infinite' }}
                        data-testid={`controle-diario-occurrence-${row.os}`}
                      >
                        <AlertTriangle size={10} />
                        {row.ocorrencias}
                      </button>
                    )}
                    {occurrence}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setNoteRow(row); setNoteKind('observacao'); setNoteDraft(''); setNoteError(''); }}
                    className="min-w-0 truncate rounded-full bg-amber-50 px-2.5 py-1 text-left text-[11px] font-bold text-amber-950"
                    title={savedNote ? savedNote : (latestNote || 'Sem observação')}
                    data-testid={`controle-diario-note-${row.os}`}
                  >
                    {latestNote || 'Sem observação'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNoteRow(row); setNoteKind('auditoria'); setNoteDraft(''); setNoteError(''); }}
                    className="min-w-0 truncate rounded-full bg-violet-50 px-2.5 py-1 text-left text-[11px] font-bold text-violet-950"
                    title={auditReminder || 'Lembrete da ocorrência de auditoria'}
                    data-testid={`controle-diario-audit-note-${row.os}`}
                  >
                    {auditReminder || 'Lembrete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAudit(row)}
                    className="inline-flex h-10 items-center justify-center gap-1 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-950 px-2 text-[11px] font-black uppercase tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_14px_-8px_rgba(0,0,0,0.7)]"
                    data-testid={`controle-diario-expand-audit-${row.os}`}
                    title="Abrir a auditoria de faturamento desta OS"
                  >
                    <Maximize2 size={13} />
                    Auditoria
                  </button>
                </div>
              );
            })}
          </div>
          {visible.length > 0 && (
            <div className="mx-auto mt-4 flex min-w-[1180px] max-w-[1480px] items-center justify-between gap-3" data-testid="controle-diario-pending-pager">
              <span className="text-xs font-bold text-zinc-500">
                {visible.length} OS · página {safePendingPage} de {pendingPageCount}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={safePendingPage <= 1}
                  onClick={() => setPendingPage(safePendingPage - 1)}
                  className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase text-zinc-700 shadow-[inset_0_1px_0_#fff,0_8px_16px_-12px_rgba(15,23,42,0.45)] ring-1 ring-zinc-200 disabled:opacity-40"
                  data-testid="controle-diario-pending-prev"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={safePendingPage >= pendingPageCount}
                  onClick={() => setPendingPage(safePendingPage + 1)}
                  className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase text-zinc-700 shadow-[inset_0_1px_0_#fff,0_8px_16px_-12px_rgba(15,23,42,0.45)] ring-1 ring-zinc-200 disabled:opacity-40"
                  data-testid="controle-diario-pending-next"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!pendingOnly && (<>
      <div
        ref={topScrollRef}
        className="sticky top-0 z-20 mx-3 mt-2 h-4 shrink-0 overflow-x-auto overflow-y-hidden rounded-full bg-zinc-200 [scrollbar-color:#71717a_#e4e4e7] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-500"
        onScroll={() => {
          if (mainScrollRef.current && topScrollRef.current && !syncingFromMainRef.current) {
            syncingFromTopRef.current = true;
            mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
            requestAnimationFrame(() => { syncingFromTopRef.current = false; });
          }
        }}
        data-testid="controle-diario-scroll-top"
        aria-label="Rolagem horizontal da folha"
      >
        <div style={{ width: topMirrorWidth, height: 1 }} />
      </div>
      <div
        ref={mainScrollRef}
        className="min-h-0 flex-1 overflow-auto px-3 pb-2"
        onScroll={() => {
          if (mainScrollRef.current && topScrollRef.current && !syncingFromTopRef.current) {
            syncingFromMainRef.current = true;
            topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
            requestAnimationFrame(() => { syncingFromMainRef.current = false; });
          }
        }}
      >
        <table ref={tableRef} className="min-w-[1680px] w-full border-separate border-spacing-y-1 text-left text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {CONTROLE_DIARIO_COLUMNS.map((col) => (
                <th key={col} className="whitespace-nowrap bg-zinc-950 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white first:rounded-l-2xl last:rounded-r-2xl">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && !loading && (
              <tr>
                <td colSpan={CONTROLE_DIARIO_COLUMNS.length} className="px-4 py-10 text-center text-sm text-zinc-500">
                  {pendingOnly ? 'Nenhuma OS concluída sem aprovação.' : 'Nenhuma OS do sistema neste dia.'}
                </td>
              </tr>
            )}
            {sheet.map((line, index) => {
              const row = line.row;
              let previous: ControleDiarioRow | undefined;
              for (let i = index - 1; i >= 0; i -= 1) {
                if (!sheet[i].isChild) {
                  previous = sheet[i].row;
                  break;
                }
              }
              const showSameDaySplit = !line.isChild && row.diaAnterior === false && previous?.diaAnterior === true && row.status !== 'FINALIZADO';
              const showDoneSplit = !line.isChild && row.status === 'FINALIZADO' && previous?.status !== 'FINALIZADO';
              const lineClass = `whitespace-nowrap px-3 py-2 align-middle first:rounded-l-2xl last:rounded-r-2xl ${
                row.diaAnterior ? 'bg-amber-100' : line.isChild ? 'bg-yellow-50 group-hover:bg-yellow-100' : 'bg-zinc-50 group-hover:bg-red-50'
              }`;
              return (
                <React.Fragment key={row.id}>
                  {index === 0 && row.diaAnterior && (
                    <tr data-testid="controle-diario-split-previous-day">
                      <td colSpan={CONTROLE_DIARIO_COLUMNS.length} className="rounded-full bg-amber-200/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-950">
                        Em viagem desde o dia anterior
                      </td>
                    </tr>
                  )}
                  {showSameDaySplit && (
                    <tr data-testid="controle-diario-split-same-day">
                      <td colSpan={CONTROLE_DIARIO_COLUMNS.length} className="rounded-full bg-zinc-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                        Iniciadas neste dia
                      </td>
                    </tr>
                  )}
                  {showDoneSplit && (
                    <tr data-testid="controle-diario-split-done">
                      <td colSpan={CONTROLE_DIARIO_COLUMNS.length} className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-900">
                        Finalizadas
                      </td>
                    </tr>
                  )}
                  <tr className="group" data-testid={`controle-diario-row-${row.os}`} title={row.diaAnterior ? 'Missão do dia anterior, ainda em viagem' : undefined}>
                    <td className={lineClass}>
                      <button
                        type="button"
                        onClick={() => openOs(row)}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-red-700 shadow-sm ring-1 ring-red-100 hover:bg-red-700 hover:text-white"
                        data-testid={`controle-diario-open-${row.os}`}
                        title={opensAudit ? 'Abrir auditoria da OS' : 'Editar OS'}
                      >
                        {opensAudit ? <FileSearch size={12} /> : <Pencil size={12} />}
                        {row.os}
                      </button>
                      {line.isLeader && line.groupSize > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleSe(line.seKey)}
                          className="ml-1 inline-flex items-center gap-1 rounded-full bg-yellow-300 px-2 py-1 text-[10px] font-black text-yellow-950 shadow-sm ring-1 ring-yellow-400 hover:bg-yellow-400"
                          data-testid={`controle-diario-se-${line.seKey}`}
                          title={`${line.groupSize} OS com a SE ${row.se}. Clique para ver todas juntas.`}
                        >
                          {printAll || expandedSe.has(line.seKey) ? '−' : '+'} SE {row.se}
                        </button>
                      )}
                      {line.isChild && (
                        <span className="ml-1 text-[10px] font-black uppercase text-yellow-800" data-testid={`controle-diario-se-child-${row.os}`}>
                          mesma SE
                        </span>
                      )}
                      {row.ocorrencias > 0 && (
                        <button
                          type="button"
                          onClick={() => setOccurrenceRow(row)}
                          className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white shadow-sm"
                          style={{ animation: 'blink-pending 1s ease-in-out infinite' }}
                          data-testid={`controle-diario-occurrence-${row.os}`}
                          title="Essa OS possui ocorrências, verificar"
                        >
                          <AlertTriangle size={11} />
                          {row.ocorrencias}
                        </button>
                      )}
                      {notesOfKind(notesByMission[row.id], 'observacao').length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setNoteRow(row); setNoteKind('observacao'); setNoteDraft(''); setNoteError(''); }}
                          className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-[10px] font-black text-amber-950 shadow-sm"
                          data-testid={`controle-diario-note-bubble-${row.os}`}
                          title={latestNoteOf(notesByMission[row.id], 'observacao')?.note || 'Observação'}
                        >
                          <MessageCircle size={11} />
                          {notesOfKind(notesByMission[row.id], 'observacao').length}
                        </button>
                      )}
                    </td>
                    <td
                      className={lineClass}
                      onMouseEnter={() => openStatusTip(row.id)}
                      onMouseLeave={closeStatusTip}
                    >
                      <span
                        className={`inline-block cursor-help rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_TONE[row.status] || 'bg-zinc-100 text-zinc-700'}`}
                        data-testid={`controle-diario-status-${row.os}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className={lineClass}>{cell(row.dataInicial)}</td>
                    <td className={lineClass}>{cell(row.horaAgendada)}</td>
                    <td className={lineClass}>{cell(row.horaOrigem)}</td>
                    <td className={`${lineClass} font-semibold`} title={row.cliente}>{cell(row.cliente)}</td>
                    <td className={lineClass} title={row.rota}>{cell(row.rota)}</td>
                    <td className={lineClass} title={row.fornecedor}>{cell(row.fornecedor)}</td>
                    <td className={`${lineClass} font-mono font-bold`}>{cell(row.viatura)}</td>
                    <td className={`${lineClass} font-mono`}>{cell(row.veiculoEscoltado)}</td>
                    <td className={lineClass}>{cell(row.dataFinal)}</td>
                    <td className={lineClass}>{cell(row.horaFinal)}</td>
                    <td className={`${lineClass} text-right tabular-nums`}>{cell(row.kmInicial)}</td>
                    <td className={`${lineClass} text-right tabular-nums`}>{cell(row.kmFinal)}</td>
                    <td className={`${lineClass} text-right font-bold tabular-nums ${row.totalKm != null && row.totalKm < 0 ? 'text-red-700' : ''}`}>
                      {row.totalKm == null ? '' : row.totalKm.toLocaleString('pt-BR')}
                    </td>
                    <td className={lineClass} title={row.equipe}>{cell(row.equipe)}</td>
                    <td className={`${lineClass} max-w-[220px] text-zinc-600`}>
                      {(() => {
                        const latest = latestNoteOf(notesByMission[row.id], 'observacao');
                        const pendingNote = !latest && (row.status === 'PENDENTE' || row.aprovacaoPendente) ? 'Pendente de aprovação' : '';
                        return (
                          <button
                            type="button"
                            onClick={() => { setNoteRow(row); setNoteKind('observacao'); setNoteDraft(''); setNoteError(''); }}
                            className={`block max-w-full truncate rounded-lg px-2 py-1 text-left text-[10px] font-bold ${latest || pendingNote ? 'bg-amber-100 text-amber-950' : 'bg-zinc-100 text-zinc-500 hover:bg-amber-50'}`}
                            data-testid={`controle-diario-note-${row.os}`}
                            title={latest ? `${latest.note} — ${latest.created_by}` : pendingNote || 'Observação registrada ao finalizar, recusar ou cancelar'}
                          >
                            {latest ? latest.note : (pendingNote || 'Sem observação')}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                  {statusTip === row.id && (
                    <tr
                      data-testid={`controle-diario-status-tip-${row.os}`}
                      onMouseEnter={() => openStatusTip(row.id)}
                      onMouseLeave={closeStatusTip}
                    >
                      <td colSpan={CONTROLE_DIARIO_COLUMNS.length} className="rounded-2xl bg-white px-3 py-2">
                        <div className="flex max-w-xl items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Última atualização</p>
                            <p className="mt-1 whitespace-normal text-xs font-semibold text-zinc-800">{row.ultimaAtualizacao || 'Sem atualização registrada'}</p>
                            {row.mapa ? (
                              <a href={row.mapa} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[11px] font-black text-red-700 underline">Abrir mapa</a>
                            ) : (
                              <p className="mt-2 text-[11px] text-zinc-400">Sem mapa nesta atualização.</p>
                            )}
                          </div>
                          {row.mapa && mapPreview(row.mapa) ? (
                            <iframe title={`Mapa da OS ${row.os}`} src={mapPreview(row.mapa)} className="h-28 w-44 shrink-0 rounded-xl border border-zinc-100" loading="lazy" />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </>)}

      {!pendingOnly && <footer className="flex items-center gap-1.5 overflow-x-auto px-4 py-3">
        {days.map((iso) => {
          const active = iso === day;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDay(iso)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                active ? 'bg-red-700 text-white shadow-md' : 'bg-zinc-100 text-zinc-500 hover:bg-red-50 hover:text-red-800'
              }`}
              data-testid={`controle-diario-day-${iso}`}
            >
              {tabLabel(iso)}
            </button>
          );
        })}
      </footer>}
      </div>
      {editMission && (
        <UpdateMissionModal
          isOpen
          mission={editMission}
          currentUser={currentUser}
          onClose={() => setEditMission(null)}
          onSuccess={() => { setEditMission(null); void load(day); }}
        />
      )}
      {auditMission && (
        <MissionFinancialModal
          isOpen
          mission={auditMission}
          onClose={() => setAuditMission(null)}
          onUpdate={() => { void (pendingOnly ? loadPending() : load(day)); }}
        />
      )}
      {occurrenceRow && (
        <MissionOccurrenceDialog
          missionId={occurrenceRow.id}
          canWrite
          context={{
            os: occurrenceRow.os,
            cliente: occurrenceRow.cliente,
            rota: occurrenceRow.rota,
            motorista: occurrenceRow.motorista,
            origem: occurrenceRow.origem,
            destino: occurrenceRow.destino,
            fornecedor: occurrenceRow.fornecedor,
            equipe: occurrenceRow.equipe,
            viatura: occurrenceRow.viatura,
          }}
          onClose={() => setOccurrenceRow(null)}
          onSaved={(count) => {
            setRows((current) => current.map((item) => (
              item.id === occurrenceRow.id ? { ...item, ocorrencias: count } : item
            )));
            setOccurrenceRow((current) => (current ? { ...current, ocorrencias: count } : current));
          }}
        />
      )}
      {passagem && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/60 p-4" data-testid="passagem-plantao-modal">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="bg-gradient-to-br from-zinc-950 via-[#4a1010] to-red-700 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Grupo TM SEG</p>
                  <h2 className="text-xl font-black">Passagem de plantão</h2>
                </div>
                <button type="button" onClick={() => setPassagem(null)} className="rounded-full bg-white/10 p-1.5" aria-label="Fechar">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              <div className="space-y-2" data-testid="passagem-plantao-resumo">
                {passagem.linhas.map((line) => {
                  const Icon = line.status === 'NA ORIGEM' ? MapPin
                    : line.status === 'EM VIAGEM' ? Truck
                    : line.status === 'CANCELADA' ? Ban
                    : line.status === 'RECUSADA' ? XCircle
                    : line.status === 'PERNOITE' ? Moon
                    : line.status === 'FINALIZADO' ? CheckCircle2
                    : CalendarClock;
                  return (
                    <div key={line.status} className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-2">
                      <span className="inline-flex items-center gap-2 text-sm font-black text-zinc-800">
                        <Icon size={16} className="text-red-700" />
                        {line.label}
                      </span>
                      <span className="text-lg font-black tabular-nums">{line.total}</span>
                    </div>
                  );
                })}
                {passagem.outros > 0 && (
                  <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-2">
                    <span className="text-sm font-black">📌 OUTROS</span>
                    <span className="text-lg font-black tabular-nums">{passagem.outros}</span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-2xl bg-zinc-950 px-3 py-3 text-white">
                  <span className="text-sm font-black tracking-wide">📊 TOTAL</span>
                  <span className="text-2xl font-black tabular-nums">{passagem.total}</span>
                </div>
              </div>
              <img src={passagem.image} alt="Print do controle diário" className="w-full rounded-2xl border border-zinc-200" data-testid="passagem-plantao-print" />
            </div>
            <div className="flex gap-2 border-t border-zinc-100 px-4 py-3">
              <button type="button" onClick={() => { void copyPassagem(); }} className="flex-1 rounded-full bg-amber-400 py-2 text-sm font-black text-zinc-950" data-testid="passagem-plantao-copy">
                Copiar texto
              </button>
              <button type="button" onClick={downloadPassagem} className="flex-1 rounded-full bg-zinc-950 py-2 text-sm font-black text-white" data-testid="passagem-plantao-download">
                Baixar print
              </button>
            </div>
          </div>
        </div>
      )}
      {noteRow && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4" data-testid="controle-diario-note-modal">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <p className="text-sm font-black text-zinc-900">{noteKind === 'auditoria' ? 'Ocorrência de auditoria' : 'Observação'} · OS {noteRow.os}</p>
                <p className="text-[11px] text-zinc-500">{noteKind === 'auditoria' ? 'Lembrete da auditoria. O histórico guarda quem escreveu.' : `${noteRow.cliente} · o histórico guarda quem escreveu`}</p>
              </div>
              <button type="button" onClick={() => !noteSaving && setNoteRow(null)} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100" data-testid="controle-diario-note-close">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={4}
                placeholder={noteKind === 'auditoria' ? 'Lembrete da ocorrência de auditoria...' : 'Escreva o que o próximo turno precisa saber...'}
                className="w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-red-400"
                data-testid="controle-diario-note-input"
              />
              {noteError && <p className="text-xs font-bold text-red-700">{noteError}</p>}
              <button
                type="button"
                disabled={noteSaving}
                onClick={() => { void saveNote(); }}
                className="w-full rounded-full bg-red-700 py-2 text-sm font-black text-white disabled:opacity-50"
                data-testid="controle-diario-note-save"
              >
                {noteSaving ? 'Salvando…' : (noteKind === 'auditoria' ? 'Salvar lembrete' : 'Salvar observação')}
              </button>
              <div className="space-y-2" data-testid="controle-diario-note-history">
                {notesOfKind(notesByMission[noteRow.id], noteKind).length === 0 && (
                  <p className="text-xs text-zinc-400">{noteKind === 'auditoria' ? 'Nenhum lembrete salvo nesta OS.' : 'Nenhuma observação salva nesta OS.'}</p>
                )}
                {notesOfKind(notesByMission[noteRow.id], noteKind).map((item) => (
                  <div key={item.id} className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <p className="whitespace-pre-wrap text-sm text-zinc-800">{item.note}</p>
                    <p className="mt-1 text-[10px] font-bold text-zinc-500">{item.created_by} · {whenNote(item.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
