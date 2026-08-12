# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Arquivo oficial de handoff entre Cursor e ChatGPT.  
> Representa **somente** a última execução realizada.  
> **Não contém segredos, senhas, tokens ou API keys.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-12 (UTC) |
| **Fase** | FASE 1 — Fechamento controlado (baseline, segurança, evidências) |
| **Objetivo** | Fechar tecnicamente a Fase 1: validar baseline, ponto de retorno, banco/infra em leitura, classificar testes falhando, tratar incidente Resend, build, segurança — **sem correções funcionais** |
| **Branch de trabalho** | `cursor/handoff-fase1-auditoria-eaa8` (handoff) / baseline auditado em `main` |
| **Commit auditado (baseline produção)** | `88992034fd26f28c30937cf59a1b95b59eb04ebe` |
| **Commit desta execução (handoff)** | ver HEAD da branch após push |
| **Versão produção** | `3.7.60` |
| **Ambiente analisado** | `/workspace`, produção `https://sistema.grupotmseg.com.br`, Vercel CLI, GitHub |
| **Produção alterada** | **NÃO** |
| **PR #253** | **NÃO mergeado** (conforme instrução) |

---

## PROGRESSO

| Métrica | Valor |
|---------|-------|
| **PROGRESSO DA FASE 1** | **96%** |
| **PROGRESSO GERAL DO PROGRAMA** | **10%** |

### Etapas concluídas nesta execução

1. Validação do diff do PR #253 (somente documentação)
2. Reconfirmação baseline Git ↔ GitHub ↔ produção
3. Criação e push da tag `baseline-fase1-20260812` no commit auditado
4. Vercel: projeto, deploy, env names (sem valores), crons via `vercel.json`
5. Supabase: tentativa leitura schema (limitada — ver seção Supabase)
6. Classificação de testes falhando (descoberta: 24 eram ambiente sem deps)
7. Incidente Resend: confirmação, histórico Git, procedimento de contenção
8. RLS: evidência aprimorada (arquivo vs banco real)
9. Build executado com sucesso após `npm install`
10. Varredura passiva de secrets no repositório
11. Atualização deste handoff

### Pendências que impedem 100% da Fase 1

- Schema Supabase em produção não inspecionado diretamente (sem service role / MCP autenticado)
- Rotação da chave Resend no provedor — **ROTAÇÃO EXTERNA NECESSÁRIA**
- Remoção do hardcode Resend no código — aguarda rotação + secret no Supabase Edge

### Pendências de fases posteriores (não bloqueiam Fase 1)

- Validação matemática de motores de cálculo → Fase 5
- Smoke test funcional de telas → Fase 2
- Correção de policies RLS → Fase 3

---

## O QUE FOI PEDIDO

Fechar tecnicamente a Fase 1 sem iniciar Fase 2, sem merge do PR #253, sem deploy funcional, sem corrigir testes/código de negócio. Validar baseline, tag de retorno, banco/infra leitura, classificar 29 testes reportados, tratar incidente Resend, build, segurança e atualizar handoff.

---

## ESTADO ANTERIOR

- Fase 1 em 88%; handoff inicial criado no PR #253
- Baseline Git/produção já confirmado na execução anterior
- 29 testes falhando reportados (491/520) sem investigação detalhada
- Tag de baseline ainda não existia
- Build não havia sido executado nesta auditoria
- Incidente Resend documentado mas sem histórico Git nem procedimento formal

---

## INVESTIGAÇÃO

### Causa raiz do trabalho

Consolidar evidências objetivas para encerrar a Fase 1 com ponto de retorno seguro e fila de riscos priorizada, sem misturar com correções funcionais.

### Componentes envolvidos

`vercel.json`, `package.json`, `scripts/run-tests.sh`, `supabase/functions/send-welcome-email/index.ts`, `server/routes.ts` (`/api/email/welcome`), `components/UserForm.tsx`, `migrations/*.sql`, `scripts/dhl-migrations.sql`, Vercel CLI, Git tags.

### APIs validadas em produção

| Endpoint | Resultado |
|----------|-----------|
| `GET /api/version` | `buildId: 88992034...`, `version: 3.7.60` |
| `GET /api/health` | `status: ok` |
| `GET /api/gemini/health` | `ok: true` |
| `GET /api/zapi/health` | configurado, bot desconectado |

### Incidente Resend — confirmação (sem expor valor)

| Item | Evidência |
|------|-----------|
| **Arquivo** | `supabase/functions/send-welcome-email/index.ts` |
| **Tipo** | Constante hardcoded `RESEND_API_KEY = "re_..."` |
| **Histórico Git** | Presente desde commit `bf9c0fa5` (*Add a new operational management system...*) — exposição histórica no repositório |
| **Uso atual em produção** | `components/UserForm.tsx` chama **`/api/email/welcome`** (Express + `emailService`), **não** a Edge Function |
| **Edge Function** | Código legado em `supabase/functions/`; uso ativo em `attached_assets/` (cópias antigas) |
| **Secret correto** | `RESEND_API_KEY` já configurada na Vercel (Production + Preview) — nome confirmado via `vercel env ls` |
| **Risco** | Chave no Git pode estar comprometida mesmo que fluxo prod use outro caminho |

**ROTAÇÃO EXTERNA NECESSÁRIA** — Cursor não possui acesso à conta Resend para revogar/rotacionar.

### Procedimento de contenção (não executado — requer humano)

1. Revogar/rotacionar credencial no painel Resend
2. Atualizar `RESEND_API_KEY` na Vercel (Production + Preview)
3. Se Edge Function ainda deployada no Supabase: `supabase secrets set RESEND_API_KEY=...`
4. Alterar código para `Deno.env.get('RESEND_API_KEY')` **sem fallback hardcoded**
5. Redeploy Edge Function (se ativa) + redeploy Vercel
6. Testar envio via `/api/email/welcome` e, se aplicável, Edge Function
7. Considerar `git filter-repo`/BFG para histórico (fase segurança dedicada)

**Código NÃO alterado nesta execução** — remover hardcode sem secret no Supabase Edge quebraria a função se ainda deployada.

---

## ANÁLISE DE IMPACTO

Execução somente leitura + tag anotada + documentação.

```
COMMIT 88992034 (baseline auditado)
    ↓ [tag baseline-fase1-20260812]
GITHUB origin/main = origin/dev
    ↓
VERCEL sistema-grupo-tm-seg (deploy Ready, 10h atrás)
    ↓
PRODUÇÃO sistema.grupotmseg.com.br v3.7.60
    ↓
SUPABASE ajhmmjuewdsukecaimik (schema real ⚪ não validado diretamente)
```

### Conexões verificadas

| Conexão | Status |
|---------|--------|
| Local `main` = `origin/main` = produção buildId | 🟢 |
| `origin/main` = `origin/dev` | 🟢 |
| PR #253 diff somente docs | 🟢 |
| Tag baseline → commit auditado | 🟢 |
| Vercel projeto/domínio/deploy | 🟢 |
| Vercel env names (sem valores) | 🟢 |
| Supabase schema real vs repo | ⚪ não validado |
| Resend fluxo prod vs edge | 🟢 mapeado |

---

## ALTERAÇÕES REALIZADAS

### Código

**Nenhuma alteração de código de aplicação.**

### Configuração

Nenhuma.

### Banco

**BANCO DE DADOS NÃO ALTERADO.**

### Migration

Nenhuma.

### Documentação

| Arquivo | Alteração | Motivo |
|---------|-----------|--------|
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Atualizado | Handoff do fechamento Fase 1 |

### Git tag (marco de retorno — não altera produção)

| Item | Valor |
|------|-------|
| Tag | `baseline-fase1-20260812` |
| Tipo | Anotada |
| Aponta para | `88992034fd26f28c30937cf59a1b95b59eb04ebe` |
| Remote | `origin` (push realizado) |
| Comando | `git tag -a baseline-fase1-20260812 -m "Baseline auditado Fase 1..." 88992034` + `git push origin baseline-fase1-20260812` |

---

## ALTERAÇÕES DE BANCO

**BANCO DE DADOS NÃO ALTERADO.**

---

## REGRAS DE NEGÓCIO

### Regras alteradas

Nenhuma.

### Regras preservadas

Todas — execução proibiu alterações em OS, faturamento, financeiro, cálculos e RLS.

### Regras críticas identificadas (inalteradas)

Listadas no handoff anterior; permanecem válidas para fases futuras.

---

## SINCRONISMO

| Conexão | Status |
|---------|--------|
| Código auditado = GitHub main = produção | 🟢 validado |
| Tag baseline = commit produção | 🟢 validado |
| OS → Faturamento / Financeiro / Relatórios | ⚪ não aplicável (sem alteração) |

---

## TESTES EXECUTADOS

### Descoberta importante sobre os "29 testes falhando"

A contagem **491/29/520** da execução anterior ocorreu **sem `node_modules` completo** (`vite: not found` no build). Após `npm install --legacy-peer-deps`, a suíte real é maior e a taxa de falha cai drasticamente.

| Execução | Comando | Resultado |
|----------|---------|-----------|
| Anterior (sem deps) | `bash scripts/run-tests.sh` | 491 pass / **29 fail** / 520 tests |
| **Esta execução (com deps)** | `bash scripts/run-tests.sh` | **672 pass / 5 fail / 677 tests** (84 suites) |

### Classificação das 5 falhas reais (com dependências instaladas)

| # | Teste | Módulo | Erro resumido | Classificação | Risco | Fase correção |
|---|-------|--------|---------------|---------------|-------|---------------|
| 1 | `investment-accounts.test.ts` → CRUD leve Vercel | Investimentos | Espera `api/investment-accounts-item.ts` em `vercel.json`; não encontrado | **B** — teste desatualizado | Baixo | Fase 2/infra |
| 2 | `invoice-display.test.ts` → auto sync | Faturas/NF | Espera URL `/api/asaas/sync-open-payments?limit=15` no componente; ausente | **B** — teste desatualizado | Médio | Fase 6 |
| 3 | `presence-refresh.test.ts` | Ponto/presença | `refresh deve ocorrer depois do insert` — ordem de chamada | **A** ou **F** — possível regressão em `registerTimeClockPunch` | Médio | Fase 2 |
| 4 | `receivable-desc-nf.test.ts` | Contas a receber | Texto NF: esperado prefixo longo TMSEG; atual `Ref. a primeira quinzena...` | **B** — comportamento alterado, teste não atualizado | Baixo | Fase 6 |
| 5 | `zapi-sdk-cockpit.test.ts` → sem "Detalhe do em aberto" | Cockpit Diretoria | UI ainda contém string `Detalhe do em aberto` | **B** — teste desatualizado vs UI atual | Baixo | Fase 7 |

### Classificação dos 24 testes que falhavam sem deps

| Classificação | Quantidade | Motivo |
|---------------|------------|--------|
| **C** — Ambiente/dependência | ~24 | `node_modules` ausente/incompleto; imports/vite falhavam em lote ao rodar `scripts/*.test.ts` |

**NÃO corrigidos** — conforme instrução.

---

## TESTE FUNCIONAL

Não executado (fora do escopo desta execução; Fase 2).

---

## APIs E INTEGRAÇÕES

| Integração | Teste | Resultado |
|------------|-------|-----------|
| Produção `/api/version` | curl | 🟢 buildId alinhado |
| Produção `/api/health` | curl | 🟢 |
| Gemini | curl `/api/gemini/health` | 🟢 |
| Z-API | curl `/api/zapi/health` | 🟡 offline |
| Vercel CLI | `vercel project ls`, `vercel inspect` | 🟢 projeto `sistema-grupo-tm-seg`, status Ready |
| Vercel env | `vercel env ls --project sistema-grupo-tm-seg production` | 🟢 50+ nomes listados (valores ocultos) |
| Supabase OpenAPI | REST com anon key | ⚪ endpoint exige service_role |
| Supabase MCP | GetMcpTools | ⚪ needsAuth |

---

## VERCEL — evidências

| Item | Valor confirmado |
|------|------------------|
| Projeto | `sistema-grupo-tm-seg` |
| Organização | `grupotmsegs-projects` |
| URL produção | `https://sistema.grupotmseg.com.br` |
| Deploy ID | `dpl_5KVtvuT15Urf9bepb2CM3W4gRhBD` |
| Status | Ready |
| Criado | 2026-08-12 02:21:05 UTC (~10h antes da auditoria) |
| Aliases | `sistema.grupotmseg.com.br`, `sistema-grupo-tm-seg.vercel.app`, ... |
| Production branch | `main` (via alias `git-main` + fluxo documentado) |
| Node (projeto) | 22.x (painel) / 24.x declarado em `package.json` |
| Crons | 9 em `vercel.json` (minute, nf-retry, email-queue, dhl, zapi, maintenance, billing-sync, gestao-investimento-schema, refresh-cache) |
| Functions explícitas | 50 em `vercel.json` |

### Env names em Production (valores NÃO exibidos)

Inclui: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `ZAPI_*`, `ASAAS_*`, `EMAIL_PASS`, `CURSOR_SESSION_TOKEN`, `VAPID_*`, entre outros.

**Nota:** `ZAPI_MOBILE_ID` / `ZAPI_MOBILE_TOKEN` / `ZAPI_CLIENT_TOKEN` não apareceram na listagem parcial — verificar no painel se estão em Production (risco documentado em AGENTS.md).

---

## SUPABASE / BANCO — evidências

| Item | Status |
|------|--------|
| Projeto | `ajhmmjuewdsukecaimik` |
| URL | `https://ajhmmjuewdsukecaimik.supabase.co` |
| Schema real (tabelas, RLS, triggers) | ⚪ **não foi possível validar** — sem service role local, MCP Supabase needsAuth, OpenAPI REST exige service_role |
| Tabelas no código | 70+ identificadas via `.from('...')` |
| Migrations no repo | 24 arquivos em `migrations/` + scripts SQL em `scripts/` |
| Edge Functions no repo | 3 (`zapi-webhook`, `reconcile-statement`, `send-welcome-email`) |

### REPOSITÓRIO == SCHEMA REAL?

**🟡 PARCIALMENTE CONFIRMADO** — apenas via código/migrations; divergências possíveis em SQL aplicado manualmente no editor Supabase.

### Tabelas no código ausentes das migrations formais (exemplos)

`missions`, `clients`, `providers`, `financial_transactions` — schema base presumivelmente criado antes do tracking em `migrations/`.

---

## RLS — evidência aprimorada

### ENCONTRADO APENAS EM MIGRATION/ARQUIVO (não confirmado no banco real)

| Tabela | RLS (arquivo) | Policy | Roles | Operações | Risco aparente |
|--------|---------------|--------|-------|-----------|----------------|
| `billing_usage` | ENABLE | Allow all | anon, authenticated | ALL | Alto — billing exposto via PostgREST |
| `time_clock` | ENABLE | Allow all | anon, authenticated | ALL | Alto — ponto CLT |
| `financial_transaction_payments` | ENABLE | Allow all | anon, authenticated | ALL | Alto — pagamentos parciais |
| `account_balance_snapshots` | ENABLE | Allow all | anon, authenticated | ALL | Alto — saldos |
| `rh_*` (~22 tabelas) | ENABLE | Allow all dinâmico | anon, authenticated | ALL | Alto — RH completo |
| `investment_*` (várias) | ENABLE | sem policy na migration | — | — | Médio — bloqueio via ausência de policy |
| `investment_trades` | ENABLE | sem policy | — | — | Médio |
| `investment_data_sources` | ENABLE | Authenticated read only | authenticated | SELECT | Baixo |

### ENCONTRADO EM SCRIPTS (não migration formal)

| Tabela | RLS | Arquivo |
|--------|-----|---------|
| `dhl_supplier_intakes` | **DISABLE** | `scripts/dhl-migrations.sql` |
| `dhl_supplier_intake_resends` | **DISABLE** | idem |
| `provider_escoltistas` | **DISABLE** | idem |
| `provider_intake_vehicles` | **DISABLE** | idem |

### CONFIRMADO NO BANCO REAL

**Nenhum** — inspeção direta não realizada nesta execução.

### Acesso típico

| Camada | Mecanismo |
|--------|-----------|
| Frontend | Supabase JS com anon key + RLS |
| Backend Vercel | `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) |
| Edge Functions | service role via env |

---

## SEGURANÇA — varredura passiva do repositório

| Arquivo / local | Tipo de risco | Status |
|-----------------|---------------|--------|
| `supabase/functions/send-welcome-email/index.ts` | API key Resend hardcoded | 🔴 **INCIDENTE** — confirmado |
| `lib/supabaseDefaults.ts` | Anon key JWT hardcoded (padrão Supabase client) | 🟡 esperado para SPA; amplifica risco se RLS fraco |
| `attached_assets/extracted*/` | Cópias legadas com padrões antigos | 🟠 revisar/remover em fase limpeza |
| `scripts/*.ts` | Referências a `SUPABASE_SERVICE_ROLE_KEY` via env (OK) | 🟢 padrão correto |
| `scripts/fix-snapshot-table-ids.ts` | Fallback anon key no script | 🟡 risco se usado sem env |
| `.env` | Não rastreado no git | 🟢 |
| `.env.example` | Template sem valores | 🟢 |
| `npm audit` | 8 high, 5 moderate | 🟠 pendente atualização deps |

**Nenhum valor de segredo reproduzido neste documento.**

---

## REGRESSÃO

Não aplicável — sem alteração funcional.

Baseline de testes com deps: **672/677 aprovados**.

---

## BUILD

| Item | Valor |
|------|-------|
| Comando | `npm install --legacy-peer-deps` + `npm run build` |
| Resultado | **🟢 SUCESSO** |
| Versão gerada localmente | `3.7.60` (buildId local difere — branch handoff à frente de main; **produção permanece `88992034`**) |
| Warnings | `import.meta` em CJS (`resolveSupabasePublicConfig.ts`); bundles ~1.4mb |
| Supabase no build | `dist/public/index.html` contém `__TMSEG_SUPABASE__` com URL do projeto TM SEG |
| Artefatos | `dist/public/`, `dist/vercelApp.cjs` — **não commitados** |

---

## GIT

| Item | Valor |
|-------|-------|
| Baseline auditado | `88992034` em `main` |
| Branch handoff | `cursor/handoff-fase1-auditoria-eaa8` |
| PR #253 | Draft — **somente** `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` (+429 linhas) — **sem código funcional** |
| Tag criada | `baseline-fase1-20260812` → `88992034` |
| Tag push | **SIM** → `origin` |
| Merge PR #253 | **NÃO** (conforme instrução) |

---

## DEPLOY

| Item | Valor |
|-------|-------|
| Deploy nesta execução | **NÃO** |
| Produção atual | `https://sistema.grupotmseg.com.br` v3.7.60 |
| Build ID produção | `88992034fd26f28c30937cf59a1b95b59eb04ebe` |
| Correspondência código | 🟢 confirmado |

---

## ROLLBACK

### Voltar ao baseline auditado da Fase 1

```bash
git checkout main
git reset --hard 88992034fd26f28c30937cf59a1b95b59eb04ebe
# ou
git checkout baseline-fase1-20260812
```

| Item | Valor |
|------|-------|
| Tag | `baseline-fase1-20260812` (remota em `origin`) |
| Commit | `88992034` |
| Migration reversível | N/A (nenhuma aplicada) |
| Risco | Baixo — tag é marco read-only; produção já está neste commit |

---

## PENDÊNCIAS

### 🔴 Crítica

1. **ROTAÇÃO EXTERNA NECESSÁRIA** — revogar chave Resend exposta no Git; atualizar Vercel (+ Supabase Edge se deployada)
2. Validar schema/RLS real no Supabase (Fase 3)

### 🟠 Alta

3. Confirmar `ZAPI_MOBILE_*` na Vercel Production (não visíveis na listagem parcial)
4. Remover hardcode Resend após rotação (código + histórico Git)
5. Smoke test funcional — Fase 2

### 🟡 Média

6. Atualizar 5 testes desatualizados (não urgente; não bloqueia Fase 1)
7. `npm audit` — 8 vulnerabilidades high
8. Documentar/inventariar schema base (tabelas pré-migrations)

### 🔵 Baixa

9. Limpar `attached_assets/` legado
10. Investigar 24 falhas fantasmas sem `node_modules` — documentar pré-requisito `npm install` antes de testes

---

## EVIDÊNCIAS

```bash
# PR #253 — somente docs
git diff origin/main...origin/cursor/handoff-fase1-auditoria-eaa8 --name-only
# → docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md

# Baseline
git rev-parse origin/main origin/dev
# → 88992034 (ambos)
curl -sS https://sistema.grupotmseg.com.br/api/version
# → buildId 88992034...

# Tag
git show baseline-fase1-20260812 --no-patch
git ls-remote --tags origin baseline-fase1-20260812

# Vercel
npx vercel project ls
npx vercel inspect sistema.grupotmseg.com.br
npx vercel env ls --project sistema-grupo-tm-seg production

# Testes (com deps)
npm install --legacy-peer-deps
bash scripts/run-tests.sh
# → 672 pass / 5 fail / 677 tests

# Build
npm run build
# → sucesso

# Resend histórico
git log --oneline -- supabase/functions/send-welcome-email/index.ts
```

---

## RESULTADO FINAL

### 🟡 CONCLUÍDO COM PENDÊNCIAS

A Fase 1 atinge **96%** com evidências sólidas de baseline, tag de retorno, build, Vercel, classificação de testes e procedimento Resend. Pendências restantes são: schema/RLS real no banco (inspeção direta) e rotação externa da chave Resend — não bloqueiam o encerramento administrativo da Fase 1, mas impedem 100%.

**Fase 2 NÃO iniciada.** PR #253 **NÃO mergeado.**

---

## PRÓXIMO PASSO RECOMENDADO

1. Autorizar rotação Resend (humano)
2. Autorizar merge PR #253 (somente docs) ou incorporar handoff em `main`
3. Autorizar Fase 2 — smoke test funcional

---

> **Arquivo para análise no ChatGPT:**  
> `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`

---

*Gerado em: 2026-08-12 UTC | Execução: Fechamento Fase 1*
