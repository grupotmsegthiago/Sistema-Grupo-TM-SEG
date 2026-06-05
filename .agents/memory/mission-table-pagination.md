---
name: MissionTable period-scoped loading
description: Decisions/invariants for loading Operations missions by period without breaking badges, client dashboards, or access scope.
---

# MissionTable period-scoped loading

The Operations screen loads only the selected period's missions instead of the whole table. Keep these invariants when touching mission loading, search, or badges:

- **Always-loaded OPEN set is the linchpin.** On staff views, load the open backlog (active statuses + `Concluída` not billing-approved) on EVERY period, unioned with the in-range rows. Global badges (approval queue, toll-not-confirmed, future/"amanhã", solicitations, accident) are computed from the full mission set, so they break if the open set isn't always present.
  - **Why:** open backlog is bounded by operational throughput while settled history grows forever; scoping to "open + selected period" bounds the load to the working set.
- **Restricted client view loads the FULL client set, no period scoping.** Those users render client panels (ClientExecutiveDashboard/Reports/Committee) that have their OWN period selectors and expect the complete client dataset; a single client is small anyway.
- **Every mission query MUST apply the resolved client scope.** Three paths exist (initial load, server-side search, deep-link `?openMission=<id>` by-id fetch) and all must filter by the same scope (eq client / in clients / empty→none). There is NO RLS backstop — an unscoped by-id fetch is an IDOR that exposes other clients' missions. Treat any new mission query the same way.
- **Realtime must not churn on period change.** Period state is read via a ref, not via `fetchMissions` deps; a separate effect triggers refetch on period change. Adding period state to the realtime subscription's deps would tear down/rebuild the channel on every period switch.
- **Accepted tradeoff:** on the ALL ("TOTAL ABERTOS") view, indicators reflect only open missions.
