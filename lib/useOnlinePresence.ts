import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  TMSEG_PRESENCE_CHANNEL,
  parsePresenceState,
  type PresenceUserState,
} from './timeclock/presence';

export function useOnlinePresence(enabled = true) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUserState[]>([]);

  const sync = useCallback((channel: RealtimeChannel) => {
    const state = channel.presenceState() as Record<string, PresenceUserState[]>;
    setOnlineUsers(parsePresenceState(state));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setOnlineUsers([]);
      return;
    }

    const channel = supabase.channel(TMSEG_PRESENCE_CHANNEL, {
      config: { presence: { key: 'public' } },
    });

    channel.on('presence', { event: 'sync' }, () => sync(channel));
    channel.on('presence', { event: 'join' }, () => sync(channel));
    channel.on('presence', { event: 'leave' }, () => sync(channel));

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, sync]);

  const onlineCount = onlineUsers.length;
  const onDutyClt = onlineUsers.filter((u) => u.isClt && u.onDuty);

  return { onlineUsers, onlineCount, onDutyClt };
}
