---
name: Alerta OS sem Tabela
description: Regra de quem é forçado a tratar OS sem tabela e por que a detecção não pode depender só de allMissions.
---

# Alerta "OS sem Tabela"

Recurso já existente: `MissingTableDialog` + `computeMissingTableRows` (detecta via `calculateMissionFinancials` → `!hasClientTable`/`!hasProviderTable`). NÃO recriar; ampliar.

## Decisões duráveis

- **Quem é forçado:** ADMINISTRADOR e AVANÇADO (papéis `administrador`/`avançado`/`avancado`) e acesso total (`permissions` inclui `'*'`). O `'*'` é tratado como admin-equivalente em todo o codebase, por isso entra junto.
  - **Why:** a diretoria pediu que esses perfis sejam OBRIGADOS a selecionar a tabela; o alerta auto-abre uma vez por montagem (reaparece a cada refresh de tela) enquanto houver pendência.
- **Piso fixo de Maio/2026:** só cobra OS de 01/05/2026 em diante (OS anteriores ficam grandfathered).
- **A detecção NÃO pode depender só de `allMissions`.**
  - **Why:** o MissionTable carrega por período ∪ conjunto OPEN global. OS terminais não-aprovadas fora do período (ex.: Canceladas) NÃO entram no OPEN set e ficariam de fora, violando "TODAS as OS".
  - **How to apply:** manter um fetch dedicado ao banco (start_time/created_at >= piso E `billing_approved != true`, paginado) e computar sobre a UNIÃO deduplicada com `allMissions` (allMissions tem prioridade por ser mais fresco/realtime). Refazer o fetch dedicado após salvar no modal financeiro.
