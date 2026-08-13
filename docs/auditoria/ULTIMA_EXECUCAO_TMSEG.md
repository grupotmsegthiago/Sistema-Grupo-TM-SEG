# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **Fase 3 Bloco P3** (limpeza, segurança, dívidas técnicas + ajustes operacionais)  
> **Não contém segredos.**  
> **NÃO mergeado. NÃO publicado.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-13 (UTC) |
| **Tipo** | Fase 3 — Bloco P3 (investigação + correções mínimas) |
| **Branch** | `cursor/fase3-p3-limpeza-seguranca-eaa8` |
| **Base** | `main` @ `b720ea61` (handoff P2 publicado) |
| **Produção (inalterada)** | `ae2fc382` |
| **Tag rollback produção** | `baseline-fase3-p2-merged-20260813` |
| **Produção alterada** | **NÃO** |
| **Banco alterado** | **NÃO** |
| **P3 iniciado** | ✅ Investigação + correções mínimas na branch |
| **Próxima fase** | **NÃO iniciada** |

---

## PROGRESSO — TRÊS INDICADORES

| Indicador | Valor | Metodologia |
|-----------|-------|-------------|
| **EXECUÇÃO ATUAL** | **100%** 🟢 | Investigação completa + correções mínimas + testes + build + handoff |
| **FASE 3 (total)** | **58%** 🔵 | P0+NB-06+P1+P2 publicados (52%) + P3 investigado (+6% pendente merge) |
| **PROGRAMA GERAL** | **57%** 🔵 | +2% bloco P3 investigado na branch |

---

## DECISÃO FINAL

# 🟡 P3 CONCLUÍDO COM PENDÊNCIAS

| Critério | Resultado |
|----------|-----------|
| Investigação P3-01 a integridade | ✅ |
| Correções mínimas comprovadas | ✅ (4 itens — ver abaixo) |
| NB-07 corrigido globalmente | ❌ Pendente (arquitetural) |
| Segurança crítica residual | 🟡 Documentada (investment/* sem auth, asaas webhook) |
| Testes — zero falha nova | ✅ 753/747/5 (+5 testes P3) |
| Build | ✅ |
| Merge / deploy | ❌ **NÃO** |

---

## P3-01 — REPLIT_INTEGRATIONS

| Item | Classificação | Evidência |
|------|---------------|-----------|
| `server/replit_integrations/` (8 arquivos) | **REMOVER** ✅ executado | Zero imports fora da pasta; rotas nunca registradas em `createApp` |
| `registerChatRoutes` / `/api/conversations` | **REMOVER** | Código morto; imports quebrados (`server/db.ts` inexistente) |
| `registerImageRoutes` / `/api/generate-image` | **REMOVER** | Nunca registrado |
| `batch/utils.ts` (`p-limit`, `p-retry`) | **INVESTIGAR MAIS** | Só usado no módulo removido — candidato remoção deps |
| `shared/models/chat.ts` | **INVESTIGAR MAIS** | Zero imports; órfão |
| Rotas vivas `/api/gemini/*`, `/api/chat` | **MANTER** | `server/routes.ts` + `api/gemini/*` |
| Env `AI_INTEGRATIONS_GEMINI_*` | **MANTER** | Usado por `geminiClient.ts` produção |
| Env `REPLIT_*` (hosting legado) | **INVESTIGAR MAIS** | `lib/publicAppUrl.ts`, dashboards custo |

**Alteração:** removido `server/replit_integrations/` (branch P3).

---

## NB-07 — CATCH-ALL `api/index`

| Métrica | Valor |
|---------|-------|
| Rewrites dedicados (leves) | 105 |
| Rotas Express total | ~217 |
| Ainda no catch-all | ~138 (~64%) |
| Bundle Express lazy | `dist/vercelApp.cjs` ~1,4 MB |

### Classificação

| Classe | Qtd aprox. | Exemplos |
|--------|------------|----------|
| 🟢 FUNCIONAL | 105 rewrites | `/api/health`, `/api/recalculate-open`, NF/Asaas/Gestão investimento |
| 🟡 TIMEOUT_RISK | 138 catch-all | Crons `/api/cron/minute`, `/api/cron/zapi`, recálculos admin |
| 🔴 SECURITY_RISK | ~20+ | Ver tabela abaixo |

### Endpoints críticos sem auth (catch-all ou handler dedicado)

| Severidade | Rota | Status P3 |
|------------|------|-----------|
| 🔴 | `PATCH /api/missions/:id/billing-override` | **CORRIGIDO** — `requireAuth` + `requireRole` |
| 🔴 | `POST /api/asaas/webhook` | Pendente — sem validação assinatura |
| 🟠 | `POST /api/investment/init`, snapshots | Pendente — handlers dedicados sem auth |
| 🟠 | `POST /api/db/vacuum`, `POST /api/supabase/init-invoices` | Pendente |
| 🟠 | `POST/DELETE /api/client-registries*` | Pendente |

**Decisão NB-07:** não corrigir catch-all globalmente nesta execução — padrão de mitigação = handler leve + rewrite (como P1/P2).

---

## ADMIN APIs — INVENTÁRIO (resumo)

| Domínio | Auth | Runtime Vercel | Classificação |
|---------|------|----------------|---------------|
| `/api/migration/*` (NB-06) | ✅ requireAuth+diretoria | Handler leve dedicado | 🟢 |
| `/api/admin/*` (26 rotas) | ✅ requireRole | Catch-all | 🟡 timeout |
| `/api/billing/recalculate-*` | ✅ financeiro+ | Catch-all | 🟡 |
| `/api/missions/recalculate-*` | ✅ | Catch-all | 🟡 |
| `/api/supabase/*` (7 rotas) | ❌ | Catch-all | 🔴 |
| Crons (6/8) | ✅ CRON_SECRET | Catch-all | 🟡 |

Correção nesta execução: somente `billing-override` (vulnerabilidade comprovada).

---

## REALTIME — DUPLO FETCH

### Fluxo mapeado

```
missions UPDATE (Supabase)
  → RealtimeProvider.handleChange
  → pendingMissionFullRefreshRef = true
  → flush (debounce)
  → dispatch refreshMissions (global)
  → + dispatch supabase:missions (por tabela)
  → + invalidateQueries React Query (missions keys)
```

### Consumidores `refreshMissions` (amostra)

| Componente | Também `useRealtimeRefresh('missions')`? | Duplicação? |
|------------|------------------------------------------|-------------|
| MissionTable | Listener próprio | Possível dupla com global |
| ExecutiveDashboard | ✅ | Possível dupla |
| ClientBillingReport | Listener próprio | Possível dupla |
| FinancialDRE | ✅ missions | Possível dupla |
| MissionFinancialModal | ✅ + listener | Tripla potencial |

**Medida:** 1 UPDATE pode disparar 2–4 refreshes (global + hook + listener local).  
**Decisão:** não otimizar nesta execução — sem evidência de problema de performance em produção; consistência preservada.

---

## ÓRFÃOS / TELAS DUPLICADAS

| Componente | Rota | Menu | Consumidor | Classificação |
|------------|------|------|------------|---------------|
| BillingControlCenter | ❌ | ❌ | ❌ | **ÓRFÃO** (P2 doc) |
| CostOptimizationDashboard | ✅ `cost-optimization` | ✅ | Ativo — métricas AIChatbot logs | **MANTER** |
| ExecutiveDashboard | ✅ `executive-dashboard` | ✅ Diretoria | Ativo + realtime P1 | **MANTER** |
| FeatureInactivePanel / AIChatbot | `ai-support` inativo | ❌ | Código preservado | **MANTER INATIVO** (P2) |

---

## 5 TESTES BASELINE — REIDENTIFICAÇÃO

| Teste | Arquivo | Diagnóstico | Ação P3 |
|-------|---------|-------------|---------|
| investment-accounts | `scripts/investment-accounts.test.ts` | **TESTE DESATUALIZADO** — espera rewrite `investment-accounts-item?id=:id` que não existe no `vercel.json` atual | Não alterado |
| invoice-display | `scripts/invoice-display.test.ts` | **TESTE DESATUALIZADO** — URL fixa `sync-open-payments?limit=15`; código usa `limit=${limit}` dinâmico | Não alterado |
| presence-refresh | `scripts/presence-refresh.test.ts` | **INCONCLUSIVO** — passa isolado; cancelled na suíte (NB-06 timeout) | Não alterado |
| receivable-desc-nf | `scripts/receivable-desc-nf.test.ts` | **PASSA** isolado | — |
| zapi-sdk-cockpit | `scripts/zapi-sdk-cockpit.test.ts` | **TESTE DESATUALIZADO** — proíbe strings removidas do Dashboard (`Detalhe do em aberto`) | Não alterado |

**Suíte:** 753 total / 747 pass / 5 fail / 1 cancelled — **zero falha nova**.

---

## SEGURANÇA — VARREDURA

| Verificação | Resultado |
|-------------|-----------|
| Secrets hardcoded no código | ❌ Não encontrados (grep padrões comuns) |
| `billing-override` sem auth | ✅ Corrigido |
| `investment/*` handlers sem auth | 🔴 Pendente |
| `asaas/webhook` sem assinatura | 🔴 Pendente |
| Logs com credenciais | Não auditado linha a linha — sem achado em amostra |
| RLS/banco | **Não alterado** (conforme instrução) |

---

## INTEGRIDADE / PAGINAÇÃO (Torres)

Itens já tratados P0/P1/P2: `missionTableSearch`, `fetchAllPages`, `parentMissionSearch`, banner pedágio, quotes Diretoria.

| Área residual | `.limit()` | Risco | Classificação |
|---------------|------------|-------|---------------|
| `MissionForm` driver suggestions | 200 | Baixo — autocomplete | **INVESTIGAR MAIS** |
| `UpdateMissionModal` driver suggestions | 200 | Baixo | **INVESTIGAR MAIS** |
| `server/routes.ts` listagens admin | 50–10000 | Médio em relatórios | **INVESTIGAR MAIS** |
| `ClientBillingReport` existence checks | `.limit(1)` | OK — boolean | **MANTER** |

Nenhuma alteração de paginação nesta execução (sem evidência de bug novo).

---

## ALTERAÇÕES IMPLEMENTADAS (BRANCH P3)

| # | Item | Arquivos | Risco |
|---|------|----------|-------|
| 1 | Remoção `replit_integrations` morto | `server/replit_integrations/*` (deleted) | Baixo |
| 2 | Auth `billing-override` | `server/routes.ts` | Baixo |
| 3 | Plinio: só fornecedor, não cliente | `components/MissionFinancialModal.tsx` | Baixo |
| 4 | PDF proposta: KM/Hora Extra na tabela | `CommercialProposalModal.tsx`, `QuotePrintModal.tsx` | Baixo |
| 5 | Testes P3 | `scripts/fase3-p3-limpeza-seguranca.test.ts` (novo) | — |

### Plinio — regras aplicadas

- `canEditClientData = false` para Plinio
- `canEditClientTablesEvenIfLocked = false` para Plinio
- `canEditProviderTablesEvenIfLocked` inclui Plinio
- `canActivateFullEdit` e `isAdminFullAccess` excluem Plinio
- Fornecedor: `canEditOpsData`, `canEditProviderCostTotal` preservados

### PDF — KM/Hora Extra

- **Proposta comercial (PAGE 5):** colunas KM Extra e Hora Extra adicionadas à tabela financeira exportada
- **Simulação (QuotePrintModal):** colunas KM Extra (R$/km) e Hora Extra (R$/h) na tabela principal do PDF

---

## TESTES E BUILD

| Suíte | Resultado |
|-------|-----------|
| `fase3-p3-limpeza-seguranca.test.ts` | **5/5 pass** |
| `scripts/*.test.ts` completa | **753 / 747 / 5 fail / 1 cancelled** |
| Delta vs baseline P2 | **+5 testes P3, todos pass; mesmas 5 falhas** |
| `npm run build` | **OK** |

---

## RISCOS RESIDUAIS E ROLLBACK

| Risco | Mitigação / rollback |
|-------|----------------------|
| `billing-override` quebra frontend | Frontend já usa `authFetch` — compatível |
| Plinio bloqueado no cliente | Reverter `MissionFinancialModal.tsx` |
| PDF layout quebrado | Reverter `CommercialProposalModal` / `QuotePrintModal` |
| Remoção replit | `git restore server/replit_integrations/` |
| NB-07 timeout crons | Migrar crons para handlers leves (fase futura) |
| Investment endpoints sem auth | Adicionar auth nos handlers dedicados |

---

## GIT / PR

| Item | Valor |
|------|-------|
| Branch | `cursor/fase3-p3-limpeza-seguranca-eaa8` |
| Base | `main` @ `b720ea61` |
| Merge | **NÃO** |
| Deploy | **NÃO** |

---

*Fase 3 P3 — Cloud Agent — 2026-08-13*
