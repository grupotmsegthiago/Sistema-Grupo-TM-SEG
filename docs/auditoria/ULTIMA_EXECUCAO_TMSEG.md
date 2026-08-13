# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **Fase 3 Bloco P3 — CORREÇÃO FINAL PLINIO + REVALIDAÇÃO PR #261**  
> **Não contém segredos.**  
> **NÃO mergeado. NÃO publicado.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-13 (UTC) |
| **Tipo** | Correção gap Plinio + revalidação integral PR #261 |
| **Branch** | `cursor/fase3-p3-limpeza-seguranca-eaa8` |
| **PR** | [#261](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/261) |
| **Produção (inalterada)** | `ae2fc382` |
| **Produção alterada** | **NÃO** |
| **Banco alterado** | **NÃO** |
| **Próxima fase** | **NÃO iniciada** |

---

## PROGRESSO — TRÊS INDICADORES

| Indicador | Valor | Metodologia |
|-----------|-------|-------------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 | Gap Plinio corrigido + testes + build + revalidação + handoff |
| **FASE 3 (total)** | **58%** 🔵 | P3 validado na branch; merge/publicação ainda pendente |
| **PROGRAMA GERAL** | **57%** 🔵 | Sem inflação por correção de fechamento |

---

## DECISÃO FINAL — PR #261

# 🟢 PR #261 APTO PARA MERGE

| Critério | Resultado |
|----------|-----------|
| Escopo autorizado P3 completo | ✅ |
| Gap Plinio fechado | ✅ `clientFinanceInputLocked` |
| PDFs (KM/Hora Extra) | ✅ Inalterados — evidências preservadas |
| billing-override protegido | ✅ |
| replit removido com segurança | ✅ |
| Testes — zero falha nova | ✅ **735 / 730 / 5 fail** |
| Build | ✅ |
| Merge / deploy nesta execução | ❌ **NÃO** (conforme instrução) |

**Nota:** SEC-01/02/03 e NB-07 permanecem como **próximo bloco controlado** — não fazem parte do escopo autorizado do PR #261 e não bloqueiam merge deste diff.

---

## 1. GAP PLINIO — CORREÇÃO

### Problema (gap residual comprovado)

Após `canUnlockBilling`, Plinio ainda podia editar campos cliente porque usavam apenas `(isController || isEffectivelyLocked)`:

- `tollInput` (pedágio cliente)
- `displacementInput` (deslocamento cliente)
- `customClientBase`, `customClientKm`, `customClientHour`
- Seletor tabela cliente (`select-client-table`) quando OS destravada

### Solução mínima

Gate unificado reutilizando permissão existente:

```typescript
const clientFinanceInputLocked = isController || isEffectivelyLocked || !canEditClientData;
```

Aplicado em todos os inputs financeiros/comerciais do **CLIENTE**. Para Plinio, `canEditClientData = false` → `clientFinanceInputLocked` permanece `true` **mesmo com OS destravada** (`unlockOverride`).

Também: `if (!canEditClientData) return;` no `handleChange` da tabela cliente.

### Fornecedor preservado

`input-toll-provider`, `input-displacement-provider`, `customProvider*`, `costInput`, `TableSwapControl` fornecedor — **não** usam `clientFinanceInputLocked`.

---

## 2. ESTADOS DA OS — MATRIZ PLINIO

| Estado | Cliente | Fornecedor |
|--------|---------|------------|
| OS bloqueada | ❌ bloqueado | ✅ conforme regra existente |
| OS destravada (`unlockOverride`) | ❌ bloqueado (`!canEditClientData`) | ✅ editável |
| `fullEditMode` | ❌ Plinio excluído (`canActivateFullEdit=false`) | ✅ |
| Tabela cliente travada | ❌ | — |
| Tabela fornecedor travada | — | ✅ `canEditProviderTablesEvenIfLocked` |
| Admin/Diretoria full access | ✅ permissões preservadas | ✅ |

---

## 3. OUTROS PERFIS — PRESERVADOS

| Perfil | Cliente | Fornecedor |
|--------|---------|------------|
| Administrador / Diretoria | ✅ editável (quando regra existente permitir) | ✅ |
| Financeiro / Controller | ✅ conforme gates existentes | ✅ |
| Plinio | ❌ bloqueado | ✅ autorizado |
| Operacional / outros | ❌ sem ampliação — gates originais | conforme role |

Identificação Plinio por nome — padrão existente; migrar para perfil estável em fase futura.

---

## 4. DIFF FINAL PR #261 (15 arquivos)

| Arquivo | Alteração | Escopo |
|---------|-----------|--------|
| `server/replit_integrations/*` (8) | Removido | P3 limpeza |
| `server/routes.ts` | Auth billing-override | P3 segurança |
| `MissionFinancialModal.tsx` | Plinio + `clientFinanceInputLocked` | Autorizado |
| `CommercialProposalModal.tsx` | PDF KM/Hora Extra | Autorizado |
| `QuotePrintModal.tsx` | PDF KM/Hora Extra | Autorizado |
| `fase3-p3-limpeza-seguranca.test.ts` | 6 testes P3 | Testes |
| `ULTIMA_EXECUCAO_TMSEG.md` | Handoff | Docs |

**Sem código inesperado** — diff restrito ao P3 autorizado.

---

## 5. PDFs — EVIDÊNCIAS PRESERVADAS (sem alteração nesta execução)

| Item | Proposta | Simulação |
|------|----------|-----------|
| KM Extra | `price_per_extra_km` | `getExtraKmValue()` cascata |
| Hora Extra | `price_per_extra_hour` | `getExtraHourValue()` cascata |
| Unidades | R$/km, R$/h | R$/km, R$/h |
| Cálculo paralelo | ❌ | ❌ |

---

## 6. SEGURANÇA — BACKLOG (NÃO CORRIGIDO NESTA EXECUÇÃO)

### SEC-01 — `investment/*`

Rotas sensíveis sem auth em handlers Vercel: `init`, `snapshots`, `snapshots-all`, `snapshot-delete`. Accounts com `assertAsaasApiAccess`.

### SEC-02 — `/api/supabase/*`

7 rotas Express com `supabaseAdmin` sem `requireAuth` (incl. `init-invoices`, `db-metrics`).

### SEC-03 — `asaas/webhook`

`POST /api/asaas/webhook` sem validação de origem no código. **NÃO VALIDADO** em produção.

**Requisitos futuros SEC-03:**

- Validar header `asaas-access-token`
- Segredo próprio de webhook (não API key Asaas)
- Comparação segura (timing-safe)
- Idempotência por event ID
- Não quebrar eventos legítimos

### NB-07 — catch-all `api/index`

~138 rotas (~64%) ainda no catch-all. Estratégia: rota crítica → handler leve → teste → deploy.

---

## 7. OUTROS ITENS P3 (revalidados)

| Item | Status |
|------|--------|
| replit removido | 🟢 SEGURA |
| billing-override | ✅ requireAuth + requireRole; 401 sem token |
| realtime 2–4 refreshes | Dívida performance — não bloqueante |

---

## 8. TESTES

| Suíte | Resultado |
|-------|-----------|
| `fase3-p3-limpeza-seguranca.test.ts` | **6/6 pass** (+1 teste gap Plinio) |
| P0+P1+P2+P3 | **56/56 pass** |
| Completa (excl. NB-06 hang) | **735 / 730 / 5 fail** |
| Delta vs baseline anterior | +1 teste, +1 pass, **mesmas 5 falhas** |
| `npm run build` | **OK** |

### 5 falhas baseline (inalteradas)

1. `Vercel tem funções leves para CRUD de contas` — `investment-accounts.test.ts`
2. `tela dispara sync de pagamentos e retry NF sem remover import React` — `invoice-display.test.ts`
3. `registerTimeClockPunch dispara requestPresenceRefresh após inserir` — `presence-refresh.test.ts`
4. `resolveNfServiceDescription usa discriminação, não prefixo NF TMSEG` — `receivable-desc-nf.test.ts`
5. `DashboardDiretoria não renderiza a seção Detalhe do em aberto` — `zapi-sdk-cockpit.test.ts`

### Teste de regressão Plinio (novo)

`Plinio + OS destravada: campos financeiros cliente usam clientFinanceInputLocked` — verifica:

- `input-toll-client`, `input-displacement-client`, `input-custom-client-base/km/hour` → `readOnly={clientFinanceInputLocked}`
- `input-toll-provider` → **não** usa gate cliente
- `if (!canEditClientData) return` na troca de tabela cliente

---

## 9. ROLLBACK

| Item | Ação |
|------|------|
| Correção Plinio | Reverter `clientFinanceInputLocked` em `MissionFinancialModal.tsx` |
| PR inteiro | Não mergear |
| Produção | Permanece `ae2fc382` |

---

## 10. FILA PRÓXIMO BLOCO

1. **SEC-01** — auth em investment snapshots/init/delete
2. **SEC-02** — auth + handlers leves supabase admin
3. **SEC-03** — webhook Asaas (token + idempotência)
4. **NB-07** — catch-all rota a rota
5. Testes baseline desatualizados (5)
6. Realtime performance (opcional)

---

## GIT / PR

| Item | Valor |
|------|-------|
| Branch | `cursor/fase3-p3-limpeza-seguranca-eaa8` |
| PR | #261 (draft) |
| Merge | **NÃO** |
| Deploy | **NÃO** |

---

*Fase 3 P3 — Correção Final Plinio — Cloud Agent — 2026-08-13*
