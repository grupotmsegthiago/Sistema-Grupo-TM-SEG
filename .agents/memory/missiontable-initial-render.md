---
name: MissionTable initial render critical path
description: What is allowed to block the first paint of the missions table vs. what must load in background.
---

# MissionTable initial render critical path

In `components/MissionTable.tsx` `fetchMissions()`, only fetch the missions plus
`vehicles`/`client_vehicles` enrichment before releasing `isLoading` (the vehicle
plates render inside the cards). Everything else must load AFTER the rows render.

**Rule:** set `lookupMapsRef.current`, `setAllMissions(mapped)`,
`initialFetchDoneRef.current = true`, then `setIsLoading(false)` — and only then
fire `fetchAllAgentPhones()` and `refreshDerivedData(mapped)` as fire-and-forget
(`void ...().catch(...)`).

**Why:** the table was perceived as slow (long "Carregando..."), worst for
operators, because `isLoading` waited on (1) a FULL scan of the `agents` table for
WhatsApp phones and (2) `refreshDerivedData`, which batches many
`system_logs`/`mission_logs` queries (approvals, evidence, logs, DHL, toll) over
ALL open missions. None of that is needed to draw the rows.

**How to apply:**
- Never move agent-phone lookup or derived/badge maps (approval/evidence/log/DHL/
  toll) back into the blocking `Promise.all` before render.
- `initialFetchDoneRef` must be set BEFORE any background work so the realtime
  targeted patch guard works; `lookupMapsRef` must be set BEFORE render so the
  patch can enrich a single OS.
- `refreshDerivedData` already self-versions via `derivedReqIdRef` (discards stale
  responses), so fire-and-forget is safe. The deferred agent-phone path is NOT
  versioned — if overlapping refetches ever cause stale phone maps, add similar
  request-versioning there.
- Deferring these only delays WhatsApp buttons/badges by a moment; rows render
  immediately.
