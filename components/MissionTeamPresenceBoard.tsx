import React, { useMemo } from 'react';
import { Users, Briefcase, Circle } from 'lucide-react';
import { useOnlinePresence } from '../lib/useOnlinePresence';
import { useTeamPresenceBoard } from '../lib/services/useTeamPresenceBoard';
import {
  PRESENCE_CATEGORY_LABELS,
  PRESENCE_CATEGORY_ORDER,
  PRESENCE_SERVICE_STATUS_LABELS,
  buildPresenceTooltip,
  getPresenceCategory,
  getPresenceServiceStatus,
  mergeRosterWithPresence,
  formatPresenceShortName,
  normalizePresenceUserId,
  type PresenceCategory,
  type PresenceServiceStatus,
  type PresenceUserState,
} from '../lib/timeclock/presence';

interface Props {
  enabled?: boolean;
}

/**
 * Avatar do robô desenhado inline (SVG no próprio bundle JS). Antes usávamos
 * um <img src="/assets/..."> que aparecia quebrado quando o cache do navegador
 * ou o caminho do arquivo falhava. Inline nunca quebra e mantém o robô pedido.
 */
const RobotAvatar: React.FC = () => (
  <svg
    viewBox="0 0 64 64"
    className="w-10 h-10 select-none pointer-events-none"
    role="img"
    aria-hidden
    focusable="false"
  >
    <defs>
      <linearGradient id="tmsegRobotBody" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#e2e8f0" />
      </linearGradient>
      <radialGradient id="tmsegRobotEye" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#67e8f9" />
        <stop offset="100%" stopColor="#06b6d4" />
      </radialGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="#f8fafc" />
    <rect x="14" y="44" width="36" height="6" rx="1.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8" />
    <rect x="16" y="38" width="32" height="8" rx="1" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />
    <ellipse cx="32" cy="34" rx="11" ry="9" fill="url(#tmsegRobotBody)" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="17" y="30" width="5" height="10" rx="2.5" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.8" />
    <rect x="42" y="30" width="5" height="10" rx="2.5" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.8" />
    <circle cx="32" cy="18" r="12" fill="url(#tmsegRobotBody)" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="22" y="14" width="20" height="10" rx="5" fill="#0f172a" />
    <ellipse cx="27" cy="19" rx="3" ry="2.2" fill="url(#tmsegRobotEye)" />
    <ellipse cx="37" cy="19" rx="3" ry="2.2" fill="url(#tmsegRobotEye)" />
    <ellipse cx="27.5" cy="18.5" rx="1" ry="0.7" fill="#ecfeff" opacity="0.9" />
    <ellipse cx="37.5" cy="18.5" rx="1" ry="0.7" fill="#ecfeff" opacity="0.9" />
    <line x1="32" y1="6" x2="32" y2="3" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="32" cy="2.5" r="1.5" fill="#06b6d4" />
  </svg>
);

interface StatusStyle {
  border: string;
  dot: string;
  text: string;
}

function statusStyle(status: PresenceServiceStatus, isOnline: boolean): StatusStyle {
  switch (status) {
    case 'em_servico':
      return {
        border: 'border-green-300',
        dot: 'bg-green-500',
        text: 'text-green-700',
      };
    case 'em_almoco':
      return {
        border: 'border-red-300',
        dot: 'bg-red-500',
        text: 'text-red-600',
      };
    case 'aguardando_ponto':
      return {
        border: 'border-amber-300',
        dot: 'bg-amber-500',
        text: 'text-amber-700',
      };
    case 'online':
      return {
        border: 'border-sky-300',
        dot: 'bg-sky-500',
        text: 'text-sky-700',
      };
    default:
      return {
        border: isOnline ? 'border-sky-200' : 'border-slate-300',
        dot: isOnline ? 'bg-sky-400' : 'bg-slate-400',
        text: isOnline ? 'text-sky-600' : 'text-slate-500',
      };
  }
}

function statusLine(user: PresenceUserState, isOnline: boolean): string {
  const status = getPresenceServiceStatus(user, { isOnline });
  const base = PRESENCE_SERVICE_STATUS_LABELS[status];
  if (status === 'em_servico' && user.minutesOnDuty != null && user.minutesOnDuty > 0) {
    const mins = `${user.minutesOnDuty} min`;
    if (user.activityStatus === 'idle' && user.idleMinutes && user.idleMinutes > 0) {
      return `${base} — ${mins} — Inativo ${user.idleMinutes}m`;
    }
    return `${base} — ${mins}`;
  }
  if (user.activityStatus === 'idle' && user.idleMinutes && user.idleMinutes > 0) {
    return `${base} — Inativo ${user.idleMinutes}m`;
  }
  return base;
}

const MissionTeamPresenceBoard: React.FC<Props> = ({ enabled = true }) => {
  const { onlineUsers, onDutyClt } = useOnlinePresence(enabled);
  const { roster, punchLookup } = useTeamPresenceBoard(enabled);

  const onlineIds = useMemo(
    () => new Set(onlineUsers.map((u) => normalizePresenceUserId(u.userId))),
    [onlineUsers]
  );

  const displayUsers = useMemo<PresenceUserState[]>(
    () => mergeRosterWithPresence(roster, onlineUsers, punchLookup),
    [roster, onlineUsers, punchLookup]
  );

  const emServicoCount = useMemo(
    () => displayUsers.filter((u) => getPresenceServiceStatus(u, { isOnline: onlineIds.has(normalizePresenceUserId(u.userId)) }) === 'em_servico').length,
    [displayUsers, onlineIds]
  );

  const onlineOnBoard = useMemo(
    () => displayUsers.filter((u) => onlineIds.has(normalizePresenceUserId(u.userId))).length,
    [displayUsers, onlineIds]
  );

  const grouped = useMemo(() => {
    const groups: Record<PresenceCategory, PresenceUserState[]> = {
      operacao: [],
      administrativo: [],
      comercial: [],
    };
    for (const user of displayUsers) {
      const category = getPresenceCategory(user.role);
      groups[category].push(user);
    }
    for (const key of PRESENCE_CATEGORY_ORDER) {
      groups[key].sort((a, b) =>
        (a.name || 'Usuário').localeCompare(b.name || 'Usuário', 'pt-BR')
      );
    }
    return groups;
  }, [displayUsers]);

  if (!enabled) return null;

  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4"
      data-testid="mission-team-presence-board"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-indigo-600" />
          <h3 className="text-xs font-black uppercase tracking-wide text-gray-800">
            Equipe no sistema
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase">
          <span className="inline-flex items-center gap-1 text-green-700">
            <Circle size={8} className="fill-green-500 text-green-500" />
            {onlineOnBoard} online
          </span>
          <span className="inline-flex items-center gap-1 text-green-700">
            <Briefcase size={10} />
            {emServicoCount} em serviço
          </span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Circle size={8} className="fill-slate-400 text-slate-400" />
            CLT em serviço: {onDutyClt.length}
          </span>
        </div>
      </div>

      {displayUsers.length === 0 ? (
        <p className="text-xs text-gray-500 font-medium">Nenhum usuário cadastrado.</p>
      ) : (
        <div className="space-y-4">
          {PRESENCE_CATEGORY_ORDER.map((category) => {
            const users = grouped[category];
            return (
              <div key={category}>
                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-wide text-gray-500">
                  <span>{PRESENCE_CATEGORY_LABELS[category]} · {users.length}</span>
                </div>
                {users.length === 0 ? (
                  <p className="text-[10px] text-gray-400 font-medium mb-1">Nenhum usuário nesta categoria.</p>
                ) : (
                  <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-x-3 gap-y-4">
                    {users.map((user) => {
                      const displayName = formatPresenceShortName(user.name || 'Usuário');
                      const isOnline = onlineIds.has(normalizePresenceUserId(user.userId));
                      const serviceStatus = getPresenceServiceStatus(user, { isOnline });
                      const style = statusStyle(serviceStatus, isOnline);
                      const status = statusLine(user, isOnline);
                      const tooltip = buildPresenceTooltip(user);
                      return (
                        <div
                          key={user.userId}
                          className={`group relative flex min-w-0 w-full flex-col items-center px-0.5 transition-opacity ${isOnline ? '' : 'opacity-60'}`}
                        >
                          <div className="relative shrink-0">
                            <div
                              className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center shadow-md border-2 bg-white ${style.border}`}
                            >
                              <RobotAvatar />
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${style.dot}`}
                            />
                          </div>
                          <p className="mt-1.5 w-full text-center text-[10px] font-bold leading-snug text-gray-800 break-words">
                            {displayName}
                          </p>
                          <p
                            className={`mt-0.5 w-full text-center text-[9px] font-black uppercase leading-snug whitespace-normal break-words ${style.text}`}
                          >
                            {status}
                          </p>

                          <div
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-52 -translate-x-1/2 rounded-xl border border-gray-200 bg-gray-900 px-3 py-2 text-left text-[10px] font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100"
                          >
                            <p className="mb-1 font-black uppercase text-[9px] text-indigo-200">
                              {displayName}
                            </p>
                            <pre className="whitespace-pre-wrap font-sans text-[10px] text-gray-100">
                              {tooltip}
                            </pre>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MissionTeamPresenceBoard;
