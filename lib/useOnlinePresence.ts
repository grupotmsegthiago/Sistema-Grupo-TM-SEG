import { useEffect, useState } from 'react';
import { subscribePresence } from './presenceChannel';
import {
  mergePresenceSources,
  subscribeUserPresenceDb,
} from './userPresenceDb';
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

    let dbUsers: PresenceUserState[] = [];
    let broadcastUsers: PresenceUserState[] = [];

    const publish = () => {
      const merged = mergePresenceSources(dbUsers, broadcastUsers);
      setOnlineUsers((prev) => (presenceListEqual(prev, merged) ? prev : merged));
    };

    const unsubscribeDb = subscribeUserPresenceDb((users) => {
      dbUsers = users;
      publish();
    });

    const unsubscribeBroadcast = subscribePresence((users) => {
      broadcastUsers = users;
      publish();
    });

    return () => {
      unsubscribeDb();
      unsubscribeBroadcast();
    };
  }, [enabled]);

  const onlineCount = onlineUsers.length;
  const onDutyClt = onlineUsers.filter((u) => u.isClt && u.onDuty);

  return { onlineUsers, onlineCount, onDutyClt };
}
