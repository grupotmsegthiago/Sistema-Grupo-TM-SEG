---
name: Finalize gate stale-closure (status)
description: Why concluding/cancelling an OS needs pendingFinalizeStatusRef, and why it must share lifetime with finalizeConfirmedRef
---

# Finalize gate: resumed submit sees a stale editData.status

The finalize flow (UpdateMissionModal) opens a checklist gate, stores a
`resumeSubmitRef` closure, and only later calls `handleUpdateSubmit` via
`resume()`. That closure captures `handleUpdateSubmit` (and its `editData`)
from the render at gate-open time. In `handleStatusButton` the status button
does `setEditData({status})` AND builds the resume closure in the same render,
so on resume `finalStatus = editData.status` is the PRE-update value
(e.g. "Em Viagem").

**Why it bit only odometer-exempt providers:** for non-exempt providers the
auto-complete branch (`!exemptOdo && isInFlight && hasStart && hasEnd ->
COMPLETED`) silently fixed the stale status. Exempt providers (TM SEG / ATIVA)
skip that branch, so the OS saved end_time/location but status never flipped to
Concluída ("antes não estava assim" = exposed by the exemption feature).

**Fix / rule:** carry the operator's chosen finalize status in
`pendingFinalizeStatusRef` (set in BOTH gates — handleStatusButton and the
in-submit finalize gate), and override `finalStatus` with it whenever
`finalizeConfirmedRef.current` is true. Do NOT try to derive the intended
status from `editData.status` on a resumed submit, and do NOT distinguish
complete-vs-cancel from `editData.status` (it can be stale).

**How to apply:** `pendingFinalizeStatusRef` MUST have the exact same lifetime
as `finalizeConfirmedRef` — set on the resume gates, reset only in the modal
reset useEffect and `handleFinalizeCancelled`. Never reset it in the submit
`finally`: a single finalization can chain multiple `handleUpdateSubmit`
invocations (finalize gate -> toll gate, each returns then resumes), and a
finally reset would clear the intended status between invocations.
