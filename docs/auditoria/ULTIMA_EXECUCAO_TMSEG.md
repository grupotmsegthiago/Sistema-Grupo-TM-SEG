# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **NB-07: migração gradual das seis rotas `/api/supabase/*`**  
> **Não contém segredos. NÃO mergeado. NÃO publicado.**

---

## NB-07 SUPABASE — IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-14 (UTC) |
| **Branch** | `cursor/nb07-supabase-routes-eaa8` |
| **Base** | `main` @ `d39eebd0` (funcional `c8f7c59d`) |
| **PR** | [#265](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/265) — draft |
| **Tag produção** | `baseline-fase3-sec01-sec02-merged-20260814` |
| **Produção alterada** | **Não** |
| **Banco/schema** | **Não alterado** |
| **PR #262 / SEC-03** | **Congelado** |

## PROGRESSO

| Indicador | Valor |
|-----------|-------|
| **EXECUÇÃO ATUAL** | **100%** |
| **FASE 3** | **74%** (inalterada — branch não publicada) |
| **PROGRAMA GERAL** | **63%** (inalterado) |

## DECISÃO NB-07

# 🟢 NB-07 SUPABASE APTO PARA REVISÃO/MERGE

As seis rotas deixam de depender do catch-all `api/index` e passam por rewrites
específicos para `api/supabase-admin.ts`. Auth, roles, respostas e operações foram
preservadas em uma SSOT compartilhada com o Express.

## ROTAS MIGRADAS

| Rota | Método | Consumidor | Auth / roles | Operação | Classe |
|------|--------|------------|--------------|----------|--------|
| `/api/supabase/init-invoices` | POST | `FinancialInvoiceControl`, `FinancialTransactionList` | auth + diretoria/admin/ceo/financeiro/controller | probes `financial_invoices`; retorna orientação SQL se estrutura faltar; **não executa DDL** | administração/diagnóstico |
| `/api/supabase/status` | GET | `ServerStats` | auth + diretoria/admin/ceo | ping REST + incidentes/manutenções Supabase | diagnóstico/leitura |
| `/api/supabase/db-metrics` | GET | `ServerStats` | auth + diretoria/admin/ceo | 21 contagens em paralelo + estimativa de uso | diagnóstico/leitura |
| `/api/supabase/storage-usage` | GET | `ServerStats` | auth + diretoria/admin/ceo | buckets + até 1000 objetos por bucket | diagnóstico/leitura |
| `/api/supabase/billing-links` | GET | `ServerStats` | auth + diretoria/admin/ceo | links estáticos do painel | administração/leitura |
| `/api/supabase/health-check` | GET | `ServerStats`; referência em `integracoesDiagnostics` | auth + diretoria/admin/ceo | database/auth/storage/realtime probes | diagnóstico/leitura |

Todos os consumidores frontend continuam usando `authFetch`; nenhum frontend foi alterado.

## ARQUITETURA

```text
request /api/supabase/<rota>
  → rewrite específico (antes de /api/(.*))
  → api/supabase-admin.ts
  → authorizeSupabaseAdminRequest()
  → função compartilhada em lib/supabaseAdminOperations.ts
  → response
```

| Arquivo | Alteração |
|---------|-----------|
| `api/supabase-admin.ts` | handler Vercel fino; método, auth, dispatch, resposta |
| `lib/supabaseAdminApiAuth.ts` | equivalente serverless de `requireAuth` + `requireRole` |
| `lib/supabaseAdminOperations.ts` | SSOT das seis operações, compartilhada com Express |
| `server/routes.ts` | handlers Express passam a chamar a mesma SSOT |
| `vercel.json` | seis rewrites específicos antes do catch-all |
| `scripts/nb07-supabase-routes.test.ts` | 40 testes de auth, métodos, dispatch, rewrites e preservação |

O catch-all global `api/index` não foi alterado.

## AUTENTICAÇÃO

| Caso | Resultado |
|------|-----------|
| Sem token | 401 antes da operação |
| Token inválido/inativo | 403 |
| Role incorreta | 403 |
| Role permitida | chega à operação mock |
| Método incorreto | 405 + `Allow` |

O resolver serverless reutiliza `resolvePrincipalFromToken`, que consulta `system_users`
com cliente administrativo apenas no backend. A service role não é retornada, logada ou
importada pelo frontend. O bundle público contém somente uma mensagem UI preexistente
citando o **nome** da env; nenhum valor secreto é empacotado.

## RUNTIME — ANTES / DEPOIS

| Cenário | Antes (produção `c8f7c59d`) | Depois (branch, equivalente Vercel) |
|---------|------------------------------|------------------------------------|
| `/api/supabase/status` sem auth | timeout ~20s | 401 em menos de 1 ms no handler |
| `/api/supabase/db-metrics` sem auth | timeout ~20s | 401 em menos de 1 ms no handler |
| Demais quatro rotas sem auth | catch-all sujeito a timeout | 401 em menos de 1 ms |
| Roteamento | `/api/(.*)` → `api/index` | rewrite específico → `api/supabase-admin` |

Evidência adicional: `api/supabase-admin.ts` foi empacotado isoladamente via esbuild
(849,2 kB) e `vercel.json` passou no parse JSON. A prova não envolve deploy.

## PERFORMANCE (SEM ALTERAR REGRAS)

- `db-metrics`: mantém 21 `count exact` em `Promise.allSettled`.
- `storage-usage`: mantém listagem sequencial dos buckets e limite 1000 por bucket.
- `status`: mantém ping ao banco + duas consultas ao status público Supabase.
- `health-check`: mantém quatro probes (database, auth, storage, realtime).
- `init-invoices`: mantém timeout soft de 4 s por probe.
- Handler Vercel: `maxDuration=30`; `Cache-Control: no-store`.

Nenhum cálculo, filtro, limite ou resposta foi mudado para otimização.

## PRESERVAÇÃO

| Escopo | Evidência |
|--------|-----------|
| NF | zero arquivos NF/frontend no diff; `/api/nf/invoices` → `nf-control?op=list`; `transformFinancialInvoicesForControl()` intacto |
| Asaas | zero arquivos/rewrite Asaas no diff; webhook e SEC-03 intactos |
| Investment | zero arquivos funcionais investment no diff; rewrite preservado |
| `/api/health`, `/api/version` | rewrites preservados |
| Banco/schema | nenhuma migration/SQL executada; `init-invoices` apenas retorna orientação existente |

## TESTES

| Suíte | Resultado |
|-------|-----------|
| NB-07 novas rotas | **40/40** |
| NB-07 + SEC-01/02 + guards NF/SEC-03 | **66/66** (rodada final) |
| Foco NB-07 + SEC + NF completo | **77/77** |
| Asaas + P0/P1/P2/P3 | **126/126** |
| TS completa (exclui hang conhecido `nb06-migration-routes`) | **809 total / 804 pass / 5 fail** |
| Componentes React | **4 total / 2 pass / 2 fail** (DHL preexistente; zero TSX alterado) |
| `npm run build` | **OK** |
| Bundle isolado handler Vercel | **OK** |
| `vercel.json` | **OK** |

As cinco falhas TS são o baseline já documentado; nenhum teste novo falhou.
As duas falhas TSX são de renderização DHL e não têm arquivos no diff.

## DIFF FINAL

```text
api/supabase-admin.ts
lib/supabaseAdminApiAuth.ts
lib/supabaseAdminOperations.ts
scripts/nb07-supabase-routes.test.ts
server/routes.ts
vercel.json
docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md
```

**Zero alterações:** Asaas, webhook, SEC-03, NF, investment funcional, banco/schema,
regras financeiras e catch-all global.

## ROLLBACK

Reverter os commits da branch/PR #265 restaura o roteamento anterior pelo catch-all.
Produção permanece em `c8f7c59d` (mais handoff `d39eebd0`) e tag
`baseline-fase3-sec01-sec02-merged-20260814`.

---

## HISTÓRICO — PUBLICAÇÃO SEC-01 + SEC-02 (PR #264)

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-14 (UTC) |
| **Tipo** | Publicação controlada SEC-01 + SEC-02 |
| **PR publicado** | [#264](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/264) |
| **PR congelado** | [#262](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/262) (SEC-03) |
| **Branch origem** | `cursor/fase3-sec01-sec02-safe-eaa8` |
| **Commit publicado** | `c8f7c59d` |
| **Tag** | `baseline-fase3-sec01-sec02-merged-20260814` |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |
| **Domínio** | `sistema.grupotmseg.com.br` |

---

## PROGRESSO — TRÊS INDICADORES

| Indicador | Valor | Metodologia |
|-----------|-------|-------------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 | Revalidação + merge + deploy + smoke + handoff |
| **FASE 3 (total)** | **74%** 🟢 | +4% SEC-01/02 publicados (SEC-03 pendente) |
| **PROGRAMA GERAL** | **63%** 🟢 | +2% publicação parcial bloco SEC |

---

## DECISÃO FINAL

# 🟡 PUBLICADO COM PENDÊNCIA NB-07

| Critério | Resultado |
|----------|-----------|
| Merge PR #264 → dev → main | ✅ `c8f7c59d` |
| Deploy Vercel | ✅ buildId `c8f7c59dd440f0bb806af7d6e4b2a888f4440345` |
| SEC-03 ausente | ✅ zero alterações webhook/token |
| SEC-01 smoke prod | ✅ `/api/investment/*` → **401** sem auth (handler leve) |
| SEC-02 smoke prod | 🟡 `/api/supabase/*` → **timeout 20s** (NB-07 catch-all) — auth no código, runtime limitado |
| NF hotfix | ✅ `/api/nf/invoices` → **401** sem auth |
| Asaas inalterado | ✅ saldo 401; status 200; webhook timeout (igual pré-publicação) |
| Vercel ENV | ✅ não alterado |
| PR #262 | ✅ congelado |

---

## PONTO DE RETORNO (pré-publicação)

| Item | Valor |
|------|-------|
| `main` | `c70acec9` |
| `dev` | `9d03166a` |
| Tag anterior | `baseline-hotfix-nf-invoices-20260814` |
| buildId produção | `c70acec9d7649ef91eda2ee3297f3ffe434bafd0` |
| `/api/version` | `3.7.60` |

### Rollback

```bash
git checkout main
git revert c8f7c59d   # ou reset --hard c70acec9 + force (somente se autorizado)
git push origin main
# Redeploy Vercel projeto sistema-grupo-tm-seg
```

Tag de retorno funcional: `baseline-hotfix-nf-invoices-20260814` @ `c70acec9`

---

## MERGE EXECUTADO

```
PR #264 → dev (merge commit c8f7c59d)
dev → main (fast-forward c70acec9..c8f7c59d)
push origin dev main
tag baseline-fase3-sec01-sec02-merged-20260814
```

**Conflito:** apenas `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` (documentação) — arquivos SEC mergearam limpos.

---

## DEPLOY PRODUÇÃO

| Check | Resultado |
|-------|-----------|
| `GET /api/version` | `buildId=c8f7c59d…` ✅ |
| `GET /api/health` | **200** ✅ |
| `GET /` | **200** ✅ |
| builtAt | `2026-08-14T14:59:47.234Z` |

---

## SMOKE PRODUÇÃO (2026-08-14)

### SEC-01 — Investment

| Rota | Sem auth | Esperado |
|------|----------|----------|
| `GET /api/investment/snapshots-all` | **401** `Não autorizado` | ✅ |
| `POST /api/investment/init` | **401** `Não autorizado` | ✅ |

Handlers Vercel dedicados — auth fail-closed **comprovado em produção**.

### SEC-02 — Supabase

| Rota | Sem auth | Resultado |
|------|----------|-----------|
| `GET /api/supabase/status` | timeout 20s | 🟡 **NB-07** |
| `GET /api/supabase/db-metrics` | timeout 20s | 🟡 **NB-07** |

**Classificação:** **SEGURANÇA APLICADA / RUNTIME AINDA LIMITADO POR NB-07**  
Rotas caem no catch-all `api/index`; auth `requireAuth` está no Express mas cold-start/timeout impede resposta 401 rápida. **Não corrigido nesta execução.**

Consumidores (`ServerStats`, etc.) com `authFetch` + sessão válida podem continuar sujeitos ao mesmo timeout pré-existente.

### NF — hotfix preservado

| Rota | Sem auth | Resultado |
|------|----------|-----------|
| `GET /api/nf/invoices` | **401** | ✅ protegido |

Código: `FinancialInvoiceControl` → `authFetch('/api/nf/invoices')`; `transformFinancialInvoicesForControl()` intacto na main publicada.

### Asaas — zero alteração

| Rota | Resultado | Notas |
|------|-----------|-------|
| `GET /api/asaas/balances` | **401** | inalterado (já protegido) |
| `GET /api/asaas/status` | **200** | handler leve OK |
| `POST /api/asaas/webhook` | timeout 20s | **igual pré-publicação** (catch-all NB-07) |

**SEC-03 / `ASAAS_PAYMENT_WEBHOOK_TOKEN`:** não publicado.

---

## TESTES PRÉ-DEPLOY

| Suíte | Resultado |
|-------|-----------|
| SEC-01/02 | **19/19** |
| Guard NF + anti-SEC-03 | **7/7** |
| NF regressão | **7/7** |
| Asaas | **70/70** |
| P0–P3 | **56/56** |
| TS excl. NB-06 hang | **769 / 764 / 5 fail** (baseline) |
| `npm run build` | **OK** |

---

## ARQUIVOS PUBLICADOS

| Arquivo | Bloco |
|---------|-------|
| `lib/investmentApiAuth.ts` | SEC-01 |
| `api/investment-init.ts` (+ snapshots*) | SEC-01 |
| `server/routes.ts` (investment + supabase auth) | SEC-01/02 |
| `scripts/fase3-sec01-sec02-security.test.ts` | testes |
| `scripts/sec-safe-nf-hotfix-guard.test.ts` | testes |

**Não publicado:** `asaas-payment-webhook.ts`, `asaasPaymentWebhook.ts`, rewrite webhook, SEC-03.

---

## PRÓXIMOS PASSOS (NÃO INICIADOS)

| Item | Status |
|------|--------|
| SEC-03 webhook token | PR #262 congelado |
| Handlers dedicados `/api/supabase/*` | NB-07 — pendência arquitetural |
| Configurar `ASAAS_PAYMENT_WEBHOOK_TOKEN` | **Não** neste ciclo |

---

*Publicação SEC-01/02 — Cloud Agent — 2026-08-14 — PR #262 não iniciado*
