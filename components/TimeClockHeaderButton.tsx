import React, { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import TimeClockModal from './TimeClockModal';
import { useTimeClockButton } from '../lib/services/useTimeClockButton';

/**
 * Botão compacto de ponto no header — visível para CLT/operadores que exigem registro.
 * Diretoria e perfis isentos não veem o botão (regra de negócio existente).
 */
const TimeClockHeaderButton: React.FC = () => {
  const { ready, label, refresh } = useTimeClockButton();
  const [open, setOpen] = useState(false);

  if (!ready) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900 text-white border border-slate-700 shadow-md hover:bg-slate-800 active:scale-[0.98] transition-all"
        data-testid="button-bater-ponto-header"
        title={`Bater ponto — ${label}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-700 shrink-0">
          <Fingerprint size={16} />
        </span>
        <span className="text-left min-w-0">
          <span className="block text-[9px] font-black uppercase tracking-wide text-slate-300 leading-none">
            Bater ponto
          </span>
          <span className="block text-xs font-black uppercase truncate max-w-[140px] lg:max-w-[200px]">
            {label}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white border border-slate-700 shadow-md"
        data-testid="button-bater-ponto-header-mobile"
        aria-label={`Bater ponto — ${label}`}
      >
        <Fingerprint size={18} className="text-red-400" />
      </button>

      <TimeClockModal
        open={open}
        onClose={() => setOpen(false)}
        onRegistered={() => void refresh()}
      />
    </>
  );
};

export default TimeClockHeaderButton;
