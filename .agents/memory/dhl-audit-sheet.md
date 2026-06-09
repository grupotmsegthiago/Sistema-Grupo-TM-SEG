---
name: DHL "PREENCHER PLANILHA (SE)" audit export
description: How the DHL fill-spreadsheet generator must source times/tables — real values, not boletim-balanced.
---

# DHL audit spreadsheet (botão "PREENCHER PLANILHA (SE)")

The generator (`handleFillDhlSheet` in `components/ClientBillingReport.tsx`, export in
`exports/dhl-faturamento-export.ts`) produces an AUDIT sheet for DHL. The DHL client
checks it against their contract, so it must show REAL/CORRECT inputs and let the
Excel formulas compute the total — even when the natural total differs from the
`revenue_value`/snapshot stored in the boletim.

**Rule:** Fill only raw inputs; never hardcode totals or "balance" the franquia to
force the total to match the stored boletim value.
- HORA INÍCIO (col U) = real time the status became "Em Viagem" (from `mission_history`).
- HORA FINAL (col V) = real time of the TERMINAL status (Concluída/Cancelada/Pendente).
- Tabela aplicada / franquia / valores tabelados: priority is by RECENCIA, NOT a fixed
  adjustment>snapshot order. Per OS capture BOTH `system_logs` rows with `created_at`:
  `BillingAdjustment` -> {id (clientTableId), name (clientTableName), at} and
  `BillingSnapshot` -> {id, name, at, FROZEN PARAMS (franchiseKm/Hours, unitKm/Hr,
  activationFee, totalGeral)}. Resolution: `adjNewer = adj && (!snap || adj.at > snap.at + 2000ms)`
  (the +2s guard ignores the adjustment+snapshot pair written in the SAME approval). If
  adjNewer -> resolveLive(adj) || frozen(snap) || resolveLive(snap); else if snap ->
  frozen(snap) || resolveLive(snap) || resolveLive(adj); else resolveLive(adj). Only if
  all null re-select via `selectDhlClientTable` (route engine), then financial fallback.
  - **resolveLive(info)**: find a CURRENTLY-LIVE table by id, then by NORMALIZED name
    (`normTableName` = trim/upper/collapse-spaces; `fillTablesByName` Map keyed by
    operation_type). Needed because DHL tables were RECREATED with new ids AND new names,
    so the id/name saved on the OS is often orphaned (only 26/201 resolved by id alone).
  - **frozen(snap)**: synthetic table from the snapshot frozen params (same source the
    on-screen boletim uses for approved OS) — valid if ANY of activationFee/franchiseKm/
    franchiseHours/unitKm/unitHr > 0. This makes the sheet mirror the boletim even when
    the table no longer exists. After fix: 176 frozen + 11 live + 14 route (route = OS
    never processed in the modal, no adj/snap — correct).
  `usedTable` drives BOTH the "TABELA APLICADA" column (AO) and the franquia/excedente/
  ativação fields, so the whole row stays consistent.
  **Why recency, not adjustment-first:** the modal restores its selector from the MOST
  RECENT `BillingAdjustment` (rewritten delete+insert each save). But the snapshot is the
  frozen truth at approval. If the adjustment is NEWER than the snapshot there was a
  post-approval correction (GTM-5022: approved 200KM, later corrected to 100KM) -> live
  adjustment wins; otherwise the frozen snapshot wins (mirrors the boletim exactly).
  **Manual-override caveat:** when the diretoria hand-edits revenue (billing_verified_by/
  revenue_edit_reason), the boletim TOTAL is overridden to dbTotal but the audit sheet
  recomputes via formula from the table params + real times — so the sheet total can
  differ by the override amount. That is BY DESIGN (audit sheet validates the breakdown).
- Cancelled before departure (no "Em Viagem" event) = início = fim = 0h.

**Why:** Earlier the generator filled SCHEDULED times and derived `activationFee` from
the stored total so the sheet matched the boletim to the cent; DHL rejected ~72 rows
with wrong times and wrong regional table. User chose (opção 1) real/correct values
over matching the stored boletim.

**Engine note:** `selectDhlClientTable` route matching tries the direct route first,
then the inverse route (destino→origem) only as fallback, and requires the table's
region to equal the detected region when the table has an identifiable region.
The plain `calculateMissionFinancials` DHL auto-engine only runs for non-cancelled
OS and zeroes KM for cancelled (band→100km), so do NOT rely on it to pick the
regional table for cancelled OS — call the selector directly with the route KM.
