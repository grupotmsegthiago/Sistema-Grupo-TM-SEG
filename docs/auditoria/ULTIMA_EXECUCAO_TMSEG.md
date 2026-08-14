# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **Fase 3 Bloco SEC-01 / SEC-02 / SEC-03**  
> **Não contém segredos.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-14 (UTC) |
| **Tipo** | Segurança SEC-01 / SEC-02 / SEC-03 (sem merge, sem publicação) |
| **Branch** | `cursor/sec-01-02-03-seguranca-eaa8` |
| **Base** | `9a083213` (produção atual) |
| **Tag baseline anterior** | `baseline-fase3-p3-merged-20260813` |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |
| **Domínio** | `sistema.grupotmseg.com.br` |

---

## PROGRESSO — TRÊS INDICADORES

| Indicador | Valor | Metodologia |
|-----------|-------|-------------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 | Investigação Asaas (somente leitura) + handoff |
| **FASE 3 (total)** | **70%** 🟢 | Sem alteração — investigação não incrementa fase |
| **PROGRAMA GERAL** | **61%** 🟢 | Sem alteração |

---

## INVESTIGAÇÃO — CONTA ASAAS DO SISTEMA TM SEG

> Execução somente leitura — **nenhuma alteração** em Vercel, Asaas, chaves ou PR #262.

### Resultado

| Campo | Valor |
|-------|-------|
| **CONTA ASAAS USADA PELO SISTEMA** | **AS TRÊS CONTAS** (TM Gestão + TM Segurança + TM Security) — arquitetura multi-emissor |
| **CONFIANÇA** | **confirmada** (código + produção `GET /api/asaas/status?probe=1`) |
| **CONTA ÚNICA “PRINCIPAL”** | **NÃO FOI POSSÍVEL DETERMINAR** uma só — o sistema opera com 3 CNPJs/emissores em paralelo |
| **Conta default (fallback)** | **TM Gestão** — quando `issuer_company` ausente ou não reconhecido |

### Evidência — produção (2026-08-14, sem expor segredos)

`GET https://sistema.grupotmseg.com.br/api/asaas/status`:

```json
{ "configured": true, "companies": { "tmGestao": true, "tmSeguranca": true, "tmSecurity": true } }
```

`GET .../api/asaas/status?probe=1` — as **3 chaves** são produção, aceitas pelo Asaas (saldo + invoices + transfers OK):

| Conta | Env ativa (Vercel) | Fingerprint SHA-256 (12 chars) | CNPJ |
|-------|-------------------|----------------------------------|------|
| **TM Gestão** | `ASAAS_TMGESTAO_API` | `16d593003583` | `60.485.843/0001-57` |
| **TM Segurança** | `ASAAS_TMSEGURANCA_API` | `e24d8bb2ae9c` | `28.804.378/0001-67` |
| **TM Security** | `ASAAS_TMSECURITY_API` | `36aceed064c2` | `60.508.931/0001-27` |

Base URL API: `https://api.asaas.com/v3` (produção; sandbox só se chave `_hmlg_`/`_sandbox_`).

Wallet financeiro (repasses internos): `6641fec4-8476-48e3-90a8-3db6b14f538c` (`ASAAS_FINANCEIRO_WALLET_ID` ou default em código).

### Evidência — código

| Arquivo | O que prova |
|---------|-------------|
| `lib/asaasEnvKeys.ts` | 3 leitores de chave: `getAsaasApiKeyTmGestao`, `getAsaasApiKeyTmSeguranca`, `getAsaasApiKeyTmSecurity` |
| `server/asaasService.ts` | Mapa `asaasCompanies()` com as 3 empresas + CNPJs; fallback → `TM GESTÃO` |
| `lib/asaasSyncCustomersCore.ts` | `ASAAS_SYNC_COMPANIES = ['TM GESTÃO', 'TM SEGURANCA', 'TM SECURITY']` — sync para as 3 |
| `api/asaas-status.ts` | Diagnóstico reporta `tmGestao`, `tmSeguranca`, `tmSecurity` |
| `components/ClientForm.tsx` | Cliente vinculado a emissor (`issuer_company`) entre as 3 opções |
| `components/FinancialInvoiceControl.tsx` | Faturas com `issuer_company`; default retro = `TM GESTÃO` |
| `lib/asaasPaymentWebhook.ts` | Webhook de pagamento casa fatura por `asaas_payment_id` — **independente da conta emissora** |
| `lib/asaasTransferApproval.ts` | Webhook transfer-approval: **mesma URL** nas 3 contas; tokens **por conta** (`ASAAS_WEBHOOK_*_API`) |
| `api/asaas-transfer-approval.ts` | Hint: “Uma URL de webhook para as 3 contas” |

### Variáveis de ambiente — mapa seguro

| Finalidade | TM Gestão | TM Segurança | TM Security |
|------------|-----------|--------------|-------------|
| **API key (cobrança/NF/saldo)** | `ASAAS_TMGESTAO_API` (+ aliases legados `ASAAS_API_KEY`, `TMGESTAO`) | `ASAAS_TMSEGURANCA_API` (`TMSEGURANCA`) | `ASAAS_TMSECURITY_API` (`TMSECURITY`) |
| **Webhook transfer-approval** | `ASAAS_WEBHOOK_TMGESTAO_API` | `ASAAS_WEBHOOK_TMSEGURANCA_API` | `ASAAS_WEBHOOK_TMSECURITY_API` |
| **Webhook pagamento (SEC-03, PR #262)** | — | — | — |
| | **`ASAAS_PAYMENT_WEBHOOK_TOKEN`** (único, compartilhado — não por conta) | | |

### Webhooks existentes no desenho do sistema

| Endpoint | Tipo | Contas |
|----------|------|--------|
| `POST /api/asaas/transfer-approval` | Aprovação de saque/transferência | **3 contas** → mesma URL; token **por conta** na Vercel |
| `POST /api/asaas/webhook` | Baixa automática fatura (`PAYMENT_RECEIVED`) | **Qualquer conta** que emitiu a cobrança; token **único** `ASAAS_PAYMENT_WEBHOOK_TOKEN` |

**Produção atual (`9a083213`):** `POST /api/asaas/webhook` → **504 timeout** (catch-all NB-07). Correção SEC-03 só na branch PR #262 (handler dedicado), **não publicada**.

### QUAL CONTA DEVE RECEBER O `ASAAS_PAYMENT_WEBHOOK_TOKEN`?

**Resposta:** **as três contas Asaas** devem apontar o webhook de pagamento para a mesma URL (`https://sistema.grupotmseg.com.br/api/asaas/webhook`) e usar o **mesmo** `authToken` configurado em `ASAAS_PAYMENT_WEBHOOK_TOKEN` na Vercel — porque:

1. Cobranças são criadas na conta Asaas da **emissora** (`issuer_company` = TM Gestão, TM Segurança ou TM Security).
2. O handler não filtra por conta — só por `payment.id` / `externalReference` na tabela `financial_invoices`.
3. O padrão já adotado para transfer-approval documenta URL única nas 3 contas (com tokens separados); para pagamento o código prevê **um** token global.

**Se hoje só uma conta tiver webhook de pagamento no painel Asaas:** verificar manualmente em cada painel qual já aponta para `sistema.grupotmseg.com.br` — o código **não** expõe essa informação.

**TM Gestão como “primária” (provável, não exclusiva):** fallback de emissor, legado `ASAAS_API_KEY`, mensagens de erro citam `ASAAS_TMGESTAO_API` primeiro.

### Ação humana (inalterada)

Antes de publicar PR #262 e ativar SEC-03:

1. Definir um `authToken` forte para o webhook de **pagamento**.
2. Configurar em **cada** painel Asaas (Gestão, Segurança, Security) → Integrações → Webhooks → eventos `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` → URL acima.
3. Gravar o **mesmo** valor em `ASAAS_PAYMENT_WEBHOOK_TOKEN` na Vercel → redeploy.

---

## DECISÃO FINAL (bloco SEC — inalterada)

# 🟡 BLOCO SEC COM PENDÊNCIAS

| Critério | Resultado |
|----------|-----------|
| SEC-02 `/api/supabase/*` protegido no código | ✅ `requireAuth` + `requireRole` em 6 rotas Express |
| SEC-01 `investment/*` fail-closed | ✅ `assertAsaasApiAccess` em Express + handlers Vercel |
| SEC-03 webhook Asaas validação token | ✅ código pronto; **env ausente em produção** |
| Testes SEC novos | ✅ **27/27** |
| Regressão P0–P3 | ✅ **67/67** |
| Suíte TS (excl. NB-06 hang) | ✅ **762 / 757 / 5 fail** (mesmas 5 falhas baseline) |
| Build | ✅ `npm run build` OK |
| Merge / publicação | ❌ **Não executado** (conforme escopo) |
| Env `ASAAS_PAYMENT_WEBHOOK_TOKEN` | 🟡 **AÇÃO HUMANA NECESSÁRIA** antes de publicar |
| Idempotência Asaas por event ID | 🟡 dependência futura (sem migration nesta execução) |
| NB-07 catch-all | 🟡 `/api/supabase/*` ainda depende de `api/index` em produção |

---

## AÇÃO HUMANA NECESSÁRIA

Antes de publicar SEC-03 em produção, configurar na Vercel (projeto `sistema-grupo-tm-seg`):

| Variável | Descrição |
|----------|-----------|
| **`ASAAS_PAYMENT_WEBHOOK_TOKEN`** | Segredo próprio do webhook de pagamento Asaas (não reutilizar API key principal). Valor configurado no painel Asaas → Webhooks → token de autenticação (`asaas-access-token`). |

Sem esta variável, o endpoint retorna **503** `webhook_not_configured` (fail-closed).

---

## 1. SEC-02 — `/api/supabase/*` (PRIORIDADE MÁXIMA)

### Inventário

| Rota | Método | Consumidor | Operação | Service role? | Dados | Risco antes |
|------|--------|------------|----------|---------------|-------|-------------|
| `/api/supabase/init-invoices` | POST | `FinancialInvoiceControl.tsx`, `FinancialTransactionList.tsx` | DDL/seed tabela faturas | ✅ `supabaseAdmin` | `financial_invoices` | 🔴 CRÍTICA — público |
| `/api/supabase/status` | GET | `ServerStats.tsx` | métricas projeto Supabase | ✅ | status API | 🔴 CRÍTICA |
| `/api/supabase/db-metrics` | GET | `ServerStats.tsx` | contagem linhas tabelas | ✅ | múltiplas tabelas | 🔴 CRÍTICA |
| `/api/supabase/storage-usage` | GET | `ServerStats.tsx` | uso storage buckets | ✅ | buckets/arquivos | 🔴 CRÍTICA |
| `/api/supabase/billing-links` | GET | `ServerStats.tsx` | links painel billing | ❌ (estático) | URLs painel | 🟡 médio |
| `/api/supabase/health-check` | GET | `ServerStats.tsx`, `integracoesDiagnostics.ts` | probe tabelas críticas | ✅ | schema health | 🔴 CRÍTICA |

**Handlers Vercel dedicados:** nenhum — rotas existem apenas no Express (`server/routes.ts`). Em produção Vercel, caem no catch-all `api/index` (NB-07).

### Auth — antes → depois

| Rota | Antes | Depois |
|------|-------|--------|
| Todas as 6 | **Sem auth** (qualquer caller) | `requireAuth` + `requireRole` |
| `init-invoices` | — | roles: `diretoria`, `administrador`, `ceo`, `financeiro`, `controller` |
| demais GET | — | roles: `diretoria`, `administrador`, `ceo` |

**Consumidores legítimos:** todos usam `authFetch` (usuário autenticado com perfil admin/diretoria). Nenhum cron/webhook externo identificado.

**Service role:** continua no servidor (`supabaseAdmin`); nunca exposto ao navegador.

---

## 2. SEC-01 — `investment/*`

### Inventário

| Rota | Escrita/Leitura | Consumidor | Handler prod | Auth antes | Auth depois | Risco antes |
|------|-----------------|------------|--------------|------------|-------------|-------------|
| `POST /api/investment/init` | escrita (DDL) | `FinancialAccountManager.tsx` | `api/investment-init.ts` | ❌ | ✅ `denyInvestmentApiUnlessAuthorized` | 🔴 |
| `GET /api/investment/snapshots/:accountId` | leitura | — (Express fallback) | catch-all | ❌ | ✅ Express | 🟡 |
| `GET /api/investment/snapshots-all` | leitura | `FinancialAccountManager.tsx` | `api/investment-snapshots-all.ts` | ❌ | ✅ | 🔴 |
| `POST /api/investment/snapshots` | escrita | `FinancialAccountManager.tsx` | `api/investment-snapshots.ts` | ❌ | ✅ | 🔴 |
| `DELETE /api/investment/snapshots/:id` | escrita | `FinancialAccountManager.tsx` | `api/investment-snapshot-delete.ts` | ❌ | ✅ | 🔴 |
| `POST /api/investment/accounts` | escrita | `FinancialAccountManager.tsx` | `api/investment-accounts.ts` | ✅ (preservado) | ✅ | — |
| `PATCH /api/investment/accounts/:id` | escrita | `FinancialAccountManager.tsx` | `api/investment-accounts-item.ts` | ✅ (preservado) | ✅ | — |
| `DELETE /api/investment/accounts/:id` | escrita | `FinancialAccountManager.tsx` | `api/investment-accounts-item.ts` | ✅ (preservado) | ✅ | — |

### Mecanismo de auth (reutilizado, sem padrão novo)

- **Vercel handlers:** `lib/investmentApiAuth.ts` → `denyInvestmentApiUnlessAuthorized` → `assertAsaasApiAccess`
- **Express:** `requireAuth` + `requireInvestmentApiAccess()` (mesma regra)
- **Roles permitidos:** `administrador`, `diretoria`, `financeiro`, `ceo` (+ permissões equivalentes via `system_users`)
- **Fail-closed:** sem token → 401; perfil não autorizado → 403

---

## 3. SEC-03 — `asaas/webhook`

### Fluxo mapeado

```
Asaas (PAYMENT_RECEIVED / PAYMENT_CONFIRMED)
  → POST /api/asaas/webhook
  → vercel.json rewrite → api/asaas-payment-webhook.ts (handler dedicado)
  → verifyAsaasPaymentWebhookRequest (header asaas-access-token)
  → processAsaasPaymentWebhookEvent
  → supabaseAdmin: UPDATE financial_invoices SET status='PAGA'
```

### Estado antes → depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Validação origem | ❌ nenhuma | ✅ `asaas-access-token` vs `ASAAS_PAYMENT_WEBHOOK_TOKEN` |
| Segredo próprio | ❌ | ✅ env dedicada (não API key) |
| Comparação segura | — | ✅ `timingSafeEqual` |
| Token ausente/incorreto | processava | ✅ 401 antes do handler |
| Env ausente | processava | ✅ 503 `webhook_not_configured` |
| `requireAuth` usuário | ❌ (correto para webhook) | ❌ (mantido — S2S) |
| Idempotência event ID | ❌ | 🟡 comportamental (reprocessar `payment.id` mantém PAGA); **sem tabela dedup** |
| Logs sensíveis | logava contagem faturas | ✅ sem logar token/payload completo |
| Handler dedicado | catch-all Express | ✅ `api/asaas-payment-webhook.ts` + rewrite |

### Idempotência — dependência futura

Reprocessar o mesmo `payment.id` é seguro comportamentalmente (UPDATE idempotente para `PAGA`), mas **não há dedup por `event.id`** persistido. Implementação com tabela/coluna exigiria migration — **não implementado nesta execução**.

---

## 4. TESTES DE SEGURANÇA

### SEC (`scripts/fase3-sec-security.test.ts`) — 27/27

| Bloco | Casos |
|-------|-------|
| SEC-02 | 6 rotas supabase com `requireAuth`+`requireRole` |
| SEC-01 | 4 handlers Vercel + 8 rotas Express + preservação accounts |
| SEC-03 | sem env → 503; token ausente → 401; incorreto → 401; correto → ok; handler dedicado; rewrite vercel; mock processamento |

### Regressão

| Suíte | Resultado |
|-------|-----------|
| P0+P1+P2+P3 | **67/67** |
| TS completa (excl. `nb06-migration-routes` hang) | **762 / 757 / 5 fail** |
| Delta vs baseline P3 | +27 testes SEC, +27 pass, **zero falha nova** |
| `npm run build` | **OK** |

### 5 falhas baseline (inalteradas)

1. `Vercel tem funções leves para CRUD de contas (não depende do Express)` — `investment-accounts.test.ts`
2. `FinancialInvoiceControl — auto sync e labels` — `invoice-control-loading.test.ts`
3. `registerTimeClockPunch dispara requestPresenceRefresh após inserir` — `timeclock-presence.test.ts`
4. `Contas a Receber — descrição = texto da NF` — `receivable-desc-nf.test.ts`
5. `cockpit sem detalhe em aberto` — `zapi-sdk-cockpit.test.ts`

**Nenhuma operação financeira real executada nos testes** (mocks após camada de auth).

---

## 5. NB-07 — dependências SEC (não corrigido globalmente)

| Rota SEC | Handler dedicado? | Timeout prod? | Notas |
|----------|-------------------|---------------|-------|
| `/api/supabase/*` (6 rotas) | ❌ catch-all `api/index` | 🟡 provável 504 | auth no código; rota não alcança handler rápido |
| `/api/investment/*` | ✅ rewrites Vercel | ✅ OK | handlers leves com auth |
| `/api/asaas/webhook` | ✅ `api/asaas-payment-webhook.ts` | ✅ OK (novo) | não depende mais do catch-all |

**Handler dedicado criado nesta execução:** somente `api/asaas-payment-webhook.ts` (rota crítica SEC-03).

**Correção SEC-02 em produção** exigiria handlers dedicados para `/api/supabase/*` — fora do escopo desta execução.

---

## 6. ARQUIVOS ALTERADOS

| Arquivo | Alteração |
|---------|-----------|
| `lib/investmentApiAuth.ts` | **NOVO** — auth compartilhada investment |
| `lib/asaasPaymentWebhook.ts` | **NOVO** — validação token + processamento |
| `api/asaas-payment-webhook.ts` | **NOVO** — handler Vercel dedicado |
| `api/investment-init.ts` | +auth |
| `api/investment-snapshots.ts` | +auth |
| `api/investment-snapshots-all.ts` | +auth |
| `api/investment-snapshot-delete.ts` | +auth |
| `server/routes.ts` | supabase auth, investment auth, webhook token |
| `vercel.json` | rewrite `/api/asaas/webhook` |
| `scripts/fase3-sec-security.test.ts` | **NOVO** — 27 testes |

**Não alterado:** schema/banco, regras financeiras, `api/index` (NB-07), funcionalidades novas.

---

## 7. ROLLBACK

| Ação | Referência |
|------|------------|
| Descartar branch | `git checkout dev && git branch -D cursor/sec-01-02-03-seguranca-eaa8` |
| Produção inalterada | `9a083213` / tag `baseline-fase3-p3-merged-20260813` |
| Após merge futuro | redeploy commit anterior no projeto `sistema-grupo-tm-seg` |

---

## 8. PRÓXIMOS PASSOS (NÃO INICIADOS)

| ID | Item |
|----|------|
| SEC-03 publish | Configurar `ASAAS_PAYMENT_WEBHOOK_TOKEN` na Vercel + redeploy |
| SEC-02 prod | Handlers dedicados `/api/supabase/*` (NB-07) |
| Idempotência Asaas | Tabela `asaas_webhook_events` (migration) |
| NB-07 | catch-all global `api/index` |
| 5 testes baseline | Atualizar expectativas desatualizadas |

---

*Fase 3 Bloco SEC-01/02/03 — Cloud Agent — 2026-08-14 — NÃO mergeado, NÃO publicado*
