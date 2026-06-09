---
name: Billing report provider mode
description: How the Boletim de Medição supports both Cliente and Fornecedor in one report component
---

The Boletim de Medição (`components/ClientBillingReport.tsx`) has a single `reportMode` ('cliente' | 'fornecedor') toggle; it is NOT a separate screen.

Key decisions:
- The generic `rowsData` row shape (activationFee, franchiseHours/Km, unitHr/Km, kmExtra*, hrExtra*, tollVal, totalGeral, etc.) is reused for both modes. A `reportMode === 'fornecedor'` branch at the top of the `missions.map` fills those same fields from `calculateMissionFinancials(...).provider` so the same table + Excel export render cost instead of revenue. Do not fork the table/export.
- **Provider total = DB truth:** `totalGeral = cost_value + tollProv` and grandTotal sums `cost_value + tollProv`, where `tollProv = toll_value_provider ?? toll_value` (non-negative). Mirrors the client-side golden rule (revenue_value + toll_value) but for cost.
- **Isolation:** filter by `.in('provider', [name, trading_name])` exact-match (filterCol switches between 'client' and 'provider'). Never ILIKE.
- **Mode leakage guards:** toggling clears the opposite selector (selectedClient/selectedProvider) and resets reportGenerated; provider mode passes empty client_price_tables (ptRes) since only fin.provider is needed; provider branch runs before the revenue snapshot logic so frozen client snapshots never touch cost.
- **UI:** in fornecedor mode, "Gerar Fatura" and "Colar Planilha" are hidden (revenue-only); Excel export stays. DHL-specific bands/columns auto-hide because clientData is undefined.

**Why:** users wanted one report that flips between billing the client and paying the provider, with cost shown per OS, without duplicating the 4000-line component.
