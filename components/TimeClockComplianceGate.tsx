import { useEffect, useState, useCallback } from 'react';
import { Loader2, Clock } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import TimeClockSystem from './TimeClockSystem';
import type { TimeClockGateMode, TimeClockStage } from '../lib/timeclockGate';

interface GateStatus {
  required: boolean;
  requires_clock: boolean;
  mode: TimeClockGateMode;
  currentStage: TimeClockStage;
  message: string;
  title: string;
  dayComplete: boolean;
}

interface Props {
  userId: string;
  userName: string;
  onComplete: () => void;
}

export default function TimeClockComplianceGate({ userId, userName, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const resp = await authFetch('/api/timeclock/my/status');
      const data = await resp.json();
      if (resp.ok) {
        setStatus(data);
        if (!data.required || data.mode === 'skip' || data.dayComplete) {
          onComplete();
          setDismissed(true);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [onComplete]);

  useEffect(() => {
    refresh();
  }, [userId, refresh]);

  const handlePunchDone = () => {
    setLoading(true);
    refresh();
  };

  const handleContinue = () => {
    setDismissed(true);
    onComplete();
  };

  if (dismissed) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9996] bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (!status?.required || status.mode === 'skip') return null;

  if (status.mode === 'can_continue') {
    return (
      <div className="fixed inset-0 z-[9996] bg-slate-950/95 flex items-center justify-center p-4" data-testid="timeclock-continue-gate">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
          <div className="px-5 py-4 bg-slate-900 text-white flex items-center gap-3">
            <Clock size={22} />
            <div>
              <h1 className="text-sm font-black uppercase">{status.title}</h1>
              <p className="text-[10px] text-slate-300">Olá, {userName.split(' ')[0]}</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700">{status.message}</p>
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Seu ponto de hoje já está em dia para este momento. Você pode continuar trabalhando normalmente.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              className="w-full py-3.5 bg-emerald-700 text-white text-xs font-black uppercase rounded-xl hover:bg-emerald-800 transition-colors"
              data-testid="button-continue-shift"
            >
              Continuar turno
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9996] bg-slate-950/95 overflow-y-auto" data-testid="timeclock-punch-gate">
      <div className="min-h-full flex flex-col">
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10 border-b border-slate-700">
          <Clock size={20} />
          <div>
            <h1 className="text-sm font-black uppercase">{status.title}</h1>
            <p className="text-[10px] text-slate-300">{status.message}</p>
          </div>
        </div>
        <div className="flex-1 p-2">
          <TimeClockSystem
            gateMode
            forcedStage={status.currentStage}
            gateTitle={status.title}
            onPunchComplete={handlePunchDone}
          />
        </div>
      </div>
    </div>
  );
}
