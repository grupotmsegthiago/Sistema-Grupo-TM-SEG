---
name: Fixed-distance/hours tables vs manual excess overrides
description: Why a manual km/hour excess price in EDIÇÃO TOTAL must disable the fixed-distance/fixed-hours cap.
---

In `lib/financialUtils.ts`, price tables named like "100KM"/"200KM" (and "02H"/
"02 HORAS") with NO excess price in the table are treated as FIXED rules:
`isFixedDistanceClientRule` / `isFixedHoursClientRule` (and provider analogs)
cap `distanceForCalculation`/`durationHours` at the franchise, so the excess is
forced to 0 — the table is "all-inclusive up to the franchise".

**The rule:** the "has extra price" flags (`clientHasExtraKmPrice`,
`clientHasExtraHrPrice`, `providerHasExtraKmCost`, `providerHasExtraHrCost`)
must count BOTH the table's own price AND a positive manual override from
`manualTableOverrides` (`customClientUnitKm/Hour`, `customProviderUnitKm/Hour`).

**Why:** when the director sets an excess unit price in EDIÇÃO TOTAL, the intent
is to charge the excess. If the flag reads only the original table value (0),
the fixed cap stays on and the excess stays R$ 0,00 even though a unit price was
entered — the classic symptom is "hour extra charged but km extra not" (because
the table happened to have an hour price but no km price).

**How to apply:** any new fixed-rule gate here must OR-in the matching manual
override (`> 0`). Without an override the behavior is byte-identical to before,
so this never affects normal fixed-table missions.
