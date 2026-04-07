# DOCUMENTACAO DE ALTERACOES - TMSEGo
### Diario de Bordo Oficial — Evolucao do Sistema

---

## 07/04/2026 14:30 - SINCRONIZACAO DE CALCULOS REAIS VS EXIBIDOS (PARTE 1)

**Descricao:** Thiago identificou que os campos de Valor Final Cliente (R$ 9.345,00) e Pagamento Fornecedor (R$ 4.561,42) nao refletiam a soma real dos itens do breakdown (Base + KM + Hora + Pedagio), permanecendo fixos com valores antigos gravados no banco de dados.

### 1. Campos Implementados / UI

- **Card "Valor Final Cliente (Servico + Pedagio)"** — Fundo verde (`bg-green-50`), borda verde, input editavel para Diretoria/Administrador
  - Breakdown em vermelho/ambar quando divergente: Base (verde) + KM (verde) + Hora (verde) + Pedagio (verde) = Total
  - Indicador ambar (`text-amber-700 bg-amber-50/80 border-amber-300`) quando valor do input diverge do calculo
  - Indicador verde (`text-green-600 bg-green-100/60 border-green-200`) quando valores batem
- **Card "Pagamento Fornecedor (Tabela + Pedagio)"** — Fundo azul (`bg-blue-50`), borda azul, mesma logica de divergencia ambar/azul
  - Icone de cadeado azul (`Lock`) quando verificado pelo controller
  - Badge "VERIFICADO PELO CONTROLLER" (`bg-blue-100 border-blue-300`) com icone `ShieldCheck`
- **Botao "Recalcular"** — Icone `RefreshCw` (10px), texto verde/azul conforme lado (cliente/fornecedor), reseta para calculo da tabela

### 2. Comportamento e Logica

- **CAUSA RAIZ:** Na inicializacao do modal (carga de dados salvos), `userManuallyEditedRef.current` era setado como `true` apenas porque existiam valores salvos no banco. Isso bloqueava TODA sincronizacao automatica futura do useEffect
- **Correcao:** Removido `userManuallyEditedRef.current = true` do bloco de inicializacao. O ref agora so e setado `true` quando o usuario realmente **digita manualmente** no campo de input (onChange)
- **useEffect de sincronizacao:** Condicao simplificada para `shouldSync = !isSavingRef.current && !isVendorLocked && !userManuallyEditedRef.current`. Sempre que shouldSync e verdadeiro, os inputs sao atualizados com o calculo em tempo real
- **Desbloqueio ao trocar tabela:** Ao mudar tabela via select (cliente ou fornecedor) ou via sugestao IA (botao "Aplicar"), `userManuallyEditedRef.current` e resetado para `false`, permitindo nova sincronizacao
- **Protecao de edicao manual:** Se o diretor digita um valor no input, `userManuallyEditedRef.current = true` e `setUseSavedValues(true)` sao acionados, travando a sincronizacao automatica

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Campos afetados na leitura: `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `billing_approved`, `verified_by`, `verified_at`, `billing_verified_by`

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linha ~586: Removido `userManuallyEditedRef.current = true` da inicializacao
  - Linha ~588: Adicionado `setUseSavedValues(true)` para marcar estado inicial
  - Linha ~878-882: Simplificada condicao do useEffect para `if (shouldSync)`
  - Linha ~898 (dep array): Adicionado `useSavedValues` as dependencias do useEffect
  - Linha ~2215 (select cliente): Adicionado `userManuallyEditedRef.current = false`
  - Linha ~2387 (select fornecedor): Adicionado `userManuallyEditedRef.current = false`
  - Linha ~2188 (botao IA "Aplicar"): Adicionado `userManuallyEditedRef.current = false`

**Status:** Implementado e funcional

---

## 07/04/2026 15:00 - SINCRONIZACAO GRID x MODAL E AUTO-SAVE (PARTE 2)

**Descricao:** Thiago reportou que a OS GTM-4371 mostrava R$ 9.310,00 na lista principal (grid/MissionTable) mas R$ 1.435,00 no modal (calculo correto). O valor antigo permanecia no banco porque ninguem re-salvou apos a correcao da Parte 1.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual — a correcao e puramente logica (auto-save silencioso no backend)
- Grid (MissionTable) atualiza automaticamente via `onUpdate()` apos auto-save

### 2. Comportamento e Logica

- **Auto-save silencioso:** Adicionada logica no useEffect de sincronizacao que detecta divergencia entre valor calculado e valor salvo no banco
- **Condicoes de seguranca para disparo do auto-save:**
  - Divergencia > R$1 entre calculo e valor salvo
  - OS **NAO aprovada** (`billing_approved === false`)
  - Valor calculado > 0 (evita zerar missoes sem tabela detectada)
  - Nao esta no meio de um salvamento manual (`!isSavingRef.current`)
  - Fornecedor nao verificado pelo controller (`!isVendorLocked`)
  - Usuario nao editou manualmente o input (`!userManuallyEditedRef.current`)
- **Campos atualizados no auto-save:** `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `last_update`
- **Trigger de refresh:** Apos salvar, dispara `onUpdate()` que chama `fetchMissions(true)` no MissionTable, atualizando a grid instantaneamente

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Campos atualizados pelo auto-save: `revenue_value` (servico sem pedagio), `cost_value` (servico sem pedagio), `toll_value`, `toll_value_provider`, `last_update`
- **Varredura realizada:** 1.837 missoes com revenue > 0 analisadas. 87 com divergencia — todas ja aprovadas (protegidas pelo auto-save). 0 missoes nao-aprovadas pendentes

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linhas ~888-907: Adicionado bloco de auto-save no useEffect de sincronizacao
    - Calcula `calcRevService` e `calcCostService` via `financialData`
    - Compara com `mission.revenue_value` e `mission.cost_value`
    - Se divergencia > 1 e OS nao aprovada, faz `supabase.from('missions').update(...)` silencioso
    - Chama `onUpdate()` no `.then()` para atualizar grid

**Status:** Implementado e funcional

---

## LEGENDA DE STATUS

- **Implementado e funcional** — Alteracao feita, testada e em producao
- **Pendente** — Analise feita, aguardando aprovacao do Thiago para executar
- **Em andamento** — Execucao iniciada, nao finalizada
