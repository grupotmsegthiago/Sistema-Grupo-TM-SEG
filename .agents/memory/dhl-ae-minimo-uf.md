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

# Coluna AA (VLR KM EXCEDENTE TABELADO) — valor fixo por UF, espelha AE

Mesma regra de UF de ORIGEM, em reais/km: **SC ou RS → R$ 7,35 ; demais UFs →
R$ 6,90** (`dhlUnitKmExcedente` no fill da planilha, gravado em
`vlrKmExcedenteTab`). É valor FIXO, vale SEMPRE — inclusive em linha vermelha
(sem tabela aplicada) ou tabela fixa sem excedente cadastrado. NÃO usar mais a
"moda" dos `price_per_extra_km` das tabelas do cliente (lógica antiga removida)
nem o `unitKm` da tabela aplicada.

**Why:** os valores 6,90/7,35 são exatamente AE/100 (690/735); a diretoria quer
o KM excedente alinhado por região igual ao mínimo. SUL = SC/RS (mesma definição
da AE, não a região geográfica inteira — PR NÃO entra, salvo pedido explícito).

**How to apply:** AA alimenta as fórmulas do Excel `AC = S*AA` (total KM
excedido) e `AD = T*AA` (deslocamento) no export; logo, corrigir AA já corrige
esses totais. Se mudarem a definição de SUL (incluir PR) ou os valores, mexer
nas DUAS constantes (`dhlMinFranquia` e `dhlUnitKmExcedente`) em lockstep.
