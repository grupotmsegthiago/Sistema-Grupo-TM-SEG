import React, { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import TimeClockModal from './TimeClockModal';
import ShiftWaitScreen from './ShiftWaitScreen';
import { enrichUserWithCltData } from '../lib/timeclock/cltEmployee';
import {
  needsEntryPunchToday,
  requiresTimeclockUser,
} from '../lib/timeclock/eligibility';
import { canPunchEntryNow } from '../lib/timeclock/shiftRules';
import { fetchTodayTimeClockEntries } from '../lib/timeclock/registerPunch';
import { buildPresenceHeartbeatFromUser } from '../lib/timeclock/presence';
import { upsertUserPresenceDb } from '../lib/userPresenceDb';
import { requestPresenceRefresh } from '../lib/presenceChannel';
import type { TimeClockUserContext } from '../lib/timeclock/types';

interface Props {
  onLogout: () => void;
  onCleared: () => void;
  children: React.ReactNode;
}

/**
 * Bloqueia o sistema até o operador bater a entrada (IN) do dia.
 * Diretoria e perfis sem obrigatoriedade de ponto passam direto.
 */
const TimeClockGate: React.FC<Props> = ({ onLogout, onCleared, children }) => {
  const [loading, setLoading] = useState(true);
  const [mustPunch, setMustPunch] = useState(false);
  const [shiftBlocked, setShiftBlocked] = useState(false);
  const [user, setUser] = useState<TimeClockUserContext | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // `initial` = primeira avaliação (mostra o "loading" que oculta a tela).
  // As reavaliações periódicas rodam em segundo plano SEM mexer em `loading`,
  // caso contrário o gate renderiza `null` e desmonta/remonta toda a árvore
  // (a tela "pisca" e componentes como o alerta "OS sem Tabela" reabrem a
  // cada ciclo). Só atualizamos mustPunch/shiftBlocked se algo mudar.
  const evaluate = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    let rawUser: TimeClockUserContext | null = null;
    try {
      const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
      if (!raw?.id) {
        setMustPunch(false);
        return;
      }
      rawUser = raw;
      const enriched = await enrichUserWithCltData(raw);
      localStorage.setItem('userData', JSON.stringify(enriched));
      setUser(enriched);
      rawUser = enriched;

      if (!requiresTimeclockUser(enriched)) {
        setMustPunch(false);
        setShiftBlocked(false);
        return;
      }

      const entries = await fetchTodayTimeClockEntries(enriched.id);

      if (requiresTimeclockUser(enriched)) {
        void upsertUserPresenceDb(buildPresenceHeartbeatFromUser(enriched, entries));
        requestPresenceRefresh();
      }

      if (!needsEntryPunchToday(entries)) {
        setMustPunch(false);
        setShiftBlocked(false);
        onCleared();
        return;
      }

      const window = canPunchEntryNow(enriched.shiftType);
      setShiftBlocked(!window.allowed);
      setMustPunch(true);
      setModalOpen((prev) => prev || window.allowed);
    } catch (e) {
      console.warn('[TimeClockGate] evaluate falhou:', e);
      // Fail-closed: operadores/CLT não entram sem confirmação de ponto.
      if (rawUser && requiresTimeclockUser(rawUser)) {
        void upsertUserPresenceDb(buildPresenceHeartbeatFromUser(rawUser));
        requestPresenceRefresh();
        setMustPunch(true);
        setShiftBlocked(false);
        setModalOpen(true);
      } else {
        setMustPunch(false);
      }
    } finally {
      if (initial) setLoading(false);
    }
  }, [onCleared]);

  useEffect(() => {
    void evaluate(true);
    const timer = setInterval(() => void evaluate(false), 30_000);
    return () => clearInterval(timer);
  }, [evaluate]);

  const handleRegistered = () => {
    setModalOpen(false);
    setMustPunch(false);
    onCleared();
  };

  if (loading) return null;

  if (!mustPunch) return <>{children}</>;

  return (
    <>
      {shiftBlocked && <ShiftWaitScreen shiftType={user?.shiftType} />}
      {!shiftBlocked && !modalOpen && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/90 p-4">
          <div className="max-w-lg w-full rounded-2xl border border-blue-500/30 bg-slate-900 p-6 text-center">
            <h2 className="text-lg font-black text-white uppercase mb-2">Bata seu ponto para iniciar</h2>
            <p className="text-sm text-slate-300 mb-6">
              O registro de entrada é obrigatório antes de utilizar o sistema.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black uppercase text-white hover:bg-blue-500"
              data-testid="button-gate-bater-ponto"
            >
              Bater ponto agora
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="mt-3 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"
            >
              <LogOut size={14} /> Sair do sistema
            </button>
          </div>
        </div>
      )}
      <TimeClockModal
        open={modalOpen && !shiftBlocked}
        forced
        onClose={() => {}}
        onRegistered={handleRegistered}
      />
    </>
  );
};

export default TimeClockGate;
