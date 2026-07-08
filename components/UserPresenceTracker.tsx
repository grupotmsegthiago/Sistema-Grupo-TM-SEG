import React, { useEffect } from 'react';
import { enrichUserWithCltData, isCltUser } from '../lib/timeclock/cltEmployee';
import { fetchTodayTimeClockEntries } from '../lib/timeclock/registerPunch';
import { getOnDutyStageLabel, isCltOnDutyToday } from '../lib/timeclock/onDuty';
import {
  onPresenceRefreshRequested,
  trackPresence,
  updatePresencePayload,
} from '../lib/presenceChannel';
import type { PresenceUserState } from '../lib/timeclock/presence';
import type { TimeClockUserContext } from '../lib/timeclock/types';

interface Props {
  enabled: boolean;
}

const HEARTBEAT_MS = 45_000;

/** Mantém o usuário atual visível no canal de presença (online + CLT em serviço). */
const UserPresenceTracker: React.FC<Props> = ({ enabled }) => {
  useEffect(() => {
    console.log('[TMSEG_PRESENCE] UserPresenceTracker useEffect. enabled=', enabled);
    if (!enabled) return;

    let cancelled = false;
    let stopTracking: (() => void) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const buildPayload = async (): Promise<PresenceUserState | null> => {
      try {
        const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
        if (!raw?.id) {
          console.log('[TMSEG_PRESENCE] buildPayload sem raw.id — userData vazio no localStorage');
          return null;
        }

        // Retorno rápido enquanto o enrich async completa (evita "0 usuários" no primeiro segundo).
        const quickPayload: PresenceUserState = {
          userId: raw.id,
          name: raw.name || 'Usuário',
          role: (raw as any).role || 'Operador',
          isClt: false,
          onDuty: false,
          onDutyLabel: 'Online',
          onlineAt: new Date().toISOString(),
        };

        // Se conseguirmos enriquecer, retorna o payload completo; se falhar, quickPayload.
        try {
          const user = await enrichUserWithCltData(raw);
          const contractType = (user.contractType || '').toUpperCase() || undefined;
          let onDuty = false;
          let onDutyLabel = 'Online';
          if (isCltUser(user)) {
            const entries = await fetchTodayTimeClockEntries(user.id);
            onDuty = isCltOnDutyToday(entries);
            onDutyLabel = getOnDutyStageLabel(entries);
          } else if (contractType) {
            onDutyLabel = contractType;
          }
          return {
            userId: user.id,
            name: user.name || 'Usuário',
            role: user.role || 'Operador',
            contractType,
            isClt: isCltUser(user),
            onDuty,
            onDutyLabel,
            onlineAt: new Date().toISOString(),
          };
        } catch (err) {
          console.warn('[TMSEG_PRESENCE] enrich falhou, mantendo payload básico', err);
          return quickPayload;
        }
      } catch (err) {
        console.warn('[TMSEG_PRESENCE] buildPayload erro', err);
        return null;
      }
    };

    const start = async () => {
      // Track "rápido" com o que já temos no localStorage — não bloqueia esperando enrich.
      try {
        const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext & { role?: string };
        if (raw?.id && !stopTracking) {
          const quickPayload: PresenceUserState = {
            userId: raw.id,
            name: raw.name || 'Usuário',
            role: raw.role || 'Operador',
            isClt: false,
            onDuty: false,
            onDutyLabel: 'Online',
            onlineAt: new Date().toISOString(),
          };
          console.log('[TMSEG_PRESENCE] start: quick track', quickPayload.name);
          stopTracking = trackPresence(quickPayload);
        }
      } catch {
        // ignora
      }

      const payload = await buildPayload();
      if (!payload || cancelled) return;
      if (stopTracking) {
        updatePresencePayload(payload);
      } else {
        stopTracking = trackPresence(payload);
      }
    };

    const heartbeat = async () => {
      if (cancelled || !stopTracking) return;
      const payload = await buildPayload();
      if (!payload || cancelled) return;
      updatePresencePayload(payload);
    };

    void start();

    heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);

    const unsubscribeRefresh = onPresenceRefreshRequested(() => {
      void heartbeat();
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void heartbeat();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      unsubscribeRefresh();
      document.removeEventListener('visibilitychange', onVisibility);
      if (stopTracking) {
        try {
          stopTracking();
        } catch {
          // ignora
        }
      }
    };
  }, [enabled]);

  return null;
};

export default UserPresenceTracker;
