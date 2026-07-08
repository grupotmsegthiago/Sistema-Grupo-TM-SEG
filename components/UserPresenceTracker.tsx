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
import { buildPunchMarks, normalizePresenceUserId, buildPresenceHeartbeatFromUser } from '../lib/timeclock/presence';
import {
  onPresenceRefreshRequested,
  trackPresence,
  updatePresencePayload,
} from '../lib/presenceChannel';
import { removeUserPresenceDb, upsertUserPresenceDb } from '../lib/userPresenceDb';
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
    // Marco (epoch ms) do início do serviço, derivado da última leitura de ponto.
    // Permite recontar os "minutos em serviço" localmente, sem ir ao banco.
    let serviceStartMs: number | null = null;

    const buildQuickPayload = (
      raw: TimeClockUserContext & { role?: string }
    ): PresenceUserState => buildPresenceHeartbeatFromUser(raw);

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

        // Guarda o início do serviço para recontagem local dos minutos entre
        // as leituras reais de ponto (evita novas idas ao banco).
        serviceStartMs = onDuty ? Date.now() - Math.max(0, minutesOnDuty) * 60_000 : null;

        const activityStatus = getActivityStatus();
        const idleMinutes = getIdleMinutes();
        return {
          userId: normalizePresenceUserId(user.id),
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
      void upsertUserPresenceDb(payload);
      if (stopTracking) {
        updatePresencePayload(payload);
      } else {
        stopTracking = trackPresence(payload);
      }
    };

    const refreshDbHeartbeat = () => {
      if (cancelled || !lastGoodPayload) return;
      void upsertUserPresenceDb({
        ...lastGoodPayload,
        onlineAt: new Date().toISOString(),
      });
    };

    const heartbeat = async (opts?: { activityOnly?: boolean; bypassThrottle?: boolean }) => {
      if (cancelled) return;

      // Caminho "activityOnly": NÃO vai ao banco. Só atualiza presença/atividade
      // e reconta os minutos em serviço localmente a partir do último ponto lido.
      if (opts?.activityOnly && lastGoodPayload) {
        if (!stopTracking) return;
        const now = Date.now();
        if (!opts.bypassThrottle && now - lastActivityHeartbeatAt < ACTIVITY_HEARTBEAT_MIN_MS) return;
        lastActivityHeartbeatAt = now;
        const minutesOnDuty =
          serviceStartMs != null
            ? Math.max(0, Math.floor((now - serviceStartMs) / 60_000))
            : lastGoodPayload.minutesOnDuty ?? 0;
        const updated: PresenceUserState = {
          ...lastGoodPayload,
          onlineAt: new Date().toISOString(),
          lastActivityAt: getLastActivityAt(),
          activityStatus: getActivityStatus(),
          idleMinutes: getIdleMinutes(),
          minutesOnDuty,
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

    // Tick periódico LOCAL: sem ida ao banco. Só reconta minutos em serviço e
    // renova a presença/atividade. O status real (Em serviço / Em almoço / Fora
    // de serviço) só muda no login e quando o banco avisa um novo ponto.
    heartbeatTimer = setInterval(() => {
      refreshDbHeartbeat();
      void heartbeat({ activityOnly: true, bypassThrottle: true });
    }, HEARTBEAT_MS);

    const unsubscribeRefresh = onPresenceRefreshRequested(() => {
      void heartbeat();
    });

    // "O banco avisa que subiu um ponto": o RealtimeProvider já escuta a tabela
    // time_clock e dispara este evento. Quando o ponto for do usuário atual,
    // relemos o ponto uma única vez e atualizamos o status (sem recarregar a
    // página e sem polling).
    const onPunchRealtime = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { new?: { user_id?: string }; old?: { user_id?: string } }
        | undefined;
      const rowUserId = detail?.new?.user_id ?? detail?.old?.user_id;
      const myId = lastGoodPayload?.userId;
      if (!myId || !rowUserId || rowUserId === myId) {
        void heartbeat();
      }
    };
    window.addEventListener('supabase:time_clock:realtime', onPunchRealtime);

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
      window.removeEventListener('supabase:time_clock:realtime', onPunchRealtime);
      window.removeEventListener('tmseg:activity', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      if (stopTracking) {
        try {
          stopTracking();
        } catch {
          // ignora
        }
      }
      if (lastGoodPayload?.userId) {
        void removeUserPresenceDb(lastGoodPayload.userId);
      }
    };
  }, [enabled]);

  return null;
};

export default UserPresenceTracker;
