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
    if (!enabled) return;

    let cancelled = false;
    let stopTracking: (() => void) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const buildPayload = async (): Promise<PresenceUserState | null> => {
      try {
        const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
        if (!raw?.id) return null;
        const user = await enrichUserWithCltData(raw);

        let onDuty = false;
        let onDutyLabel = 'Online';
        if (isCltUser(user)) {
          const entries = await fetchTodayTimeClockEntries(user.id);
          onDuty = isCltOnDutyToday(entries);
          onDutyLabel = getOnDutyStageLabel(entries);
        }

        return {
          userId: user.id,
          name: user.name || 'Usuário',
          role: user.role || 'Operador',
          isClt: isCltUser(user),
          onDuty,
          onDutyLabel,
          onlineAt: new Date().toISOString(),
        };
      } catch {
        return null;
      }
    };

    const start = async () => {
      const payload = await buildPayload();
      if (!payload || cancelled) return;
      stopTracking = trackPresence(payload);
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

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      unsubscribeRefresh();
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
