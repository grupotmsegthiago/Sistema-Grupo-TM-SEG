import React, { useMemo } from 'react';
import { Users, Briefcase, Circle } from 'lucide-react';
import { useOnlinePresence } from '../lib/useOnlinePresence';
import {
  PRESENCE_CATEGORY_LABELS,
  PRESENCE_CATEGORY_ORDER,
  PRESENCE_SERVICE_STATUS_LABELS,
  PRESENCE_USER_AVATAR_SRC,
  buildPresenceTooltip,
  getPresenceCategory,
  getPresenceServiceStatus,
  type PresenceCategory,
  type PresenceServiceStatus,
  type PresenceUserState,
} from '../lib/timeclock/presence';

interface Props {
  enabled?: boolean;
}

interface StatusStyle {
  border: string;
  dot: string;
  text: string;
}

function statusStyle(status: PresenceServiceStatus): StatusStyle {
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
    default:
      return {
        border: 'border-slate-300',
        dot: 'bg-slate-400',
        text: 'text-slate-500',
      };
  }
}

function statusLine(user: PresenceUserState): string {
  const status = getPresenceServiceStatus(user);
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
  const { onlineUsers, onlineCount, onDutyClt } = useOnlinePresence(enabled);

  const grouped = useMemo(() => {
    const groups: Record<PresenceCategory, PresenceUserState[]> = {
      operacao: [],
      administrativo: [],
      comercial: [],
    };
    for (const user of onlineUsers) {
      const category = getPresenceCategory(user.role);
      groups[category].push(user);
    }
    for (const key of PRESENCE_CATEGORY_ORDER) {
      groups[key].sort((a, b) =>
        (a.name || 'Usuário').localeCompare(b.name || 'Usuário', 'pt-BR')
      );
    }
    return groups;
  }, [onlineUsers]);

  const emServicoCount = useMemo(
    () => onlineUsers.filter((u) => getPresenceServiceStatus(u) === 'em_servico').length,
    [onlineUsers]
  );

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
            {onlineCount} online
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

      {onlineCount === 0 ? (
        <p className="text-xs text-gray-500 font-medium">Nenhum usuário online no momento.</p>
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
                  <p className="text-[10px] text-gray-400 font-medium mb-1">Ninguém online nesta categoria.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {users.map((user) => {
                      const displayName = user.name || 'Usuário';
                      const serviceStatus = getPresenceServiceStatus(user);
                      const style = statusStyle(serviceStatus);
                      const status = statusLine(user);
                      const tooltip = buildPresenceTooltip(user);
                      return (
                        <div
                          key={user.userId}
                          className="group relative flex flex-col items-center w-[76px]"
                        >
                          <div className="relative">
                            <div
                              className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center shadow-md border-2 bg-white ${style.border}`}
                            >
                              <img
                                src={PRESENCE_USER_AVATAR_SRC}
                                alt=""
                                aria-hidden
                                className="w-10 h-10 object-contain select-none pointer-events-none"
                                draggable={false}
                              />
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${style.dot}`}
                            />
                          </div>
                          <p className="mt-1.5 text-[10px] font-bold text-gray-800 text-center leading-tight line-clamp-2 w-full">
                            {displayName.split(' ')[0]}
                          </p>
                          <p
                            className={`text-[8px] font-black uppercase truncate w-full text-center ${style.text}`}
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
