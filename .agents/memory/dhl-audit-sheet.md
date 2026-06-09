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
- HORA INÍCIO (col U) = ALWAYS the AGENDAMENTO (`m.start_time`), never the real "Em
  Viagem" time. Consequence: W/Y (HORA TOTAL/EXCEDENTE, `=V-U` in the sheet) count from
  agendamento → fim real (aligned with how the hour franchise is billed). User chose this.
- HORA FINAL (col V) = real time of the TERMINAL status (Concluída/Cancelada/Pendente).
- RAIO missions (col E e.g. "RAIO SP 200 KM", radius ∈ {100..500}): **REGRA ATUAL (inverteu
  a antiga "segue raio declarado"): SEMPRE calcular P-O primeiro.** `kmRealRaio = max(0,
  km_final - km_inicio)`. Se houve RODAGEM real (`kmRealRaio > 0`, não cancelada) o raio
  DECLARADO é IGNORADO e a faixa vem do km real: `effectiveRaioKm = computeDhlBand(kmRealRaio)`
  (1-150→100, 151-250→200, 251-350→300, ...). Essa faixa dirige a TABELA APLICADA (AO,
  `selectDhlClientTable(..., effectiveRaioKm, ...)`) e a FRANQUIA (R). KM TOTAL (Q) passa a
  ser o km REAL (kmTotalOverride=undefined → fórmula Excel `=P-O`), e o excedente
  (`=IF(Q-R<0,0,Q-R)`) sai natural. Ex.: raio 200 rodando 53 → tabela/franquia 100, Q=53,
  exc 0 (automatiza a correção que antes era feita à mão); raio 200 rodando 220 → 200, exc 20;
  raio 300 rodando 301-350 → 300. Sem rodagem (`kmRealRaio===0`: cancelada OU km não
  registrado) MANTÉM o raio declarado (Q = raioKm, franquia = raioKm) como antes.
  **EXCEPTION (manual override beats tudo):** troca MANUAL no seletor do modal (adjNewer:
  BillingAdjustment mais novo que o snapshot) resolve PRIMEIRO e vence até a faixa do km
  real — AO, franquia/excedente/ativação e `franchiseKm` seguem a tabela escolhida pela
  diretoria. Ordem: 1) adjNewer→resolveLive(adj); 2) faixa do km real / raio (se sem
  override manual); 3) snapshot/adjust frozen; 4) route engine; 5) financial fallback.
  `franchiseKm = (effectiveRaioKm>0 && !adjNewer) ? effectiveRaioKm : usedTable.franchise_km`.
  **Removida** a marcação "fora do normal" (raio declarado ≠ franquia → linha vermelha +
  célula amarela): com a faixa auto vinda do km real ela dispararia à toa. Mantida só a
  vermelha de `noAppliedTable` (OS sem tabela aplicada).
- Whole-row RED = OS for which NO DHL price table could be resolved at all. Final criterion:
  `noAppliedTable = !usedTable` (after exhausting snapshot/adjust → route engine → financial
  fallback). RAIO normalmente NÃO fica vermelho, mas PODE: como a faixa agora vem do km real,
  se `computeDhlBand(kmReal)` cair numa banda sem tabela RAIO cadastrada (ex.: > 500km),
  `usedTable=null` → vermelho (correto, p/ revisão). Do NOT key the red on snapshot/adjust EXISTENCE (`!snapInfo
  && !adjInfo`) — that wrongly reds correct rows whose AO came from the route/financial
  fallback (no approval logs but a real DHL table). Do NOT key on "id present in
  fillPriceTables" either — approved OS use a synthetic frozen table with no id and would
  wrongly go red. `!usedTable` = "nem tem no grupo DHL". Export paints cols 1..42 last so it
  overrides the blank-cell blue and the always-red columns.
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
- **Recorte por período (FILL):** as OS são buscadas por `dhl_se_number` em QUALQUER data
  (a planilha enviada define o conjunto de SEs), mas DEPOIS o resultado é filtrado pelo
  período escolhido (`startDate`/`endDate`): mantém só OS com `start_time` OU
  `billing_period_override` (inclusão manual) dentro do intervalo — mesmo recorte do
  boletim (`rowsData`). **Why:** SEs reaproveitadas / OS em andamento de períodos
  anteriores entravam e saíam vermelhas (sem tabela). Sem período definido não filtra.
- Cancelled before departure (no "Em Viagem" event) = início = fim = 0h.
- **CANCELADA / CANCELAMENTO SOLICITADO (coluna D) = MÍNIMO da tabela 100km da região.**
  Um único predicado `isCancelledRow = /CANCEL/.test(canceladaVal)` (canceladaVal =
  situação importada OU status do sistema) governa TUDO, calculado logo após carregar
  `imp`. Para cancelada: KM TOTAL (Q) = 0 (`kmTotalOverride=0`), PEDÁGIO (AF) = 0,
  km início/fim = 0, e `rowEnd = rowStart` (duração 0 → HORA EXCEDENTE AB = 0 SEMPRE,
  inclusive quando saiu "Em Viagem" e foi cancelada depois — isso SUBSTITUI a antiga
  regra de "somar horas reais"). FRANQUIA TABELA (AE) = `activation_fee` da tabela
  100km da região via `selectDhlClientTable(..., 100, {clientName})`; fallback para o
  activation_fee da tabela aplicada se a região não for detectada. Resultado: como
  AB=AC=AD=AF=0, `AG = SUM(AB:AF)` colapsa em AE = preço mínimo 100km. O export precisa
  aceitar `kmTotalOverride === 0` (condição `typeof === 'number'`, NÃO `> 0`) senão Q
  volta para a fórmula `=P-O`. **Why:** OS cancelada cobra o mínimo contratual da
  região, independente de KM/horas reais (regra do cliente).

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
