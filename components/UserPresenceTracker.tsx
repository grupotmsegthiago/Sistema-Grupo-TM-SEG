import React, { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { enrichUserWithCltData, isCltUser } from '../lib/timeclock/cltEmployee';
import { fetchTodayTimeClockEntries } from '../lib/timeclock/registerPunch';
import { getOnDutyStageLabel, isCltOnDutyToday } from '../lib/timeclock/onDuty';
import { TMSEG_PRESENCE_CHANNEL, type PresenceUserState } from '../lib/timeclock/presence';
import type { TimeClockUserContext } from '../lib/timeclock/types';

interface Props {
  enabled: boolean;
}

const HEARTBEAT_MS = 45_000;

/** Mantém o usuário atual visível no canal de presença (online + CLT em serviço). */
const UserPresenceTracker: React.FC<Props> = ({ enabled }) => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userRef = useRef<TimeClockUserContext | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const rawUser = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
    const presenceKey = rawUser?.id || `guest-${Date.now()}`;

    const buildPayload = async (): Promise<PresenceUserState | null> => {
      try {
        const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
        if (!raw?.id) return null;
        const user = await enrichUserWithCltData(raw);
        userRef.current = user;

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

    const trackPresence = async () => {
      const channel = channelRef.current;
      const payload = await buildPayload();
      if (!channel || !payload || cancelled) return;
      await channel.track(payload);
    };

    const channel = supabase.channel(TMSEG_PRESENCE_CHANNEL, {
      config: { presence: { key: presenceKey } },
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel;
        await trackPresence();
      }
    });

    heartbeatTimer = setInterval(() => {
      void trackPresence();
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [enabled]);

  return null;
};

export default UserPresenceTracker;
