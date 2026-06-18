---
name: VendorVerificationControl load strategy
description: Why the "CONTROLE DE OS FORNECEDOR" screen must not full-load the base on text search
---

The CONTROLE DE OS FORNECEDOR screen (components/VendorVerificationControl.tsx) must NOT
download the whole 2026 mission base into the browser just to answer a search.

**Rule:** text search uses a server-side query (only matching rows come back); the full
in-memory load is reserved for column filters, provider/status/date filters, and the
Divergências tab (which compares an uploaded spreadsheet against all loaded missions).

**Why:** the base is thousands of OS with ~35 columns. Loading it all (sequential
1000-row pages) on every search made the screen very slow. Cards stay accurate during
search via cheap head-count queries, so they don't need the full set.

**How to apply:**
- Keep search on the server path (a PostgREST `.or()` across id/client/provider/
  vendor_os_number/invoice_number/origin/destination + vehicle-id `.in()` for plates +
  numeric `eq` on km), AND-combined with the base filter (billing_approved OR Concluída,
  created_at >= 2026-01-01). Mission `id` is varchar, so `id.ilike` is safe.
- Paginate ALL matches (no hard `.limit()`), or the on-screen Total Custo and pagination
  silently operate on a truncated subset for broad terms.
- The search result must be a SUPERSET of what client-side filters need, since
  filteredMissions still applies provider/status/date/column filters on top.
- Don't move agent-phone lookups / derived data back into the blocking path.
