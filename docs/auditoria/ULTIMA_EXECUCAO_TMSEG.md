# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Arquivo oficial de handoff entre Cursor e ChatGPT.  
> Representa **somente** a última execução realizada.  
> **Não contém segredos, senhas, tokens ou API keys.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-12 (UTC) |
| **Fase** | FASE 1 — Infraestrutura, Conexões, Segurança e Baseline |
| **Objetivo** | Descobrir, documentar e validar (somente leitura) a fotografia técnica do sistema antes de qualquer intervenção: código → GitHub → Vercel → runtime → APIs → banco → integrações externas |
| **Branch** | `main` |
| **Commit inicial** | `88992034fd26f28c30937cf59a1b95b59eb04ebe` |
| **Commit final** | `4f55bf94` (handoff: `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`) |
| **Versão produção** | `3.7.60` |
| **Ambiente analisado** | Repositório local `/workspace`, produção `https://sistema.grupotmseg.com.br`, leitura remota GitHub/Vercel via curl e código-fonte |
| **Produção alterada** | **NÃO** |

---

## PROGRESSO

| Métrica | Valor |
|---------|-------|
| **Progresso da Fase 1** | **88%** |
| **Progresso geral do programa** | **9%** |

### Etapas concluídas (Fase 1)

1. Identificação do repositório Git (branch, commit, remote, tags, divergências)
2. Identificação da stack real (frontend, backend, banco, infra)
3. Mapeamento GitHub → produção (commit = buildId)
4. Mapeamento Vercel (projeto, domínio, crons, functions, rewrites)
5. Mapeamento banco via código e migrations (parcial — schema em prod não inspecionado diretamente)
6. Inventário de nomes de variáveis de ambiente (sem valores)
7. Auditoria inicial de segurança passiva
8. Inventário funcional preliminar por módulo
9. Localização de domínios críticos (OS, financeiro, faturamento, etc.)
10. Detecção de possíveis violações de SSOT
11. Mapeamento de mecanismos de cache
12. Inventário preliminar de relatórios
13. Baseline e ponto de retorno proposto

### Etapas pendentes (Fase 1)

- Schema completo do banco em produção (tabelas, triggers, functions, RLS real) — requer acesso autenticado ao painel Supabase ou MCP
- Painel Vercel direto (env scopes, últimos deploys, logs) — `VERCEL_TOKEN` ausente no ambiente cloud
- Validação funcional hands-on das telas críticas (login, OS, faturamento) — escopo da Fase 2
- Rotação da chave Resend exposta no repositório — aguarda autorização explícita

### Bloqueios

- Nenhum bloqueio para continuar a Fase 2 em modo leitura/validação
- Rotação de credencial Resend versionada requer ação humana autorizada (não executada nesta fase por regra)

---

## O QUE FOI PEDIDO

Executar a **Fase 1** do Programa Mestre de Auditoria, Estabilização e Evolução do Sistema Grupo TM SEG, com regra absoluta de **não alterar** código, banco, produção, env ou deploy. Objetivo: estabelecer baseline técnico seguro.

Na mesma solicitação subsequente, registrar regra permanente de governança (progresso percentual obrigatório + arquivo único de handoff `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`).

---

## ESTADO ANTERIOR

Antes desta execução:

- Sistema em produção na versão `3.7.60`, domínio `sistema.grupotmseg.com.br`, projeto Vercel `sistema-grupo-tm-seg`
- Repositório `grupotmsegthiago/Sistema-Grupo-TM-SEG`, branches `main` e `dev` no mesmo commit
- Documentação parcial existente (`AGENTS.md`, `MAPA_ENGENHARIA_REVERSA_TMSEG.md`, memórias `.agents/memory/`)
- **Não existia** arquivo oficial de handoff em `docs/auditoria/`
- Nenhuma auditoria formal consolidada das 13 etapas da Fase 1 havia sido registrada neste formato

---

## INVESTIGAÇÃO

### Causa raiz do trabalho

Necessidade de conhecer o estado real do sistema (código, infra, integrações, riscos) antes de qualquer correção ou evolução, evitando regressão em regras de negócio críticas (OS, faturamento, Asaas, financeiro).

### Componentes envolvidos

| Camada | Artefatos principais |
|--------|---------------------|
| Frontend | `App.tsx`, `components/` (~146 TSX), `lib/`, navegação por estado (`currentScreen`) |
| Backend | `server/routes.ts` (~9.800 linhas), `server/createApp.ts`, 91 handlers `api/*.ts` |
| Build | `vite.config.ts`, `build-server.mjs`, `dist/vercelApp.cjs` |
| Config deploy | `vercel.json` (50 functions, 9 crons, ~107 rewrites) |
| Banco | Supabase PostgreSQL projeto `ajhmmjuewdsukecaimik`, 24 migrations em `migrations/` |
| Integrações | Asaas, Gemini, Z-API WhatsApp, Google Maps, Qualp, PlugNotas, SMTP/Resend, Stripe (billing mirror) |

### Tabelas envolvidas (identificadas no código — amostra)

`missions`, `clients`, `providers`, `client_price_tables`, `provider_cost_tables`, `financial_transactions`, `financial_invoices`, `financial_transaction_payments`, `system_users`, `profiles`, `billing_usage`, `dhl_supplier_intakes`, `os_analysis_requests`, `whatsapp_instances`, `time_clock`, `rh_*` (20+), `investment_*`, `patrimonio_*`, `backup_history`

### APIs envolvidas (amostra validada em produção)

- `GET /api/version` — validado
- `GET /api/health` — validado
- `GET /api/gemini/health` — validado
- `GET /api/zapi/health` — validado (bot offline)

Demais ~90 endpoints mapeados por leitura de código; não testados individualmente nesta fase.

### Telas envolvidas (inventário preliminar)

MissionTable, MissionForm, MissionFinancialModal, ClientBillingReport, DashboardDiretoria, FinancialDashboard, RhModule, DhlSupplierIntake, GestaoInvestimento, SystemSettingsPage, ReportsDashboard, entre ~50 telas mapeadas via `constants.ts` / `App.tsx`.

### Services envolvidos

`lib/financialUtils.ts` (motor principal), `lib/missionBillingAudit.ts`, `server/asaasService.ts`, `server/geminiClient.ts`, `server/zapiClient.ts`, `lib/billing/billingService.ts`, `lib/toll/*`

### Regras de negócio envolvidas (localização — sem validação matemática)

- Cálculo OS: `calculateMissionFinancials` em `lib/financialUtils.ts`
- OS mãe/filha: `parent_mission_id`, `is_same_os` em `missions` e componentes de missão
- Faturamento: `ClientBillingReport`, snapshots, `billing_approved`
- Pedágio: `lib/toll/clientTollBilling.ts`, Qualp, Gemini estimate
- DHL: `lib/dhlAutoTableSelector.ts`, intake público, occurrence report

### Integrações envolvidas

| Integração | Status nesta execução |
|------------|----------------------|
| Supabase | Mapeado via código; schema prod ⚪ não validado diretamente |
| Vercel | Mapeado via `vercel.json` + curl produção |
| Gemini | 🟢 health OK em produção |
| Z-API WhatsApp | 🟡 configurado, bot desconectado em produção |
| Asaas | ⚪ mapeado, não testado (sem credenciais) |
| GitHub | 🟢 repo sync confirmado |

---

## ANÁLISE DE IMPACTO

Esta execução foi **somente leitura** — nenhuma alteração foi aplicada. A análise de impacto abaixo documenta **conexões identificadas** para futuras intervenções.

```
CÓDIGO (main @ 88992034)
    ↓
GITHUB (grupotmsegthiago/Sistema-Grupo-TM-SEG)
    ↓ [sync 0 divergência main/dev]
VERCEL (sistema-grupo-tm-seg)
    ↓ [buildId = commit]
PRODUÇÃO (sistema.grupotmseg.com.br v3.7.60)
    ↓
SUPABASE (ajhmmjuewdsukecaimik)
    ↓
INTEGRAÇÕES (Asaas, Gemini, Z-API, Maps, etc.)
```

### Conexões verificadas nesta execução

| Conexão | Status |
|---------|--------|
| Git local → `origin/main` | 🟢 validado (working tree clean, mesmo commit) |
| `origin/main` → `origin/dev` | 🟢 validado (0 commits de divergência) |
| `origin/main` → produção `/api/version` buildId | 🟢 validado |
| Código → stack (`package.json`, estrutura) | 🟢 validado |
| `vercel.json` → crons/functions | 🟢 validado (leitura) |
| Código → tabelas Supabase | 🟡 parcialmente validado (grep `.from('...')`) |
| Produção → Gemini | 🟢 validado |
| Produção → Z-API | 🟡 parcialmente validado (health responde, bot offline) |
| Schema prod → migrations repo | ⚪ não validado |

---

## ALTERAÇÕES REALIZADAS

### Código

Nenhuma alteração de código de aplicação.

### Configuração

Nenhuma alteração de configuração de deploy ou ambiente.

### Banco

**BANCO DE DADOS NÃO ALTERADO.**

### Migration

Nenhuma migration criada ou executada.

### Documentação

| Arquivo | Alteração | Motivo |
|---------|-----------|--------|
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Criado | Handoff oficial da Fase 1 + registro da regra permanente de governança |

---

## ALTERAÇÕES DE BANCO

**BANCO DE DADOS NÃO ALTERADO.**

Nenhuma tabela, coluna, índice, trigger, function, RLS ou policy foi criada ou modificada nesta execução.

---

## REGRAS DE NEGÓCIO

### Regras alteradas

Nenhuma. Execução somente leitura.

### Regras preservadas

Todas as regras existentes foram preservadas por design desta fase (proibição explícita de alterar lógica de OS, financeiro, Asaas, faturamento, comissões).

### Regras consideradas críticas (identificadas, não validadas matematicamente)

1. `calculateMissionFinancials` — motor central de receita/custo de OS
2. Franquia KM/hora, KM excedente, hora excedente — `lib/financialUtils.ts`
3. OS mãe/filha (`parent_mission_id`, `is_same_os`) — impacto em pedágio e custo fornecedor
4. Snapshots de billing vs. `revenue_value` / `cost_value` persistidos
5. Aprovação de faturamento (`billing_approved`)
6. Regras DHL auto-tabela (`dhlAutoTableSelector`)
7. Pedágio cliente vs. fornecedor (`lib/toll/clientTollBilling`)
8. Integração Asaas (3 contas, emissão NF, PIX, webhook aprovação)
9. Comissões RH (`rh_commission_rules`, `rh_commissions`)

---

## SINCRONISMO

Como não houve alteração de código, o sincronismo abaixo refere-se à **verificação de alinhamento** entre camadas (não pós-alteração):

| Conexão | Status |
|---------|--------|
| Código repo → Produção (buildId) | 🟢 validado |
| main → dev | 🟢 validado |
| Grid OS → Faturamento | ⚪ não aplicável (sem alteração; divergência SSOT documentada para Fase 4) |
| OS → Fornecedor | ⚪ não aplicável |
| OS → Financeiro | ⚪ não aplicável |
| OS → Relatório | ⚪ não aplicável |
| OS → Diretoria | ⚪ não aplicável |

---

## TESTES EXECUTADOS

| Comando | Finalidade | Esperado | Obtido | Status |
|---------|------------|----------|--------|--------|
| `git status` | Confirmar working tree | Limpo | Limpo, `main` up to date | 🟢 |
| `git rev-list --left-right --count origin/main...origin/dev` | Divergência main/dev | 0 | `0 0` | 🟢 |
| `curl https://sistema.grupotmseg.com.br/api/version` | Alinhamento prod/commit | buildId = commit | `buildId: 88992034...`, `version: 3.7.60` | 🟢 |
| `curl https://sistema.grupotmseg.com.br/api/health` | API viva | `status: ok` | `{"status":"ok",...}` | 🟢 |
| `curl https://sistema.grupotmseg.com.br/api/gemini/health` | Integração Gemini | `ok: true` | `{"ok":true,"model":"gemini-2.5-flash"}` | 🟢 |
| `curl https://sistema.grupotmseg.com.br/api/zapi/health` | Integração Z-API | Resposta diagnóstica | Configurado, `connected: false` | 🟡 |
| `npm audit --json` | Vulnerabilidades deps | Relatório | 8 high, 5 moderate, 0 critical | 🟡 |
| `bash scripts/run-tests.sh` | Suite automatizada | Baseline | **491 pass / 29 fail** de 520 testes | 🟡 |
| `npm run build` | Build produção | — | **NÃO EXECUTADO** nesta execução | ⚪ |

---

## TESTE FUNCIONAL

Não aplicável nesta fase — escopo explicitamente proibido alterar funcionalidades. Validação funcional de telas (login, OS, faturamento) ficou pendente para **Fase 2**.

---

## APIs E INTEGRAÇÕES

| API | Teste realizado | Resultado |
|-----|-----------------|-----------|
| `/api/version` | Sim (curl produção) | 🟢 buildId alinhado |
| `/api/health` | Sim | 🟢 ok |
| `/api/gemini/health` | Sim | 🟢 ok |
| `/api/zapi/health` | Sim | 🟡 bot offline |
| Demais ~87 endpoints | Não (somente mapeamento código) | ⚪ pendente Fase 2 |
| Asaas | Não (sem credenciais no ambiente) | ⚪ pendente |
| Supabase direto | Não (sem MCP autenticado) | ⚪ pendente |

---

## SEGURANÇA

### Impacto desta execução

Nenhum impacto — somente leitura.

### Problemas encontrados (documentados, não corrigidos)

| Severidade | Problema | Localização |
|------------|----------|-------------|
| 🔴 Crítico | API key Resend hardcoded no repositório | `supabase/functions/send-welcome-email/index.ts` |
| 🔴 Crítico | RLS permissivo (`Allow all for anon, authenticated`) em tabelas sensíveis | `migrations/` (billing_usage, time_clock, etc.) |
| 🟠 Alto | Tabelas DHL com RLS desabilitado em scripts SQL | `scripts/dhl-migrations.sql` |
| 🟠 Alto | Auth token custom não assinado (`tmseg-token-{uuid}-{ts}`) | `components/Login.tsx`, `server/routes.ts` |
| 🟠 Alto | 8 vulnerabilidades npm high | `npm audit` |
| 🟡 Médio | Variáveis de ambiente duplicadas/aliases (Z-API, Asaas) | `.env.example`, `server/whatsapp/zapiMobileEnv.ts` |

**Nenhum segredo reproduzido neste documento.**

---

## REGRESSÃO

Não aplicável — nenhuma alteração de código ou configuração foi realizada.

A suite de testes foi executada como **baseline**: 491/520 aprovados, 29 falhando (estado pré-existente, não introduzido por esta execução).

---

## BUILD

| Item | Valor |
|------|-------|
| Build executado | **NÃO** |
| Motivo | Fase 1 somente leitura; build não era requisito do escopo de auditoria |
| Pendência | Executar `npm run build` na Fase 2 como parte do baseline operacional |

---

## GIT

| Item | Valor |
|------|-------|
| Branch | `main` |
| Arquivos modificados nesta execução | `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` (após commit) |
| Commit inicial analisado | `88992034` |
| Tag criada | Nenhuma (proposta `baseline-fase1-20260812` aguarda autorização) |
| Push | **SIM** — branch `cursor/handoff-fase1-auditoria-eaa8`, PR #253 |

---

## DEPLOY

| Item | Valor |
|------|-------|
| Deploy realizado nesta execução | **NÃO** |
| Ambiente produção atual | `https://sistema.grupotmseg.com.br` |
| Versão | `3.7.60` |
| Build ID | `88992034fd26f28c30937cf59a1b95b59eb04ebe` |
| Validação pós-deploy | N/A (sem deploy nesta execução) |
| Estado prod verificado | `/api/version` e `/api/health` respondendo corretamente |

---

## ROLLBACK

Não aplicável para esta execução (sem alterações em produção ou código de aplicação).

**Ponto de retorno documentado:**

- Commit: `88992034fd26f28c30937cf59a1b95b59eb04ebe`
- Tags existentes: `backup/pre-publish-*` (marcos anteriores no histórico Git)
- Proposta futura (requer autorização): `git tag -a baseline-fase1-20260812 88992034`

Para reverter apenas o handoff desta execução: `git checkout HEAD~1 -- docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` ou delete o arquivo.

---

## PENDÊNCIAS

### 🔴 Crítica

1. Rotacionar/revogar chave Resend exposta em `supabase/functions/send-welcome-email/index.ts` — aguarda autorização
2. Revisar RLS permissivo em tabelas com dados financeiros/RH — Fase 3

### 🟠 Alta

3. Validar schema real em produção (Supabase dashboard/MCP)
4. Inspecionar painel Vercel (env scopes, deploy history)
5. Executar Fase 2 — smoke test funcional das telas críticas

### 🟡 Média

6. Resolver ou classificar 29 testes falhando (baseline 491/520)
7. Consolidar ou remover `export_relatorio/financialUtils.ts` (SSOT duplicado)
8. Executar `npm run build` como evidência de baseline

### 🔵 Baixa

9. Limpar/arquivar `attached_assets/` (cópias legadas)
10. Corrigir `database_setup.sql` corrompido na raiz
11. Investigar `AIChatbot` órfão em `App.tsx`

---

## EVIDÊNCIAS

1. `git status` — working tree clean, branch `main`
2. `git rev-list --left-right --count origin/main...origin/dev` → `0 0`
3. `curl /api/version` → `buildId` = `88992034...`
4. `curl /api/health` → `status: ok`
5. `curl /api/gemini/health` → `ok: true`
6. `curl /api/zapi/health` → configurado, disconnected
7. `bash scripts/run-tests.sh` → 491 pass, 29 fail (520 total)
8. `npm audit` → 8 high, 5 moderate
9. Leitura de `vercel.json`, `package.json`, `AGENTS.md`, `lib/financialUtils.ts`, `server/routes.ts`, migrations

---

## RESULTADO FINAL

### 🟡 CONCLUÍDO COM PENDÊNCIAS

A Fase 1 foi executada conforme escopo (somente leitura, sem alterar produção). Baseline técnico estabelecido com evidências objetivas. Pendências: schema Supabase em prod, painel Vercel, testes funcionais de telas, rotação de credencial exposta, build local não executado.

---

## REGRA PERMANENTE REGISTRADA

A partir desta execução, passa a valer para **todas as fases** do programa:

1. Informar **PROGRESSO DA FASE ATUAL** e **PROGRESSO GERAL DO PROGRAMA** em todo relatório final
2. Atualizar **somente** `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` como handoff (sem segredos)
3. Não declarar "PRONTO" sem teste, evidência e análise de impacto documentados
4. Seguir estrutura obrigatória deste arquivo em toda execução relevante

---

## PRÓXIMO PASSO RECOMENDADO

Aguardar autorização para **Fase 2 — Raio-X / Funcionalidades**: smoke test autenticado, matriz módulo×tabela×API, classificação dos 29 testes falhando, validação hands-on sem alterar regras de negócio.

---

*Gerado em: 2026-08-12 UTC | Agente: Cursor Cloud | Fase: 1*
