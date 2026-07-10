import { useEffect, useState } from 'react';
import { subscribePresence } from './presenceChannel';
import type { PresenceUserState } from './timeclock/presence';

function presenceListEqual(a: PresenceUserState[], b: PresenceUserState[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.userId !== y.userId ||
      x.onDuty !== y.onDuty ||
      x.onDutyLabel !== y.onDutyLabel ||
      x.activityStatus !== y.activityStatus ||
      x.idleMinutes !== y.idleMinutes ||
      x.minutesOnDuty !== y.minutesOnDuty ||
      x.onlineAt !== y.onlineAt ||
      x.lastActivityAt !== y.lastActivityAt ||
      JSON.stringify(x.punchMarks || []) !== JSON.stringify(y.punchMarks || [])
    ) {
      return false;
    }
  }
  return true;
}

export function useOnlinePresence(enabled = true) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUserState[]>([]);

  useEffect(() => {
    if (!enabled) {
      setOnlineUsers([]);
      return;
    }
    const unsubscribe = subscribePresence((users) => {
      setOnlineUsers((prev) => (presenceListEqual(prev, users) ? prev : users));
    });
    return () => {
      unsubscribe();
    };
  }, [enabled]);

  const onlineCount = onlineUsers.length;
  const onDutyClt = onlineUsers.filter((u) => u.isClt && u.onDuty);

  return { onlineUsers, onlineCount, onDutyClt };
}
