---
name: OS price/cost table swap (per-OS)
description: How swapping a single OS's client price table / provider cost table works end-to-end in MissionFinancialModal, and why no per-screen realtime is needed.
---

Trocar a tabela de preço (cliente) ou custo (fornecedor) de UMA OS:
- Definir `manualClientTableId` / `manualProviderTableId` é o gatilho. O effect de params (deps nesses ids) reseta `dbValuesLoadedRef`/`userManuallyEditedRef`, e o effect de autofill então sincroniza `revenueInput`/`costInput` para o total da nova tabela. Por isso a troca precisa acontecer num render ANTES de salvar (UI de 2 cliques: selecionar tabela, depois "Aplicar e Salvar").
- Salvar deve usar o caminho canônico `handleUpdate(false)` (o "Salvar Ajustes"), NÃO um update solto. Ele persiste `revenue_value`/`cost_value`/`toll_value` E grava `clientTableId`/`providerTableId` em system_logs (BillingAdjustment), que o `loadData` recupera no reload — sem isso a escolha de tabela não sobrevive ao recarregar.

**Why:** Como a troca de tabela mantém `userManuallyEditedRef=false` e o autofill faz `revenueInput == financialData.client.total`, o `handleUpdate` não dispara `revDivergent`/`costDivergent`, então NÃO exige "motivo" — é tratado como recálculo automático, não edição manual.

**How to apply:** NÃO criar `.on('postgres_changes')` por tela para refletir a troca. O `RealtimeProvider` (canal único `global-realtime-sync`) já cobre `missions` → dispara `refreshMissions` + invalida `['missions']`, então financeiro/diário/relatórios atualizam sem F5. Adicionar subscription nova duplicaria o canal (gotcha conhecido).
