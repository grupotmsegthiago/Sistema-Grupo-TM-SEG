---
name: Billing report cross-client contamination
description: Why the boletim de medição can pull another client's OS, and the guard that prevents it.
---

The client billing report (boletim de medição) fetches missions with a
Supabase `.or()` of several `ilike` patterns on the `client` column, including
a GENERIC word-based pattern built from the client's meaningful name parts
(e.g. UNIKA = "VMF TRANSPORTE E LOGISTICA LTDA" produces `%TRANSPORTE%LOGISTICA%`).

**Why this bites:** in logistics, words like TRANSPORTE/TRANSPORTES/LOGISTICA
are shared across many companies, so the generic pattern matches OTHER clients'
canonical names (FSM = "...TRANSPORTES E LOGISTICA INTEGRADA LTDA"). Adding more
stop-words is whack-a-mole and never fully safe.

**The durable rule:** the mission `client` field stores the full canonical
client name. So after the broad fetch, resolve each mission's `client` back to
the real client (longest name/trading_name containment match) and keep it only
if it resolves to the selected client (or to no known client = free variant).
Resolve against ALL clients including inactive ones, or an inactive same-industry
client can still leak through as "unresolved".

**How to apply:** any time you broaden the client `.or()` filter for performance/
recall, keep the JS resolve-and-verify guard downstream; do not trust the SQL
filter alone to scope a single client's billing. The DHL "PREENCHER PLANILHA"
path fetches by dhl_se_number and is not affected.
