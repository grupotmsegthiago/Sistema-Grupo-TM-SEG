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
- Franquia/valores tabelados come from the correct regional table via
  `selectDhlClientTable` (região da origem + faixa KM + rota), called directly with
  the route distance — applied to ALL OS including cancelled.
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
