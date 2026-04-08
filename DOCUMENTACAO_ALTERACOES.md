# DOCUMENTACAO DE ALTERACOES - TMSEGo
### Diario de Bordo Oficial — Evolucao do Sistema

---

## 08/04/2026 00:00 (Brasília) - REGRA PEDAGIO CEVA + JUNDIAI + 200KM (#056)

**Descricao:** OS GTM-4386 nasceu com pedagio de R$ 463,37 porque a API de pedagio recebeu "200KM DE ACOMPANHAMENTO" como destino (nao e um endereco real). Criada regra hardcoded no MissionForm.tsx.

### Regra

Se TODAS as condicoes forem verdadeiras:
1. Cliente contem "CEVA" (case-insensitive)
2. Origem contem "JUNDIA" (Jundiai, case-insensitive)
3. Destino contem "200KM"

Entao: pedagio fixo = R$ 35,00. Nao chama API de pedagio nem Gemini IA.

### Arquivo Alterado
- `components/MissionForm.tsx` — `handleRouteSelect()` — regra inserida ANTES de qualquer outra logica de pedagio (rota fixa, historico, API).

**Status:** ✅ Concluido

---

## 07/04/2026 20:35 (Brasília) - REAL-TIME GLOBAL — SINCRONIZACAO EM TEMPO REAL (#055)

**Descricao:** Implementacao de sincronizacao em tempo real para 100% do sistema. Todos os usuarios conectados recebem atualizacoes instantaneas quando qualquer dado muda no banco de dados Supabase.

### Arquitetura

1. **RealtimeProvider** (`lib/RealtimeProvider.tsx`): Componente central que envolve toda a app. Assina `postgres_changes` (INSERT/UPDATE/DELETE) em 23 tabelas Supabase via canal unico `global-realtime-sync`.
2. **Mapeamento tabela→cache**: Cada tabela tem queryKeys associados que sao invalidados automaticamente (TanStack Query). Ex: `financial_transactions` invalida `['financial-dashboard']` e `['financial_transactions']`.
3. **Eventos customizados**: Cada mudanca de tabela dispara `supabase:{tableName}` no `window`. Isso permite que componentes que NAO usam TanStack Query tambem reajam.
4. **Hook `useRealtimeRefresh(tables, callback)`**: Componentes que fazem fetch direto podem ouvir mudancas em tabelas especificas. Debounce de 500ms para evitar overload.
5. **Publicacao Supabase**: Server startup (`routes.ts`) executa `ALTER PUBLICATION supabase_realtime ADD TABLE ...` para garantir que todas as tabelas estao habilitadas para real-time.
6. **Polling reduzido**: Polling antigo de 30s/60s reduzido para 5 min (fallback de seguranca).

### Componentes Atualizados

- VehicleList, UserList, ProviderAgentList, ClientVehicleList, ClientRouteList
- FinancialAccountManager, FinancialTransactionList, FinancialInvoiceControl, FinancialDRE, DailyCashMovement
- VehicleTechnologyList, QuoteList, ClientPriceList, ProviderCostList
- AlvaraControl, EquipmentManager, WhatsAppChat, RHPointReport
- MissionTable (ambas versoes) — via `refreshMissions` event
- ClientBillingReport, VendorVerificationControl — via `refreshMissions` event
- ProfileList, FinancialDashboard, ClientList, ProviderList — via TanStack Query invalidation

### Tabelas Monitoradas (23)

missions, clients, providers, vehicles, agents, profiles, client_price_tables, client_routes, client_vehicles, provider_cost_tables, financial_transactions, financial_accounts, financial_categories, financial_invoices, quotes, commercial_proposals, support_agents, time_clock, vehicle_technologies, system_users, whatsapp_messages, system_logs, mission_logs

**Status:** ✅ Concluido

---

## 07/04/2026 20:15 (Brasília) - EXTERMINIO DE RECALCULO NO COMPARADOR (#054)

**Descricao:** O ClientBillingReport.tsx (comparador e relatorio) priorizava `snapshot_data.totalGeral` antigo sobre o `revenue_value` editado manualmente. Quando o usuario salvava R$ 0,01, o comparador exibia R$ 608,10 (valor do snapshot congelado).

### Correcoes

1. **Comparador rowsData**: Quando a missao tem snapshot MAS foi manualmente editada (billing_verified_by ou revenue_edit_reason existem), usa `revenue_value + toll_value` do banco em vez de `snapshot_data.totalGeral`.
2. **Comparador missionDbMap**: Aceita `revenue_value = 0` como valor valido quando `billing_verified_by` ou `billing_approved` existem.
3. **grandTotal**: Simplificado para SEMPRE usar `revenue_value + toll_value` do banco. Sem fallback para calculo.
4. **Resumo Financeiro**: Mesma correcao aplicada ao bloco de totais na UI do comparador.
5. **MissionFinancialModal snapshot sync**: Quando o usuario salva manualmente (approve=false) e a missao tem snapshot, atualiza `snapshot_data.totalGeral` e `snapshot_data.revenueServiceOnly` com os novos valores. Antes so atualizava quando pedagio mudava.
6. **Debug logs removidos**: Limpeza dos console.log de debug ([SAVE DEBUG], [AUTOFILL], [ERRO DE SAVE]).

### Regra

**REGRA SUPREMA**: O comparador NAO pensa, NAO calcula. Ele exibe `revenue_value + toll_value` do banco. Se no banco esta R$ 0,01, ele mostra R$ 0,01. O snapshot so e usado para campos de detalhamento (km extra, hr extra, base), NUNCA para totalGeral quando houve edicao manual.

### Arquivos Alterados

- `components/ClientBillingReport.tsx` — rowsData snapshot logic, missionDbMap, grandTotal, Resumo Financeiro
- `components/MissionFinancialModal.tsx` — snapshot sync no handleUpdate, debug log cleanup

**Status:** ✅ Concluido

---

## 07/04/2026 19:50 (Brasília) - SOLUCAO DEFINITIVA: VALORES SALVOS INVIOLAVEIS (#053)

**Descricao:** Solucao definitiva para impedir que o modal financeiro sobrescreva valores salvos no banco com calculos automaticos. Implementado `dbValuesLoadedRef` — um bloqueio binario absoluto que impede qualquer sincronizacao do calculo quando existem dados salvos.

### Arquitetura

- `dbValuesLoadedRef = useRef(false)`: Comeca falso. Se o banco retorna revenue_value > 0 OU billing_verified_by, vira `true`.
- **useEffect de sincronizacao**: So executa `setRevenueInput`/`setCostInput` se `dbValuesLoadedRef.current === false`.
- **Resultado**: Missoes com valores salvos NUNCA tem seus inputs sobrescritos, independente de quantas vezes o `financialData` recalcule.

### Fluxo

1. Modal abre → `dbValuesLoadedRef = false`, `isLoading = true`
2. Dados do banco carregam → se tem revenue/cost/verified → `dbValuesLoadedRef = true`, inputs setados com DB values
3. `financialData` useMemo recalcula → useEffect dispara → verifica `dbValuesLoadedRef` → **true = NAO sobrescreve**
4. Unica forma de desbloquear: clicar "Recalcular" (reseta `dbValuesLoadedRef = false`)

### Arquivo Alterado

- `components/MissionFinancialModal.tsx` — dbValuesLoadedRef, useEffect guard, handleRecalculate

**Status:** ✅ Concluido (DEFINITIVO)

---

## 07/04/2026 18:40 (Brasília) - UNIFICACAO GLOBAL DA FONTE DA VERDADE (#052)

**Descricao:** Migracao completa da inteligencia financeira do Frontend para o Backend para todos os perfis de usuario. Eliminacao de divergencias entre maquinas e navegadores diferentes. O banco de dados agora governa 100% dos valores exibidos no sistema.

### 1. Componentes Corrigidos

| Componente | Antes | Depois |
|------------|-------|--------|
| **ClientBillingReport.tsx** chartComputedData | Fallback para `calculateMissionFinancials` se `revenue_value = 0` | Sempre le `revenue_value + toll_value` do banco |
| **ClientBillingReport.tsx** rowsData.totalGeral | Ternario com 3 caminhos (DB, fin.serviceTotal, base+km+hr) | Sempre `savedRevenue + tollVal` do banco |
| **ClientBillingReport.tsx** Resumo Financeiro | Ja corrigido no #049 | Mantido — `missions.reduce(rev + toll)` |
| **MissionCard.tsx** displayRevenue | Fallback para `financials.client.total` se nao tinha revenue | DB sempre priorizado. Calculo APENAS para `IN_TRANSIT` ativo |
| **MissionCard.tsx** displayCost | Fallback para `financials.provider.total` | DB sempre priorizado. Calculo APENAS para `IN_TRANSIT` ativo |
| **MissionTable.tsx** | Ja usava DB values | Confirmado — sem calculo frontend |
| **MissionFinancialModal.tsx** | Calcula para preview antes de salvar | Mantido — necessario para funcao de edicao |

### 2. Invalidacao de Cache (Supabase Realtime)

- ClientBillingReport agora escuta `postgres_changes` na tabela `missions` via canal `billing-financial-sync`
- Quando `revenue_value`, `cost_value` ou `toll_value` mudam no banco, o relatorio regenera automaticamente
- Nao depende mais de F5, Ctrl+Shift+R ou limpeza de cache do navegador

### 3. Regra Final

- Frontend = espelho (Display Only) dos campos `revenue_value`, `cost_value`, `toll_value` do Supabase
- Unica excecao: MissionCard mostra calculo estimado para missoes IN_TRANSIT que ainda nao foram salvas
- MissionFinancialModal mantem calculo para preview/edicao, mas os valores salvos no banco sao lei

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx` — chartComputedData, rowsData.totalGeral, Supabase Realtime
- `components/MissionCard.tsx` — displayRevenue, displayCost (DB-first)

**Status:** ✅ Concluido

---

## 07/04/2026 18:25 (Brasília) - CORRECAO GERAL DE TABELA DE CUSTO 100KM vs 200KM (#051)

**Descricao:** Script executado para reverter custos inflados de R$ 800 para R$ 400 em missoes de curto percurso. O recalculo em massa de 01-07/04 aplicou a tabela LOGITECH 200KM (base R$800) em missoes que deveriam usar GERAL SP/RJ ATE 100KM (base R$400).

### 1. Missoes Corrigidas

| OS | KM | Custo Antes | Custo Depois | Rota |
|----|-----|-------------|--------------|------|
| GTM-3775 | 51km | R$820 | R$400 | Jundiaí → Perus |
| GTM-3940 | 74km | R$820 | R$400 | Av. Francisco Roveri → Barueri |
| GTM-3773 | 50km | R$820 | R$400 | Av. Francisco Roveri → Perus |
| GTM-3774 | 51km | R$820 | R$400 | Jundiaí → Perus |
| GTM-3865 | 52km | R$820 | R$400 | Jundiaí → Perus |
| GTM-3866 | 54km | R$820 | R$400 | Jundiaí → Perus |

Total: 6 missoes corrigidas. Economia: R$2.520 (R$420 por missao).

### 2. Missoes Protegidas (NAO alteradas)

- GTM-4296 (billing_approved=true, cost=R$875.67)
- GTM-3790 (billing_approved=true, cost=R$813.23)

### 3. Regra de Negocio Aplicada

- Se `km_total <= 100km` E fornecedor COMANDO G8 E rota SP → tabela `GERAL SP/RJ ATE 100KM` (base R$400)
- Tabela `LOGITECH 200KM` (base R$800) so se aplica a missoes com `km_total > 100km`

### 4. Blindagem

- Todos os cost_edit_reason gravados com justificativa completa
- Logs registrados em system_logs com entity='Mission', action='UPDATE'
- Regra de Ouro (#049): Frontend NUNCA calcula totais — apenas exibe valores do banco

**Status:** ✅ Concluido

---

## 07/04/2026 20:30 (Brasília) - TOTAL SISTEMA LIDO DIRETO DO BANCO (#049)

**Descricao:** O comparador de planilha e o resumo financeiro agora leem `revenue_value + toll_value` diretamente do array `missions` (dados do Supabase), em vez de depender do calculo intermediario `rowsData.totalGeral` que podia estar desatualizado por cache do navegador.

### Regra de Ouro

- O frontend NUNCA calcula totais financeiros por conta propria
- Comparador e Relatorios exibem APENAS a soma de `revenue_value + toll_value` do banco
- Valores editados pelo usuario no Modal Financeiro sao lei absoluta

**Status:** ✅ Concluido
