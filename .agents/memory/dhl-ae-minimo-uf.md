---
name: Boletim DHL — coluna AE (mínimo por UF)
description: Regra de negócio do valor mínimo da FRANQUIA TABELA (AE) na planilha de medição DHL
---

# Coluna AE (FRANQUIA TABELA) — mínimo fixo por UF

Na planilha de medição DHL (fluxo "PREENCHER PLANILHA" / `handleFillSheet`), a
coluna **AE = FRANQUIA TABELA** (a base/ativação da tabela, NÃO o total) usa um
**valor mínimo FIXO pela UF de ORIGEM** quando a OS é **cancelada** OU está na
**faixa de 100km**:

- UF de origem **SC ou RS → R$ 735,00**
- **demais UFs → R$ 690,00**
- Faixas maiores (200km+) mantêm a `activation_fee` da própria tabela aplicada.

**Why:** regra de negócio da diretoria — o acionamento mínimo no Sul (SC/RS) é
maior. Substitui a lógica antiga que derivava o mínimo de cancelada via
`selectDhlClientTable(...,100,...).activation_fee` da região da origem (que dava
valores por região do cadastro); agora o mínimo é fixo por UF, então outras
regiões que tivessem 100km ≠ 690 passam a 690.

**How to apply:** ao mexer no preenchimento da planilha DHL, "faixa de 100km" =
`franchiseKm <= 100` (já normalizado para o raio em OS de raio). AE é base
independente dos excedentes; AG = `SUM(AB:AF)` continua coerente (em cancelada Q
e pedágio AF já zeram, então AG colapsa em AE). Não confundir AE com o total.
