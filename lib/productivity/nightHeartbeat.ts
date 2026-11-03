/**
 * Heartbeat de presença noturna (cliente).
 * Envia sinal ao servidor a cada NIGHT_HEARTBEAT_INTERVAL_MS enquanto a vigia
 * estiver ativa — permite detectar quem “sumiu” do sistema.
 */

import { authFetch } from '../authFetch';
import {
  isNightWatchActive,
  isNightWatchExemptRole,
  NIGHT_HEARTBEAT_INTERVAL_MS,
} from './nightWatch';

function readUser(): { id?: string | number; name?: string; role?: string } | null {
  try {
    const raw = localStorage.getItem('userData');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function sendHeartbeat(): Promise<void> {
  const user = readUser();
  if (!user?.id) return;
  if (isNightWatchExemptRole(user.role)) return;
  if (!isNightWatchActive()) return;

  try {
    await authFetch('/api/productivity/night-heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        visibility: typeof document !== 'undefined' ? document.visibilityState : null,
      }),
    });
  } catch (e) {
    console.warn('[NightHeartbeat] falha:', e);
  }
}

/** Notifica a diretoria sobre incidente noturno (timeout/desafio/logout). */
export async function reportNightIncident(payload: {
  type: 'challenge_timeout' | 'challenge_failed' | 'force_logout' | 'stale_client';
  idleMinutes?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await authFetch('/api/productivity/night-incident', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('[NightIncident] falha:', e);
  }
}

/** Instala o heartbeat noturno. Retorna cleanup. */
export function wireNightHeartbeat(): () => void {
  if (typeof window === 'undefined') return () => {};

  void sendHeartbeat();
  const id = window.setInterval(() => {
    void sendHeartbeat();
  }, NIGHT_HEARTBEAT_INTERVAL_MS);

  const onVis = () => {
    if (document.visibilityState === 'visible') void sendHeartbeat();
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}
