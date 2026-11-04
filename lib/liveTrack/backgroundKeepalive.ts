/**
 * Mantém a página viva em segundo plano enquanto ela existir.
 * GPS de navegador NÃO existe depois que o usuário fecha a aba ou mata o app.
 */

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export type LiveTrackKeepalive = { stop: () => void };

export type LiveTrackKeepaliveMarca = {
  title: string;
  artist: string;
  album: string;
  body: string;
  icon?: string;
};

const MARCA_PADRAO: LiveTrackKeepaliveMarca = {
  title: 'TM SEG — rastreio ao vivo',
  artist: 'Grupo TM SEG',
  album: 'Acompanhamento de missão',
  body: 'Rastreio ativo em segundo plano. Pode ocultar a tela. Só para se fechar esta página.',
};

export async function startLiveTrackKeepalive(marca: Partial<LiveTrackKeepaliveMarca> = {}): Promise<LiveTrackKeepalive> {
  const aviso = { ...MARCA_PADRAO, ...marca };
  let stopped = false;
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let pulse: number | null = null;

  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0006;
      o.type = 'sine';
      o.frequency.value = 18;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      osc = o;
    }
  } catch {
    /* alguns aparelhos bloqueiam AudioContext */
  }

  try {
    audioEl = new Audio(SILENT_WAV);
    audioEl.loop = true;
    audioEl.volume = 0.02;
    audioEl.setAttribute('playsinline', 'true');
    await audioEl.play();
  } catch {
    /* play() precisa de gesto do usuário — o chamador já veio do clique */
  }

  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: aviso.title,
        artist: aviso.artist,
        album: aviso.album,
      });
      navigator.mediaSession.playbackState = 'playing';
    }
  } catch {
    /* Media Session opcional */
  }

  try {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission === 'granted') {
        const opts: NotificationOptions = {
          body: aviso.body,
          icon: aviso.icon || '/favicon.png',
          badge: aviso.icon || '/favicon.png',
          tag: 'tmseg-live-track',
          requireInteraction: true,
          silent: true,
          data: { url: window.location.href },
        };
        const reg = await navigator.serviceWorker?.ready.catch(() => null);
        if (reg?.showNotification) {
          await reg.showNotification(aviso.title, opts);
        } else {
          new Notification(aviso.title, opts);
        }
      }
    }
  } catch {
    /* notificação não é obrigatória para o GPS */
  }

  const resume = () => {
    if (stopped) return;
    void ctx?.resume?.();
    void audioEl?.play?.().catch(() => {});
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } catch { /* ignore */ }
  };

  pulse = window.setInterval(resume, 12000);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('pagehide', resume);

  return {
    stop: () => {
      stopped = true;
      if (pulse != null) window.clearInterval(pulse);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pagehide', resume);
      try { osc?.stop(); } catch { /* já parado */ }
      try { void ctx?.close(); } catch { /* já fechado */ }
      try {
        if (audioEl) {
          audioEl.pause();
          audioEl.src = '';
        }
      } catch { /* ignore */ }
      audioEl = null;
      osc = null;
      ctx = null;
      try {
        navigator.serviceWorker?.ready.then((reg) => reg.getNotifications({ tag: 'tmseg-live-track' }).then((list) => {
          list.forEach((n) => n.close());
        }));
      } catch { /* ignore */ }
    },
  };
}
