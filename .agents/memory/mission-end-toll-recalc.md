---
name: Mission-end toll auto-recalc
description: How/why the Finalization Checklist auto-recalculates and persists toll on completion
---

# Recálculo automático de pedágio ao concluir OS

Ao concluir uma OS (Checklist de Finalização em `UpdateMissionModal.tsx`,
`handleFinalizeConfirmed`), o pedágio é recalculado via `/api/toll/qualp`
(origem/destino reais, axis=2) e salvo direto em `toll_value` +
`toll_value_provider` (`is_same_os ? 0 : valor`), SEM pedir confirmação manual.
Em sucesso, seta `tollConfirmedRef=true` para pular o gate manual de pedágio;
em falha, deixa o gate manual ativo (fallback para o usuário responsável).

**Why:** pedágio é o único valor financeiro que o frontend ainda recalcula
(regra de ouro permite por ser recalculável/salvo); o resto vem do banco.
A guarda `billing_approved` existe em DOIS lugares — no cliente
(`!mission.billing_approved`) e no próprio UPDATE (`.eq('billing_approved', false)`)
— para que o snapshot financeiro de OS aprovada NUNCA seja tocado, inclusive
sob aprovação concorrente.

**How to apply:** o fluxo segue de propósito o mesmo padrão do gate manual
de pedágio (persistir toll → depois `resume()` do submit que muda o status).
Não é atômico (toll grava antes do save final de status); manter consistente
entre os dois fluxos. Se for tornar atômico, fazer no backend para ambos.
