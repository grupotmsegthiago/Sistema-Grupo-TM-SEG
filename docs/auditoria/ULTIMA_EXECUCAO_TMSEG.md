# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **SEC-01/SEC-02 Safe (sem SEC-03, Asaas e NF preservados)**  
> **Não contém segredos. NÃO mergeado. NÃO publicado.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-14 (UTC) |
| **Tipo** | Separação controlada SEC-01 + SEC-02 |
| **Branch** | `cursor/fase3-sec01-sec02-safe-eaa8` |
| **Base** | `main` @ `c70acec9` (hotfix NF publicado e validado) |
| **Tag produção** | `baseline-hotfix-nf-invoices-20260814` |
| **PR #262** | **Congelado** — SEC-03 permanece na branch antiga |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |

---

## PROGRESSO — TRÊS INDICADORES

| Indicador | Valor |
|-----------|-------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 |
| **FASE 3 (total)** | **70%** 🟢 (sem aumento — apenas preparação) |
| **PROGRAMA GERAL** | **61%** 🟢 |

---

## DECISÃO FINAL

# 🟢 SEC-01/02 APTO PARA REVISÃO/MERGE

| Critério | Resultado |
|----------|-----------|
| SEC-03 excluído | ✅ **ZERO alterações** webhook / `ASAAS_PAYMENT_WEBHOOK_TOKEN` |
| Asaas funcional | ✅ diff funcional **ZERO** vs `main` |
| Hotfix NF | ✅ `transformFinancialInvoicesForControl` + `/api/nf/invoices` preservados |
| SEC-01 investment | ✅ fail-closed (`assertAsaasApiAccess`) |
| SEC-02 supabase | ✅ 6 rotas protegidas; consumidores com `authFetch` |
| NB-07 `/api/supabase/*` | 🟡 **pré-existente** — timeout catch-all não piorado por esta branch |
| Testes SEC novos | ✅ **26/26** (19 SEC + 7 guard) |
| NF regressão | ✅ **7/7** |
| Asaas | ✅ **70/70** |
| P0–P3 | ✅ **56/56** |
| TS completa (excl. NB-06 hang) | ✅ **769 / 764 / 5 fail** (baseline; **zero falha nova**) |
| Build | ✅ `npm run build` OK |
| Merge / publicação | ❌ **Não executado** |

### NB-07 — classificação SEC-02

As 6 rotas `/api/supabase/*` **continuam** no catch-all `api/index` (mesmo que `main`). O hardening adiciona `requireAuth`+`requireRole` **antes** do handler — não aumenta cold-start. Timeout operacional é **pré-existente**, não introduzido por SEC-02.

**Classificação:** SEC-02 **APTO** (auth correto; NB-07 documentado como pendência arquitetural separada).

---

## 1. ABORT MERGE CONFLITANTE (#262)

- Branch `cursor/sec-01-02-03-seguranca-eaa8` — merge/rebase **não** continuado
- Conflitos financeiros (`lib/nfInvoiceControlApi.ts`) **não** resolvidos automaticamente
- Nova branch criada **a partir de `main`**, não da branch SEC antiga

---

## 2. ARQUIVOS ALTERADOS (SOMENTE SEC-01/02)

| Arquivo | Bloco | Alteração |
|---------|-------|-----------|
| `lib/investmentApiAuth.ts` | SEC-01 | **NOVO** — `denyInvestmentApiUnlessAuthorized` |
| `api/investment-init.ts` | SEC-01 | +auth |
| `api/investment-snapshots.ts` | SEC-01 | +auth |
| `api/investment-snapshots-all.ts` | SEC-01 | +auth |
| `api/investment-snapshot-delete.ts` | SEC-01 | +auth |
| `server/routes.ts` | SEC-01/02 | auth investment (8 rotas) + supabase (6 rotas) |
| `scripts/fase3-sec01-sec02-security.test.ts` | testes | **NOVO** — 19 casos |
| `scripts/sec-safe-nf-hotfix-guard.test.ts` | testes | **NOVO** — 7 casos guard NF + anti-SEC-03 |

### Explicitamente NÃO alterados

- `api/asaas-payment-webhook.ts` — **não existe** nesta branch
- `lib/asaasPaymentWebhook.ts` — **não existe**
- `vercel.json` — **inalterado** (sem rewrite webhook)
- `components/FinancialInvoiceControl.tsx` — **inalterado** (hotfix main)
- `lib/nfInvoiceControlApi.ts` — **inalterado** (SSOT main com `transformFinancialInvoicesForControl`)
- Webhook Express `/api/asaas/webhook` — **byte-equivalente** à main

---

## 3. SEC-01 — INVESTMENT (ANTES → DEPOIS)

| Rota | Antes | Depois | Auth | Perfis | Consumidor |
|------|-------|--------|------|--------|------------|
| `POST /api/investment/init` | público | fail-closed | `assertAsaasApiAccess` | admin, diretoria, financeiro, ceo | `FinancialAccountManager` |
| `GET /api/investment/snapshots/:id` | público | fail-closed | idem | idem | Express fallback |
| `GET /api/investment/snapshots-all` | público | fail-closed | idem | idem | `FinancialAccountManager` |
| `POST /api/investment/snapshots` | público | fail-closed | idem | idem | `FinancialAccountManager` |
| `DELETE /api/investment/snapshots/:id` | público | fail-closed | idem | idem | `FinancialAccountManager` |
| `POST /api/investment/accounts` | público Express | fail-closed | idem | idem | `FinancialAccountManager` |
| `PATCH /api/investment/accounts/:id` | público Express | fail-closed | idem | idem | `FinancialAccountManager` |
| `DELETE /api/investment/accounts/:id` | público Express | fail-closed | idem | idem | `FinancialAccountManager` |

Handlers Vercel (`investment-init`, `snapshots*`, `snapshot-delete`) já tinham rewrite; agora também exigem auth. `investment-accounts` já protegido — **preservado**.

---

## 4. SEC-02 — `/api/supabase/*` (ANTES → DEPOIS)

| Rota | Antes | Depois | Auth | Perfis | Consumidor |
|------|-------|--------|------|--------|------------|
| `POST /api/supabase/init-invoices` | público | fail-closed | `requireAuth`+`requireRole` | diretoria, admin, ceo, financeiro, controller | `FinancialInvoiceControl`, `FinancialTransactionList` |
| `GET /api/supabase/status` | público | fail-closed | idem | diretoria, admin, ceo | `ServerStats` |
| `GET /api/supabase/db-metrics` | público | fail-closed | idem | idem | `ServerStats` |
| `GET /api/supabase/storage-usage` | público | fail-closed | idem | idem | `ServerStats` |
| `GET /api/supabase/billing-links` | público | fail-closed | idem | idem | `ServerStats` |
| `GET /api/supabase/health-check` | público | fail-closed | idem | idem | `ServerStats`, diagnostics |

Todos os consumidores usam `authFetch` — perfis legítimos **preservados**.

---

## 5. SEC-03 — EXCLUÍDO DESTE CICLO

Auditoria `git diff origin/main...HEAD`:

```
ASAAS_PAYMENT_WEBHOOK_TOKEN     → ZERO
asaas-payment-webhook           → ZERO
asaasPaymentWebhook             → ZERO
/api/asaas/webhook (diff)       → ZERO
```

SEC-03 permanece **congelado** na branch `cursor/sec-01-02-03-seguranca-eaa8` / PR #262.

---

## 6. HOTFIX NF — PRESERVADO

| Item | Status |
|------|--------|
| `transformFinancialInvoicesForControl()` | ✅ exportada e usada por `listFinancialInvoicesForControl` |
| `authFetch('/api/nf/invoices')` | ✅ em `FinancialInvoiceControl` |
| Rewrite `/api/nf/invoices` | ✅ em `vercel.json` |
| Teste guard `sec-safe-nf-hotfix-guard.test.ts` | ✅ 7/7 |

---

## 7. TESTES

| Suíte | Resultado |
|-------|-----------|
| `fase3-sec01-sec02-security.test.ts` | **19/19** |
| `sec-safe-nf-hotfix-guard.test.ts` | **7/7** |
| `nf-invoices-list.test.ts` + `invoice-control-loading.test.ts` | **7/7** |
| `asaas-*.test.ts` + `nf-isolada-asaas` | **70/70** |
| P0+P1+P2+P3 | **56/56** |
| TS excl. `nb06-migration-routes` | **769 / 764 / 5 fail** |
| `npm run build` | **OK** |

### 5 falhas baseline (inalteradas)

Mesmas da produção/hotfix — nenhuma introduzida por SEC-01/02.

---

## 8. ROLLBACK

```bash
git checkout main
git branch -D cursor/fase3-sec01-sec02-safe-eaa8
```

Produção permanece em `c70acec9` até merge explícito.

---

## 9. PRÓXIMOS PASSOS (NÃO INICIADOS)

| Item | Branch |
|------|--------|
| Publicar SEC-01/02 safe | `cursor/fase3-sec01-sec02-safe-eaa8` (após revisão humana) |
| SEC-03 webhook token | PR #262 — **congelado** até ciclo separado |
| Handlers dedicados `/api/supabase/*` | NB-07 — fora deste escopo |
| Configurar `ASAAS_PAYMENT_WEBHOOK_TOKEN` | **Não** neste ciclo |

---

*SEC-01/02 Safe — Cloud Agent — 2026-08-14 — NÃO mergeado, NÃO publicado, Asaas/Vercel ENV inalterados*
