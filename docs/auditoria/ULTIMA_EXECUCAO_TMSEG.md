# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — investigação NB-06 (504 migration em produção).  
> **Não contém segredos.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-12 (UTC) |
| **Tipo** | Investigação NB-06 — timeout `/api/migration/*` em produção |
| **Branch** | `cursor/nb06-migration-504-eaa8` |
| **Produção (sem deploy desta correção)** | buildId `420e9680…` |
| **Migration executada?** | **NÃO** |
| **P1 iniciado?** | **NÃO** |

---

## PROGRESSO — TRÊS INDICADORES

| Indicador | Valor | Significado |
|-----------|-------|-------------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 | Investigação NB-06 concluída |
| **FASE 3 (total)** | **20%** 🔵 | Sem avanço funcional publicado — investigação não infla a fase |
| **PROGRAMA GERAL** | **22%** | Inalterado |

### Marcos desta execução

| Marco | % execução | Evidência |
|-------|------------|-----------|
| Mapear rotas + diff local/prod | 10% | §2 |
| Testes seguros produção/local | 25% | §5 |
| Causa raiz 504 | 50% | §3 |
| Inventário família admin | 75% | §7 |
| Correção mínima + testes + handoff | **100%** | §8–12 |

---

## DECISÃO FINAL

# 🟡 NB-06 NÃO BLOQUEANTE — P1 PODE INICIAR COM MONITORAMENTO

| Critério | Resultado |
|----------|-----------|
| Causa raiz identificada | ✅ `api/index` catch-all (Express 1,4 MB) trava em produção |
| Auth migration no código | ✅ `requireAuth` → `requireRole` **antes** do handler (Express + handlers leves) |
| 401/403 comprovado em produção (rotas migration) | ❌ **Ainda não** — timeout impede resposta; correção na branch aguarda deploy |
| Migration/SQL executado nos testes | ❌ **NÃO** |
| Risco de exposição imediata | 🟢 Baixo — endpoints inacessíveis (timeout), não respondem com SQL |
| Correção preparada | ✅ Handlers leves + rewrites (branch, **sem publicar**) |

**Não é 🔴 bloqueio:** o 504 não indica endpoint desprotegido executando migration; indica função `api/index` que não completa a resposta. Efeito colateral: negação de serviço, não bypass de auth.

**Não é 🟢 resolvida:** critério de fechamento exige 401/403 em produção — depende de deploy autorizado da correção.

---

## 1. OBJETIVO

Explicar por que `POST /api/migration/*` retorna TIMEOUT/504 em produção enquanto localmente retorna 401, e classificar impacto em P1.

---

## 2. MAPEAMENTO DE ROTAS

### 2.1 Endpoints NB-06

| Campo | `add-mission-columns` | `provider-ops-columns` |
|-------|----------------------|------------------------|
| **Caminho** | `POST /api/migration/add-mission-columns` | `POST /api/migrations/provider-ops-columns` |
| **Express** | `server/routes.ts` L2664 | `server/routes.ts` L5113 |
| **Middleware** | `requireAuth` → `requireRole('diretoria','administrador')` → handler | idem |
| **Handler** | Retorna JSON com SQL (manual) — **não executa** | Retorna SQL manual — **não executa** `ALTER` |
| **Rewrite Vercel (antes)** | catch-all ` /api/(.*)` → `/api/index` | idem |
| **Serverless (antes)** | `api/index.ts` → `dist/vercelApp.cjs` → Express | idem |
| **Rewrite Vercel (correção branch)** | → `/api/migration-add-mission-columns` | → `/api/migrations-provider-ops-columns` |

### 2.2 Diferença local × produção

| Ambiente | Runtime | Resultado sem token |
|----------|---------|---------------------|
| **Local** (`getApp()` direto) | Express | **401** em ~3–6 ms |
| **Produção** (pré-correção) | `api/index` catch-all | **TIMEOUT** 0 bytes (20–120 s) |
| **Produção** (handlers dedicados, controle) | ex. `api/billing-ensure-schema` | **401** em ~70 ms |

---

## 3. CAUSA RAIZ DO 504

### Diagnóstico

O 504 **não** é falha do middleware `requireAuth` nem execução de migration antes da auth.

**Causa comprovada:** rotas que dependem exclusivamente do catch-all Express (`api/index.ts` → `serverless-http` → `dist/vercelApp.cjs` ~1,4 MB) **não completam a resposta HTTP** na Vercel (0 bytes recebidos, timeout cliente).

Evidências:

1. **Padrão sistemático** — mesmas rotas via `api/index` travam; handlers leves respondem:
   - TIMEOUT: `/api/migration/*`, `/api/chat`, `/api/admin/manual-override-settings`, `/api/push/send`, `/api/supabase/health-check`
   - OK rápido: `/api/billing/ensure-schema`, `/api/nf/summary`, `/api/whatsapp/groups`, `/api/recalculate-open`

2. **Documentação interna pré-existente** — `server/osAnalysisRequests.ts`, `api/nf-control.ts`, `api/recalculate-open.ts` citam explicitamente que `api/index` causa timeout/504 em produção.

3. **Logs Vercel** — invocações de `api/cron/email-queue` (mesmo `getApp`) bootam Express com sucesso via cron; requisições externas a `api/index` **não** geram linha `express POST /api/migration/...` nos logs (request não chega a responder).

4. **Deploy inspect** — `api/index` = **18,18 MB** (bundle pesado); handlers leves ~280 KB.

5. **Local** — auth e ordem de middleware corretos; handler migration não toca Supabase/SQL.

### Onde o request trava

```
Cliente → Vercel Edge → rewrite catch-all → λ api/index
  → require vercelApp.cjs + getApp() + serverless-http
  → (hang / sem resposta HTTP dentro do limite efetivo do cliente)
```

**Não** trava no handler de migration nem em `exec_sql` — a requisição não retorna corpo algum.

---

## 4. ORDEM DO MIDDLEWARE (Express)

```text
POST /api/migration/add-mission-columns
  → requireAuth (síncrono: sem token → 401)
  → requireRole (async: Supabase system_users → 403 se role inválida)
  → handler (só JSON com SQL)
```

Nenhum acesso a Supabase migration, `exec_sql`, ou `ALTER` ocorre **antes** de `requireAuth`.

**Classificação segurança middleware:** 🟢 ordem correta no código — **não** 🔴 bloqueio de segurança por ordem invertida.

---

## 5. TESTES SEGUROS (sem executar migration)

### Produção @ buildId `420e9680` (pré-deploy correção)

| Caso | Rota | Esperado | Obtido |
|------|------|----------|--------|
| A — sem token | `POST /api/migration/add-mission-columns` | 401/403 | **TIMEOUT** 0 bytes (25–120 s) |
| A — sem token | `POST /api/migrations/provider-ops-columns` | 401/403 | **TIMEOUT** |
| B — token inválido | `POST /api/migration/add-mission-columns` + `Bearer fake` | 401/403 | **TIMEOUT** |
| C — método incorreto | `GET /api/migration/add-mission-columns` | 404/405 | **TIMEOUT** |
| Controle dedicado | `POST /api/billing/ensure-schema` sem token | 401 | **401** em 77 ms |
| Controle dedicado | `GET /api/whatsapp/instances` sem token | 401 | **401** em 67 ms |

### Local Express (`getApp()`)

| Caso | Resultado |
|------|-----------|
| POST sem token | **401** `Não autorizado` (~3 ms) |
| POST token inválido | **403** (via `requireRole`) |
| GET | **404** |

### Handlers leves (branch, teste unitário)

`scripts/nb06-migration-routes.test.ts` — **8/8 pass**

---

## 6. LOGS VERCEL (sanitizados)

| Request | Função | Etapa alcançada | Resultado |
|---------|--------|-----------------|-----------|
| `POST /api/migration/add-mission-columns` | `api/index` | Boot Express não confirmado para esta request | Timeout cliente, sem log `express POST` |
| `GET /api/cron/email-queue` (cron interno) | `api/cron/email-queue` | `getApp()` OK, migrations background | Sucesso |
| `GET /api/billing/dashboard` | handler dedicado | auth check | 401 imediato |

---

## 7. INVENTÁRIO FAMÍLIA ADMIN (somente classificação)

### Migration / schema

| Rota | Runtime prod | Auth código | Classificação |
|------|--------------|-------------|---------------|
| `POST /api/migration/add-mission-columns` | api/index (timeout) | requireAuth + role | 🟡 precisa validar em prod (fix na branch) |
| `POST /api/migrations/provider-ops-columns` | api/index (timeout) | requireAuth + role | 🟡 idem |
| `POST /api/billing/ensure-schema` | dedicado | assertBilling + role | 🟢 protegido (401 prod) |
| `POST /api/gestao-investimento/ensure-schema` | dedicado | auth no handler | 🟢 protegido |
| `GET /api/whatsapp/telemetry/migrations-sql` | api/index | requireAuth + role | 🟡 timeout catch-all |

### Admin (amostra)

| Rota | Auth | Classificação |
|------|------|---------------|
| `GET/PUT /api/admin/manual-override-settings` | requireAuth + role | 🟡 Express-only, timeout prod |
| `GET /api/admin/system-settings/daily-reports` | dedicado parcial | 🟢 GET dedicado |
| `POST /api/admin/run-monthly-logs-cleanup` | **SEM auth** | 🔴 sem auth no código — mitigado por timeout api/index hoje |
| `POST /api/missions/fix-ceva-logitech-values` | **SEM auth** | 🔴 altera dados se acessível — mitigado por timeout hoje |

### Recalculate / maintenance

| Rota | Runtime | Classificação |
|------|---------|---------------|
| `POST /api/recalculate-open` | dedicado | 🟢 401 prod |
| `POST /api/recalculate-all` | api/index | 🟡 timeout |
| `POST /api/admin/recalculate-batch` | api/index | 🟡 timeout |
| `GET /api/cron/maintenance` | api/index | 🟡 timeout (cron Vercel pode funcionar internamente) |

**Nota:** endpoints 🔴 não foram corrigidos nesta execução (escopo NB-06). Se `api/index` for reparado globalmente, exigem auth imediata.

---

## 8. CORREÇÃO IMPLEMENTADA (branch — NÃO publicada)

### Causa → arquivos → impacto

| Item | Detalhe |
|------|---------|
| **Causa** | Migration só no catch-all `api/index` que trava |
| **Arquivos novos** | `api/migration-add-mission-columns.ts`, `api/migrations-provider-ops-columns.ts`, `lib/migrationApiAuth.ts`, `lib/migrationEndpointPayloads.ts` |
| **Arquivos alterados** | `vercel.json` (2 rewrites antes do catch-all) |
| **Impacto** | Rotas migration passam a handlers leves; auth antes de payload; **zero SQL** |
| **Express** | Rotas mantidas para dev local (inalteradas) |

### Testes pós-correção (local)

| Teste | Resultado |
|-------|-----------|
| `npx tsx --test scripts/nb06-migration-routes.test.ts` | **8/8 pass** |
| `npm run build` | **OK** |

### Deploy

**NÃO executado** — aguardando autorização explícita.

Após deploy: repetir Casos A/B/C em produção; esperado **401/403** em &lt;200 ms.

---

## 9. RISCO E ROLLBACK

| Risco | Nível | Mitigação |
|-------|-------|-----------|
| Migration exposta sem auth em prod hoje | Baixo | Timeout = inacessível |
| Admin settings via Express quebrados em prod | Médio | Já conhecido; extrair handlers (padrão P1) |
| Endpoints sem auth se api/index voltar a funcionar | Alto | Inventário 🔴 — corrigir antes de reparar catch-all |

**Rollback da correção NB-06:** reverter rewrites + apagar handlers leves (Express fallback permanece).

---

## 10. P1

| Pergunta | Resposta |
|----------|----------|
| NB-06 bloqueia P1? | **Não** — classificação 🟡 |
| Condição | P1 pode iniciar com monitoramento; deploy da correção migration recomendado cedo no P1 |
| P1 iniciado nesta execução? | **NÃO** |

---

## 11. GIT

| Item | Valor |
|------|-------|
| Branch | `cursor/nb06-migration-504-eaa8` |
| Base | `main` @ `420e9680` |
| Publicado | **NÃO** |

---

## ENCERRAMENTO

| Indicador | Valor |
|-----------|-------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 |
| **FASE 3** | **20%** 🔵 |
| **PROGRAMA GERAL** | **22%** |

**PARADO.** P1 não iniciado. Deploy da correção NB-06 aguarda autorização.

---

*Gerado em: 2026-08-12 UTC | Investigação NB-06*
