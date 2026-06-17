---
name: Finalize odometer exemption (ATIVA / TM SEG)
description: Quais fornecedores dispensam o print do hodômetro ao concluir a OS e por quê
---

# Dispensa do hodômetro na conclusão (KM final + print)

Política: ao CONCLUIR (ou CANCELAR) uma OS dos fornecedores **ATIVA** e
**TM SEG / TM SEGURANÇA**, o FinalizeChecklistDialog vira PASSA-LIVRE — pula
TODO o checklist de auditoria (endereço, raio, cidades, KM final, print do
hodômetro/IA). A única exigência é a data/hora de fim (na conclusão) ou
data/hora + fim de viagem (no cancelamento). É a "regra antiga" de fechamento.
Todos os demais fornecedores continuam OBRIGADOS ao checklist completo: endereço
+ cidades + raio + KM final + print + auditoria IA (controle anti-fraude do KM).

Match do fornecedor: helper module-level `isOdometerExemptProvider(name)` —
palavra inteira para ATIVA (evitar falso positivo tipo COOPERATIVA); TM SEG/TM
SECURITY por string normalizada sem espaços (TMSEG/TMSECURITY).

Isentos NÃO auto-concluem ao salvar: a "IA Operacional" promovia in-flight/
pending para COMPLETED quando `hasStart && hasEnd`. Para isentos, `hasEnd` é só
data/hora (KM não exigido), então QUALQUER atualização de OS ATIVA/TM SEG em
trânsito disparava o dialog de finalização ("não consigo atualizar"). Correção:
guardar a auto-inferência de conclusão com `!exemptOdo` nos 3 pontos do
`handleUpdateSubmit` (gate de finalização, gate de pedágio, resolução de
finalStatus). Para isentos o processo de finalizar/cancelar SÓ dispara via
seleção EXPLÍCITA de CONCLUÍDA/CANCELADA (handleStatusButton). Não-isentos
seguem auto-concluindo ao preencher KM final + datas (KM é o sinal deliberado).

IA do hodômetro NUNCA trava (todos os fornecedores): a conferência por IA do
print é só AUXÍLIO informativo. Para concluir, basta anexar o print (prova do
KM) — falha de IA ou "divergência" NÃO bloqueiam. A IA falhava em fotos
escuras/embaçadas e travava o fechamento por completo. `odometerOk = print
anexado` (não exige `odoValidForKm`); o gate de IA/divergência foi removido do
`handleConfirm`. Demais validações não-IA seguem: KM final + ciência de tabela
quando o KM rodado não bate. Não reintroduzir gate de validação por IA.

Armadilha: a isenção precisa ser aplicada de forma CONSISTENTE em TODOS os
pontos que derivam "tem fim?" / liberam a conclusão — o gate de progresso do
checklist, a validação do dialog, os gates de finalização e de pedágio do submit
e o cálculo de status final. Se algum ponto continuar exigindo KM, a OS ou trava
(botão desabilitado) ou cai de COMPLETED para PENDENTE. A regra padrão é
`isento ? true : (kmFim>0 && kmFim>=kmIni)`, mantendo apenas data/hora de fim.

Atalho operacional: clicar nos botões de status CONCLUÍDA/CANCELADA de uma OS
ativa (não aprovada, não já concluída/cancelada) abre o checklist de
finalização DIRETO e, ao confirmar, persiste a OS automaticamente com os campos
da tela. OS aprovada/já finalizada cai no fluxo normal (só seleciona o status).

**Why:** ATIVA e TM SEG só enviam KM final/print depois da missão, então exigir
no momento da conclusão travaria o fechamento. Os demais mandam na hora, então
KM + print continuam sendo a prova. Snapshot de OS aprovada é imutável e nunca
é tocado por este fluxo (`!mission.billing_approved`).

**How to apply:** para adicionar/remover fornecedor da exceção, ajustar
`isOdometerExemptProvider`. NUNCA afrouxar para fornecedores fora da lista — é
exceção operacional pontual, não a regra geral.
