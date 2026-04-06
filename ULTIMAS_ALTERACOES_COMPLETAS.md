# RELATÓRIO DE ALTERAÇÕES RECENTES — TMSEGo

**Data:** 06/04/2026

---

## 1. MELHORIA 4 — REACT QUERY (Cache + Invalidação)

### Arquivos criados/alterados:

**`lib/queryClient.ts`** (NOVO)
- QueryClient global com staleTime 30s, gcTime 5min, retry 1, refetchOnWindowFocus false

**`lib/useSupabaseQuery.ts`** (NOVO)
- Hooks: `useSupabaseQuery`, `useSupabaseUpdate`, `useSupabaseInsert`, `useSupabaseDelete`

**`App.tsx`** — Adicionado `QueryClientProvider`

**`components/ProfileList.tsx`** — Migrado para `useQuery` (key: `['profiles']`)

**`components/FinancialDashboard.tsx`** — Migrado para `useQuery` (key: `['financial-dashboard']`)

**`components/ClientList.tsx`** — Migrado para `useQuery` (key: `['clients', lockedClientId, isCommercial, userId]`)

**`components/ProviderList.tsx`** — Migrado para `useQuery` (key: `['providers']`)

---

## 2. MELHORIA 5 — ROLE-BASED ACCESS CONTROL NO BACKEND

### Arquivo alterado: `server/routes.ts`

**Adicionado:**
- `extractUserIdFromToken(token)` — extrai userId do formato `tmseg-token-{uuid}-{timestamp}`
- `roleCache` — Map com TTL de 5 minutos
- `requireRole(...roles)` — middleware que valida role via Supabase

**Rotas protegidas:**
- `/api/admin/*` → administrador, diretoria
- `/api/asaas/*` → administrador, diretoria, financeiro
- `/api/email/mission-*` → administrador, diretoria, avançado, operador
- `/api/billing/recalculate-all` → administrador, diretoria, financeiro

---

## 3. MELHORIA 6 — VISIBILIDADE DE OS (MissionTable)

### Arquivo alterado: `components/MissionTable.tsx`

**Risco 2 — Card Total com indicador:**
```tsx
// ANTES:
title="Total"

// DEPOIS:
title={totalVolumeCount < allMissions.length ? `Total (${allMissions.length})` : "Total"}
```
Quando o período filtra e há mais OS no banco, mostra `"Total (340)"`.

**Risco 3 — Nova opção HISTÓRICO no dropdown:**
```tsx
// Dropdown:
<option value="HISTORY">HISTÓRICO</option>

// Lógica:
if (viewPeriod === 'HISTORY') {
    return true; // Mostra TODAS as OS sem filtro de status ou data
}
```

---

## 4. CORREÇÃO FATURAMENTO 1 — Cancelada na medição

### Arquivo alterado: `components/ClientBillingReport.tsx`

**Query principal (linha ~180):**
```ts
// ANTES:
.neq('status', 'Recusada')

// DEPOIS:
.neq('status', 'Recusada')
.neq('status', 'Cancelada')
```

**Query de gráficos (linha ~264):**
```ts
// ANTES:
.neq('status', 'Recusada')

// DEPOIS:
.neq('status', 'Recusada').neq('status', 'Cancelada')
```

---

## 5. CORREÇÃO FATURAMENTO 2 — Pedágio R$35 fixo

### Arquivo alterado: `lib/financialUtils.ts`

```ts
// ANTES (linha ~918):
if (isLogitechTable && !isZeroValueMission) {
    tollValue = 35;
}

// DEPOIS:
if (isLogitechTable && !isZeroValueMission && tollValue === 0) {
    tollValue = 35;
}
```
O override R$35 agora só se aplica quando o operador NÃO preencheu pedágio. Pedágio manual é respeitado.

---

## 6. CORREÇÃO FATURAMENTO 3 — Snapshot não atualiza pedágio

### Arquivo alterado: `components/MissionFinancialModal.tsx`

**Lógica adicionada após o save com sucesso (~linha 1279):**
```ts
if (!shouldSnapshot && mission.snapshot_approved_by && mission.snapshot_data) {
    const existingSnap = mission.snapshot_data as any;
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
Quando já existe snapshot e o pedágio mudou, atualiza APENAS tollVal, tollProvider e totalGeral no snapshot sem alterar os demais campos congelados.

---

## 7. COMENTÁRIO — Hora extra (Problema 4)

### Arquivo alterado: `lib/financialUtils.ts`

```ts
// REGRA DE ARREDONDAMENTO DE HORA EXTRA:
// Se o cliente tem full_extra_hour_after_16_min = true, qualquer fração > 15 minutos
// é arredondada para a hora cheia seguinte. Ex: 1h16min extra → 2h extra.
// Isso NÃO é bug — é comportamento configurável por cliente na tabela `clients`.
// Pode parecer "hora extra em dobro" mas é o arredondamento contratual.
```

---

## RESUMO

| # | Alteração | Arquivo(s) | Tipo |
|---|---|---|---|
| 1 | React Query | 7 arquivos | Melhoria |
| 2 | Role backend | server/routes.ts | Melhoria |
| 3 | Visibilidade OS | MissionTable.tsx | Melhoria |
| 4 | Cancelada na medição | ClientBillingReport.tsx | Correção |
| 5 | Pedágio R$35 | financialUtils.ts | Correção |
| 6 | Snapshot pedágio | MissionFinancialModal.tsx | Correção |
| 7 | Comentário hora extra | financialUtils.ts | Documentação |
