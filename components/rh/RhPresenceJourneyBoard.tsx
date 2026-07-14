import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useOnlinePresence } from '../../lib/useOnlinePresence';
import { useTeamPresenceBoard } from '../../lib/services/useTeamPresenceBoard';
import {
  mergeRosterWithPresence,
  normalizePresenceUserId,
  formatPresenceShortName,
  getPresenceServiceStatus,
  PRESENCE_SERVICE_STATUS_LABELS,
  PRESENCE_USER_AVATAR_SRC,
  type PresenceUserState,
} from '../../lib/timeclock/presence';
import { resolvePunchEntriesForMember } from '../../lib/timeclock/teamPunchBoard';
import {
  computeJourneyDayMetrics,
  formatDurationHoursMinutes,
} from '../../lib/timeclock/journeyMetrics';
import { formatDateTimeBR } from '../../lib/dateUtils';
import { supabase } from '../../lib/supabase';

/** Atualiza roster/ponto/últimos logins a cada 5 min (pedido do Thiago). */
const POLL_MS = 5 * 60_000;
/** Recalcula minutos em tela a cada 30s sem refetch. */
const TICK_MS = 30_000;

type LastLoginMap = Record<string, string>;

function MetricRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-gray-500 font-semibold">{label}</span>
      <span className={`font-mono font-black ${accent || 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

const RhPresenceJourneyBoard: React.FC = () => {
  const { onlineUsers, onlineCount } = useOnlinePresence(true);
  const { roster, punchLookup, loading, refresh } = useTeamPresenceBoard(true);
  const [tick, setTick] = useState(0);
  const [lastLoginByUser, setLastLoginByUser] = useState<LastLoginMap>({});
  const [lastLoginByName, setLastLoginByName] = useState<LastLoginMap>({});
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const loadLastLogins = useCallback(async () => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('system_logs')
        .select('entity_id, user_name, created_at, action_type')
        .eq('action_type', 'LOGIN')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(800);
      if (error) throw error;

      const byUser: LastLoginMap = {};
      const byName: LastLoginMap = {};
      for (const row of data || []) {
        const uid = normalizePresenceUserId((row as any).entity_id);
        const nameKey = String((row as any).user_name || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase();
        const at = String((row as any).created_at || '');
        if (!at) continue;
        if (uid && !byUser[uid]) byUser[uid] = at;
        if (nameKey && !byName[nameKey]) byName[nameKey] = at;
      }
      setLastLoginByUser(byUser);
      setLastLoginByName(byName);
    } catch (e) {
      console.warn('[RhPresenceJourneyBoard] falha ao carregar LOGIN:', e);
    }
  }, []);

  const pollAll = useCallback(async () => {
    setPolling(true);
    try {
      await Promise.all([refresh(), loadLastLogins()]);
      setLastPolledAt(new Date().toISOString());
    } finally {
      setPolling(false);
    }
  }, [refresh, loadLastLogins]);

  useEffect(() => {
    void pollAll();
  }, [pollAll]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void pollAll();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [pollAll]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const onlineIds = useMemo(
    () => new Set(onlineUsers.map((u) => normalizePresenceUserId(u.userId))),
    [onlineUsers],
  );

  const rows = useMemo(() => {
    void tick;
    const now = new Date();
    const merged = mergeRosterWithPresence(roster, onlineUsers, punchLookup);

    // Prioriza quem está online; mantém quem bateu ponto hoje mesmo offline.
    const scored = merged.map((u) => {
      const punches = resolvePunchEntriesForMember(
        { userId: u.userId, name: u.name, role: u.role },
        punchLookup,
      ) || [];
      const journey = computeJourneyDayMetrics(punches, now);
      const isOnline = onlineIds.has(normalizePresenceUserId(u.userId));
      return { user: u, journey, punches, isOnline };
    });

    return scored
      .filter((r) => r.isOnline || r.journey.onDuty || r.punches.length > 0)
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        if (a.journey.onDuty !== b.journey.onDuty) return a.journey.onDuty ? -1 : 1;
        return (a.user.name || '').localeCompare(b.user.name || '', 'pt-BR');
      });
  }, [roster, onlineUsers, punchLookup, onlineIds, tick]);

  const resolveLastLogin = (user: PresenceUserState): string | null => {
    const uid = normalizePresenceUserId(user.userId);
    if (uid && lastLoginByUser[uid]) return lastLoginByUser[uid];
    const nameKey = String(user.name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    if (nameKey && lastLoginByName[nameKey]) return lastLoginByName[nameKey];
    return user.lastActivityAt || (user.onlineAt && user.onlineAt !== new Date(0).toISOString() ? user.onlineAt : null);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm" data-testid="rh-presence-journey-board">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase text-gray-900 tracking-wide">
              Presença & jornada (hoje)
            </h3>
            <p className="text-xs text-gray-500">
              {onlineCount} online agora · atualiza a cada 5 min (tempos ao vivo a cada 30s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastPolledAt && (
            <span className="text-[10px] text-gray-400 font-medium">
              Sync: {formatDateTimeBR(lastPolledAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => { void pollAll(); }}
            disabled={polling || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw size={12} className={polling || loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          Nenhum colaborador online ou com ponto hoje.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map(({ user, journey, isOnline }) => {
            const status = getPresenceServiceStatus(user, { isOnline });
            const statusLabel = PRESENCE_SERVICE_STATUS_LABELS[status];
            const idleMin = user.activityStatus === 'idle' ? (user.idleMinutes || 0) : 0;
            const lastLoginIso = resolveLastLogin(user);
            const lastLoginLabel = lastLoginIso
              ? formatDateTimeBR(lastLoginIso).replace(',', ' -')
              : '—';

            return (
              <div
                key={user.userId}
                className={`rounded-xl border p-3 space-y-2 ${
                  isOnline ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-200 bg-gray-50/60'
                }`}
                data-testid={`rh-journey-card-${user.userId}`}
              >
                <div className="flex items-start gap-2">
                  <img
                    src={PRESENCE_USER_AVATAR_SRC}
                    alt=""
                    className="h-9 w-9 rounded-full border border-white shadow-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-gray-900 truncate">
                      {formatPresenceShortName(user.name)}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">{user.role || '—'}</p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      isOnline ? 'bg-green-600 text-white' : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                <p className="text-[10px] font-black uppercase tracking-wide text-indigo-700">
                  {statusLabel}
                </p>

                <div className="space-y-1 rounded-lg bg-white/80 border border-gray-100 p-2">
                  <MetricRow
                    label="Em Serviço"
                    value={
                      journey.onDuty && !journey.onLunch
                        ? formatDurationHoursMinutes(journey.serviceOpenMinutes)
                        : journey.onDuty
                          ? '—'
                          : formatDurationHoursMinutes(0)
                    }
                    accent="text-green-700"
                  />
                  <MetricRow
                    label="Almoço"
                    value={formatDurationHoursMinutes(journey.lunchMinutes)}
                    accent="text-amber-700"
                  />
                  <MetricRow
                    label="Logado sem mexer"
                    value={
                      !isOnline
                        ? '—'
                        : idleMin > 0
                          ? formatDurationHoursMinutes(idleMin)
                          : 'Ativo'
                    }
                    accent={idleMin > 0 ? 'text-rose-700' : 'text-sky-700'}
                  />
                  <MetricRow
                    label="Hora total trabalhada"
                    value={formatDurationHoursMinutes(journey.workedMinutes)}
                    accent="text-gray-900"
                  />
                  <MetricRow
                    label="Última vez logado"
                    value={lastLoginLabel}
                    accent="text-gray-700"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
        Em serviço = trecho atual (após entrada ou retorno do almoço). Almoço e total líquido vêm das batidas de hoje.
        Sem mexer = mais de 10 min sem clique/navegação (só online). Sync completo a cada 5 minutos.
      </p>
    </div>
  );
};

export default RhPresenceJourneyBoard;
