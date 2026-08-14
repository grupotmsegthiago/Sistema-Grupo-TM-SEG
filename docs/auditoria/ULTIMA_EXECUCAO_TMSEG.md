# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **Revisão Final PR #262 (SEC-01/02/03) sem quebrar Asaas**  
> **Não contém segredos. NÃO mergeado. NÃO publicado.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-14 (UTC) |
| **Tipo** | Revisão final PR #262 — SEC-01/02/03 + não-regressão Asaas/NF |
| **Branch** | `cursor/sec-01-02-03-seguranca-eaa8` |
| **PR** | [#262](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/262) |
| **Produção atual** | `main` @ `c70acec9` — tag `baseline-hotfix-nf-invoices-20260814` (hotfix NF publicado e validado pelo usuário) |
| **Base original PR** | `9a083213` (antes do hotfix NF) |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |
| **Domínio** | `sistema.grupotmseg.com.br` |

---

## PROGRESSO — TRÊS INDICADORES

| Indicador | Valor | Metodologia |
|-----------|-------|-------------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 | Rebase/merge + diff + mapa Asaas + SEC-03 + testes + handoff |
| **FASE 3 (total)** | **70%** 🟢 | SEC implementado em branch; aguarda merge coordenado |
| **PROGRAMA GERAL** | **61%** 🟢 | Sem alteração |

---

## DECISÃO FINAL — REVISÃO PR #262

# 🟡 PR #262 PRECISA AJUSTE ANTES DO MERGE

| Critério | Resultado |
|----------|-----------|
| Rebase/merge com `main` (hotfix NF) | 🟡 **Conflito** — ver seção abaixo; **não resolvido automaticamente** |
| Hotfix NF preservado no diff | ✅ `FinancialInvoiceControl` → `/api/nf/invoices`; **não revertido** |
| SEC-01 investment | ✅ fail-closed; consumidores com `authFetch` |
| SEC-02 `/api/supabase/*` | ✅ 6 rotas protegidas; `ServerStats`/`FinancialInvoiceControl` usam `authFetch` |
| SEC-03 webhook pagamento | 🟡 **muda comportamento** — exige `ASAAS_PAYMENT_WEBHOOK_TOKEN` ou webhook para de baixar |
| Fluxos Asaas saldo/transfer/cobrança/sync | ✅ **inalterados** no diff |
| **PR #262 MUDA FLUXO ASAAS QUE JÁ FUNCIONA?** | **PARCIALMENTE** — somente webhook de **pagamento** (baixa automática) |
| Testes SEC | ✅ **27/27** |
| Testes NF regressão | ✅ **7/7** (`nf-invoices-list` + `invoice-control-loading`) |
| Testes Asaas | ✅ **79/79** |
| P0–P3 | ✅ **56/56** |
| TS completa (excl. NB-06 hang) | ✅ **766 / 759 / 7 fail** (5 baseline + 2 pré-existentes hotfix; **zero falha nova SEC**) |
| Build | ✅ `npm run build` OK |
| Merge / publicação | ❌ **Não executado** |

### Por que 🟡 e não 🟢

1. **Conflito de merge** com `main` em `lib/nfInvoiceControlApi.ts` (hotfix publicado extraiu `transformFinancialInvoicesForControl`; branch SEC tem lógica inline equivalente) — precisa resolução manual antes do merge.
2. **SEC-03 altera auth do webhook de pagamento**: produção hoje aceita POST sem token; após publicar PR #262 sem configurar `ASAAS_PAYMENT_WEBHOOK_TOKEN` na Vercel **e** nos 3 painéis Asaas, a baixa automática retorna **503** e para de funcionar.
3. Deploy coordenado obrigatório: configurar env + `authToken` nas 3 contas **antes** ou **no mesmo deploy** da publicação.

### Por que não 🔴

- Saldo, transferência Pix, transfer-approval, create-charge, sync-payment-status, sync-customers **não são alterados** pelo PR.
- Hotfix NF **não é revertido** — listagem continua via `/api/nf/invoices`.
- Lógica de baixa do webhook é a **mesma** (extraída, não reescrita); só a validação de origem é nova.

---

## 1. REBASE / ATUALIZAÇÃO COM MAIN

| Tentativa | Resultado |
|-----------|-----------|
| `git rebase origin/main` | ❌ Conflito **somente** em `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` |
| `git merge origin/main` | ❌ Conflitos em 3 arquivos (ver abaixo) |
| `server/routes.ts`, `vercel.json` | ✅ auto-merge OK no rebase (SEC + NF coexistem) |

### Conflitos no merge (PARADO — não resolvido)

| Arquivo | Natureza | Ação |
|---------|----------|------|
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Documentação | Resolver na hora do merge |
| `lib/nfInvoiceControlApi.ts` | **Financeiro** | `main` tem `transformFinancialInvoicesForControl()` exportada; SEC tem lógica inline em `listFinancialInvoicesForControl()` — **mesmo comportamento, estrutura diferente** |
| `scripts/nf-invoices-list.test.ts` | Teste (add/add) | Alinhar com versão `main` pós-hotfix |

**Regra aplicada:** conflito financeiro **não** resolvido automaticamente nesta execução.

---

## 2. DIFF PR #262 — CLASSIFICAÇÃO POR ARQUIVO

`git diff origin/main...cursor/sec-01-02-03-seguranca-eaa8` — **17 arquivos**

| Arquivo | Bloco | Alteração | Consumidor | Risco | Impacto produção |
|---------|-------|-----------|------------|-------|------------------|
| `lib/asaasPaymentWebhook.ts` | SEC-03 | **NOVO** — token + processamento baixa | `api/asaas-payment-webhook.ts`, Express fallback | Médio | Webhook exige env nova |
| `api/asaas-payment-webhook.ts` | SEC-03 | **NOVO** — handler serverless leve | Asaas S2S (3 contas) | Médio | Substitui catch-all para webhook |
| `vercel.json` | SEC-03 + NF | rewrite `/api/asaas/webhook` + `/api/nf/invoices` | Vercel routing | Baixo | Webhook rápido; NF já em prod |
| `server/routes.ts` | SEC-01/02/03 + NF | auth supabase/investment; webhook token; `/api/nf/invoices` | Express dev + catch-all | Médio | Auth em rotas antes públicas |
| `lib/investmentApiAuth.ts` | SEC-01 | **NOVO** — wrapper auth investment | handlers investment | Baixo | Fail-closed |
| `api/investment-init.ts` | SEC-01 | +`denyInvestmentApiUnlessAuthorized` | `FinancialAccountManager` | Baixo | 401/403 sem auth |
| `api/investment-snapshots.ts` | SEC-01 | +auth | `FinancialAccountManager` | Baixo | idem |
| `api/investment-snapshots-all.ts` | SEC-01 | +auth | `FinancialAccountManager` | Baixo | idem |
| `api/investment-snapshot-delete.ts` | SEC-01 | +auth | `FinancialAccountManager` | Baixo | idem |
| `lib/nfInvoiceControlApi.ts` | NF (hotfix) | `listFinancialInvoicesForControl()` | `api/nf-control`, Express | Baixo | **Duplicado com main** — conflito merge |
| `api/nf-control.ts` | NF (hotfix) | `GET ?op=list` | `FinancialInvoiceControl` | Baixo | Já em produção |
| `components/FinancialInvoiceControl.tsx` | NF (hotfix) | `authFetch('/api/nf/invoices')` | UI Controle NF | Baixo | **Preservado** — não reverte anon |
| `scripts/fase3-sec-security.test.ts` | SEC | **NOVO** 27 testes | CI | — | — |
| `scripts/nf-invoices-list.test.ts` | NF | **NOVO** regressão listagem | CI | — | — |
| `scripts/invoice-control-loading.test.ts` | NF | atualizado para API | CI | — | — |
| `scripts/nb06-migration-routes.test.ts` | NF | +rewrite invoices | CI | — | — |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | docs | handoff | — | — | — |

**Hotfix NF:** presente no PR (commit `21f02e10` anterior ao hotfix em `main`). Conteúdo **equivalente** ao publicado; merge com `main` exige deduplicar/alinhar `transformFinancialInvoicesForControl`.

---

## 3. MAPA FLUXOS ASAAS FUNCIONAIS (3 CONTAS) — INALTERADOS PELO PR

### TM Gestão (`ASAAS_TMGESTAO_API`, CNPJ 60.485.843/0001-57)

| Fluxo | Endpoint | Env | Consumidor | Auth atual | Alterado PR #262? |
|-------|----------|-----|------------|------------|-------------------|
| Saldo | `GET /api/asaas/balances` | `ASAAS_TMGESTAO_API` | `FinancialTransactionList`, `FinancialAccountManager` | `assertAsaasApiAccess` | ❌ |
| Transferência Pix | `POST /api/asaas/transfer-pix` | API key Gestão + `ASAAS_FINANCEIRO_WALLET_ID` | `AsaasPixTransferModal` | `assertAsaasApiAccess` | ❌ |
| Aprovação transferência | `POST /api/asaas/transfer-approval` | `ASAAS_WEBHOOK_TMGESTAO_API` | Asaas S2S | token por conta / open mode | ❌ |
| Cobrança | `POST /api/asaas/create-charge` | API key por `issuer_company` | `ClientBillingReport` | `assertAsaasApiAccess` | ❌ |
| Baixa manual | `POST /api/asaas/sync-payment-status` | API key emissora | `FinancialInvoiceControl`, `ClientBillingReport` | `assertAsaasApiAccess` | ❌ |
| Baixa automática | `POST /api/asaas/webhook` | — (prod: sem token) | Asaas S2S | **nenhuma** → SEC-03: token global | ✅ **SIM** |
| Sync clientes | `POST /api/asaas/sync-customers` | 3 API keys | `ClientList`, `ClientForm` | `CRON_SECRET` ou `assertAsaasApiAccess` | ❌ |

### TM Segurança (`ASAAS_TMSEGURANCA_API`, CNPJ 28.804.378/0001-67)

Mesma tabela — endpoints compartilhados; API key e webhook transfer (`ASAAS_WEBHOOK_TMSEGURANCA_API`) **isolados por emissor**. PR #262 **não altera** saldo/transfer/cobrança/sync.

### TM Security (`ASAAS_TMSECURITY_API`, CNPJ 60.508.931/0001-27)

Idem — isolamento por `issuer_company` e env própria. PR #262 **não altera** fluxos exceto webhook pagamento.

---

## 4. IMPACTO SEC-03 — CONCLUSÃO OBJETIVA

### O que o PR faz com `/api/asaas/webhook`

| Aspecto | Produção (`main` @ `c70acec9`) | PR #262 |
|---------|--------------------------------|---------|
| Roteamento | Catch-all Express `api/index` (NB-07) — risco 504 | Rewrite → `api/asaas-payment-webhook.ts` (leve) |
| Handler Express | Inline em `routes.ts` | Chama `lib/asaasPaymentWebhook.ts` (mesma lógica) |
| Auth | **Nenhuma** | `asaas-access-token` vs `ASAAS_PAYMENT_WEBHOOK_TOKEN` |
| Env ausente | Processa baixa | **503** `webhook_not_configured` |
| Token errado | Processa baixa | **401** |
| Supabase client | `supabase` (anon em parte) | `createSupabaseAdminClient()` (service role) |

**Classificação:** **EXTRAI + PARALELIZA + EXPÕE** — não cria fluxo de negócio novo; refatora roteamento e adiciona validação de origem.

### PR #262 MUDA FLUXO ASAAS QUE JÁ FUNCIONA?

# PARCIALMENTE

- **SIM** para baixa automática via webhook (auth obrigatória após publicar).
- **NÃO** para saldo, transferência, aprovação de transferência, cobrança, sync manual, sync clientes.

---

## 5. NECESSIDADE DE `ASAAS_PAYMENT_WEBHOOK_TOKEN`

| Cenário | Necessário? |
|---------|-------------|
| Produção **hoje** (`main`) | **Não** — webhook funciona sem token (sem validação) |
| Após publicar PR #262 **sem** configurar env | **Sim** — sem token → **503**, baixa automática **para** |
| Baixa via `sync-payment-status` / `sync-open-payments` | **Não** — auth de usuário, independente do webhook |
| Cobrança / emissão NF | **Não** |

**Conclusão:** env nova é **necessária apenas para manter** a baixa automática via webhook **após** publicar SEC-03. Não substitui tokens de transfer-approval (`ASAAS_WEBHOOK_*_API`). **Não pedir alteração no painel Asaas nesta execução** — apenas documentar dependência para deploy futuro coordenado.

---

## 6. SEGURANÇA SEM QUEBRA — RESUMO ANTES/DEPOIS

### SEC-02 — consumidores legítimos

| Consumidor | Rotas | Auth enviada | Pós-SEC |
|------------|-------|--------------|---------|
| `ServerStats.tsx` | 5 GET supabase | `authFetch` (JWT) | ✅ preservado |
| `FinancialInvoiceControl.tsx` | `init-invoices` POST | `authFetch` | ✅ preservado |
| `FinancialTransactionList.tsx` | `init-invoices` POST | `authFetch` | ✅ preservado |
| Anônimo | qualquer supabase | — | ❌ 401/403 (correto) |

### SEC-01 — `FinancialAccountManager.tsx`

Todas as rotas investment via `authFetch`; perfis financeiro/diretoria/admin. Anônimo → 401/403.

### SEC-03 — webhook

| Caller | Antes | Depois (com env) | Depois (sem env) |
|--------|-------|------------------|------------------|
| Asaas com token correto | 200 + baixa | 200 + baixa | 503 |
| Asaas sem token | 200 + baixa | 401 | 503 |
| Atacante externo | 200 + baixa possível | 401 | 503 |

### NF — não-regressão

| Item | Status |
|------|--------|
| `FinancialInvoiceControl` usa `/api/nf/invoices` | ✅ confirmado (grep + testes) |
| PR reverte hotfix | ❌ não reverte |
| Listagem anon | ❌ não reintroduzida |

---

## 7. TESTES DESTA REVISÃO

| Suíte | Resultado |
|-------|-----------|
| `fase3-sec-security.test.ts` | **27/27** |
| `nf-invoices-list.test.ts` + `invoice-control-loading.test.ts` | **7/7** |
| `asaas-*.test.ts` + `nf-isolada-asaas` + `financial-internal-transfer` | **79/79** |
| P0+P1+P2+P3 | **56/56** |
| TS `*.test.ts` excl. `nb06-migration-routes` (hang) | **766 / 759 / 7 fail** |
| `npm run build` | **OK** |

### 7 falhas (nenhuma nova do SEC)

5 baseline documentadas + 2 em `faturas-clean-slate.test.ts` / `faturas-excluir-todas.test.ts` (expectativa `transformFinancialInvoicesForControl` na `main` vs inline na branch SEC).

---

## 8. NB-07 — ROTAS SEC E DEPENDÊNCIA

| Rota | Handler dedicado? | Depende NB-07 em prod? |
|------|-------------------|------------------------|
| `/api/supabase/*` (6 rotas) | ❌ | ✅ catch-all — timeout provável mesmo com auth |
| `/api/investment/*` | ✅ rewrites Vercel | ❌ |
| `/api/asaas/webhook` (SEC-03) | ✅ `asaas-payment-webhook` | ❌ após publicar |
| `/api/nf/invoices` (hotfix) | ✅ `nf-control?op=list` | ❌ já em prod |

**Não corrigido globalmente** nesta execução.

---

## 9. AÇÃO HUMANA ANTES DE PUBLICAR PR #262

1. Resolver conflito merge `lib/nfInvoiceControlApi.ts` com `main` (preservar `transformFinancialInvoicesForControl` + SEC).
2. Configurar `ASAAS_PAYMENT_WEBHOOK_TOKEN` na Vercel (`sistema-grupo-tm-seg`).
3. Cadastrar **mesmo** `authToken` nos 3 painéis Asaas → webhook pagamento → URL `https://sistema.grupotmseg.com.br/api/asaas/webhook`.
4. Deploy coordenado (env + código no mesmo ciclo).
5. Validar POST webhook com token correto/incorreto; confirmar baixa automática e que saldo/transfer continuam OK.

---

*Revisão Final PR #262 — Cloud Agent — 2026-08-14 — NÃO mergeado, NÃO publicado*

---

## INCIDENTE — CONTROLE DE FATURAS / NF VAZIO

### Sintoma reportado

- Painel superior (Saúde das emissoras): TM GESTÃO TOTAL 15 / AUTORIZ. 15; TM SECURITY TOTAL 2 / AUTORIZ. 2
- Listagem inferior: **0 faturas** em todos os status (Em aberto, Pago, Vencidas, Canceladas)

### Mapeamento da tela

```
FinancialInvoiceControl.tsx (App → fin-invoices)
  ├─ fetchIssuerSummary() → authFetch GET /api/nf/summary
  │     → vercel rewrite → api/nf-control?op=summary
  │     → buildNfIssuerSummary() → Supabase **service role** → financial_invoices
  │
  └─ fetchInvoices() [ANTES] → supabase.from('financial_invoices') **anon/RLS** → []
     fetchInvoices() [DEPOIS] → authFetch GET /api/nf/invoices
           → api/nf-control?op=list → listFinancialInvoicesForControl() → service role
```

**Tabelas:** `financial_invoices` (principal), `financial_transactions` (receivables, não usada na listagem).

### Causa raiz

| Item | Detalhe |
|------|---------|
| **Classificação** | 🔴 **REGRESSÃO DE LEITURA/APRESENTAÇÃO** (dados existem) |
| **Causa** | `fetchInvoices` lia via cliente Supabase **anon**; RLS em `financial_invoices` retorna **0 linhas** para anon |
| **Evidência** | Query anon: `count=0` sem erro; summary admin via `/api/nf/summary` mostra 15+2 |
| **Relação PR #262** | **Não causado pelo hardening SEC** — `FinancialInvoiceControl.tsx` não mudou no commit SEC; problema estrutural pré-existente (desde migração para leitura direta anon) |
| **SEC init-invoices** | Irrelevante para listagem — fire-and-forget; não cria policy RLS em tabela existente |

### Dados no banco

- **Não apagados** — summary com 17 faturas ativas (15 Gestão + 2 Security) comprova existência
- Nenhum DELETE/UPDATE executado nesta investigação
- `init-invoices` / `ensure-clean-slate` **não executados**

### Correção mínima (branch)

| Arquivo | Alteração |
|---------|-----------|
| `lib/nfInvoiceControlApi.ts` | `listFinancialInvoicesForControl()` — epoch + MED- + VENCIDA |
| `api/nf-control.ts` | `GET ?op=list` |
| `vercel.json` | rewrite `/api/nf/invoices` → `nf-control?op=list` |
| `server/routes.ts` | `GET /api/nf/invoices` (dev local) + summary via `buildNfIssuerSummary` |
| `components/FinancialInvoiceControl.tsx` | `fetchInvoices` → `authFetch('/api/nf/invoices')` |
| `scripts/nf-invoices-list.test.ts` | **NOVO** — regressão listagem |
| `scripts/invoice-control-loading.test.ts` | atualizado |
| `scripts/nb06-migration-routes.test.ts` | rewrite invoices |

**Preserva:** auth (`assertFinanceNfAccess`), dados, regras financeiras, sem schema/migration.

### Testes

| Suíte | Resultado |
|-------|-----------|
| `nf-invoices-list.test.ts` | **4/4** |
| `invoice-control-loading.test.ts` | **3/3** |
| SEC + P0–P3 | **47/47** |
| TS completa (excl. NB-06 hang) | **766 / 759 / 7 fail** (5 baseline + 2 pré-existentes; zero falha nova da correção) |
| `npm run build` | **OK** |

### Decisão incidente

# 🟢 INCIDENTE CORRIGIDO NA BRANCH — PRONTO PARA REVISÃO

**NÃO mergeado. NÃO publicado.**

### Rollback desta correção

Reverter commit do incidente na branch ou restaurar `fetchInvoices` anterior (voltará a listar vazio com RLS).

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
