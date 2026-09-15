import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, EyeOff, Loader2, MapPin, Radio, ShieldCheck, Smartphone,
} from 'lucide-react';
import tmsegLogo from '../attached_assets/tmseg_logo_transparent.png';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { startLiveTrackKeepalive, type LiveTrackKeepalive } from '../lib/liveTrack/backgroundKeepalive';

type Phase = 'loading' | 'consent' | 'sharing' | 'ended' | 'error';

const GEO_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
};

function tokenFromUrl(): string {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function vis(): 'visible' | 'hidden' {
  return document.visibilityState === 'visible' ? 'visible' : 'hidden';
}

export default function PublicLiveTrack() {
  const token = tokenFromUrl();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [lgpdSummary, setLgpdSummary] = useState('');
  const [lgpdFull, setLgpdFull] = useState('');
  const [osNumber, setOsNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [showFullLgpd, setShowFullLgpd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [hiddenWarn, setHiddenWarn] = useState(false);
  const [wakeOk, setWakeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [minimized, setMinimized] = useState(false);
  const [bgOk, setBgOk] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const wakeRef = useRef<any>(null);
  const lastSentRef = useRef(0);
  const lastPosRef = useRef<GeolocationPosition | null>(null);
  const endedRef = useRef(false);
  const keepaliveRef = useRef<LiveTrackKeepalive | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const stopKeepalive = useCallback(() => {
    try { keepaliveRef.current?.stop(); } catch { /* ignore */ }
    keepaliveRef.current = null;
    setBgOk(false);
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    try { wakeRef.current?.release?.(); } catch { /* ignore */ }
    wakeRef.current = null;
    stopKeepalive();
  }, [stopKeepalive]);

  const requestWake = useCallback(async () => {
    try {
      const lock = await (navigator as any).wakeLock?.request?.('screen');
      if (!lock) {
        setWakeOk(false);
        return;
      }
      wakeRef.current = lock;
      setWakeOk(true);
      lock.addEventListener?.('release', () => setWakeOk(false));
    } catch {
      setWakeOk(false);
    }
  }, []);

  const sendPing = useCallback(async (pos: GeolocationPosition, visibility: 'visible' | 'hidden') => {
    if (endedRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1800) return;
    lastSentRef.current = now;
    lastPosRef.current = pos;
    const coords = pos.coords;
    const batt = (navigator as any).getBattery ? await (navigator as any).getBattery().catch(() => null) : null;
    const tok = tokenRef.current;
    const payload = {
      token: tok,
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      heading: coords.heading,
      battery: batt ? Math.round(batt.level * 100) : undefined,
      visibility,
      background: visibility === 'hidden',
    };
    try {
      const r = await fetch(`/api/live-track?op=public-ping&token=${encodeURIComponent(tok)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        keepalive: true,
        body: JSON.stringify(payload),
      });
      const j = await parseJsonResponse(r);
      if (j?.ended || r.status === 410) {
        endedRef.current = true;
        stopWatch();
        setPhase('ended');
        setMinimized(false);
        return;
      }
      if (!r.ok) {
        setError(j?.error || 'Falha ao enviar localização');
        return;
      }
      setAccuracy(typeof coords.accuracy === 'number' ? coords.accuracy : null);
      setLastPingAt(Date.now());
      setError('');
    } catch {
      setError('Sem conexão — tentando de novo automaticamente');
    }
  }, [stopWatch]);

  const pollOnce = useCallback(() => {
    if (endedRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { void sendPing(pos, vis()); },
      () => {
        const last = lastPosRef.current;
        if (last) void sendPing(last, vis());
      },
      GEO_OPTS,
    );
  }, [sendPing]);

  const startGps = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Este aparelho não oferece GPS no navegador. Abra o link no Chrome ou Safari do celular.');
      setPhase('error');
      return;
    }
    await requestWake();
    try {
      keepaliveRef.current = await startLiveTrackKeepalive();
      setBgOk(true);
    } catch {
      setBgOk(false);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPhase('sharing');
        void sendPing(pos, vis());
        watchIdRef.current = navigator.geolocation.watchPosition(
          (next) => { void sendPing(next, vis()); },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              setError('Permissão de localização negada. Ative o GPS de alta precisão e recarregue esta página.');
            } else {
              pollOnce();
            }
          },
          GEO_OPTS,
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Permissão de localização negada. No celular: Configurações → este navegador → Localização → Permitir.');
        } else {
          setError('Não foi possível obter GPS. Ative a localização de alta precisão e tente de novo.');
        }
        setPhase('consent');
        stopKeepalive();
      },
      GEO_OPTS,
    );
  }, [pollOnce, requestWake, sendPing, stopKeepalive]);

  useEffect(() => {
    if (!token) {
      setError('Link incompleto. Peça um novo link ao operacional TM SEG.');
      setPhase('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/live-track?op=public-get&token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const j = await parseJsonResponse(r);
        if (cancelled) return;
        if (!r.ok) {
          setError(j?.error || 'Link inválido');
          setPhase('error');
          return;
        }
        setLgpdSummary(j.lgpdSummary || '');
        setLgpdFull(j.lgpdFull || '');
        setOsNumber(j.mission?.osNumber || '');
        setOrigin(j.mission?.origin || '');
        setDestination(j.mission?.destination || '');
        if (j.ended || j.status === 'ended') {
          setPhase('ended');
          return;
        }
        setPhase('consent');
      } catch {
        if (!cancelled) {
          setError('Falha ao abrir o acompanhamento. Verifique a internet e tente de novo.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (phase !== 'sharing') return;
    const clock = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'sharing') return;
    const onVis = () => {
      const hidden = document.visibilityState !== 'visible';
      setHiddenWarn(hidden);
      if (!hidden) void requestWake();
      pollOnce();
    };
    const onFreeze = () => { pollOnce(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onVis);
    window.addEventListener('freeze', onFreeze);
    window.addEventListener('resume', onVis as EventListener);
    const tick = window.setInterval(() => { pollOnce(); }, 2500);
    const onHide = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Se fechar esta página o rastreio GPS para. Ocultar ou ir ao WhatsApp mantém o segundo plano.';
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) {
        pollOnce();
        return;
      }
      const pos = lastPosRef.current;
      const tok = tokenRef.current;
      if (!pos || !tok || endedRef.current) return;
      try {
        const body = JSON.stringify({
          token: tok,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          visibility: 'hidden',
          background: true,
        });
        navigator.sendBeacon(
          `/api/live-track?op=public-ping&token=${encodeURIComponent(tok)}`,
          new Blob([body], { type: 'application/json' }),
        );
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onVis);
      window.removeEventListener('freeze', onFreeze);
      window.removeEventListener('resume', onVis as EventListener);
      window.clearInterval(tick);
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [phase, pollOnce, requestWake]);

  useEffect(() => () => stopWatch(), [stopWatch]);

  const onShare = async () => {
    if (!accepted) {
      setError('Marque o aceite LGPD para continuar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/live-track?op=public-consent&token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accepted: true }),
      });
      const j = await parseJsonResponse(r);
      if (!r.ok) {
        setError(j?.error || 'Não foi possível registrar o aceite');
        setBusy(false);
        return;
      }
      await startGps();
    } catch {
      setError('Falha de rede ao confirmar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'sharing' && minimized) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-white flex items-end justify-center p-3">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          data-testid="live-track-expand"
          className="w-full max-w-lg rounded-2xl bg-emerald-500 text-slate-950 px-4 py-3 shadow-2xl flex items-center gap-3"
        >
          <span className="w-3 h-3 rounded-full bg-slate-950 animate-pulse shrink-0" />
          <span className="text-left flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest">Segundo plano ativo</span>
            <span className="block text-sm font-bold">TM SEG rastreando{osNumber ? ` · OS ${osNumber}` : ''}</span>
          </span>
          <span className="text-[10px] font-black uppercase">Abrir</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col">
      <header className="px-5 pt-8 pb-4 flex items-center gap-3 border-b border-white/10">
        <img src={tmsegLogo} alt="TM SEG" className="h-10 w-auto" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Grupo TM SEG</p>
          <p className="text-sm font-bold">Acompanhamento em tempo real</p>
        </div>
      </header>

      <main className="flex-1 px-5 py-6 max-w-lg mx-auto w-full">
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-300">
            <Loader2 className="animate-spin" size={36} />
            <p className="text-xs font-black uppercase tracking-widest">Abrindo missão…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-5 space-y-3">
            <AlertTriangle className="text-red-400" />
            <p className="font-bold">Não foi possível iniciar o rastreio</p>
            <p className="text-sm text-red-100/80">{error}</p>
          </div>
        )}

        {phase === 'ended' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-5 space-y-3 text-center">
            <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
            <p className="font-black uppercase tracking-wide">Missão encerrada</p>
            <p className="text-sm text-emerald-100/80">O acompanhamento GPS desta OS foi finalizado. Você já pode fechar esta tela.</p>
            {osNumber ? <p className="text-xs font-mono text-emerald-200">OS {osNumber}</p> : null}
          </div>
        )}

        {phase === 'consent' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-red-600 p-5 shadow-xl shadow-red-900/40">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Você está em acompanhamento</p>
              <h1 className="text-2xl font-black leading-tight mt-1">A Central TM SEG está acompanhando esta missão</h1>
              {osNumber ? <p className="mt-3 font-mono text-sm bg-black/20 inline-block px-2 py-1 rounded">OS {osNumber}</p> : null}
            </div>
            {(origin || destination) && (
              <p className="text-xs text-slate-300 leading-relaxed">
                {origin ? <>Origem: {origin}<br /></> : null}
                {destination ? <>Destino: {destination}</> : null}
              </p>
            )}
            <p className="text-sm text-slate-200 leading-relaxed">{lgpdSummary}</p>
            <label className="flex items-start gap-3 text-sm bg-white/5 rounded-xl p-4 border border-white/10">
              <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="live-track-lgpd-check" />
              <span>Li e autorizo o tratamento da minha localização em tempo real, inclusive em segundo plano (tela oculta), até o fim da missão.</span>
            </label>
            <button
              type="button"
              onClick={() => setShowFullLgpd((v) => !v)}
              className="text-[11px] uppercase font-black tracking-widest text-slate-400"
            >
              {showFullLgpd ? 'Ocultar texto LGPD' : 'Ver garantias LGPD completas'}
            </button>
            {showFullLgpd && (
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300 bg-black/40 rounded-xl p-4 border border-white/10">{lgpdFull}</pre>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={onShare}
              data-testid="live-track-share-btn"
              className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wide text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Radio size={18} />}
              Compartilhar localização em tempo real
            </button>
            <p className="text-[11px] text-slate-400 text-center">Na permissão de GPS escolha Permitir. Depois use Ocultar para ir ao WhatsApp — o rastreio segue até você fechar esta página.</p>
          </div>
        )}

        {phase === 'sharing' && (
          <div className="space-y-5">
            {hiddenWarn && (
              <div className="rounded-2xl bg-emerald-400 text-slate-950 p-4 font-bold text-sm">
                Segundo plano ativo. Pode usar o WhatsApp. O GPS só para se você fechar esta página.
              </div>
            )}
            <div className="rounded-3xl bg-emerald-500 text-slate-950 p-6 text-center shadow-2xl">
              <div className="mx-auto w-16 h-16 rounded-full bg-white/30 flex items-center justify-center mb-3 animate-pulse">
                <MapPin size={32} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em]">Transmitindo ao vivo</p>
              <p className="text-2xl font-black mt-1">Central TM SEG acompanhando</p>
              {osNumber ? <p className="font-mono text-sm mt-2">OS {osNumber}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              data-testid="live-track-minimize"
              className="w-full h-12 rounded-2xl bg-white/10 border border-white/20 text-white text-sm font-black uppercase tracking-wide flex items-center justify-center gap-2"
            >
              <EyeOff size={16} /> Ocultar e rastrear em segundo plano
            </button>
            <ul className="space-y-2 text-sm text-slate-200">
              <li className="flex gap-2"><EyeOff size={16} className="mt-0.5 shrink-0" /> Ocultar, Home ou WhatsApp: GPS continua. Só para se você fechar esta página.</li>
              <li className="flex gap-2"><Smartphone size={16} className="mt-0.5 shrink-0" /> Deixe o Chrome/Safari aberto (pode ficar oculto) até o fim da missão.</li>
              <li className="flex gap-2"><Radio size={16} className="mt-0.5 shrink-0" /> GPS em alta precisão (não use só Wi‑Fi).</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> Localização usada só nesta OS, com registro LGPD.</li>
            </ul>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-white/5 p-3 border border-white/10">
                <p className="text-slate-400 uppercase font-black tracking-widest text-[9px]">Precisão</p>
                <p className="font-mono text-lg">{accuracy != null ? `${Math.round(accuracy)} m` : '—'}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3 border border-white/10">
                <p className="text-slate-400 uppercase font-black tracking-widest text-[9px]">Último envio</p>
                <p className="font-mono text-lg">{lastPingAt ? `${Math.max(0, Math.round((nowTs - lastPingAt) / 1000))}s` : '—'}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Segundo plano: {bgOk ? 'ativo (notificação + áudio de manutenção)' : 'limitado neste aparelho — não feche a aba'}.
              {' '}Tela ligada: {wakeOk ? 'ativa' : 'o celular pode apagar a tela; o rastreio tenta seguir'}.
            </p>
            {error && <p className="text-sm text-amber-300">{error}</p>}
            {accuracy != null && accuracy > 80 && (
              <p className="text-sm text-amber-300">Precisão fraca. Ative o GPS de alta precisão nas configurações do celular.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
