import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatDateTimeAuditBR, formatTimeAuditBR } from '../lib/dateUtils';
import {
  Activity, Database, Radio, Wifi, WifiOff, Maximize2, Minimize2,
  Filter, Loader2, Circle,
} from 'lucide-react';

export interface TimelineEvent {
  id: string;
  at: string;
  category: 'system' | 'mission' | 'os' | 'db';
  title: string;
  detail: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

interface Props {
  tvMode?: boolean;
  onToggleTvMode?: () => void;
}

const MAX_EVENTS = 200;

const severityColor: Record<TimelineEvent['severity'], string> = {
  info: 'border-slate-600 bg-slate-800/60',
  success: 'border-emerald-700/60 bg-emerald-950/40',
  warning: 'border-amber-700/60 bg-amber-950/40',
  error: 'border-red-700/60 bg-red-950/40',
};

const categoryIcon = (cat: TimelineEvent['category']) => {
  switch (cat) {
    case 'db': return <Database size={14} className="text-blue-400" />;
    case 'os': return <Activity size={14} className="text-orange-400" />;
    case 'mission': return <Radio size={14} className="text-purple-400" />;
    default: return <Circle size={14} className="text-slate-400" />;
  }
};

function mapSystemLog(row: any): TimelineEvent {
  const action = String(row.action_type || 'EVENT').toUpperCase();
  const entity = row.entity || 'Sistema';
  const sev: TimelineEvent['severity'] =
    action.includes('DELETE') || action.includes('ERROR') ? 'error'
    : action.includes('UPDATE') || action.includes('OVERRIDE') ? 'warning'
    : action.includes('CREATE') || action.includes('APPROV') ? 'success'
    : 'info';
  return {
    id: `sl-${row.id}`,
    at: row.created_at,
    category: 'system',
    title: `${action} · ${entity}`,
    detail: `${row.user_name || 'Sistema'}${row.entity_id ? ` · ${row.entity_id}` : ''}${row.details ? ` — ${String(row.details).slice(0, 120)}` : ''}`,
    severity: sev,
  };
}

function mapMissionLog(row: any): TimelineEvent {
  return {
    id: `ml-${row.id}`,
    at: row.created_at,
    category: 'mission',
    title: `Log missão · ${row.mission_id || '—'}`,
    detail: `${row.updated_by || 'Operador'}: ${(row.description || '').slice(0, 140)}`,
    severity: 'info',
  };
}

function mapMissionChange(row: any, event: 'INSERT' | 'UPDATE' | 'DELETE'): TimelineEvent {
  const id = row.id || row.mission_id || '—';
  const status = row.status || '';
  return {
    id: `m-${event}-${id}-${row.updated_at || row.created_at || Date.now()}`,
    at: row.updated_at || row.last_update || row.created_at || new Date().toISOString(),
    category: 'os',
    title: event === 'INSERT' ? `Nova OS · ${id}` : event === 'DELETE' ? `OS removida · ${id}` : `OS atualizada · ${id}`,
    detail: [status && `Status: ${status}`, row.client && `Cliente: ${row.client}`, row.provider && `Forn: ${row.provider}`].filter(Boolean).join(' · '),
    severity: event === 'DELETE' ? 'error' : event === 'INSERT' ? 'success' : 'info',
  };
}

function mapHistoryRow(row: any): TimelineEvent {
  return {
    id: `mh-${row.id || `${row.mission_id}-${row.changed_at}`}`,
    at: row.changed_at,
    category: 'db',
    title: `Histórico · ${row.mission_id}`,
    detail: `${row.field_name}: ${row.old_value ?? '—'} → ${row.new_value ?? '—'} (${row.changed_by || '—'})`,
    severity: row.field_name === 'status' ? 'warning' : 'info',
  };
}

const DatabaseLiveTimeline: React.FC<Props> = ({ tvMode = false, onToggleTvMode }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [filter, setFilter] = useState<'all' | TimelineEvent['category']>('all');
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedTopRef = useRef(true);

  const pushEvent = useCallback((ev: TimelineEvent) => {
    setEvents(prev => {
      if (prev.some(p => p.id === ev.id)) return prev;
      return [ev, ...prev].slice(0, MAX_EVENTS);
    });
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const pingStart = performance.now();
      const { error: pingErr } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      setDbLatency(Math.round(performance.now() - pingStart));
      if (pingErr) {
        pushEvent({
          id: `heartbeat-err-${Date.now()}`,
          at: new Date().toISOString(),
          category: 'db',
          title: 'Falha na consulta ao banco',
          detail: pingErr.message,
          severity: 'error',
        });
      }

      const [sysRes, missLogRes, histRes] = await Promise.all([
        supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(80),
        supabase.from('mission_logs').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('mission_history').select('*').order('changed_at', { ascending: false }).limit(40),
      ]);

      const merged: TimelineEvent[] = [];
      for (const r of sysRes.data || []) merged.push(mapSystemLog(r));
      for (const r of missLogRes.data || []) merged.push(mapMissionLog(r));
      for (const r of histRes.data || []) merged.push(mapHistoryRow(r));
      merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setEvents(merged.slice(0, MAX_EVENTS));
    } catch (e: any) {
      pushEvent({
        id: `load-err-${Date.now()}`,
        at: new Date().toISOString(),
        category: 'db',
        title: 'Erro ao carregar timeline',
        detail: e?.message || String(e),
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [pushEvent]);

  useEffect(() => { void loadInitial(); }, [loadInitial]);

  // Heartbeat de latência a cada 30s
  useEffect(() => {
    const tick = async () => {
      const start = performance.now();
      const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      const ms = Math.round(performance.now() - start);
      setDbLatency(ms);
      pushEvent({
        id: `hb-${Math.floor(Date.now() / 30000)}`,
        at: new Date().toISOString(),
        category: 'db',
        title: error ? 'Heartbeat DB — ERRO' : 'Heartbeat DB',
        detail: error ? error.message : `Latência ${ms}ms · Supabase operacional`,
        severity: error ? 'error' : ms > 1000 ? 'warning' : 'success',
      });
    };
    const t = setInterval(() => { void tick(); }, 30000);
    return () => clearInterval(t);
  }, [pushEvent]);

  // Realtime Supabase
  useEffect(() => {
    const channel = supabase
      .channel('db-live-timeline')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_logs' }, payload => {
        pushEvent(mapSystemLog(payload.new));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mission_logs' }, payload => {
        pushEvent(mapMissionLog(payload.new));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, payload => {
        const row = payload.new && Object.keys(payload.new as object).length ? payload.new : payload.old;
        if (row) pushEvent(mapMissionChange(row, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'));
      })
      .subscribe(status => {
        setLiveConnected(status === 'SUBSCRIBED');
      });

    return () => { void supabase.removeChannel(channel); };
  }, [pushEvent]);

  useEffect(() => {
    if (pinnedTopRef.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const filtered = filter === 'all' ? events : events.filter(e => e.category === filter);

  const shellClass = tvMode
    ? 'fixed inset-0 z-[200] bg-[#0a0f1a] text-white p-6 overflow-hidden flex flex-col'
    : 'bg-gradient-to-br from-[#0f172a] to-[#1e293b] rounded-3xl border border-slate-700 p-5 shadow-xl';

  return (
    <div className={shellClass} data-testid="panel-db-live-timeline">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <h3 className={`font-black uppercase tracking-widest flex items-center gap-2 ${tvMode ? 'text-2xl' : 'text-sm text-white'}`}>
            <Activity className={tvMode ? 'text-emerald-400' : 'text-blue-400'} size={tvMode ? 28 : 18} />
            Linha do Tempo — Banco & Sistema
          </h3>
          <p className={`text-slate-400 font-bold uppercase tracking-wider mt-1 ${tvMode ? 'text-xs' : 'text-[9px]'}`}>
            Realtime · system_logs · missions · mission_logs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${liveConnected ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700' : 'bg-red-900/50 text-red-300 border border-red-700'}`}>
            {liveConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {liveConnected ? 'Live ON' : 'Live OFF'}
          </span>
          {dbLatency != null && (
            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black font-mono uppercase border ${dbLatency > 1000 ? 'border-red-700 text-red-300 bg-red-950/40' : 'border-blue-700 text-blue-300 bg-blue-950/40'}`}>
              DB {dbLatency}ms
            </span>
          )}
          {onToggleTvMode && (
            <button
              type="button"
              onClick={onToggleTvMode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-[10px] font-black uppercase text-white transition-colors"
              data-testid="btn-toggle-tv-mode"
            >
              {tvMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              {tvMode ? 'Sair TV' : 'Modo TV'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
        {(['all', 'db', 'os', 'system', 'mission'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            <Filter size={10} className="inline mr-1" />
            {f === 'all' ? 'Tudo' : f === 'db' ? 'Banco' : f === 'os' ? 'OS' : f === 'system' ? 'Sistema' : 'Missão'}
          </button>
        ))}
      </div>

      <div
        ref={listRef}
        className={`flex-1 overflow-y-auto space-y-2 pr-1 ${tvMode ? 'min-h-0' : 'max-h-[420px]'}`}
        onScroll={e => { pinnedTopRef.current = (e.currentTarget.scrollTop < 40); }}
      >
        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
            <Loader2 size={20} className="animate-spin" /> Carregando eventos…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-8">Nenhum evento no filtro selecionado.</p>
        )}
        {filtered.map(ev => (
          <div
            key={ev.id}
            className={`flex gap-3 p-3 rounded-xl border ${severityColor[ev.severity]} ${tvMode ? 'text-base' : 'text-xs'}`}
          >
            <div className="shrink-0 mt-0.5">{categoryIcon(ev.category)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={`font-black text-white truncate ${tvMode ? 'text-lg' : 'text-[11px]'}`}>{ev.title}</p>
                <time className="text-[10px] font-mono text-slate-400 shrink-0" title={formatDateTimeAuditBR(ev.at)}>
                  {formatTimeAuditBR(ev.at)}
                </time>
              </div>
              <p className={`text-slate-400 mt-0.5 break-words ${tvMode ? 'text-sm' : 'text-[10px]'}`}>{ev.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {tvMode && (
        <p className="text-[10px] text-slate-600 text-center mt-3 shrink-0 font-mono">
          TM SEG · Monitor ao vivo · {formatDateTimeAuditBR(new Date())}
        </p>
      )}
    </div>
  );
};

export default DatabaseLiveTimeline;
