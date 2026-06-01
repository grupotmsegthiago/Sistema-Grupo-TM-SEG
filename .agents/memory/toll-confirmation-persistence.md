---
name: Toll (pedágio) confirmation persistence
description: Confirming a toll must persist toll_value to the DB, not only write the audit log + local state
---

# Toll confirmation must persist toll_value to the missions table

The "PEDÁGIO PENDENTE DE CONFIRMAÇÃO" banner treats an OS as resolved when
either `toll_value` is non-null **or** a `TOLL_CONFIRMATION` row exists in
`system_logs`. `TollConfirmationDialog` writes that audit log on confirm and
then calls its `onConfirm` callback.

**The trap:** in the financial modal, `onConfirm` (applyTollConfirmation) only
updated local React state and relied on the separate "Salvar Ajustes"/approve
flow to write `toll_value`. So confirming a toll removed the OS from the banner
(log existed) but the value was lost on reopen if the user never ran the full
save. The confirmation flow itself must persist `toll_value` (and
`toll_value_provider`) directly to the `missions` table.

**Why:** users expect "confirmar pedágio" to save the toll; the audit-log-only
path silently dropped it. `UpdateMissionModal` already persisted toll directly,
so the financial modal was the inconsistent one.

**How to apply:** any toll-confirmation entry point should write `toll_value`
to the DB at confirm time, throw on failure (so the dialog surfaces the error
and stays open), and dispatch `refreshMissions`.

## Additive financial model (critical)

`missions.revenue_value` and `cost_value` store **service-only** amounts; toll
is stored separately in `toll_value` / `toll_value_provider`. Totals are
`revenue_value + toll_value` (client) and `cost_value + toll_value_provider`
(provider). Therefore persisting toll alone is consistent — never fold toll
into revenue/cost. Use `is_same_os === true` => provider toll = 0 (mirrors the
main save payload).
