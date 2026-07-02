---
name: Deslocamento Aprovado (Cobrado) espelha o Pedágio
description: O campo displacement_value/_provider é aditivo e espelha 100% o toll_value em todo o app
---

Regra: o "Deslocamento Aprovado (Cobrado)" é um encargo ADITIVO pass-through que espelha
exatamente o pedágio (toll). NÃO é serviço.

- Colunas: `displacement_value` (cliente), `displacement_value_provider` (fornecedor, com
  fallback p/ `displacement_value` — mesmo padrão de `toll_value_provider`). NULL -> 0.
- Total cliente   = `revenue_value + toll_value + displacement_value`.
- Total fornecedor = `cost_value + toll_value_provider + displacement_value_provider`.
- `revenue_value`/`cost_value` permanecem SÓ serviço; deslocamento entra por fora, igual pedágio.
- Número grande do MissionFinancialModal = `serviceTotal + toll + displacement` (estende a regra
  do "número grande acompanha a memória de cálculo": some o deslocamento editável junto do toll).

**Why:** o usuário pediu para o deslocamento entrar no VALOR FINAL e em TODOS os relatórios,
espelhando 100% o toll. Tratar como aditivo (não como parte do serviço) evita recalcular
revenue/cost e mantém o snapshot financeiro imutável consistente.

Auto-cobrança do KM DHL autorizado: o campo `dhl_deslocamento_km` (Atualizar Missão) alimenta
automaticamente o deslocamento no modal financeiro — cliente = km × R$/km excedente da tabela
aplicada (`financialData.client.unitPriceKm`), fornecedor = km × `provider.unitCostKm` (0 se
MESMA OS). Autofill silencioso SÓ quando: não travado/aprovado, sem override manual
(`userManuallyEditedRef`) e deslocamento atual == 0. Caso contrário, exibe só a sugestão
"KM DHL AUTORIZADO" com botão APLICAR (habilitado após destravar). Nunca reescreve valor salvo.
ARMADILHA: tabelas DHL fixas (ex: SUL - RAIO SC 200KM) têm `price_per_extra_km = 0` — nesse
caso a taxa do cliente cai no fallback FIXO por UF de origem (regra AA do boletim: SC/RS = 7,35;
demais = 6,90), guardado por cliente DHL. Sem esse fallback o cálculo dá 0 e nada aparece.

**How to apply:** ao tocar qualquer soma/relatório que já trata `toll_value`, adicione o
deslocamento na MESMA expressão (mesmo Math.max(0,...) e mesmo fallback provider). Exceção:
cálculos de MARGEM (MissionTable: rev-cost service-only) NÃO incluem toll — então também NÃO
incluem deslocamento. A planilha "PREENCHER PLANILHA (SE)" tem coluna VALOR DESLOCAMENTO que é
KM-fórmula de auditoria (conceito distinto) — não confundir com o encargo manual. No
RELATORIO_DHL_FATURAMENTO o deslocamento vai na coluna VALOR DESLOCAMENTO via `r.displacementVal`
para a linha reconciliar com o TOTAL FORNECEDOR.
