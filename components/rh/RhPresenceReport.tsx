import React, { useMemo } from 'react';
import { Activity, Users } from 'lucide-react';
import { useOnlinePresence } from '../../lib/useOnlinePresence';
import { PRESENCE_USER_AVATAR_SRC } from '../../lib/timeclock/presence';

/** Relatório RH: presença operacional em tempo real com atividade do sistema. */
const RhPresenceReport: React.FC = () => {
  const { onlineUsers, onlineCount } = useOnlinePresence(true);

  const sorted = useMemo(() => {
    return [...onlineUsers].sort((a, b) => {
      const aOn = a.onDuty ? 0 : 1;
      const bOn = b.onDuty ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });
  }, [onlineUsers]);

  const lineFor = (u: (typeof onlineUsers)[0]) => {
    const parts: string[] = [u.onDutyLabel || 'Online'];
    if (u.onDuty && u.minutesOnDuty != null && u.minutesOnDuty > 0) {
      parts.push(`${u.minutesOnDuty} minutos`);
    }
    if (u.activityStatus === 'idle' && u.idleMinutes && u.idleMinutes > 0) {
      return `${u.name} — ${u.onDutyLabel} — Sem utilização no sistema há ${u.idleMinutes} minutos`;
    }
    if (u.activityStatus === 'idle') {
      return `${u.name} — ${u.onDutyLabel} — Inativa (sem uso recente)`;
    }
    return `${u.name} — ${parts.join(' — ')}`;
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
          <Activity size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase text-gray-900">Presença operacional</h3>
          <p className="text-xs text-gray-500">{onlineCount} conectado(s) agora — dados de atividade reais</p>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">Nenhum usuário online no momento.</p>
        )}
        {sorted.map((u) => (
          <div
            key={u.userId}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              u.onDuty ? 'border-blue-200 bg-blue-50/80' : 'border-gray-100 bg-gray-50/50'
            }`}
          >
            <img src={PRESENCE_USER_AVATAR_SRC} alt="" className="h-8 w-8 rounded-full border border-white shadow-sm" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-gray-900 truncate">{u.name}</p>
              <p className="text-[11px] text-gray-600 truncate">{lineFor(u).replace(`${u.name} — `, '')}</p>
            </div>
            {u.onDuty && (
              <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                Em serviço
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-center gap-1 text-[10px] text-gray-400">
        <Users size={12} /> Inatividade = mais de 10 minutos sem navegar ou interagir no sistema.
      </p>
    </div>
  );
};

export default RhPresenceReport;
