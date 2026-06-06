---
name: DHL price table naming standard
description: How DHL client_price_tables names must be formatted and where the KM comes from.
---

DHL SUPPLY CHAIN price tables (client_price_tables) must follow the auto-engine
standard name `REGIÃO - DESCRIÇÃO NNNKM` validated by `validateDhlTableName`
(lib/dhlAutoTableSelector.ts). Names failing it show a ⚠️ in the table selector
and are NOT auto-suggested by the engine.

The common failure is a missing KM suffix (region + hyphen separator are usually
fine). The KM to append is the row's `franchise_km` value — for DHL route tables
that field holds the route distance (e.g. EXTREMA-CABEDELO franchise_km=2650 ->
"... EXTREMA-CABEDELO 2650KM"); for RAIO/DISTRIBUIÇÃO tables it is the band.

**Why:** the company's "Tabelas DHL Fora do Padrão" screen
(DhlNonCompliantTables.tsx) is built to push every DHL table into this compliant
state so the auto-engine can suggest them. `__AUTO_MASTER__*` rows are engine
config and must be excluded from any bulk rename.

**How to apply:** appending ` ${franchise_km}KM` to non-compliant DHL SUPPLY
CHAIN operation_type names makes them valid and disambiguates duplicate RAIO/
DISTRIBUIÇÃO names. Approved missions keep frozen snapshots, so renames don't
touch historical financials.
