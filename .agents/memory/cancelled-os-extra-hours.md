---
name: Cobrança de excedente (KM e horas) em OS CANCELADA
description: Por que OS cancelada pode não cobrar excedente e o que alimenta o motor
---

# Excedente (KM e horas) em OS CANCELADA

Regra de negócio (confirmada pela diretoria): OS cancelada que **chegou na origem**
cobra a tabela mínima (100/110 KM) com a franquia de horas embutida na base; se o
cancelamento ocorreu **depois** da franquia (ex.: 3h), cobra-se a(s) hora(s)
excedente(s).

**KM excedente em cancelada-EXECUTADA:** se a OS foi de fato executada — hodômetro
com rodagem real (`end_km > start_km`, i.e. `hasValidKms && realTraveledKm > 0`) — o
KM rodado conta e o excedente acima da franquia É cobrado normalmente (cliente E
fornecedor). A pessoa rodou mais que o combinado, tem que receber. Sem rodagem real
(cancelada antes de executar) o KM segue zerado e cobra-se só a base. No motor:
`distanceForCalculation` usa `realTraveledKm` quando `isCancelled` com hodômetro
válido; e o bloco `cancelledBeforeExecution` só zera `cExcessKm/pExcessKm` quando NÃO
houve execução (`cancelledExecuted`). As horas, nesse ramo "antes", continuam zeradas
de propósito (ver abaixo).

O motor (`lib/financialUtils.ts`) só cobra essas horas quando recebe o **horário do
cancelamento** em `mission._cancelStatusAt`. Esse timestamp NÃO está nas colunas de
`missions`; vem de `mission_history` (linha `field_name='status'` com `new_value`
contendo "cancel", pega-se o `changed_at` mais recente). Sem `_cancelStatusAt`, o
motor classifica como "cancelada antes da execução" (`cancelledBeforeExecution=true`)
e **zera KM e horas**, cobrando só a base.

**Why:** o enriquecimento de `_cancelStatusAt` historicamente só existia no Boletim
(`ClientBillingReport`). A rota automática de recálculo ao cancelar e o
`MissionFinancialModal` chamavam o motor sem esse campo, então toda OS cancelada
depois da franquia era subfaturada (só base) — inclusive a rota
`/api/missions/:id/recalc-on-cancel`, que grava o valor no momento do cancelamento.

**How to apply:** qualquer caller que calcule/salve financeiro de OS cancelada DEVE
buscar o cancel time em `mission_history` e passar `_cancelStatusAt`. O motor usa
duração = `cancelStatusAt − agendamento` (start_time), truncada ao minuto, NÃO o
end_time administrativo. OS já APROVADA tem snapshot imutável: corrigir exige update
manual de `revenue_value`/`cost_value` + `snapshot_data` (hrExtraQtd/hrExtraTotal/
durationHours/...ServiceOnly/totalGeral) + log em `system_logs`.
