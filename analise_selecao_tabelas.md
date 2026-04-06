# Análise Completa — Seleção de Tabelas de Preço (Cliente) e Custo (Fornecedor)

Data: 06/04/2026

---

## 1. Estrutura das Tabelas no Supabase

### `client_price_tables`
```
id, client, operation_type, activation_fee, franchise_hours, franchise_km,
price_per_extra_km, price_per_extra_hour,
regional_costs?, previous_activation_fee?, previous_price_per_extra_km?,
previous_price_per_extra_hour?, adjustment_status?, last_adjustment_date?
```

### `provider_cost_tables`
```
id, provider, operation_type, activation_cost, franchise_hours, franchise_km,
cost_per_extra_km, cost_per_extra_hour, cancellation_fee?
```

---

## 2. Arquivo `lib/financialUtils.ts` — Visão Geral (1.102 linhas)

### Funções auxiliares
- **`safeNumber()`**: Parser numérico seguro (trata `,` e `.`)
- **`normalize()`**: Remove acentos e converte para maiúsculas
- **`UF_TO_REGION`**: Mapa UF → região (SUDESTE, SUL, etc.)
- **`extractUF()`**: Extrai a UF do endereço usando regex + dicionário de ~200 cidades
- **`extractCityFromAddress()`**: Extrai a cidade do endereço por parsing de vírgulas/traços
- **`identifyRegionFromText()`**: Identifica região a partir de texto livre

### Função central: `selectStrictTable()` (linhas 325-501)
Sistema de pontuação (score) que avalia cada tabela candidata.

### Função principal: `calculateMissionFinancials()` (linhas 232-1050)
Calcula receita (cliente) e custo (fornecedor) com regras especiais por cliente.

### Função de auditoria: `auditMissionFinancials()` (linhas 1061-1102)
Compara valores salvos na missão vs recalculados pela tabela — tolerância R$ 5,00.

---

## 3. Como o MissionFinancialModal Seleciona Tabelas

1. **Carrega dados em paralelo**:
   - `client_price_tables` filtradas por nome do cliente (`eq('client', clientName)`)
   - **TODAS** as `provider_cost_tables` (sem filtro na query)
   - Dados do cliente (`clients`)
   - Dados atualizados da missão (`missions`)

2. **Chama `calculateMissionFinancials()`** passando:
   - A missão
   - Tabelas do cliente
   - Tabelas de fornecedores
   - Dados do cliente
   - Eventuais overrides manuais (tableId, valores customizados)

3. **Exibe o resultado**: tabela selecionada, franquia, KM extra, hora extra, valores base

4. **Auditoria automática**: `auditMissionFinancials()` recalcula do zero e compara com valores salvos — se diferença > R$ 5, mostra alerta **"CÁLCULO FORA DA REGRA DE FRANQUIA"**

---

## 4. Lógica de Seleção — Sistema de Score

### Critérios de pontuação (do maior para o menor peso):

| Score | Critério | Descrição |
|-------|----------|-----------|
| +5000 | Código de Rota | `operation_type` contém o código da rota da missão |
| +5000 | Rota Exata | `operation_type` contém AMBAS as cidades (origem + destino) |
| +3000 | Agentes (Pronta Resposta) | Tabela de 02 agentes para missão com 2 agentes |
| +2500 | Tipo Operação | VELADA para missão velada, CARACTERIZADA para caracterizada |
| +2000 | Cidade Origem | `operation_type` contém a cidade de origem |
| +1500 | UF Específico MG/ES | Tabela específica para MG ou ES |
| +1200 | UF Genérico | Estado aparece no nome da tabela |
| +800 | Região | Região (SUDESTE, SUL, etc.) aparece no nome |
| +600 | Faixa KM (cobre) | Tabela com franquia ≥ distância da missão |
| +50 | Franquia OK | Franquia genérica ≥ distância |
| -300 | Faixa KM (não cobre) | Tabela com franquia < distância |
| -2000 | Agentes incompatíveis | Tabela de 01 agente para missão com 2 |
| -5000 | Tipo incompatível | Tabela VELADA para missão CARACTERIZADA (e vice-versa) |
| -5000 | Bloqueio EXCETO | Tabela com "EXCETO MG" para missão de MG |

### Desempate entre candidatos:
1. Remove tabelas com score < -1000
2. Ordena por score decrescente
3. Pega grupo dos melhores (score ≥ top - 20)
4. Se há tabelas com faixa KM no grupo → prefere a que cobre exatamente a distância (menor franquia possível)
5. Se não há faixa KM → prefere a que cobre a distância, senão a de maior franquia

---

## 5. Regras Especiais Hardcoded por Cliente

### CEVA Logística (Jundiaí)
- Se origem = Jundiaí e distância > 200km → busca tabela "LOGITECH 200KM"
- Se distância ≤ 200km → busca tabela "ESTADO DE SP" com franquia ≤ 100km

### CESLOG (Cubatão-Santos)
- Se rota = Cubatão ↔ Santos → busca tabela específica "CUBATAO SANTOS"
- Aplica mesma lógica para fornecedor

### Fornecedor Especial (ATIVA / TM SEG)
- Prioriza tabelas "PRONTA RESPOSTA"
- Diferencia 01 vs 02 agentes

### Fornecedor MACOR
- Filtra apenas tabelas do cliente que contêm "MACOR" no nome

---

## 6. Lógica de Franquia (KM fixo vs KM extra)

- Cada tabela tem `franchise_km` (ex: 100 km) e `franchise_hours` (ex: 3h)
- **Dentro da franquia**: valor = apenas `activation_fee` (base fixa)
- **Acima da franquia**: `base + (KM real - franquia) × preço_extra_km + (horas - franquia) × preço_extra_hora`
- **Tabelas de distância fixa** ("200KM", "LOGITECH" sem `price_per_extra_km`): distância é limitada à franquia — não cobra KM extra
- **Tabelas de hora fixa** ("02H", "02 HORAS" sem `price_per_extra_hour`): horas limitadas à franquia

---

## 7. Por que ocorre o alerta "CÁLCULO FORA DA REGRA DE FRANQUIA"

A função `auditMissionFinancials()` compara:
- **Valores salvos** na missão (`revenue_value + toll_value` e `cost_value + toll_value_provider`)
- **Valores recalculados** pela tabela atual

Se a diferença for > R$ 5,00 e o operador NÃO verificou manualmente (`billing_verified_by` vazio), o alerta aparece.

### Causas comuns:
1. Operador salvou valor manualmente diferente do calculado
2. Tabela de preço foi alterada depois que o valor foi salvo
3. O sistema selecionou tabela diferente na hora de auditar vs na hora de salvar
4. Override manual foi usado ao salvar mas a auditoria recalcula sem overrides
5. Dados da missão mudaram (KM, horas, agentes) depois do salvamento

### Exemplo da screenshot:
- Custo salvo: **R$ 1.297,11**
- Tabela oficial calcula: **R$ 329,53**
- Diferença: **R$ 967,58**
- Causa provável: valor salvo com tabela errada ou com KM extra indevido

---

## 8. Por que o sistema pode selecionar a tabela errada

1. **Nomes ambíguos**: O sistema depende de palavras no `operation_type`. Nomes vagos geram scores imprecisos
2. **Desempate frágil**: Tabelas com score similar são diferenciadas por franquia, não por adequação real
3. **Otimização de menor custo (fornecedor)**: Após selecionar por score, troca pela mais barata — pode ser inadequada para a rota
4. **Distância de referência mista**: Usa `Math.max(totalDistance, distanceForCalculation)` — mistura KM previsto com KM real
5. **Normalização parcial**: Matching por texto pode falhar com variações de nome
6. **Sem campos estruturados**: Não há campos `origin`/`destination` nas tabelas — depende de parse do `operation_type`

---

## 9. Pontos de Melhoria Identificados

### Críticos (impacto direto nos cálculos)

1. **Score de faixa KM não prioriza a faixa mais próxima** — "até 100km" para missão de 95km deveria ganhar mais que "até 200km", mas o bônus é +600 para ambas (com desconto mínimo de `excess × 0.5`, máx 200 pts)

2. **`franchise_km` default de 100** (linha 850) — quando a tabela não define franquia, assume 100km. Tabelas com franquia 0 serão calculadas como 100km

3. **Otimização de "menor custo" para fornecedor** (linhas 746-817) — troca a tabela selecionada por score pela de menor custo total, o que pode ser comercialmente incorreto

4. **Auditoria ignora overrides** — `auditMissionFinancials()` recalcula sem considerar que o operador pode ter usado tabela manual ou valores customizados legítimos

5. **`provider_cost_tables` carrega TODAS** na query (sem filtro por fornecedor) — filtra depois no JS por nome normalizado, causando ineficiência e possíveis erros de matching

### Importantes (manutenção e escalabilidade)

6. **Regras hardcoded por cliente** (CEVA, CESLOG, VTC, IBL, MACOR) — qualquer mudança operacional exige alteração no código-fonte

7. **Sem campos `origin`/`destination` nas tabelas de preço** — seleção depende de parse textual do campo `operation_type`

8. **Sem cache de seleções validadas** — se o operador corrige manualmente e salva, o sistema pode sobrescrever na próxima recalculada

9. **Regra "200km → table 100km fallback"** (linhas 819-833) — pode forçar troca indevida para missões com ~200km exatos

10. **Falta log estruturado da seleção** — o `detectionLog` é uma string livre, difícil de auditar sistematicamente

---

## 10. Fluxo Visual Resumido

```
Missão criada
    │
    ▼
Extrai: origem (UF, cidade, região), destino (cidade), tipo (Velada/Caracterizada)
    │
    ▼
Filtra tabelas do cliente por nome normalizado
    │
    ▼
Aplica regras especiais (CEVA, CESLOG, MACOR)
    │
    ▼
selectStrictTable() → sistema de score
    │
    ├── Score > 0 → Seleciona melhor candidata
    │       │
    │       ▼
    │   Faixa KM? → Prefere a que cobre exatamente
    │
    └── Score < -1000 → Sem tabela (Bloqueio Regional)
    │
    ▼
Calcula: base + extra_km + extra_hora + pedágio
    │
    ▼
auditMissionFinancials() → Compara salvo vs calculado
    │
    ├── Diferença ≤ R$ 5 → OK
    └── Diferença > R$ 5 → Alerta "FORA DA REGRA DE FRANQUIA"
```
