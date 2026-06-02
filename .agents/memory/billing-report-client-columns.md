---
name: Billing report client-specific columns
description: How the Boletim de Medição (ClientBillingReport) adds extra columns for specific clients, and every place that must stay aligned.
---

# Billing report client-specific columns

The Boletim de Medição (`components/ClientBillingReport.tsx`) shows extra columns for specific clients, gated by `isXBilling` boolean flags derived from `clientData.name`/`trading_name` (e.g. CESLOG → REFERÊNCIA, DHL → S.E./SM, CEVA → TIPO, INTERMODAL → UF). Client UF is not a stored column; it is derived per row via `extractUF` (in `lib/financialUtils.ts`) from the mission origin/destination address, exposed on each `rowsData` row as `originUf`/`destinationUf`.

## The alignment rule
**Why:** the report has two parallel renderings (the Excel export in `handleExportExcel` and the on-screen `<table>`) plus several hardcoded colSpan/index numbers. Adding one client-specific column means updating EVERY spot below in lockstep, or colSpans, currency-column indices, and column widths drift silently.

**How to apply:** when adding a per-client column, place it consistently in the same position (the existing extras sit between Nº and STATUS) and update all of:
- `extraColOffset` (sum of leading extra columns)
- Excel `dataRows` push order and `headers` push order (must match each other)
- the `handleExportExcel` `useCallback` dependency array (include the new flag, else stale export)
- on-screen: `<colgroup>`, the "TABELA ACORDADA" group-header colSpan, the sub-header `<th>`, the body `<td>`, the empty-state colSpan, and the total-row colSpan

## Known pre-existing quirk
`routeColIdx = 3 + extraColOffset` in `handleExportExcel` is off by one (ROTA is actually at `2 + extraColOffset`); it only sets a cosmetic min-width floor, so it lands on the VALOR column. Pre-existing, unrelated to per-client columns — leave unless explicitly fixing export widths.
