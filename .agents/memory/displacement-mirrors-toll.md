---
name: Deslocamento Aprovado (Cobrado) espelha o Pedágio
description: O campo displacement_value/_provider é aditivo e espelha 100% o toll_value em todo o app
---

Regra: o "Deslocamento Aprovado (Cobrado)" é um encargo ADITIVO pass-through que espelha
exatamente o pedágio (toll). NÃO é serviço.

- Colunas: `displacement_value` (cliente), `displacement_value_provider` (fornecedor, SEM
  fallback p/ o valor do cliente — diferente do padrão do toll; NULL -> 0 em todo lugar).
  O deslocamento é cobrança do FATURAMENTO CLIENTE; fornecedor só recebe se digitado.
- Total cliente   = `revenue_value + toll_value + displacement_value`.
- Total fornecedor = `cost_value + toll_value_provider + displacement_value_provider`.
- `revenue_value`/`cost_value` permanecem SÓ serviço; deslocamento entra por fora, igual pedágio.
- Número grande do MissionFinancialModal = `serviceTotal + toll + displacement` (estende a regra
  do "número grande acompanha a memória de cálculo": some o deslocamento editável junto do toll).

**Why:** o usuário pediu para o deslocamento entrar no VALOR FINAL e em TODOS os relatórios,
espelhando 100% o toll. Tratar como aditivo (não como parte do serviço) evita recalcular
revenue/cost e mantém o snapshot financeiro imutável consistente.

Auto-cobrança do KM DHL autorizado: o campo `dhl_deslocamento_km` (Atualizar Missão) alimenta
automaticamente o deslocamento SÓ do lado do cliente = km × R$/km excedente da tabela aplicada.
Fornecedor NUNCA é preenchido automaticamente (nem espelhado ao digitar o do cliente) — é manual,
só se o fornecedor cobrar. Autofill roda quando: não travado/aprovado, não salvando e deslocamento
atual == 0 — inclusive com override manual salvo (nesse caso soma o valor direto no número grande,
porque o sync automático não roda em modo manual). OS travada: destravar dispara o autofill.
ARMADILHA: tabelas DHL fixas (ex: SUL - RAIO SC 200KM) têm `price_per_extra_km = 0` — nesse
caso a taxa do cliente cai no fallback FIXO por UF de origem (regra AA do boletim: SC/RS = 7,35;
demais = 6,90), guardado por cliente DHL. Sem esse fallback o cálculo dá 0 e nada aparece.

**How to apply:** ao tocar qualquer soma/relatório que já trata `toll_value`, adicione o
deslocamento na MESMA expressão (mesmo Math.max(0,...)), MAS no lado fornecedor use SEMPRE
`displacement_value_provider || 0` — nunca reintroduzir fallback p/ o do cliente. Exceção:
cálculos de MARGEM (MissionTable: rev-cost service-only) NÃO incluem toll — então também NÃO
incluem deslocamento. A planilha "PREENCHER PLANILHA (SE)" tem coluna VALOR DESLOCAMENTO que é
KM-fórmula de auditoria (conceito distinto) — não confundir com o encargo manual. No
RELATORIO_DHL_FATURAMENTO o deslocamento vai na coluna VALOR DESLOCAMENTO via `r.displacementVal`
para a linha reconciliar com o TOTAL FORNECEDOR.
