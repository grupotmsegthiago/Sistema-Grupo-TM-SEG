import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Keyboard, MousePointerClick, ShieldAlert } from 'lucide-react';
import { readInteractionStats } from '../lib/productivity/interactionCounters';
import { flushInteractionStats } from '../lib/productivity/interactionStats';
import { logProductivityEvent } from '../lib/productivity/logProductivity';
import {
  isNightWatchExemptRole,
  isNightWatchWindow,
  keywordMatches,
  NIGHT_IDLE_MINUTES,
  NIGHT_IDLE_MS,
  pickNightWatchKeyword,
} from '../lib/productivity/nightWatch';
import {
  forceTouchUserActivity,
  getIdleMs,
  setActivityTrackingPaused,
} from '../lib/userActivityTracker';

type LocalUser = { id?: string | number; name?: string; role?: string };

function readUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem('userData');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Vigia de presença noturna (20h–08h BRT).
 * Se o usuário ficar sem interação por 15 min, bloqueia a tela até
 * confirmar com clique + digitação da palavra-chave + OK.
 */
export default function IdlePresenceGuard() {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [typed, setTyped] = useState('');
  const [clickedHere, setClickedHere] = useState(false);
  const [error, setError] = useState('');
  const [idleMinutesShown, setIdleMinutesShown] = useState(NIGHT_IDLE_MINUTES);
  const shownLoggedRef = useRef(false);
  const challengeStartedAt = useRef<string | null>(null);

  const resetChallengeForm = useCallback(() => {
    setTyped('');
    setClickedHere(false);
    setError('');
    setKeyword(pickNightWatchKeyword());
  }, []);

  const openChallenge = useCallback((idleMs: number) => {
    const mins = Math.max(NIGHT_IDLE_MINUTES, Math.floor(idleMs / 60_000));
    setIdleMinutesShown(mins);
    resetChallengeForm();
    setOpen(true);
    setActivityTrackingPaused(true);
    challengeStartedAt.current = new Date().toISOString();
    if (!shownLoggedRef.current) {
      shownLoggedRef.current = true;
      const stats = readInteractionStats();
      void logProductivityEvent('IDLE_CHALLENGE_SHOWN', {
        idleMinutes: mins,
        keywordHint: true,
        interactionsToday: stats.interactions,
        clicksToday: stats.clicks,
      });
    }
  }, [resetChallengeForm]);

  const closeChallenge = useCallback(() => {
    setOpen(false);
    setActivityTrackingPaused(false);
    shownLoggedRef.current = false;
    challengeStartedAt.current = null;
    forceTouchUserActivity();
  }, []);

  // Poll: dentro da janela noturna, idle >= 15 min → bloqueia
  useEffect(() => {
    const tick = () => {
      const user = readUser();
      if (!user?.id) return;
      if (isNightWatchExemptRole(user.role)) return;
      if (!isNightWatchWindow()) {
        if (open) {
          // Fora da janela: libera sem exigir (fim do plantão 08h)
          closeChallenge();
        }
        return;
      }
      if (open) return;
      const idleMs = getIdleMs();
      if (idleMs >= NIGHT_IDLE_MS) {
        openChallenge(idleMs);
      }
    };

    tick();
    const id = window.setInterval(tick, 15_000);
    const onActivity = () => {
      // se já bloqueado, ignora
    };
    window.addEventListener('tmseg:activity', onActivity);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('tmseg:activity', onActivity);
    };
  }, [open, openChallenge, closeChallenge]);

  // Timeout do desafio (10 min sem responder) → log
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      void logProductivityEvent('IDLE_CHALLENGE_TIMEOUT', {
        startedAt: challengeStartedAt.current,
        idleMinutes: idleMinutesShown,
      });
    }, 10 * 60 * 1000);
    return () => window.clearTimeout(id);
  }, [open, idleMinutesShown]);

  const handleConfirm = async () => {
    setError('');
    if (!clickedHere) {
      setError('Clique em “Estou aqui” antes de continuar.');
      return;
    }
    if (!keywordMatches(keyword, typed)) {
      setError('Palavra-chave incorreta. Digite exatamente a palavra exibida.');
      void logProductivityEvent('IDLE_CHALLENGE_FAILED', {
        reason: 'keyword_mismatch',
        startedAt: challengeStartedAt.current,
      });
      return;
    }

    const stats = readInteractionStats();
    await logProductivityEvent('IDLE_CHALLENGE_PASSED', {
      startedAt: challengeStartedAt.current,
      idleMinutes: idleMinutesShown,
      interactionsToday: stats.interactions,
      clicksToday: stats.clicks,
    });
    await flushInteractionStats('challenge_passed');
    closeChallenge();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md"
      data-testid="idle-presence-guard"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-presence-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-white shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-orange-700 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <ShieldAlert className="shrink-0" size={28} />
            <div>
              <h2 id="idle-presence-title" className="text-lg font-black uppercase tracking-tight">
                Confirme que você está aí
              </h2>
              <p className="text-xs text-amber-100 font-medium">
                Vigia noturna 20h–08h · sem interação há ~{idleMinutesShown} min
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-950">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
            <p>
              O sistema detectou inatividade no horário de plantão. Para continuar usando,
              confirme presença: clique, digite a palavra-chave e confirme com OK.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setClickedHere(true);
              setError('');
            }}
            className={`w-full flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all ${
              clickedHere
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-amber-500 hover:bg-amber-50'
            }`}
            data-testid="idle-presence-click-here"
          >
            {clickedHere ? <CheckCircle2 size={18} /> : <MousePointerClick size={18} />}
            {clickedHere ? 'Presença registrada — continue abaixo' : '1. Clique: Estou aqui'}
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <Keyboard size={14} /> 2. Digite a palavra-chave
            </p>
            <p
              className="text-center text-2xl font-black tracking-[0.25em] text-slate-900 mb-3 select-all"
              data-testid="idle-presence-keyword"
            >
              {keyword}
            </p>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Digite a palavra acima"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-base font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="idle-presence-keyword-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConfirm();
              }}
            />
          </div>

          {error && (
            <p className="text-sm font-semibold text-red-600" data-testid="idle-presence-error">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleConfirm()}
            className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-wide py-3.5 text-sm transition-colors"
            data-testid="idle-presence-ok"
          >
            3. OK — Liberar sistema
          </button>

          <p className="text-[10px] text-center text-slate-400 uppercase tracking-wide">
            Home office · registro enviado à diretoria no relatório das 09h
          </p>
        </div>
      </div>
    </div>
  );
}
