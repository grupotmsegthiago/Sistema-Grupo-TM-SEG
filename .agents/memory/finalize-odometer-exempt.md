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
