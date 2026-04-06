# RELATÓRIO COMPLETO DA SESSÃO — TMSEGo
**Data:** 06/04/2026

---

## MELHORIAS IMPLEMENTADAS

### MELHORIA 4 — React Query (Cache + Invalidação)
**Status:** ✅ Concluída  
**Arquivos:** 7 (2 novos + 5 alterados)

| Arquivo | Alteração |
|---|---|
| `lib/queryClient.ts` | NOVO — QueryClient global (staleTime 30s, gcTime 5min) |
| `lib/useSupabaseQuery.ts` | NOVO — Hooks utilitários (useSupabaseQuery, useSupabaseUpdate, useSupabaseInsert, useSupabaseDelete) |
| `App.tsx` | QueryClientProvider envolvendo toda a aplicação |
| `components/ProfileList.tsx` | Migrado para useQuery — key: `['profiles']` |
| `components/FinancialDashboard.tsx` | Migrado para useQuery — key: `['financial-dashboard']` |
| `components/ClientList.tsx` | Migrado para useQuery — key: `['clients', lockedClientId, isCommercial, userId]` |
| `components/ProviderList.tsx` | Migrado para useQuery — key: `['providers']` |

MissionTable mantido com padrão direto (Realtime Supabase incompatível com migração segura).

---

### MELHORIA 5 — Role-Based Access Control no Backend
**Status:** ✅ Concluída  
**Arquivo:** `server/routes.ts`

- Middleware `requireRole(...roles)` com cache de 5 minutos
- Extração de userId do token `tmseg-token-{uuid}-{timestamp}`
- 20 rotas protegidas:
  - `/api/admin/*` → administrador, diretoria
  - `/api/asaas/*` → administrador, diretoria, financeiro
  - `/api/email/mission-*` → administrador, diretoria, avançado, operador
  - `/api/billing/recalculate-all` → administrador, diretoria, financeiro

---

### MELHORIA 6 — Visibilidade de OS (MissionTable)
**Status:** ✅ Concluída  
**Arquivo:** `components/MissionTable.tsx`

- **Card Total:** Mostra `"Total (N)"` quando o período filtrado tem menos OS que o total geral no banco
- **Opção HISTÓRICO:** Nova opção no dropdown de período que mostra TODAS as OS sem filtro de status ou data

---

## CORREÇÕES DE FATURAMENTO

### CORREÇÃO 1 — Status Cancelada na medição
**Status:** ✅ Concluída → ⚠️ Revertida  
**Arquivo:** `components/ClientBillingReport.tsx`

Inicialmente adicionamos `.neq('status', 'Cancelada')` nas 2 queries. O usuário corrigiu: **Cancelada DEVE aparecer na medição**. Revertido — apenas Recusada é filtrada.

Estado final das queries:
```
.neq('status', 'Recusada')     ← Mantido (Recusada NÃO aparece)
                                  Cancelada APARECE na medição ✅
```

---

### CORREÇÃO 2 — Pedágio R$35 fixo conflitando com pedágio manual
**Status:** ✅ Concluída  
**Arquivo:** `lib/financialUtils.ts` (linha ~918)

```ts
// ANTES: Sempre sobrescrevia com R$35
if (isLogitechTable && !isZeroValueMission) {
    tollValue = 35;
}

// DEPOIS: Só aplica R$35 se operador não preencheu pedágio
if (isLogitechTable && !isZeroValueMission && tollValue === 0) {
    tollValue = 35;
}
```

---

### CORREÇÃO 3 — Snapshot não atualizava pedágio pós-aprovação
**Status:** ✅ Concluída  
**Arquivo:** `components/MissionFinancialModal.tsx` (linha ~1279)

Adicionada lógica que, ao salvar (mesmo sem aprovar), detecta se o pedágio mudou em relação ao snapshot congelado e atualiza APENAS os campos de toll no snapshot:

```ts
if (!shouldSnapshot && mission.snapshot_approved_by && mission.snapshot_data) {
    const existingSnap = mission.snapshot_data;
    const tollChanged = existingSnap.tollVal !== toll;
    if (tollChanged) {
        const updatedSnap = {
            ...existingSnap,
            tollVal: toll,
            tollProvider: tollProv,
            totalGeral: r2((existingSnap.revenueServiceOnly ?? 0) + toll),
        };
        await supabase.from('missions').update({ snapshot_data: updatedSnap }).eq('id', mission.id);
    }
}
```

---

### PROBLEMA 4 — Hora extra em dobro (NÃO é bug)
**Status:** ✅ Comentário adicionado  
**Arquivo:** `lib/financialUtils.ts` (linha ~885)

Confirmado que é comportamento configurável por cliente (`full_extra_hour_after_16_min`). Comentário explicativo adicionado na função `applyRoundingRule`.

---

## ANÁLISES REALIZADAS (sem alteração de código)

### Regras hardcoded por cliente
- **MACOR:** 8 linhas — filtra tabelas por fornecedor
- **CEVA Jundiaí:** 42 linhas — seleção de tabela por distância/origem
- **CESLOG Cubatão×Santos:** 25 linhas — rota fixa cliente + fornecedor
- **VTC:** 5 linhas — horas fixas
- **IBL:** 2 linhas — identificação (sem lógica especial ativa)
- **Total:** ~83 linhas hardcoded para 5 clientes

### Campos estruturados nas tabelas de preço
- `operation_type` é campo texto livre usado para parse de região, franquia, tipo
- Proposta: adicionar colunas `origin_city`, `destination_city`, `region`, `table_type` no Supabase
- Complexidade ALTA, pré-requisito para eliminar regras hardcoded

### Logs de exclusão faltando
- **3 componentes sem log:** ProfileList, QuoteList, BankStatementImporter
- **1 componente com limpeza interna:** SupportAgentFormModal (sub-agentes virtuais)
- Complexidade BAIXA (~15 linhas em 3 arquivos)

---

## PENDÊNCIAS IDENTIFICADAS

| Item | Complexidade | Prioridade |
|---|---|---|
| Logs de exclusão em 3 componentes | BAIXA | Alta |
| Regras hardcoded (CEVA, CESLOG, etc) | ALTA | Média |
| Campos estruturados nas tabelas | ALTA | Média |
| MissionTable sem React Query | MÉDIA | Baixa |
| Bug: `toll_value` não salvo no UpdateMissionModal | BAIXA | Média |

---

## ARQUIVOS MODIFICADOS (RESUMO)

| Arquivo | Tipo de alteração |
|---|---|
| `lib/queryClient.ts` | Novo |
| `lib/useSupabaseQuery.ts` | Novo |
| `App.tsx` | React Query Provider |
| `server/routes.ts` | Middleware requireRole |
| `components/ProfileList.tsx` | React Query |
| `components/FinancialDashboard.tsx` | React Query |
| `components/ClientList.tsx` | React Query |
| `components/ProviderList.tsx` | React Query |
| `components/MissionTable.tsx` | Visibilidade (Total + HISTÓRICO) |
| `components/ClientBillingReport.tsx` | Correção filtro status |
| `lib/financialUtils.ts` | Pedágio R$35 + Comentário hora extra |
| `components/MissionFinancialModal.tsx` | Snapshot toll update |
| `replit.md` | Documentação atualizada |
