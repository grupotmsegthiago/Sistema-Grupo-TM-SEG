import React, { useState } from 'react';
import { Clock, Fingerprint } from 'lucide-react';
import TimeClockModal from './TimeClockModal';
import { formatNowTimeBR } from '../lib/dateUtils';
import { useTimeClockButton } from '../lib/services/useTimeClockButton';

/** Barra fixa inferior (legado) — preferir TimeClockHeaderButton no header. */
const CltTimeClockBar: React.FC = () => {
  const { ready, label, refresh } = useTimeClockButton();
  const [open, setOpen] = useState(false);

  if (!ready) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-[90] px-3 pb-3 pt-2 pointer-events-none lg:pl-24">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700 active:scale-[0.99] transition-transform"
            data-testid="button-bater-ponto-missao"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-red-700 shrink-0">
                <Fingerprint size={18} />
              </div>
              <div className="text-left min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-300">Bater ponto</p>
                <p className="text-sm font-black uppercase truncate">{label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[10px] font-bold uppercase text-slate-300">
              <Clock size={14} />
              {formatNowTimeBR()}
            </div>
          </button>
        </div>
      </div>

      <TimeClockModal
        open={open}
        onClose={() => setOpen(false)}
        onRegistered={() => void refresh()}
      />
    </>
  );
};

export default CltTimeClockBar;
