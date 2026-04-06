# RELATÓRIO COMPLETO — MELHORIAS 4, 5, 6 + ANÁLISE DE FATURAMENTO

**Data:** 06/04/2026  
**Sistema:** TMSEGo — Grupo TMSEG  

---

## MELHORIA 4 — REACT QUERY (Cache + Invalidação)

### Objetivo
Substituir chamadas diretas ao Supabase por React Query v5 nos componentes de lista, ganhando cache automático, deduplicação de requests e invalidação reativa.

### Infraestrutura criada

**`lib/queryClient.ts`** — QueryClient global
```ts
staleTime: 30_000    // 30 segundos antes de refetch
gcTime: 300_000      // 5 minutos de garbage collection
refetchOnWindowFocus: false
retry: 1
```

**`lib/useSupabaseQuery.ts`** — Hooks utilitários
- `useSupabaseQuery(key, tableName, query?)` — SELECT com cache
- `useSupabaseUpdate(tableName, invalidateKeys)` — UPDATE com invalidação
- `useSupabaseInsert(tableName, invalidateKeys)` — INSERT com invalidação
- `useSupabaseDelete(tableName, invalidateKeys)` — DELETE com invalidação

**`App.tsx`** — Provider
```tsx
<QueryClientProvider client={queryClient}>
  <NotificationProvider>
    <AppContent />
  </NotificationProvider>
</QueryClientProvider>
```

### Componentes migrados

| Componente | Query Key | Detalhes |
|---|---|---|
| `ProfileList.tsx` | `['profiles']` | Fetch via queryFn, invalidação após delete |
| `FinancialDashboard.tsx` | `['financial-dashboard']` | Fetch complexo com múltiplas tabelas |
| `ClientList.tsx` | `['clients', lockedClientId, isCommercial, userId]` | Key composta, refetch em mutações |
| `ProviderList.tsx` | `['providers']` | Fetch com contagem de veículos/agentes/tabelas |

### Componente NÃO migrado

**`MissionTable.tsx`** — Mantido com padrão direto `useState` + `fetchMissions()`.  
**Motivo:** Tem 4 canais Realtime do Supabase com lógica de reconexão automática. Migrar para React Query exigiria reescrever toda a gestão de Realtime, com risco alto de regressão na experiência operacional em tempo real.

### Arquivos alterados
1. `lib/queryClient.ts` (NOVO)
2. `lib/useSupabaseQuery.ts` (NOVO)
3. `App.tsx` (QueryClientProvider adicionado)
4. `components/ProfileList.tsx` (migrado)
5. `components/FinancialDashboard.tsx` (migrado)
6. `components/ClientList.tsx` (migrado)
7. `components/ProviderList.tsx` (migrado)

---

## MELHORIA 5 — ROLE-BASED ACCESS CONTROL NO BACKEND

### Objetivo
Validar roles no backend para todas as rotas sensíveis. Antes, a proteção era apenas no frontend (verificação de `localStorage`), qualquer chamada direta à API passava sem checagem.

### Implementação

**`server/routes.ts`** — Middleware `requireRole(...roles)`

```ts
// Extração do userId do token
function extractUserIdFromToken(token: string): string | null {
    // Formatos: "tmseg-token-{uuid}-{timestamp}" ou "impersonation-token-{uuid}-{timestamp}"
    const match = token.match(/^(?:tmseg|impersonation)-token-(.+?)-\d+$/);
    return match ? match[1] : null;
}

// Cache de roles com TTL de 5 minutos
const roleCache = new Map<string, { role: string; timestamp: number }>();
const ROLE_CACHE_TTL = 5 * 60 * 1000;

// Middleware
function requireRole(...allowedRoles: string[]) {
    return async (req, res, next) => {
        // 1. Extrai token do header Authorization
        // 2. Extrai userId do token
        // 3. Consulta role no cache ou no Supabase (system_users → profiles)
        // 4. Compara role com allowedRoles (case-insensitive, normaliza acentos)
        // 5. Retorna 403 se não autorizado
    };
}
```

### Rotas protegidas

| Padrão de rota | Roles permitidos | Qtd rotas |
|---|---|---|
| `/api/admin/*` | administrador, diretoria | 6 |
| `/api/asaas/*` | administrador, diretoria, financeiro | 7 |
| `/api/email/mission-*` | administrador, diretoria, avançado, operador | 6 |
| `/api/billing/recalculate-all` | administrador, diretoria, financeiro | 1 |

### Arquivo alterado
1. `server/routes.ts`

---

## MELHORIA 6 — CORREÇÃO DE VISIBILIDADE DE OS

### Problema identificado

**Risco 2 (MÉDIO):** O card "Total" no painel de missões mostra apenas as OS do período selecionado. Se o período é HOJE, OS de ontem não aparecem no total — sem nenhuma indicação visual de que existem mais OS fora do período.

**Risco 3 (BAIXO):** A opção "TOTAL ABERTOS" no filtro de período exclui explicitamente OS com status Concluída, Cancelada e Recusada. Não existe forma de ver o histórico completo.

### Correções aplicadas

**Correção Risco 2 — Indicador no card Total**

```tsx
// ANTES:
<StatCard title="Total" value={totalVolumeCount} ... />

// DEPOIS:
<StatCard 
  title={totalVolumeCount < allMissions.length 
    ? `Total (${allMissions.length})` 
    : "Total"} 
  value={totalVolumeCount} ... />
```

Quando o período filtra e há mais OS no banco, o card mostra `"Total (340)"` com o número filtrado em destaque. Quando não há diferença, mostra apenas `"Total"`.

**Correção Risco 3 — Nova opção "HISTÓRICO"**

```tsx
// Dropdown de período — nova opção adicionada:
<option value="HISTORY">HISTÓRICO</option>

// Lógica do periodMissions:
if (viewPeriod === 'HISTORY') {
    return true; // Mostra TODAS as OS sem filtro
}
```

A opção "TOTAL ABERTOS" continua existindo (tem função operacional válida). O "HISTÓRICO" serve para auditoria, busca e verificação completa — mostra todas as OS de todos os status e datas.

### Arquivo alterado
1. `components/MissionTable.tsx`

---

## ANÁLISE DE 4 PROBLEMAS CRÍTICOS DE FATURAMENTO

### PROBLEMA 1 — Missão RECUSADA aparecendo na medição/relatório

**Código relevante (`ClientBillingReport.tsx`, linhas 175-183):**
```ts
const { data: missionDataRaw } = await supabase
    .from('missions')
    .select('*, company_vehicle:vehicles(*)')
    .ilike('client', escapedClientName)
    .neq('status', 'Recusada')        // ← FILTRA Recusada
    .not('start_time', 'is', null)
    .gte('start_time', rangeStart)
    .lte('start_time', rangeEnd)
    .order('start_time', { ascending: true });
```

**Diagnóstico:** A query JÁ exclui `Recusada` com `.neq('status', 'Recusada')`. Porém, **NÃO exclui `Cancelada`**. Missões canceladas COM `start_time` preenchido aparecem na medição e são cobradas.

A segunda query (gráficos, linha 263) também tem o mesmo padrão:
```ts
.neq('status', 'Recusada')  // Exclui Recusada, mas NÃO Cancelada
```

**Causa raiz:** Filtro incompleto — falta `.neq('status', 'Cancelada')` nas duas queries.

**Arquivo:** `components/ClientBillingReport.tsx`  
**Complexidade:** BAIXA — adicionar 1 linha em 2 queries  
**Linhas afetadas:** 179 e 263

---

### PROBLEMA 2 — Pedágio duplicado automático

**Código relevante (`lib/financialUtils.ts`, linhas 307 e 914-929):**

```ts
// Linha 307 — Leitura do pedágio do banco:
let tollValue = isZeroValueMission ? 0 : Math.max(0, safeNumber(mission.toll_value));

// Linhas 914-916 — Override automático para tabelas LOGITECH/200KM:
const isLogitechTable = appliedTableName.includes('LOGITECH') || 
                        appliedTableName.includes('200KM') || 
                        appliedTableName.includes('200 KM');
if (isLogitechTable && !isZeroValueMission) {
    tollValue = 35;  // ← SOBRESCREVE com R$ 35,00 fixo
}

// Linhas 927-929 — Soma ao total:
const totalRevenue = round2(clientServiceTotal + tollValue);
const totalCost = round2(providerServiceTotal + tollValue);
```

**No `MissionFinancialModal.tsx` (linhas 1130 e 1173-1175):**
```ts
// Na hora de salvar:
const revServiceOnly = revTotal - toll;    // Subtrai pedágio do total
// Salva:
revenue_value: r2(revServiceOnly),         // Valor SEM pedágio
toll_value: r2(toll),                      // Pedágio separado
```

**Diagnóstico:** NÃO há duplicação no salvamento — o sistema salva `revenue_value` (sem pedágio) e `toll_value` (pedágio) separadamente. Na leitura, soma os dois: `revenue_value + toll_value`. O override de R$35 para LOGITECH/200KM substitui (não soma) o valor do banco, mas pode causar confusão quando o operador digitou um pedágio diferente — o valor R$35 aparece no cálculo mesmo que o operador tenha salvo outro valor manualmente.

**Causa raiz:** O override fixo `tollValue = 35` na `financialUtils.ts` pode conflitar com pedágio manual. Se o operador salvou R$50 de pedágio, na próxima abertura do modal o cálculo mostra R$35 (do override), mas o campo de input mostra R$50 (do banco). O total fica inconsistente.

**Arquivo:** `lib/financialUtils.ts`  
**Complexidade:** MÉDIA — precisa decidir se o override deve existir ou se pedágio deve ser sempre manual  
**Linha afetada:** 916

---

### PROBLEMA 3 — Alteração de pedágio pós-auditoria não reflete na medição

**Código relevante — Criação do snapshot (`MissionFinancialModal.tsx`, linhas 1187-1220):**
```ts
if (shouldSnapshot && financialData) {
    const snapshotObj = {
        // ...
        tollVal: toll,              // ← Pedágio congelado no momento da aprovação
        tollProvider: tollProv,
        totalGeral: r2(revServiceOnly + toll),
        // ...
    };
    basePayload.snapshot_data = snapshotObj;
    basePayload.snapshot_approved_by = userName;
}
```

**Condição para criar snapshot (linha 1167):**
```ts
const shouldSnapshot = approve && canReleaseBilling && !mission.snapshot_approved_by;
//                                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                     Só cria snapshot se NÃO existe um anterior
```

**Uso do snapshot no relatório (`ClientBillingReport.tsx`, linhas 656-703):**
```ts
const isFrozen = !!(m.snapshot_approved_by && snap);
if (isFrozen) {
    return {
        tollVal: snap.tollVal ?? 0,                    // ← Usa valor do snapshot
        totalGeral: snap.totalGeral ?? ((snap.revenueServiceOnly ?? 0) + (snap.tollVal ?? 0)),
        frozen: true,
    };
}
```

**Diagnóstico:** O snapshot é criado UMA VEZ na primeira aprovação (financeiro/diretoria/controller) e NUNCA é recriado. Se depois alguém alterar o pedágio (via save sem approve), o `toll_value` da missão muda, mas o `snapshot_data.tollVal` permanece com o valor antigo. O relatório de medição usa `snapshot_data` quando existe, então mostra o pedágio antigo.

**Causa raiz:** `!mission.snapshot_approved_by` impede recriação do snapshot. Alterações pós-aprovação atualizam `toll_value` na missão mas não atualizam `snapshot_data`.

**Arquivo:** `components/MissionFinancialModal.tsx`  
**Complexidade:** MÉDIA — precisa decidir: (A) atualizar o snapshot a cada save, ou (B) usar valores atuais da missão no relatório quando não congelado  
**Linha afetada:** 1167

---

### PROBLEMA 4 — Hora extra em dobro

**Código relevante (`lib/financialUtils.ts`, linhas 780-912):**

```ts
// Cálculo do excesso de horas (cliente):
let cExcessHr = Math.max(0, durationHours - cFranchiseHr);     // Linha 780

// Preço unitário da hora extra:
const cUnitPriceHour = manualTableOverrides?.customClientUnitHour !== undefined
    ? manualTableOverrides.customClientUnitHour
    : (appliedClientTable?.price_per_extra_hour || 0);           // Linha 786-788

// Regra de arredondamento (>15min → hora cheia):
if (clientData?.full_extra_hour_after_16_min) {
    cExcessHr = applyRoundingRule(cExcessHr);                    // Linha 893-894
}

// Valor final:
let cExtraHrVal = round2(Math.max(0, cExcessHr * cUnitPriceHour));   // Linha 909

// Fornecedor — cálculo INDEPENDENTE:
let pExcessHr = Math.max(0, durationHours - pFranchiseHr);
const pUnitCostHour = manualTableOverrides?.customProviderUnitHour !== undefined
    ? manualTableOverrides.customProviderUnitHour
    : (appliedProviderTable?.cost_per_extra_hour || 0);          // Linha 877
let pExtraHrVal = round2(Math.max(0, pExcessHr * pUnitCostHour));    // Linha 912
```

**Diagnóstico:** A fórmula é simples: `(horas_real - franquia) × preço_hora`. NÃO existe multiplicador ou fator que dobre o valor. O cálculo do cliente e fornecedor é INDEPENDENTE (usam tabelas diferentes).

**Possíveis causas de "hora extra em dobro":**

1. **Regra de arredondamento:** Se `full_extra_hour_after_16_min` está ativado no cliente, 1h16min vira 2h de extra (arredonda para cima). Isso pode parecer "dobro" se o operador espera ver 1.27h.

2. **Multiplicador de 2 agentes:** Se a missão tem 2 agentes, o `clientMultiplier = 2` é aplicado ao valor base (`cBase = activationFee * clientMultiplier`), mas NÃO ao valor da hora extra. O multiplicador afeta apenas a taxa de ativação.

3. **Tabela errada selecionada:** Se a tabela tem `franchise_hours = 0`, todas as horas da missão viram "extra", resultando em valor muito alto.

**Causa raiz provável:** Arredondamento `full_extra_hour_after_16_min` combinado com franquia curta. Não há bug de duplicação real — é comportamento configurável por cliente.

**Arquivo:** `lib/financialUtils.ts`  
**Complexidade:** BAIXA (investigação) — precisa verificar se o cliente específico tem `full_extra_hour_after_16_min = true` e qual `franchise_hours` está na tabela

---

## RESUMO GERAL

| Item | Status | Arquivo(s) | Complexidade |
|---|---|---|---|
| MELHORIA 4 — React Query | ✅ Concluída | 7 arquivos | Alta |
| MELHORIA 5 — Role Backend | ✅ Concluída | 1 arquivo | Média |
| MELHORIA 6 — Visibilidade OS | ✅ Concluída | 1 arquivo | Baixa |
| PROB 1 — Cancelada na medição | ⚠️ Identificado | ClientBillingReport.tsx | Baixa |
| PROB 2 — Pedágio R$35 fixo | ⚠️ Identificado | financialUtils.ts | Média |
| PROB 3 — Snapshot não atualiza | ⚠️ Identificado | MissionFinancialModal.tsx | Média |
| PROB 4 — Hora extra "dobro" | ⚠️ Investigado | financialUtils.ts | Baixa |
