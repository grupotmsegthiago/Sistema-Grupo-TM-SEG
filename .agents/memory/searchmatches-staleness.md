---
name: searchMatches staleness in MissionTable
description: Why a mission card found via search/OS-filter can show stale financials after save/approve, and the invariant that keeps it fresh.
---

# searchMatches must track mission changes

In `MissionTable`, an OS shown via the search box or the OS-filter can be OUTSIDE the
currently loaded period (the per-period fetch loads in-range ∪ open/non-terminal only).
Those cards are served from `searchMatches`, a SEPARATE state filled once when the
search term is typed. In `filteredBySpecialCriteria`, `allMissions` takes priority and
`searchMatches` only fills IDs missing from it — so a completed/terminal OS outside the
period is displayed from `searchMatches`.

**The rule:** any code path that mutates mission state must also keep `searchMatches`
in sync, otherwise saving/approving (or another user's change) leaves the searched card
frozen on the pre-edit `revenue_value`/`cost_value` (classic symptom: "AUDITADO" card
shows old values, while the DB is already correct, and "última atualização" lags).

**Why:** the realtime in-place patch and `fetchMissions(true)` only touch `allMissions`.
They never refreshed `searchMatches`, so the searched-out-of-period card never updated.

**How to apply:**
- In the realtime patch (`applyRealtimeMissionChange`, full-access choke point): on
  DELETE filter the id out of `searchMatches`; on UPDATE/INSERT replace the matching
  `searchMatches` row with the re-mapped row. Financial fields come straight from the
  DB row, so this respects the golden rule (DB = source of truth, no frontend recalc).
- For paths without in-place patching (restricted/commercial use full refetch) and for
  realtime reconnect: bump a `searchRefreshTick` state that is a dependency of the
  debounced search effect, so the server-side search re-runs and `searchMatches`
  reflects DB truth. The external `refreshMissions` listener bumps it too.
