import React from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { canPunchEntryNow } from '../lib/timeclock/shiftRules';
import { formatNowTimeBR } from '../lib/dateUtils';

interface Props {
  shiftType?: string | null;
}

/** Bloqueia batida de entrada antes do horário do turno. */
const ShiftWaitScreen: React.FC<Props> = ({ shiftType }) => {
  const check = canPunchEntryNow(shiftType);
  const turno = check.shiftType === 'noturno' ? 'Noturno' : 'Diurno';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 p-6">
      <div className="max-w-md w-full rounded-2xl border border-amber-500/40 bg-slate-900 p-8 text-center shadow-2xl">
        <Clock className="mx-auto h-12 w-12 text-amber-400 mb-4" />
        <h2 className="text-xl font-black text-white uppercase tracking-wide mb-2">Aguarde o horário do turno</h2>
        <p className="text-sm text-slate-300 mb-4">
          Turno <strong>{turno}</strong>: a batida de entrada libera às <strong>{check.waitUntilLabel}</strong>.
        </p>
        <p className="text-xs text-slate-500">Horário atual: {formatNowTimeBR()}</p>
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-amber-300">
          <Loader2 className="h-4 w-4 animate-spin" /> O sistema liberará automaticamente após o horário.
        </div>
      </div>
    </div>
  );
};

export default ShiftWaitScreen;
