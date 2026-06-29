---
name: KM rodado = 0 na conclusão da OS
description: Por que "KM RODADO (REAL)" aparece 0 no finalize e qual a causa real (dado, não cálculo).
---

# "KM RODADO (REAL) = 0 km" na conclusão (FinalizeChecklistDialog)

Em OS baseadas em hodômetro, `start_km` e `end_km` são leituras do PAINEL (números
grandes, ex.: 97968). O KM rodado é `Math.max(0, end_km - start_km)` — clampado em 0.

**Causa real quando aparece 0 com KM final preenchido:** o KM final digitado é MENOR
que o `start_km` já gravado (hodômetro não anda para trás). Ex.: GTM-6036 tinha
start_km=97968 e o operador digitou 97021 → traveled clampa em 0. Não é bug de
cálculo; é dado (dígito faltando no final, ou start_km errado).

**Why:** o card mostrava só "0 km" sem explicar, e o operador interpretava como
"o sistema não identifica o KM rodado". Foi adicionado um aviso vermelho inline
quando `endKmNum < startKm` (data-testid warn-end-km-below-start) orientando a
conferir o painel ou ajustar o KM inicial no Financeiro.

**How to apply:** ao investigar "KM rodado errado/zero" numa OS, PRIMEIRO consultar
`start_km`/`end_km` no Supabase antes de mexer no engine. parseNumber('') = 0 (não NaN),
então start_km nulo daria traveled = end inteiro, NÃO 0 — 0 com final preenchido ⇒
end < start. Distinto da regra de KM fixa/franquia (essa é cobrança, não leitura).
