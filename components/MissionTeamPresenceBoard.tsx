import React, { useMemo } from 'react';
import { Users, Briefcase, Circle, Coffee, LogOut, Clock, BadgeCheck } from 'lucide-react';
import { useOnlinePresence } from '../lib/useOnlinePresence';
import { getInitials, type PresenceUserState } from '../lib/timeclock/presence';

interface Props {
  enabled?: boolean;
}

type Bucket = 'em_servico' | 'em_almoco' | 'fora' | 'aguardando' | 'pj' | 'outros';

interface AvatarStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

function bucketOf(user: PresenceUserState): Bucket {
  const label = (user.onDutyLabel || '').toLowerCase();
  if (user.isClt) {
    if (user.onDuty) {
      if (label.includes('almoço') || label.includes('almoco')) return 'em_almoco';
      return 'em_servico';
    }
    if (label.includes('aguardando')) return 'aguardando';
    return 'fora';
  }
  const ct = (user.contractType || '').toUpperCase();
  if (ct && ct !== 'CLT') return 'pj';
  return 'outros';
}

function bucketLabel(b: Bucket): string {
  switch (b) {
    case 'em_servico':
      return 'CLT em serviço';
    case 'em_almoco':
      return 'CLT em almoço';
    case 'fora':
      return 'CLT fora do expediente';
    case 'aguardando':
      return 'CLT aguardando ponto';
    case 'pj':
      return 'PJ / Prestadores';
    default:
      return 'Administrativo';
  }
}

function bucketOrder(b: Bucket): number {
  return {
    em_servico: 0,
    em_almoco: 1,
    aguardando: 2,
    pj: 3,
    outros: 4,
    fora: 5,
  }[b];
}

function statusLine(user: PresenceUserState): string {
  if (user.isClt) return user.onDutyLabel || 'Online';
  const ct = (user.contractType || '').toUpperCase();
  if (ct && ct !== 'CLT') return ct;
  return 'Online';
}

function statusIcon(b: Bucket) {
  switch (b) {
    case 'em_servico':
      return <Briefcase size={9} />;
    case 'em_almoco':
      return <Coffee size={9} />;
    case 'fora':
      return <LogOut size={9} />;
    case 'aguardando':
      return <Clock size={9} />;
    case 'pj':
      return <BadgeCheck size={9} />;
    default:
      return <Circle size={8} className="fill-green-500 text-green-500" />;
  }
}

function avatarStyle(b: Bucket): AvatarStyle {
  switch (b) {
    case 'em_servico':
      return {
        bg: 'bg-blue-600',
        text: 'text-white',
        border: 'border-blue-300',
        dot: 'bg-blue-500',
      };
    case 'em_almoco':
      return {
        bg: 'bg-amber-500',
        text: 'text-white',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'fora':
      return {
        bg: 'bg-slate-200',
        text: 'text-slate-600',
        border: 'border-slate-300',
        dot: 'bg-slate-400',
      };
    case 'aguardando':
      return {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        border: 'border-yellow-300',
        dot: 'bg-yellow-500',
      };
    case 'pj':
      return {
        bg: 'bg-purple-100',
        text: 'text-purple-800',
        border: 'border-purple-300',
        dot: 'bg-purple-500',
      };
    default:
      return {
        bg: 'bg-indigo-50',
        text: 'text-indigo-800',
        border: 'border-indigo-200',
        dot: 'bg-green-500',
      };
  }
}

const MissionTeamPresenceBoard: React.FC<Props> = ({ enabled = true }) => {
  const { onlineUsers, onlineCount, onDutyClt } = useOnlinePresence(enabled);

  const grouped = useMemo(() => {
    const groups: Partial<Record<Bucket, PresenceUserState[]>> = {};
    for (const u of onlineUsers) {
      const b = bucketOf(u);
      (groups[b] = groups[b] || []).push(u);
    }
    // ordena os arrays alfabeticamente
    for (const key of Object.keys(groups) as Bucket[]) {
      groups[key]!.sort((a, b) =>
        (a.name || 'Usuário').localeCompare(b.name || 'Usuário', 'pt-BR')
      );
    }
    return groups;
  }, [onlineUsers]);

  const bucketsOrdered = useMemo(() => {
    return (Object.keys(grouped) as Bucket[]).sort((a, b) => bucketOrder(a) - bucketOrder(b));
  }, [grouped]);

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
        <div className="flex items-center gap-3 text-[10px] font-black uppercase">
          <span className="inline-flex items-center gap-1 text-green-700">
            <Circle size={8} className="fill-green-500 text-green-500" />
            {onlineCount} online
          </span>
          <span className="inline-flex items-center gap-1 text-blue-700">
            <Briefcase size={10} />
            {onDutyClt.length} em serviço
          </span>
        </div>
      </div>

      {bucketsOrdered.length === 0 ? (
        <p className="text-xs text-gray-500 font-medium">Nenhum usuário online no momento.</p>
      ) : (
        <div className="space-y-3">
          {bucketsOrdered.map((b) => (
            <div key={b}>
              <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-wide text-gray-500">
                {statusIcon(b)}
                <span>
                  {bucketLabel(b)} · {grouped[b]!.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {grouped[b]!.map((user) => {
                  const displayName = user.name || 'Usuário';
                  const style = avatarStyle(b);
                  const status = statusLine(user);
                  return (
                    <div
                      key={user.userId}
                      className="flex flex-col items-center w-[76px]"
                      title={`${displayName} — ${user.role || 'Online'}${
                        user.contractType ? ` — ${user.contractType}` : ''
                      } — ${status}`}
                    >
                      <div className="relative">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-md border-2 ${style.bg} ${style.text} ${style.border}`}
                        >
                          {getInitials(displayName)}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${style.dot}`}
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] font-bold text-gray-800 text-center leading-tight line-clamp-2 w-full">
                        {displayName.split(' ')[0]}
                      </p>
                      <p className="text-[8px] font-black uppercase text-gray-400 truncate w-full text-center">
                        {status}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MissionTeamPresenceBoard;
