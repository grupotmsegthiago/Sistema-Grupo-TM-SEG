---
name: Disable fixed-KM-rule toggle
description: Per-OS toggle that recognizes full driven KM by removing the fixed-distance CAP without touching table selection.
---

# Reconhecer KM cheio (desligar regra de KM fixa)

`manualTableOverrides.disableFixedKmRule` (em `lib/financialUtils.ts`) desliga APENAS o
TETO de distância das regras de KM fixa, reconhecendo o KM cheio rodado e cobrando o
excedente acima da franquia nas tabelas JÁ aplicadas.

**Regra / o que toca e o que NÃO toca:**
- O engine tem DUAS camadas distintas de "regra de KM fixa":
  1. **SELEÇÃO de tabela soberana** (200km/ACOMPANHAMENTO escolhe uma tabela específica). NUNCA mexer — a flag preserva a tabela aplicada.
  2. **CAP de distância** (4 gates: cliente 200km, cliente franquia fixa, fornecedor 200km, fornecedor franquia fixa). A flag adiciona `&& !disableFixedKmRule` só nesses 4.
- Só afeta KM. As regras de HORAS fixas (02H) continuam intactas — pedido foi "KM completo".
- O excedente só é COBRADO de fato se a tabela aplicada tiver preço de KM excedente (`price_per_extra_km`/`cost_per_extra_km`) ou houver override manual `customClient/ProviderUnitKm` > 0. Sem preço de excedente, remover o cap não cobra nada (ver `fixed-table-manual-override.md`).
- `usedSpecialRule` (breakdown) suprime só a parte de distância quando a flag está ligada (mantém a parte de horas).

**Why:** OS com destino "Nkm DE ACOMPANHAMENTO" / tabela de franquia fixa capa a distância
na franquia, ignorando KM rodado a mais (ex.: GTM-5382, 1055km exec vs franquia ~1012/1000).
A diretoria precisa, caso a caso, reconhecer o KM cheio sem trocar a tabela soberana.

**How to apply / persistência:** estado por OS no modal; persiste no `system_logs`
`entity='BillingAdjustment'` keyed por `entity_id=mission.id` (NÃO na memória de rota
`BillingPattern`, que vazaria para todas as OS da mesma rota). Carrega no bloco de
restauração do BillingAdjustment, reseta em troca de OS. Passar a flag em TODAS as chamadas
de `calculateMissionFinancials` (memo + handleUpdate + recalc na troca de tabela) e nas deps
do memo, senão tela e save divergem. Só atua quando `lockAllowsRecalc` (EDIÇÃO TOTAL /
destravado) — snapshot de OS aprovada nunca é tocado.
