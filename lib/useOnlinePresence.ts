import { useEffect, useState } from 'react';
import { subscribePresence } from './presenceChannel';
import type { PresenceUserState } from './timeclock/presence';

export function useOnlinePresence(enabled = true) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUserState[]>([]);

  useEffect(() => {
    if (!enabled) {
      setOnlineUsers([]);
      return;
    }
    const unsubscribe = subscribePresence((users) => {
      setOnlineUsers(users);
    });
    return () => {
      unsubscribe();
    };
  }, [enabled]);

  const onlineCount = onlineUsers.length;
  const onDutyClt = onlineUsers.filter((u) => u.isClt && u.onDuty);

  return { onlineUsers, onlineCount, onDutyClt };
}
