---
name: React Query cache vs Supabase Realtime
description: Why staleTime can be long and refetchOnWindowFocus off in this app
---

React Query defaults are tuned for low refetch pressure: staleTime ~60s, gcTime ~10m, refetchOnWindowFocus disabled (refetchOnReconnect kept on).

**Why:** Freshness comes from the global Supabase Realtime channel (lib/RealtimeProvider.tsx), which invalidates query keys and dispatches window events on DB changes. So aggressive refetch-on-focus/short-stale only re-downloaded large datasets (missions ~950, clients, providers, transactions) on every tab switch, causing the perceived load slowness — without adding correctness, since realtime already keeps caches current.

**How to apply:** Don't re-shorten staleTime or re-enable refetchOnWindowFocus to "fix stale data" — first check whether the table is wired into RealtimeProvider's invalidation. MissionTable does NOT use React Query; it fetches manually and listens to the `refreshMissions` window event, so queryClient settings don't affect it.
