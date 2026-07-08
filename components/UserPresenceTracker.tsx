import React, { useEffect } from 'react';
import { enrichUserWithCltData } from '../lib/timeclock/cltEmployee';
import { fetchTodayTimeClockEntries } from '../lib/timeclock/registerPunch';
import { getOnDutyStageLabel, isCltOnDutyToday, getMinutesOnDutyToday } from '../lib/timeclock/onDuty';
import {
  getActivityStatus,
  getIdleMinutes,
  getLastActivityAt,
} from '../lib/userActivityTracker';
import { requiresTimeclockUser } from '../lib/timeclock/eligibility';
import { buildPunchMarks } from '../lib/timeclock/presence';
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
const ACTIVITY_HEARTBEAT_MIN_MS = 15_000;

/** Mantém o usuário atual visível no canal de presença (online + CLT em serviço). */
const UserPresenceTracker: React.FC<Props> = ({ enabled }) => {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let stopTracking: (() => void) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lastGoodPayload: PresenceUserState | null = null;
    let lastActivityHeartbeatAt = 0;

    const buildQuickPayload = (
      raw: TimeClockUserContext & { role?: string }
    ): PresenceUserState => ({
      userId: raw.id,
      name: raw.name || 'Usuário',
      role: raw.role || 'Operador',
      isClt: !!(raw.isClt || raw.requiresTimeclock),
      onDuty: false,
      onDutyLabel: 'Online',
      onlineAt: new Date().toISOString(),
    });

    const buildPayload = async (): Promise<PresenceUserState | null> => {
      try {
        const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext & {
          role?: string;
        };
        if (!raw?.id) return null;

        let user: TimeClockUserContext;
        try {
          user = await enrichUserWithCltData(raw);
        } catch (err) {
          console.warn('[TMSEG_PRESENCE] enrich falhou, reutilizando dados locais', err);
          user = raw;
        }

        const contractType = (user.contractType || '').toUpperCase() || undefined;
        const mustClock = requiresTimeclockUser(user);
        let onDuty = lastGoodPayload?.onDuty ?? false;
        let onDutyLabel = lastGoodPayload?.onDutyLabel ?? 'Online';
        let minutesOnDuty = lastGoodPayload?.minutesOnDuty ?? 0;
        let punchMarks = lastGoodPayload?.punchMarks;

        if (mustClock) {
          try {
            const entries = await fetchTodayTimeClockEntries(user.id);
            punchMarks = buildPunchMarks(entries);
            onDuty = isCltOnDutyToday(entries);
            onDutyLabel = getOnDutyStageLabel(entries);
            minutesOnDuty = onDuty ? getMinutesOnDutyToday(entries) : 0;
          } catch (err) {
            console.warn('[TMSEG_PRESENCE] fetch ponto falhou, mantendo último estado', err);
          }
        } else if (contractType) {
          onDutyLabel = contractType;
          punchMarks = undefined;
        }

        const activityStatus = getActivityStatus();
        const idleMinutes = getIdleMinutes();
        return {
          userId: user.id,
          name: user.name || 'Usuário',
          role: user.role || 'Operador',
          contractType,
          isClt: mustClock,
          onDuty,
          onDutyLabel,
          onlineAt: new Date().toISOString(),
          lastActivityAt: getLastActivityAt(),
          minutesOnDuty,
          activityStatus,
          idleMinutes,
          punchMarks,
        };
      } catch (err) {
        console.warn('[TMSEG_PRESENCE] buildPayload erro', err);
        return lastGoodPayload;
      }
    };

    const applyPayload = (payload: PresenceUserState) => {
      lastGoodPayload = payload;
      if (stopTracking) {
        updatePresencePayload(payload);
      } else {
        stopTracking = trackPresence(payload);
      }
    };

    const heartbeat = async (opts?: { activityOnly?: boolean }) => {
      if (cancelled || !stopTracking) return;

      if (opts?.activityOnly && lastGoodPayload) {
        const now = Date.now();
        if (now - lastActivityHeartbeatAt < ACTIVITY_HEARTBEAT_MIN_MS) return;
        lastActivityHeartbeatAt = now;
        const updated: PresenceUserState = {
          ...lastGoodPayload,
          onlineAt: new Date().toISOString(),
          lastActivityAt: getLastActivityAt(),
          activityStatus: getActivityStatus(),
          idleMinutes: getIdleMinutes(),
        };
        applyPayload(updated);
        return;
      }

      const payload = await buildPayload();
      if (!payload || cancelled) return;
      applyPayload(payload);
    };

    const start = async () => {
      try {
        const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext & {
          role?: string;
        };
        if (raw?.id && !stopTracking) {
          applyPayload(buildQuickPayload(raw));
        }
      } catch {
        // ignora
      }

      await heartbeat();
    };

    void start();

    heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);

    const unsubscribeRefresh = onPresenceRefreshRequested(() => {
      void heartbeat();
    });

    const onActivity = () => void heartbeat({ activityOnly: true });
    window.addEventListener('tmseg:activity', onActivity);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void heartbeat();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      unsubscribeRefresh();
      window.removeEventListener('tmseg:activity', onActivity);
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
