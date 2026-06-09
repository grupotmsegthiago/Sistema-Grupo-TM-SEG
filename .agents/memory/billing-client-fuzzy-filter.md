---
name: Billing report client isolation
description: How the boletim de medição must scope OS to a single client, and why fuzzy matching is banned.
---

The client billing report (boletim de medição) must scope missions to ONE
client using EXACT canonical matching, never fuzzy `ILIKE` with generic terms.

**Why:** mission rows store the full canonical client name in the `client`
field. A generic word-based `.or()`/`ILIKE` filter (e.g. UNIKA "VMF TRANSPORTE
E LOGISTICA LTDA" → `%TRANSPORTE%LOGISTICA%`) matches other same-industry
clients (FSM "...TRANSPORTES E LOGISTICA INTEGRADA LTDA") and contaminates the
report. Adding stop-words is whack-a-mole and never safe. A JS post-filter that
re-derives ownership is a band-aid the directors explicitly rejected — fix at
the query origin.

**The rule:** filter at the query with `.in('client', [name, trading_name])`
(exact), on BOTH the main query and the `billing_period_override` query.
`.in()` also safely handles names with commas/parentheses (e.g. "DHL SUPPLY
CHAIN (BRAZIL) LTDA"), unlike hand-built `.or()` strings that need quoting.

**How to apply:** never reintroduce ILIKE/generic-word client filters or a JS
ownership post-filter here. Verified once that 0 of 1000 missions have a
`client` value diverging from a canonical name, so exact match drops no
legitimate OS. The DHL "PREENCHER PLANILHA" path fetches by dhl_se_number and
is a separate concern.
