import React, { useMemo } from 'react';
import { Users, Briefcase, Circle } from 'lucide-react';
import { useOnlinePresence } from '../lib/useOnlinePresence';
import { getInitials } from '../lib/timeclock/presence';

interface Props {
  enabled?: boolean;
}

const MissionTeamPresenceBoard: React.FC<Props> = ({ enabled = true }) => {
  const { onlineUsers, onlineCount, onDutyClt } = useOnlinePresence(enabled);

  const sorted = useMemo(() => {
    return [...onlineUsers].sort((a, b) => {
      if (a.onDuty !== b.onDuty) return a.onDuty ? -1 : 1;
      if (a.isClt !== b.isClt) return a.isClt ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [onlineUsers]);

  if (!enabled) return null;

  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4"
      data-testid="mission-team-presence-board"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-indigo-600" />
          <h3 className="text-xs font-black uppercase tracking-wide text-gray-800">Equipe no sistema</h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-black uppercase">
          <span className="inline-flex items-center gap-1 text-green-700">
            <Circle size={8} className="fill-green-500 text-green-500" />
            {onlineCount} online
          </span>
          <span className="inline-flex items-center gap-1 text-blue-700">
            <Briefcase size={10} />
            {onDutyClt.length} CLT em serviço
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-gray-500 font-medium">Nenhum usuário online no momento.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {sorted.map((user) => {
            const onDuty = user.isClt && user.onDuty;
            return (
              <div
                key={user.userId}
                className="flex flex-col items-center w-[72px]"
                title={`${user.name} — ${user.role}${user.isClt ? ` — ${user.onDutyLabel}` : ''}`}
              >
                <div className="relative">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-md border-2 ${
                      onDuty
                        ? 'bg-blue-600 text-white border-blue-300'
                        : user.isClt
                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                    }`}
                  >
                    {getInitials(user.name)}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                      onDuty ? 'bg-blue-500' : 'bg-green-500'
                    }`}
                  />
                </div>
                <p className="mt-1.5 text-[9px] font-bold text-gray-800 text-center leading-tight line-clamp-2 w-full">
                  {user.name.split(' ')[0]}
                </p>
                <p className="text-[8px] font-black uppercase text-gray-400 truncate w-full text-center">
                  {onDuty ? 'Em serviço' : user.isClt ? 'CLT' : 'Online'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MissionTeamPresenceBoard;
