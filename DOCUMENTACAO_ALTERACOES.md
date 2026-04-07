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

## 07/04/2026 16:00 - SINCRONIZACAO CRITICA DE VALORES FINANCEIROS (PARTE 3)

**Descricao:** Correcao de divergencia entre valor salvo (R$ 9.345,00 / R$ 9.310,00) e valor real calculado (R$ 1.435,00). O campo de input verde ainda exibia por um instante o valor antigo do banco antes do useEffect sobrescrever com o calculo correto. Eliminado o residuo de carga de valores salvos nos inputs.

### 1. Campos Implementados / UI

- **Input Verde "Valor Final Cliente"** — Agora exibe EXCLUSIVAMENTE o resultado do calculo matematico (Base + KM + Hora + Pedagio). Nao carrega mais valores do banco como placeholder inicial
- **Input Azul "Pagamento Fornecedor"** — Mesmo comportamento: calculo matematico tem prioridade absoluta
- Eliminado flash visual do valor antigo ao abrir o modal (antes: mostrava R$9.310 por ~200ms, depois recalculava para R$1.435)

### 2. Comportamento e Logica

- **Eliminacao de residuo:** Removidas as linhas que carregavam `savedRev + dbToll` e `savedCost + dbTollProvider` nos inputs (`setRevenueInput` e `setCostInput`) durante a inicializacao
- **Removido `setUseSavedValues(true)`** da inicializacao — nao ha mais conceito de "usar valores salvos" como default
- **Prioridade matematica:** O useEffect de sincronizacao (linha ~878) e a UNICA fonte de verdade para os inputs. Ele calcula `financialData.client.total` e `financialData.provider.serviceTotal + tollProvider` e seta diretamente nos inputs
- **Auto-save mantido:** Quando o calculo diverge do banco e a OS nao esta aprovada, o banco e atualizado silenciosamente e a grid e refreshada via `onUpdate()`
- **Fluxo completo ao abrir modal:**
  1. Modal abre → inputs comecam vazios (string vazia)
  2. Dados carregam do banco (toll, tabelas, missao)
  3. `financialData` e calculado via `useMemo`
  4. useEffect detecta `shouldSync = true` → seta inputs com calculo correto
  5. Se valor calculado diverge do banco e OS nao aprovada → auto-save silencioso
  6. Grid atualiza via `onUpdate()`

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Auto-save silencioso continua atualizando `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider` para OS nao-aprovadas com divergencia

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linhas ~578-584: Removidas 4 linhas do bloco `if (hasSavedData)`:
    - Removido `setRevenueInput(revWithToll.toLocaleString(...))`
    - Removido `setCostInput(costWithToll.toLocaleString(...))`
    - Removido `setUseSavedValues(true)`
    - Mantido apenas `setTollEmbeddedInCost(true)` (logica de pedagio embutido)

**Status:** Implementado e funcional

---

## 07/04/2026 17:00 - SINCRONIZACAO CRITICA - ELIMINACAO DE VALORES RESIDUAIS + RECALCULO EM MASSA

**Descricao:** Correcao definitiva da divergencia entre valor salvo no banco (R$ 9.345,00 / R$ 9.310,00) e valor real calculado (R$ 1.435,00). Eliminado o carregamento de valores antigos do banco nos inputs. Criado mecanismo de recalculo em massa para corrigir TODAS as OS nao-aprovadas de uma vez, sem precisar abrir cada modal individualmente.

### 1. Campos Implementados / UI

- **Input Verde "Valor Final Cliente"** — Bloqueado para exibir APENAS resultado da soma real (Base + KM + Hora + Pedagio). Nao carrega mais valores do banco como placeholder
- **Input Azul "Pagamento Fornecedor"** — Mesmo comportamento: calculo matematico tem prioridade absoluta
- **Botao "Recalcular Tudo"** — Novo botao ambar (`bg-amber-600`) no header do relatorio de OS, visivel apenas para Diretoria/Administrador
  - Icone `RefreshCw` (13px) normal, `Loader2` com animacao spin durante processamento
  - Label: "Recalcular Tudo" / "Recalculando..."
  - Disabled durante execucao para evitar duplo clique
  - Notificacao verde ao concluir com contagem de OS corrigidas

### 2. Comportamento e Logica

- **Eliminacao de residuo (MissionFinancialModal.tsx):** Removidas as linhas que carregavam `savedRev + dbToll` e `savedCost + dbTollProvider` nos inputs durante a inicializacao. Removido `setUseSavedValues(true)`. O useEffect de sincronizacao e a UNICA fonte de verdade
- **Rota backend POST /api/recalculate-all (server/routes.ts):**
  - Protegida por `requireAuth` + `requireRole('diretoria', 'administrador', 'ceo', 'financeiro')`
  - Carrega TODAS as missoes nao-aprovadas com revenue > 0 (paginacao de 1000 em 1000)
  - Carrega todas as tabelas de preco (cliente e fornecedor) e dados de clientes
  - Para cada missao, executa `calculateMissionFinancials()` — mesma funcao usada no frontend
  - Se divergencia > R$1 entre calculo e valor salvo: atualiza `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `last_update`
  - Registra log `BULK_RECALCULATE` em `system_logs` com totais (analisadas, corrigidas, puladas, erros)
  - Retorna JSON com `{ total, updated, skipped, errors, details[] }`
- **Botao no frontend (MissionTable.tsx):** Chama `authFetch('/api/recalculate-all', { method: 'POST' })`, exibe notificacao com resultado e dispara `fetchMissions(true)` para atualizar a grid

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Campos atualizados em massa: `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `last_update`
- Log registrado: `system_logs` com `action_type: 'BULK_RECALCULATE'`, `entity: 'Mission'`, `entity_id: 'ALL'`
- **Escopo:** Apenas missoes com `billing_approved = false` e `revenue_value > 0` e status diferente de Cancelada/Recusada

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linhas ~578-584: Removidas `setRevenueInput(...)`, `setCostInput(...)`, `setUseSavedValues(true)` do bloco `if (hasSavedData)`
- `components/MissionTable.tsx`
  - Linha ~174: Adicionado state `isRecalculating`
  - Linhas ~1305-1332: Adicionado botao "Recalcular Tudo" no header do relatorio (visivel para diretoria/administrador)
- `server/routes.ts`
  - Linhas ~106-193: Nova rota `POST /api/recalculate-all` com logica de recalculo em massa usando `calculateMissionFinancials()`

**Status:** Implementado e funcional

---

## LEGENDA DE STATUS

- **Implementado e funcional** — Alteracao feita, testada e em producao
- **Pendente** — Analise feita, aguardando aprovacao do Thiago para executar
- **Em andamento** — Execucao iniciada, nao finalizada
