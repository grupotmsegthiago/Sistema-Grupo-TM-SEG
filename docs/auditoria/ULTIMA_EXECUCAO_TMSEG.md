# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **CORREÇÃO TOCTOU PREPARADA NOS ARTEFATOS DE `rh_employee_documents`**
> **Live permanece protegido; nenhum SQL adicional e rollback não executado.**

---

## FASE 4 — RLS RH_EMPLOYEE_DOCUMENTS — CORREÇÃO DO FINDING TOCTOU

### ORIGEM / CAUSA

- Data: 2026-08-31 (UTC-3).
- Base:
  `origin/main = origin/dev =
  8d850fb0aba52b4ff58627f888a2325ef0634b93`.
- Branch:
  `cursor/fase4-rh-employee-documents-rls-eaa8`.
- Commit já publicado na branch:
  `002e14bbc63b5719a705110f9aa81fbdbb020de5`.
- Finding independente: **MEDIUM** por janela TOCTOU.
- Causa: forward e rollback liam `pg_policies` e somente depois executavam
  `DROP POLICY`/`CREATE POLICY`; sem lock explícito, DDL privilegiado concorrente
  poderia alterar policies entre validação e mudança.

### CORREÇÃO ADOTADA

- Forward e rollback validam primeiro a existência da relação.
- Em seguida adquirem exatamente:
  `LOCK TABLE public.rh_employee_documents IN ACCESS EXCLUSIVE MODE`.
- Toda inspeção definitiva de RLS, FORCE RLS e `pg_policies` ocorre somente
  depois do lock.
- O DDL de policy ocorre depois da inspeção e antes do `COMMIT`.
- Conforme PostgreSQL, `ACCESS EXCLUSIVE` conflita com todos os modos de lock e
  é mantido até o fim da transação; isso serializa acessos e DDL concorrentes na
  relação durante a janela crítica.
- O lock é restrito a uma tabela e à transação curta. Não há prompt humano,
  chamada externa ou segunda relação dentro da transação.
- Idempotência, guardas fail-closed, policy exata e ausência de alteração em
  dados, grants, FORCE RLS ou schema funcional foram preservadas.

### LIVE / ESCOPO NEGATIVO

- Revalidação somente leitura:
  RLS habilitado, FORCE RLS false, policies 0, anon/authenticated 0,
  `service_role` com SELECT/BYPASSRLS e row count 0.
- O forward **não foi reaplicado**.
- Nenhum SQL live mutável foi executado nesta correção.
- Rollback **NÃO executado**.
- Nenhuma policy live, dado, código funcional, API, componente ou script global
  foi alterado.
- Nenhum merge, deploy ou publicação.

### TESTE / VERSIONAMENTO

- O teste dedicado agora exige um único `ACCESS EXCLUSIVE`, depois do guard de
  existência e antes da leitura de policies e do DDL, tanto no forward quanto
  no rollback.
- O teste também rejeita `GRANT`/`REVOKE`, DML, FORCE RLS e alterações de schema
  funcional.
- Correção destinada a segundo commit normal, sem amend e sem force push.
- Nova revisão independente deve provar HEAD, base, diff e `git show --stat`.
- Resultado da revisão e SHA do segundo commit serão registrados em handoff
  posterior somente após autorização para um terceiro commit documental.

### DECISÃO DESTE MARCO

# 🟡 CORREÇÃO TOCTOU EM TESTE — REVISÃO INDEPENDENTE PENDENTE

---

> Handoff oficial — **RLS `rh_employee_documents` APLICADO E VALIDADO**
> **Policy permissiva removida; zero PII, zero dados alterados e rollback não executado.**

---

## FASE 4 — RLS RH_EMPLOYEE_DOCUMENTS — APPLY CONTROLADO

### PROGRESSO

**Programa geral: 84,7%**

`█████████████████░░░`

**Fase 4: 66%**

`█████████████░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### MARCO / BASE

- Apply registrado pelo Supabase em 2026-08-31 16:53:10 (UTC-3).
- Pós-validação concluída em 2026-08-31 17:15:27 (UTC-3).
- Baseline preservado:
  `origin/main = origin/dev =
  8d850fb0aba52b4ff58627f888a2325ef0634b93`.
- Branch local:
  `cursor/fase4-rh-employee-documents-rls-eaa8`.
- Tag local/remota pré-apply:
  `baseline-fase4-pre-rls-rh-employee-documents-20260831` →
  `8d850fb0aba52b4ff58627f888a2325ef0634b93`.
- Migration executada exatamente uma vez:
  `migrations/2026_08_31_fase4_rls_rh_employee_documents.sql`.
- Histórico remoto confirma uma única entrada
  `20260831195310_fase4_rls_rh_employee_documents`.
- Nenhum outro SQL de escrita, script global ou migration foi executado.

### PRÉ-CHECK LIVE — SOMENTE METADADOS/COUNT

| Campo | Estado |
|-------|--------|
| Tabela / owner | `public.rh_employee_documents` / `postgres` |
| RLS | habilitado |
| FORCE RLS | `false` |
| Policies | 1/1 esperada |
| Policy | `Allow all for rh_employee_documents` |
| Tipo / comando | `PERMISSIVE` / `ALL` |
| Roles | `anon`, `authenticated` |
| USING / WITH CHECK | `true` / `true` |
| service_role | SELECT + `BYPASSRLS=true` |
| Row count | 0 |

O guard confirmou o estado exato antes do `DROP`. Nenhuma coluna, linha, URL,
nome de arquivo, funcionário ou PII foi retornado.

### APPLY / PÓS-CHECK IMEDIATO

- Forward específico concluído com sucesso uma única vez.
- RLS permanece **habilitado**.
- FORCE RLS permanece **false**.
- Policies finais: **0**.
- Policies aplicáveis a anon: **0**.
- Policies aplicáveis a authenticated: **0**.
- `service_role`: SELECT e `BYPASSRLS=true` preservados.
- Row count permanece **0**.
- Nenhum INSERT, UPDATE, DELETE, TRUNCATE ou alteração de dados foi executado.
- Grants e schema funcional permaneceram inalterados.

### SMOKES / REGRESSÕES

| Check | Resultado |
|-------|-----------|
| Endpoint documentos sem autenticação | **401** `Não autorizado` |
| Preparação RLS dedicada | **9/9 PASS** |
| RH API Foundation + documentos + pilotos relacionados | **113/113 PASS** |
| React proporcional de documentos | **3/3 PASS** |
| `npm run build` | **OK** |
| `git diff --check` | **OK** |

Nenhum documento foi criado, editado ou excluído nos smokes. O build confirmou
a URL Supabase oficial; seis bundles `.cjs` regenerados foram restaurados ao
baseline e permanecem fora do diff.

### INTEGRIDADE DE CONJUNTO DE DADOS

- Foi utilizada somente contagem SQL exata, sem paginação, limite ou fallback.
- Estado pré e pós-apply: zero linhas.
- Ausência de linhas não foi usada isoladamente para validar segurança; o
  resultado foi combinado com metadata RLS, policies, grants e BYPASSRLS.

### ROLLBACK / RISCOS

- Rollback disponível em
  `migrations/rollback/2026_08_31_fase4_rls_rh_employee_documents.sql`.
- Rollback **NÃO executado**, pois todos os critérios pós-apply permaneceram
  exatamente no estado esperado.
- Executar o rollback reabriria deliberadamente a policy ampla para
  anon/authenticated; qualquer uso futuro exige autorização explícita.
- O registro global de Realtime fica sem eventos dessa tabela para clientes
  comuns, mas não há listener, query key ou dependência funcional atual.

### ESCOPO NEGATIVO / PRÓXIMO PASSO

- Nenhum commit, push de branch, PR, merge, deploy ou publicação.
- `main` e `dev` não foram alteradas.
- A única escrita remota Git foi a tag de segurança autorizada.
- Zero mudança funcional em frontend, Foundation, componentes, folha, ponto,
  financeiro, Asaas, Investment, Z-API, OS ou scripts globais de RLS.
- Próximo passo: revisar/versionar os quatro arquivos locais e abrir PR somente
  após autorização específica.

### DECISÃO

# 🟢 LOCKDOWN RLS DE RH_EMPLOYEE_DOCUMENTS APLICADO COM SUCESSO — AGUARDANDO VERSIONAMENTO E PR

---

> Handoff oficial — **RLS `rh_employee_documents` AUDITADO E PREPARADO**
> **Forward/rollback somente locais; nenhuma migration aplicada e nenhum dado de documento consultado.**

---

## FASE 4 — RLS RH_EMPLOYEE_DOCUMENTS — PREPARAÇÃO PRÉ-APPLY

### PROGRESSO

**Programa geral: 84,7%**

`█████████████████░░░`

**Fase 4: 65%**

`█████████████░░░░░░░`

**Execução atual: 100%**

`████████████████████`

Preparação não representa apply, merge, publicação ou homologação do lockdown.

### BASE / ESCOPO

- Data: 2026-08-31 (UTC-3).
- Baseline homologado:
  `origin/dev = origin/main =
  8d850fb0aba52b4ff58627f888a2325ef0634b93`.
- Branch/worktree isolada:
  `cursor/fase4-rh-employee-documents-rls-eaa8`.
- Tabela exclusiva: `public.rh_employee_documents`.
- Estado inicial da worktree: limpo.
- Nenhum SQL/DDL/DML live foi executado.
- Nenhum commit, push, PR ou deploy foi realizado.

### ARQUITETURA FUNCIONAL REVALIDADA

- Frontend funcional direto na tabela: **ZERO**.
- Cadeia de leitura/escrita:
  `components/rh/RhEmployeeDocuments.tsx` →
  `lib/rh/employeeDocumentsClient.ts` → `authFetch` →
  `api/rh-employee-documents.ts` → `authorizeRhApiRequest` →
  `lib/rh/employeeDocumentsApiCore.ts` →
  `createRhServiceRoleClient` → tabela.
- `lib/rh/employeeDocumentsApiCore.ts` é a única ocorrência runtime de
  `.from('rh_employee_documents')` em `components/` + `lib/`.
- `lib/rh/rhApiAccess.ts` exige service role e resolve RH/Diretoria no backend;
  não aceita role enviada pelo browser.
- O upload do arquivo continua usando Supabase Storage no componente, mas os
  metadados de `rh_employee_documents` são persistidos exclusivamente pela API.
  Storage não faz parte deste lockdown de policy da tabela.
- `lib/RealtimeProvider.tsx` ainda registra `rh_employee_documents` no canal
  global, porém a tabela possui lista de query keys vazia.
- Não existe listener `supabase:rh_employee_documents`, hook de refresh ou
  consumidor funcional dependente desse evento. Após create/delete, o componente
  chama `load()` explicitamente pela API.
- Consumidor legítimo direto como `anon`/`authenticated`: **nenhum encontrado**.

### ESTADO LIVE EXATO — SOMENTE METADADOS/COUNT

Projeto oficial: `ajhmmjuewdsukecaimik`.

| Campo | Estado observado |
|-------|------------------|
| Tabela / owner | `public.rh_employee_documents` / `postgres` |
| RLS | habilitado |
| FORCE RLS | `false` |
| Policies | 1 |
| Nome | `Allow all for rh_employee_documents` |
| Tipo | `PERMISSIVE` |
| Comando | `ALL` |
| Roles | `anon`, `authenticated` |
| USING / WITH CHECK | `true` / `true` |
| Grants anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| Grants authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| Grants service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| service_role | `BYPASSRLS=true`; demais flags privilegiadas consultadas = false |
| Row count | 0 |

Todos os grants de `anon`, `authenticated` e `service_role` têm
`is_grantable=NO`; os do owner `postgres`, `YES`. Nenhuma coluna, linha, URL,
nome de arquivo, funcionário ou PII foi retornado. A policy permissiva ampla é a
única exposição a remover; os grants ficam inalterados e passam a ser limitados
pelo deny-by-default do RLS sem policies.

### FORWARD PREPARADO

- Arquivo:
  `migrations/2026_08_31_fase4_rls_rh_employee_documents.sql`.
- Transacional, idempotente, exclusivo e fail-closed.
- Antes do `DROP`, valida tabela regular existente, RLS habilitado,
  `FORCE RLS=false`, total de policies e todos os atributos da policy observada.
- Aceita somente:
  1. exatamente a policy permissiva observada; ou
  2. zero policies, como estado pós-apply idempotente.
- Qualquer policy adicional ou divergente aborta antes de alterar.
- Remove somente `Allow all for rh_employee_documents`.
- Não cria policy substituta, não altera FORCE RLS, grants, dados, tabela,
  colunas, índices, funções ou triggers.
- **NÃO aplicado.**

### ROLLBACK PREPARADO

- Arquivo:
  `migrations/rollback/2026_08_31_fase4_rls_rh_employee_documents.sql`.
- Transacional, idempotente, exclusivo e fail-closed.
- Aceita somente:
  1. zero policies, quando restaura a policy original; ou
  2. exatamente a policy original já restaurada.
- Restaura exatamente:
  `PERMISSIVE`, `ALL`, `TO anon, authenticated`, `USING (true)` e
  `WITH CHECK (true)`.
- Qualquer policy adicional ou divergente aborta.
- Não altera FORCE RLS, grants, dados ou schema fora da policy.
- **NÃO executado.**

### TESTES / REGRESSÕES

| Check | Resultado |
|-------|-----------|
| Preparação RLS dedicada | **9/9 PASS** |
| RH API Foundation + documentos + pilotos RLS relacionados | **113/113 PASS** |
| React proporcional de documentos | **3/3 PASS** |
| `npm run build` | **OK** |
| `git diff --check` | **OK** |

O primeiro processo React concluiu os três asserts, mas permaneceu aberto por
handle JSDOM preexistente; a mesma suíte foi repetida com
`--test-force-exit` e encerrou com **3/3 PASS**. Não houve alteração no teste
legado para ampliar o escopo.

O build confirmou a URL Supabase oficial injetada. Bundles `.cjs` e a mudança
de plataforma no `package-lock.json`, gerados localmente pelo build/install,
foram restaurados exatamente ao baseline e não integram o diff.

### DIFF FINAL PREVISTO

Exatamente quatro arquivos locais:

1. `migrations/2026_08_31_fase4_rls_rh_employee_documents.sql`;
2. `migrations/rollback/2026_08_31_fase4_rls_rh_employee_documents.sql`;
3. `scripts/fase4-rls-rh-employee-documents.test.ts`;
4. `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`.

Zero código funcional, `.cjs`, `rhApiAccess`, componentes, folha, ponto,
financeiro, Asaas, Investment, Z-API, OS ou script global de RLS no diff.

### RISCOS / GATES

- O rollback restaura deliberadamente a policy ampla anterior e, portanto,
  reabre acesso direto de `anon`/`authenticated`; usar somente por decisão
  emergencial explícita.
- O registro global de Realtime deixará de receber eventos da tabela para
  clientes comuns após o lockdown, mas hoje não há listener nem query key
  funcional. Revalidar esse inventário imediatamente antes do apply.
- Como a tabela está vazia, o pós-check deve combinar metadata RLS com smoke da
  API autenticada; uma lista vazia isolada não prova acesso técnico.
- Mudança de policy, FORCE RLS, consumidor direto, listener ou base Git antes
  do apply constitui drift e exige nova auditoria.

### PLANO DE APPLY / ROLLBACK FUTURO

1. Atualizar refs e confirmar `main=dev` na base autorizada.
2. Reauditar frontend, backend, Realtime e metadata live sem retornar PII.
3. Confirmar policy exata e criar tag Git pré-apply.
4. Mostrar o forward completo e obter autorização humana explícita.
5. Executar somente o forward específico uma vez.
6. Pós-check: RLS ligado, FORCE RLS false, zero policies, grants preservados,
   service role com BYPASSRLS e row count apenas numérico.
7. Executar smokes API e regressões proporcionais.
8. Se houver lockout funcional comprovado causado pelo bloco, mostrar o
   rollback, obter autorização explícita, executá-lo uma vez e revalidar.
9. Sem falha, manter rollback não executado e seguir para revisão/PR em etapa
   separada.

### DECISÃO

# 🟡 LOCKDOWN RLS DE RH_EMPLOYEE_DOCUMENTS PREPARADO — AGUARDANDO REVISÃO E AUTORIZAÇÃO PARA APPLY

---

> Handoff oficial — **PR #294 MERGEADO E HOMOLOGADO EM DEV**
> **Lockdown de exames persistiu após o merge; SQL não reaplicado e rollback não executado.**

---

## FASE 4 — RLS RH_MEDICAL_EXAMS — HOMOLOGAÇÃO PÓS-MERGE

### PROGRESSO

**Programa geral: 84,6%**

`█████████████████░░░`

**Fase 4: 63%**

`█████████████░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### GIT / PR

- PR: [#294](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/294).
- Feature:
  `c2cf74ff6b23fb42b645ba0229af2da907641473`.
- Merge real em `dev`:
  `fd807edf853162eb218e593493817507e40b6aa8`.
- `origin/dev`:
  `fd807edf853162eb218e593493817507e40b6aa8`.
- `origin/main` preservado:
  `ea18e74734d7db574a3ecf6b33ec185b7e50f8ce`.
- O merge possui pais exatos `ea18e747` e `c2cf74ff`.
- Não houve commit posterior inesperado em `dev`.
- Branches dos PRs #289, #293 e #294 não foram apagadas.

### CHECKS DO PR

- 4 checks aprovados, conforme evidência do GitHub.
- Vercel Preview concluída.
- Supabase Preview skipped por ausência de alteração na pasta Supabase; estado
  esperado e não classificado como falha.

### ESCOPO INCORPORADO

- Exatamente quatro arquivos:
  - forward RLS de `rh_medical_exams`;
  - rollback exato;
  - teste arquitetural RLS;
  - handoff.
- `+559`, sem `.cjs` ou código funcional.
- `rhApiAccess.ts` e `RhEmployeeScopedCrud.tsx`: zero diff.
- Zero mudança em financeiro, Asaas, folha, ponto, Investment, Z-API ou OS.

### LIVE READ-ONLY PÓS-MERGE

| Campo | Resultado |
|-------|-----------|
| RLS | habilitado |
| FORCE RLS | false |
| Policies | 0 |
| Anon | 0 |
| Authenticated | 0 |
| Service role | SELECT + BYPASSRLS preservados |
| Row count | 0 |

- Nenhuma linha, funcionário ou PII médica foi consultada/retornada.
- Forward **não reaplicado** nesta homologação.
- Rollback **não executado**.

### REGRESSÕES NO HEAD REAL DE DEV

| Check | Resultado |
|-------|-----------|
| RLS exames | **9/9 PASS** |
| RH/RLS/Foundation/F4 dirigidos | **158/158 PASS** |
| React proporcional | **3/3 PASS** |
| Build | **OK** |
| `git diff --check` | **OK** |

### ROLLBACK / PRÓXIMO PASSO

- Rollback permanece disponível em
  `migrations/rollback/2026_08_31_fase4_rls_rh_medical_exams.sql`.
- Nenhum critério de rollback foi observado.
- Próximo gate: versionar este handoff em commit documental separado e preparar
  publicação controlada `dev → main` somente após autorização explícita.

### DECISÃO

# 🟢 PR #294 HOMOLOGADO EM DEV — APTO PARA PUBLICAÇÃO CONTROLADA

---

> Handoff oficial — **RLS `rh_medical_exams` APLICADO E VALIDADO**
> **Policy permissiva removida; zero PII, zero dados alterados e rollback não executado.**

---

## FASE 4 — RLS RH_MEDICAL_EXAMS — APPLY CONTROLADO

### PROGRESSO

**Programa geral: 84,5%**

`█████████████████░░░`

**Fase 4: 61%**

`████████████░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### MARCO / BASE

- Data/hora do pós-check: 2026-08-31 14:18:39 (UTC-3).
- Baseline funcional:
  `main = dev = ea18e74734d7db574a3ecf6b33ec185b7e50f8ce`.
- Branch de trabalho:
  `cursor/fase4-rh-medical-exams-rls-eaa8`.
- Tag pré-apply:
  `baseline-fase4-pre-rls-rh-medical-exams-20260831` → `ea18e747`.
- Migration aplicada exatamente uma vez:
  `migrations/2026_08_31_fase4_rls_rh_medical_exams.sql`.
- Nenhuma outra tabela ou migration foi executada.

### PRÉ-CHECK LIVE

| Campo | Estado |
|-------|--------|
| Tabela | `public.rh_medical_exams` |
| RLS | habilitado |
| FORCE RLS | não |
| Policies | 1/1 esperada |
| Policy | `Allow all for rh_medical_exams` |
| Tipo / comando | `PERMISSIVE` / `ALL` |
| Roles | anon, authenticated |
| USING / WITH CHECK | `true` / `true` |
| Row count | 0 |
| service_role | SELECT + BYPASSRLS |

O drift guard aprovou o estado exato antes do `DROP`.

### APPLY / PÓS-CHECK

- Transação concluída sem erro.
- RLS permanece **habilitado**.
- FORCE RLS permanece **false**.
- Policies finais: **0**.
- Anon: **0** acesso direto.
- Authenticated: **0** acesso direto.
- Service role: acesso técnico preservado por `BYPASSRLS`; contagem atual 0.
- Row count permanece **0**.
- Nenhuma linha, funcionário, tipo, data, resultado, clínica, documento ou PII
  foi retornado.
- Nenhum INSERT, UPDATE ou DELETE de dados foi executado.

### API / REGRESSÕES

- Rota de exames sem autenticação:
  GET 401, POST 401, PATCH 401 e DELETE 401.
- Nenhuma operação autenticada real ou escrita sintética foi executada.
- Teste RLS: **9/9 PASS**.
- RH/RLS/Foundation/F4 proporcionais: **158/158 PASS**.
- React proporcional: **3/3 PASS**.
- Build: **OK**.

### ROLLBACK

- Disponível em:
  `migrations/rollback/2026_08_31_fase4_rls_rh_medical_exams.sql`.
- Compatível com o estado pré-apply e restaura exatamente a policy anterior.
- Rollback **NÃO executado**, pois API, service role, RLS e regressões
  permaneceram verdes.
- Qualquer execução futura exige nova decisão explícita.

### ESCOPO NEGATIVO

- Zero alteração em outras tabelas, policies, schema ou dados.
- Zero mudança funcional em frontend, Foundation, CRUD genérico, folha, ponto,
  financeiro, Asaas, Investment, Z-API ou OS.
- Nenhum merge, deploy ou publicação Git nesta execução.

### DECISÃO

# 🟢 RLS RH_MEDICAL_EXAMS APLICADO E VALIDADO

---

> Handoff oficial — **RLS `rh_medical_exams` AUDITADO E PREPARADO**
> **Forward/rollback locais; nenhuma migration aplicada e nenhum dado médico consultado.**

---

## FASE 4 — RLS RH_MEDICAL_EXAMS — PREPARAÇÃO PRÉ-APPLY

### PROGRESSO

**Programa geral: 84,5%**

`█████████████████░░░`

**Fase 4: 61%**

`████████████░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

Preparação não representa apply, merge ou homologação de lockdown.

### BASE / ESCOPO

- Baseline homologado:
  `origin/dev = origin/main =
  ea18e74734d7db574a3ecf6b33ec185b7e50f8ce`.
- PR funcional: [#293](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/293).
- Feature funcional:
  `02f34955e360bf9d1e00efc00df67a015a1fb571`.
- Branch desta preparação:
  `cursor/fase4-rh-medical-exams-rls-eaa8`.
- Tabela exclusiva: `public.rh_medical_exams`.
- Nenhum SQL/DDL/DML live foi executado.

### CONSUMIDORES

- Frontend runtime direto: **ZERO**.
- Únicas chamadas runtime `.from('rh_medical_exams')`:
  `lib/rh/medicalExamsApiCore.ts`, SSOT backend.
- Fluxo preservado:
  `RhMedicalExams` → `medicalExamsClient` → `authFetch` → handler →
  `authorizeRhApiRequest` → core → `createRhServiceRoleClient` → tabela.
- Ocorrências restantes: migration/schema histórico, scripts/testes e
  documentação.
- `lib/rh/rhApiAccess.ts` e `RhEmployeeScopedCrud.tsx`: **zero diff**.

### ESTADO LIVE — SOMENTE METADADOS/COUNT

Projeto oficial: `ajhmmjuewdsukecaimik`.

| Campo | Estado observado |
|-------|------------------|
| Tabela | existe |
| RLS | habilitado |
| FORCE RLS | não |
| Owner | `postgres` |
| Policies | 1 |
| Nome | `Allow all for rh_medical_exams` |
| Tipo | `PERMISSIVE` |
| Comando | `ALL` |
| Roles | `anon`, `authenticated` |
| USING / WITH CHECK | `true` / `true` |
| Grants SELECT | anon, authenticated e service_role |
| service_role | `BYPASSRLS` ativo |
| Contagem | 0 |

Nenhuma coluna, linha, funcionário ou dado médico foi retornado. A policy atual
permite acesso direto amplo e deve ser removida após aprovação controlada.

### LOCKDOWN ALVO

- RLS permanece habilitado.
- Policies permissivas para anon/authenticated: zero.
- Grants podem permanecer; com RLS ativo e zero policies, anon/authenticated
  ficam em deny-by-default.
- Service role mantém acesso backend via `BYPASSRLS`.
- A autorização RH/Diretoria continua na aplicação; RLS não a substitui.

### FORWARD

- Arquivo:
  `migrations/2026_08_31_fase4_rls_rh_medical_exams.sql`.
- Exclusivo, transacional, idempotente e fail-closed.
- Aceita somente zero policies ou exatamente a policy live observada.
- Valida tabela, RLS, nome, modo, comando, roles, `USING` e `WITH CHECK` antes
  do `DROP`.
- Remove somente `Allow all for rh_medical_exams`.
- Não cria policy substituta, não altera colunas e não contém DML.
- **NÃO aplicado.**

### ROLLBACK

- Arquivo:
  `migrations/rollback/2026_08_31_fase4_rls_rh_medical_exams.sql`.
- Aceita somente zero policies ou a policy exata já restaurada.
- Restaura exatamente:
  `PERMISSIVE`, `ALL`, `TO anon, authenticated`, `USING (true)` e
  `WITH CHECK (true)`.
- Qualquer estado diferente aborta sem tentar corrigir drift.
- **NÃO executado.**

### SCRIPTS GLOBAIS / REALTIME

- `scripts/rh-rls-policies.sql` permanece structure-only: somente habilita RLS
  e não cria/remove/altera policies.
- `scripts/rh-bootstrap-full.sql` não cria policy.
- Migration histórica permanece imutável.
- Nenhum listener ou dependência funcional Realtime existe para a tabela.

### TESTES

| Check | Resultado |
|-------|-----------|
| Preparação RLS específica | **9/9 PASS** |
| RH/RLS/Foundation/F4 proporcionais | **158/158 PASS** |
| Componente exames proporcional | **3/3 PASS** |
| Build | **OK** |
| `git diff --check` | **OK** |

### PLANO DE APPLY / ROLLBACK FUTURO

1. Atualizar refs e reauditar consumidor frontend.
2. Pré-check live somente leitura: RLS ativo e policy exatamente igual à
   registrada acima; contagem apenas como evidência variável.
3. Mostrar o SQL forward completo e aguardar aprovação humana.
4. Aplicar somente a migration de `rh_medical_exams`.
5. Pós-check: policies 0; anon/authenticated 0; service role preservado; API sem
   auth 401; nenhuma escrita sintética.
6. Executar rollback imediatamente apenas se API/service role sofrer regressão
   causada pelo lockdown.
7. Após deploy/startup futuro, confirmar novamente policies 0 para provar que
   nenhum bootstrap reabriu acesso.

### ÁREAS PRESERVADAS

Zero alteração em frontend funcional, Foundation, CRUD genérico, folha, ponto,
financeiro, Asaas, Investment, Z-API, OS, outras tabelas, schemas ou policies.

### DECISÃO

# 🟢 RLS RH_MEDICAL_EXAMS PREPARADO — APTO PARA REVISÃO PRÉ-APPLY

---

> Handoff oficial — **PR #293 MERGEADO E HOMOLOGADO EM DEV**
> **Terceiro piloto RH validado no HEAD real de `dev`; `main` e banco preservados.**

---

## FASE 4 — EXAMES MÉDICOS — HOMOLOGAÇÃO PÓS-MERGE

### PROGRESSO

**Programa geral: 84,3%**

`█████████████████░░░`

**Fase 4: 57%**

`███████████░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

O merge em `dev` não altera o progresso de programa/Fase 4 antes da publicação
e homologação em produção.

### GIT / PR

- PR: [#293](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/293).
- Feature:
  `02f34955e360bf9d1e00efc00df67a015a1fb571`.
- Merge real em `dev`:
  `c560f078678d11f865619756156815acd64eecfd`.
- `origin/dev`:
  `c560f078678d11f865619756156815acd64eecfd`.
- `origin/main` preservado:
  `c3bd847c53fb9d385c48d2da9cd657b619fd6f3d`.
- `02f34955` e `c560f078` são ancestrais de `origin/dev`.
- Não houve avanço posterior ao merge.
- Branch feature e PR antigo #289 permanecem intactos.

### CHECKS INFORMADOS PELO GITHUB

- 4 checks aplicáveis aprovados.
- Vercel Preview concluída.
- Vercel Agent Review aprovado.
- Vercel Preview Comments sem pendências.
- Supabase Preview skipped por ausência de alteração Supabase.
- Sem conflitos com `dev`.

### ESCOPO INCORPORADO

- 10 arquivos, `+1389/-19`.
- Componente dedicado, client, core, handler, integração da aba Exames, rota
  Express, rewrite Vercel, testes e handoff.
- `RhEmployeeScopedCrud.tsx`: **zero diff**.
- `lib/rh/rhApiAccess.ts`: **zero diff**.
- Zero `.cjs`, migration, SQL, policy, RLS ou schema.
- Zero alteração funcional em folha, ponto, financeiro, Asaas, Investment,
  Z-API ou OS.

### ARQUITETURA E CONTRATOS REVALIDADOS

`RhEmployeeWorkspace` → `RhMedicalExams` → `medicalExamsClient` → `authFetch`
→ handler → `authorizeRhApiRequest` → core → `createRhServiceRoleClient` →
`rh_medical_exams`.

- Frontend Supabase direto para `rh_medical_exams`: **zero**.
- GET: `employee_id`, `deleted_at IS NULL`, `exam_date DESC`.
- POST/PATCH: UUIDs e allowlist; `exam_type` obrigatório; zero `updated_by`.
- DELETE: somente soft delete por `deleted_at`; nunca hard delete.
- Falha de escrita não retorna/exibe sucesso.
- Auditoria somente backend, best-effort e sem duplicidade.
- Nenhum listener ou dependência Realtime foi adicionado.
- Sem token/token inválido: 401; role inválida: 403; sem service role: 503.
- Nenhum registro ou PII de exame foi consultado/exibido na homologação.

### TESTES NO HEAD REAL DE DEV

| Check | Resultado |
|-------|-----------|
| API/core exames | **14/14 PASS** |
| Componente isolado | **3/3 PASS** |
| RH/Foundation/RLS/F4 dirigidos | **153/153 PASS** |
| TypeScript | **1177/1178** |
| Falha TS | mesma baseline CRLF em `invoice-control-loading.test.ts` |
| React completo | **10/10 PASS** |
| Build completo | **OK** |
| `git diff --check` | **OK** |

### HANDOFF / ROLLBACK / PRÓXIMO PASSO

- Este marco é somente documental, preparado localmente e ainda sem commit.
- Nenhum rollback foi necessário; não houve alteração de banco/RLS.
- Rollback de código, se necessário antes da publicação, é o revert controlado
  do merge/feature; não foi executado.
- Próximo gate: apresentar este resultado, depois versionar o handoff
  separadamente e preparar `dev → main` somente mediante nova autorização.

### DECISÃO

# 🟢 PR #293 MERGEADO E HOMOLOGADO EM DEV

---

> Handoff oficial — **PR #289 RECONCILIADO NO BASELINE ATUAL**
> **Consumidor de `rh_medical_exams` migrado localmente para a RH API Foundation; sem commit/push/SQL/RLS.**

---

## FASE 4 — TERCEIRO PILOTO RH — EXAMES MÉDICOS

### PROGRESSO

**Programa geral: 84,3%**

`█████████████████░░░`

**Fase 4: 57%**

`███████████░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

Reconciliação local não aumenta programa ou Fase 4 antes de revisão, merge e
homologação.

### BASE E PRESERVAÇÃO

- Baseline: `origin/dev = origin/main =
  c3bd847c53fb9d385c48d2da9cd657b619fd6f3d`.
- Produção: versão `3.7.60`, build `c3bd847c`.
- PR antigo: [#289](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/289),
  draft, não mergeado.
- Branch antiga preservada:
  `cursor/fase4-rh-medical-exams-api-eaa8` →
  `f8cafa524dc31134159f22b7999780927624f960`.
- Base histórica informada do PR: `9a634793`; pai direto real do feature commit:
  `6cc3a8f3`.
- Nova branch/worktree:
  `cursor/fase4-rh-medical-exams-reconcile-eaa8`.
- O gate Vercel pendente no marco anterior foi posteriormente resolvido:
  `c3bd847c` foi publicado e homologado antes desta reconciliação.

### CLASSIFICAÇÃO DO PR ANTIGO

| Arquivo antigo | Classe | Resultado |
|----------------|--------|-----------|
| `api/rh-employee-medical-exams.ts` | C | adaptado à Foundation atual |
| `components/rh/RhEmployeeWorkspace.tsx` | C | somente aba Exames substituída |
| `components/rh/RhMedicalExams.tsx` | A | reaplicado com teardown JSDOM corrigido no teste |
| handoff antigo | D | substituído por este marco, sem sobrescrever histórico |
| `lib/rh/medicalExamsApiCore.ts` | A | SSOT backend preservado |
| `lib/rh/medicalExamsClient.ts` | A | `authFetch` preservado |
| teste API/core antigo | C | reconciliado com a Foundation atual |
| teste React antigo | C | reconciliado e sem hang isolado |
| `server/rhRoutes.ts` | C | rota mínima sobre handler comum |
| `vercel.json` | C | rewrite mínimo antes do catch-all |

Nenhuma mudança foi classificada como B (já implementada integralmente) ou E
(inconclusiva).

### ARQUITETURA FINAL

`RhEmployeeWorkspace` → `RhMedicalExams` → `medicalExamsClient` → `authFetch`
→ handler autenticado → `authorizeRhApiRequest` → `medicalExamsApiCore` →
`createRhServiceRoleClient` → `rh_medical_exams`.

- `lib/rh/rhApiAccess.ts` permanece SSOT e tem **zero diff**.
- `RhEmployeeScopedCrud.tsx` permanece com **zero diff**.
- Frontend runtime direto para `rh_medical_exams`: **zero**.
- Nenhum fallback anon ou chave `service_role` no frontend.
- Nenhum listener/dependência Realtime foi adicionado.

### CONTRATOS PRESERVADOS

- GET: `employee_id`, `deleted_at IS NULL`, `exam_date DESC`.
- POST: `exam_type` e `exam_date` obrigatórios; sem `updated_by`.
- PATCH: `id`/`employeeId` UUID, allowlist explícita e sem mass assignment.
- DELETE: somente soft delete em `deleted_at`; nunca hard delete.
- INSERT/UPDATE/DELETE com erro não retornam nem exibem sucesso.
- Erro de leitura mantém a equivalência visual baseline: lista vazia, sem nova
  notificação.
- Layout, tabela, busca, ordenação, permissões, mensagens e refresh preservados.

### AUTH / SERVICE ROLE

- Fundação atual valida token TM SEG e principal ativo server-side.
- Somente RH e Diretoria são autorizados.
- Sem token/token inválido: 401.
- Role inválida: 403.
- `service_role` ausente: 503.
- Headers, body e query não elevam role.
- Handler usa `createRhServiceRoleClient()`; erros internos retornam mensagem
  genérica.

### AUDITORIA

- Auditoria é escrita somente pelo core backend em `rh_audit_logs`.
- Não existe chamada de auditoria no novo componente/client.
- Falha da auditoria é best-effort e não desfaz operação principal já concluída.
- Nenhuma API genérica, policy ou RLS de `rh_audit_logs` foi alterada.

### TESTES

| Check | Resultado |
|-------|-----------|
| API/core exames | **14/14 PASS** |
| Componente exames isolado, sem `--test-force-exit` | **3/3 PASS** |
| RH/Foundation/RLS/F4 dirigidos | **153/153 PASS** |
| Baseline TS `c3bd847c` | **1163/1164** |
| TS pós-reconciliação | **1177/1178** |
| Falha TS | mesma baseline CRLF em `invoice-control-loading.test.ts` |
| React completo | **10/10 PASS** |
| Build completo | **OK** |
| `git diff --check` | **OK** |

O runner React completo sem `--test-force-exit` permanece aberto em um arquivo
baseline anterior aos exames. O teste novo de exames encerra normalmente sem
force; a suíte completa foi executada com a opção oficial do Node e passou
10/10. Classificação: **AMBIENTE/BASELINE**, não regressão do piloto.

### ESCOPO / ROLLBACK / PRÓXIMO PASSO

- Diff restrito aos arquivos do consumidor de exames e este handoff.
- Zero `.cjs`, bundle, temporário, migration, SQL, policy ou RLS.
- Folha, ponto, Control iD, financeiro, NF, Asaas, Investment, DRE, Z-API e OS
  permanecem inalterados.
- Nenhum SQL/DDL/DML live foi executado.
- Rollback de banco não se aplica; antes de merge, o retorno é descartar/reverter
  somente este diff Git local.
- Próximo passo: revisão independente do novo diff; depois, mediante nova
  autorização, commit/push e novo PR. O PR #289 antigo permanece intacto.

### DECISÃO

# 🟢 PR #289 RECONCILIADO — NOVO DIFF APTO PARA REVISÃO

---

> Handoff oficial — **PR #292 MERGEADO EM DEV E HOMOLOGADO LOCALMENTE**
> **Vercel do HEAD de dev pendente de evidência; `main` e produção não foram alteradas.**

---

## FASE 4 — PR #292 — HOMOLOGAÇÃO PÓS-MERGE EM DEV

### PROGRESSO

**Programa geral: 84,3%**

`█████████████████░░░`

**Fase 4: 57%**

`███████████░░░░░░░░░`

**Execução atual: 90%**

`██████████████████░░`

O merge e o código foram homologados no estado real de `dev`; o fechamento em
100% depende somente da confirmação externa do deploy/check Vercel do merge.

### GIT / PR

- PR: [#292](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/292).
- Feature commit:
  `693ff2c109fce0716cfa60fd51e70158bddce6e3`.
- Merge commit:
  `38d945e917c014544b28dc84b6f5db6e14af3184`.
- `origin/dev`:
  `38d945e917c014544b28dc84b6f5db6e14af3184`.
- `origin/main`:
  `0f50b03f150691bd18f8b6bd5012e38199038456`.
- `693ff2c1` é ancestral de `origin/dev`.
- Não houve commit posterior ao merge em `dev`.
- A branch feature não foi apagada.

### ESCOPO DO MERGE

- 11 arquivos: quatro handlers RH, `ensureRhTables`, caller CLI, quatro testes
  e este handoff.
- `+927/-97`.
- Nenhum `.cjs`, migration, SQL, policy ou alteração RLS.
- Nenhuma mudança funcional em folha, ponto, Control iD, cálculos RH ou
  financeiro.
- `ensureTimeClockAndLinkCltUsers()` e startup interno permaneceram
  inalterados.

### TESTES NO HEAD REAL DE DEV

| Check | Resultado |
|-------|-----------|
| Bootstraps + bypass | **32/32 PASS** |
| RH/Foundation/RLS/F4 dirigidos | **190/190 PASS** |
| TypeScript | **1163/1164** |
| Falha TS | mesma baseline CRLF em `invoice-control-loading.test.ts` |
| React | **7/7 PASS** |
| Build completo | **OK** |

### SMOKES SEGUROS

- Os testes de handler confirmaram, sem escrita:
  - `/api/rh/init` sem auth → 401;
  - `/api/rh/timeclock/init` sem auth → 401;
  - `/api/rh/employees` sem auth → 401;
  - `/api/rh/employees/cost-summary` sem auth → 401.
- Nenhuma operação estrutural, consulta de PII, salário ou custo foi alcançada.
- Controle de produção:
  - `/api/version` → build `0f50b03f`, versão `3.7.60`,
    builtAt `2026-08-28T18:47:54.233Z`;
  - `/api/health` → 200;
  - `/` → 200.
- O controle confirma que `main`/produção não receberam o PR #292.

### VERCEL

- CLI Vercel: indisponível.
- Integração dinâmica Vercel: indisponível.
- URL da Preview/check do merge `38d945e9`: não fornecida.
- Portanto, o status do deploy correspondente ao **HEAD pós-merge de dev**
  permanece **NÃO VALIDADO**, sem inferência a partir da Preview da feature.

### HANDOFF / ROLLBACK / PRÓXIMO PASSO

- Este é um ajuste exclusivamente documental, ainda local e sem commit.
- Nenhum rollback foi necessário; não houve SQL/RLS nem publicação em `main`.
- Próximo gate: obter evidência Vercel do commit `38d945e9`. Se verde, preparar
  publicação controlada `dev → main` somente mediante nova autorização.

### DECISÃO

# 🟡 PR #292 HOMOLOGADO EM DEV — VERCEL DO MERGE PENDENTE

---

> Handoff oficial — **BOOTSTRAPS RH + BYPASS RECONCILIADOS COM A RH API FOUNDATION**
> **Nova worktree em `origin/dev`; staged antigo preservado e nenhum commit/push/SQL/RLS executado.**

---

## FASE 4 — RECONCILIAÇÃO DOS BOOTSTRAPS RH

### PROGRESSO DA EXECUÇÃO

**Programa geral: 84,2%**

`█████████████████░░░`

**Fase 4: 55%**

`███████████░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

Percentuais mantidos conforme escopo desta execução; nenhum avanço foi
contabilizado antes de revisão, merge, deploy e homologação.

### PRESERVAÇÃO E BASE

- Base reconciliada: `origin/dev = origin/main =
  0f50b03f150691bd18f8b6bd5012e38199038456`.
- Nova branch/worktree:
  `cursor/fase4-rh-bootstrap-reconcile-eaa8`.
- A branch antiga `cursor/fase4-rls-rh-lote1-audit-eaa8` permanece intacta em
  `473b4d40`, com seus 12 arquivos staged e quatro `.cjs` unstaged.
- Nenhum reset destrutivo, `stash pop/apply/drop`, commit, push, PR, merge ou
  deploy foi executado.

### SSOT ATUAL DE AUTH RH

`lib/rh/rhApiAccess.ts` é a foundation homologada e a fonte única para APIs RH
sensíveis:

1. extrai e valida o token TM SEG;
2. exige `service_role`;
3. resolve server-side o principal ativo em `system_users` e seu perfil;
4. permite somente RH e Diretoria;
5. ignora `x-tmseg-role`, body e querystring como fonte de autorização;
6. cria cliente administrativo exclusivamente via
   `createRhServiceRoleClient()`.

`lib/rh/apiEmployeesAuth.ts` continua necessário para parsing de token,
normalização de roles e consumidores legacy, mas não é mais o SSOT de
autorização dos quatro handlers reconciliados. O wrapper estrito proposto na
branch antiga foi descartado para evitar arquitetura paralela.

### CLASSIFICAÇÃO DAS MUDANÇAS ANTIGAS

| Artefato antigo | Classificação | Reconciliação |
|-----------------|---------------|---------------|
| `api/rh-init.ts` | C — adaptar | Foundation + single-flight |
| `api/rh-timeclock-init.ts` | C — adaptar | Foundation + single-flight |
| `api/rh-employee-list.ts` | C — adaptar | Foundation + service-role client |
| `api/rh-employee-costs.ts` | C — adaptar | Foundation + service-role client |
| `lib/rh/apiEmployeesAuth.ts` | D — wrapper obsoleto | removido do diff |
| `lib/rh/ensureRhTables.ts` | A — necessária | fail-closed via Foundation |
| `scripts/link-clt-system-users.mjs` | A — necessária | token remoto + sem anon |
| teste arquitetural antigo | D — obsoleto | não reaplicado |
| três testes de segurança | C — adaptar | Foundation real nos testes |
| handoff antigo | C — adaptar | novo marco no topo, histórico preservado |

### CONTRATOS PRESERVADOS

- `/api/rh/init`: POST RH/Diretoria preservado; sem auth/token inválido = 401;
  role indevida = 403; sem service role = 503; GET autenticado = 405.
- `/api/rh/timeclock/init`: mesmo contrato de segurança; retorno
  `unavailable` e mensagens operacionais preservados.
- `/api/rh/employees`: mesmos campos, filtro `deleted_at`, joins, ordenação e
  payload `{ ok, employees, total }`.
- `/api/rh/employees/cost-summary`: mesmo período, loader, agregações, salários,
  benefícios, folha e payload.
- `ensureTimeClockAndLinkCltUsers()`, `runRhMigrations()`, ponto, batidas,
  entrada/saída, Control iD e migrations permaneceram inalterados.

### BOOTSTRAP / CLI

- `ensureRhTables()` continua aplicando exatamente a migration estrutural
  existente, sem policy ou DDL novo.
- A execução e a verificação agora exigem
  `createRhServiceRoleClient()`; não há fallback anon.
- Os dois endpoints de init usam single-flight por processo, limpando estado
  em sucesso e erro e permitindo tentativa posterior.
- O caller remoto `link-clt-system-users.mjs --api` exige `--token` ou
  `TMSEG_AUTH_TOKEN` e envia o segredo somente no header `Authorization`.
- O caminho CLI local também falha fechado sem service role; nenhum token/chave
  é impresso ou persistido.

### TESTES PÓS-RECONCILIAÇÃO

| Check | Resultado |
|-------|-----------|
| Bootstraps + bypass real | **32/32 PASS** |
| RH/Foundation/RLS/F4 dirigidos | **190/190 PASS** |
| Baseline TS de `origin/dev` | **1131/1132** |
| TS pós-reconciliação | **1163/1164** |
| Falha TS | mesma baseline CRLF em `invoice-control-loading.test.ts` |
| React pós-reconciliação | **7/7 PASS** |
| Build | **OK** |

O runner React sem `--test-force-exit` concluiu as asserções iniciais, mas
permaneceu aberto por handle do ambiente. A reexecução com a opção oficial do
Node terminou em 7/7; classificado como **AMBIENTE**, sem regressão.

### DIFF RECONCILIADO

- Quatro handlers RH.
- `lib/rh/ensureRhTables.ts`.
- Caller CLI.
- Teste arquitetural existente atualizado para a Foundation.
- Três testes novos de segurança.
- Este handoff.
- Zero alteração em `lib/rh/apiEmployeesAuth.ts`, migrations, policies,
  cálculos, folha, ponto, financeiro, NF, Asaas, Investment, DRE, Z-API ou OS.
- Bundles `.cjs` gerados foram removidos apenas da worktree nova; os quatro
  arquivos unstaged da árvore antiga permanecem intocados.

### DECISÃO

# 🟢 RECONCILIAÇÃO CONCLUÍDA — DIFF ATUALIZADO APTO PARA COMMIT/PR

---

> Handoff oficial — **F4 RH RLS `rh_employee_bank_accounts` HOMOLOGADO**
> **PR #288 em produção; lockdown persistiu após startup e rollback não foi necessário.**

---

## RLS — `rh_employee_bank_accounts` — APLICAÇÃO CONTROLADA

### PROGRESSO CONSERVADOR

**Programa geral: 84,1%**

`█████████████████░░░`

**Fase 4: 52%**

`██████████░░░░░░░░░░`

**Execução do apply: 100%**

`████████████████████`

Fórmula conservadora: base pré-Fase 4 de 82% + `4 × 0,52 = 2,08`,
totalizando 84,08%, arredondado para 84,1%. A Fase 4 avançou de 50% para 52%
somente após apply, merge, deploy e revalidação live pós-startup.

### RECONCILIAÇÃO

- Data: 2026-08-26 (UTC-3).
- Base pré-aplicação: `origin/main = origin/dev = produção =
  92df6a0d41f428b62afaaccc0906a20fe25873b6`.
- Branch: `cursor/fase4-rls-rh-bank-accounts-eaa8`, atualizada exclusivamente
  por fast-forward da `main`.
- [PR #288](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/288)
  mergeado em `dev` pelo commit `3007a46a45f5d9ce709aff9b512bbbc4e9532619`.
- Tag pré-aplicação:
  `baseline-fase4-pre-rls-rh-bank-accounts-20260826` → `92df6a0d`.
- Tag pós-homologação:
  `baseline-fase4-rls-rh-bank-accounts-merged-20260826` → `3007a46a`.
- `main = dev = produção =
  3007a46a45f5d9ce709aff9b512bbbc4e9532619`.
- Produção: `/api/version` no build `3007a46a`, versão `3.7.60`,
  builtAt `2026-08-26T20:25:30.223Z`; `/api/health` e `/` HTTP 200.
- Handoff anterior confirma o PR #287 publicado e o script operacional RH
  neutralizado.

### APPLY E ESTADO LIVE

- Projeto oficial: Grupo TMSEG `ajhmmjuewdsukecaimik`.
- Pré-check exato:
  - policy `Allow all for rh_employee_bank_accounts`;
  - `PERMISSIVE`;
  - comando `ALL`;
  - roles exatas `anon` e `authenticated`;
  - `USING (true)`;
  - `WITH CHECK (true)`.
- Forward aplicado pelo Supabase MCP:
  `20260826201427 / fase4_rls_rh_employee_bank_accounts`.
- Horário do apply: 2026-08-26 17:14:27 (UTC-3).
- Resultado pós-apply:
  - RLS habilitado;
  - policies: **0**;
  - `anon SELECT`: **0**;
  - `authenticated SELECT`: **0**;
  - `service_role`: **4 registros visíveis**, confirmando bypass preservado.
- Nenhum valor bancário, PIX, agência, conta, favorecido ou `employee_id` foi
  consultado ou exibido.

### CONSUMIDORES E SERVICE ROLE

- Frontend runtime direto: **ZERO**.
- Única ocorrência runtime de `.from('rh_employee_bank_accounts')`:
  `lib/rh/employeeBankAccountsApiCore.ts`, SSOT backend.
- Fluxo preservado:
  `RhEmployeeForm` → `employeeBankAccountsClient` → `authFetch` →
  API RH autenticada → `authorizeRhApiRequest` → backend →
  `createRhServiceRoleClient` → tabela.
- Contrato preservado: GET por `employeeId`, POST e PATCH; sem DELETE.
- RH e Diretoria permanecem autorizados. Administrador, CEO, Gestor,
  Financeiro e Operador permanecem bloqueados.
- Ausência de chave `service_role` continua fail-closed com HTTP 503.
- Não foi criada policy para `service_role`; o backend mantém o bypass RLS
  nativo e a chave não é exposta ao frontend.

### REALTIME

- A tabela permanece no cadastro global de `RealtimeProvider` e na migration
  histórica de publicação.
- `TABLE_TO_QUERY_KEYS` está vazio para a tabela e não existe listener de
  `supabase:rh_employee_bank_accounts` no runtime.
- O formulário não depende de evento Realtime: carregamento e gravação passam
  pela API autenticada.
- Conforme a documentação atual do Supabase, quando RLS não permite SELECT a
  assinatura conecta, mas os eventos ficam silenciosos. Logo, o lockdown elimina
  eventos públicos sem remover comportamento necessário do formulário.
- Nenhuma configuração Realtime foi alterada.

### MIGRATION FORWARD

- Arquivo:
  `migrations/2026_08_26_fase4_rls_rh_employee_bank_accounts.sql`.
- Exclusiva da tabela alvo, transacional, idempotente e fail-closed.
- Exige tabela existente, RLS já habilitado e estado com zero policies
  (já aplicado) ou exatamente a única policy permissiva auditada.
- Qualquer policy adicional ou alteração de nome, roles, comando, `USING` ou
  `WITH CHECK` aborta antes do `DROP`.
- Mantém RLS habilitado e remove somente
  `Allow all for rh_employee_bank_accounts`.
- Não contém DML nem cria policy substituta para `anon`, `authenticated` ou
  `service_role`.
- Aplicação concluída sem drift e restrita à tabela alvo.

### ROLLBACK

- Arquivo:
  `migrations/rollback/2026_08_26_fase4_rls_rh_employee_bank_accounts.sql`.
- Exclusivo, transacional, idempotente e somente para emergência.
- Aceita apenas zero policies ou a policy anterior já restaurada.
- Restaura exatamente nome, modo permissivo, `ALL`, roles
  `anon/authenticated`, `USING (true)` e `WITH CHECK (true)`.
- Qualquer estado diferente aborta sem tentar corrigir drift.

### TESTES E BUILD

- Testes novos da preparação: **9/9**.
- Baseline RH/F4 + script hardening + RLS anteriores: **68/68**.
- Total dirigido: **77/77 PASS**.
- Testes reexecutados após o apply: **77/77 PASS**.
- `npm run build` pós-apply: **OK**.
- Avisos de chunks/importação permanecem no baseline, sem falha.
- `git diff --check`: **OK**.
- Bundles gerados pelo build foram removidos do diff.

### API, ROLLBACK E PRÓXIMOS GATES

- API sem autenticação após o apply: GET **401**, POST **401**, PATCH **401** e
  DELETE **405**; nenhuma escrita real foi executada.
- Arquitetura autenticada e `service_role` permanecem cobertas pelos testes; a
  contagem com `service_role` confirmou acesso backend sem expor conteúdo.
- Nenhum critério de rollback ocorreu. Rollback **não executado**.
- Após o deploy/startup: RLS habilitado, policies **0**, `anon=0`,
  `authenticated=0` e `service_role=4`; o script operacional não recriou
  policy.
- Fluxo oficial `publicar.ps1` concluiu `dev` → `main`, pushes e retorno para
  `dev` sem force.

### ESCOPO, RISCOS E DECISÃO

- Diff exclusivo: forward aplicado live, rollback não executado, teste e este
  handoff.
- Zero alteração funcional em frontend/API/Realtime e zero mudança em outras
  tabelas ou policies.
- Folha, salário, ponto, documentos, exames, advertências, demais tabelas RH,
  financeiro, NF, Asaas, Investment, DRE, Z-API, pedágio e OS foram preservados.
- Nenhuma outra tabela/policy foi referenciada pelo forward.
- Nenhum DML foi executado. A única escrita live foi o DDL versionado do
  forward exclusivo.

# 🟢 RLS `rh_employee_bank_accounts` APLICADO E HOMOLOGADO

---

> Handoff oficial — **F4 RH RLS: SCRIPT LEGADO PUBLICADO E HOMOLOGADO**
> **PR #287 em produção; sem SQL, migration ou alteração de RLS live.**

---

## F4 RH RLS — NEUTRALIZAÇÃO DE `scripts/rh-rls-policies.sql`

### PROGRESSO

**Programa geral: 84,0%**

`█████████████████░░░`

**Fase 4: 50%**

`██████████░░░░░░░░░░`

**Execução: 100%**

`████████████████████`

Preparação não aumenta percentual e não contabiliza lockdown RLS.

### AUDITORIA DO SCRIPT

- Base inicial: `origin/main = origin/dev = 0f468aaa`.
- Branch: `cursor/fase4-rh-rls-script-hardening-eaa8`.
- [PR #287](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/287)
  mergeado em `dev` pelo commit `14e0a3bf`.
- O script operacional abrangia 23 tabelas:
  `rh_departments`, `rh_positions`, `rh_employees`,
  `rh_employee_bank_accounts`, `rh_employee_documents`,
  `rh_employee_dependents`, `rh_salary_configs`, `rh_commissions`,
  `rh_awards`, `rh_bonuses`, `rh_vacation_requests`, `rh_leave_records`,
  `rh_warnings`, `rh_medical_exams`, `rh_timeclock`, `rh_payroll_runs`,
  `rh_payroll_items`, `rh_holidays`, `rh_benefit_types`,
  `rh_employee_benefits`, `rh_tax_brackets`, `rh_audit_logs` e
  `rh_settings`.
- Para todas as 23 tabelas, o comportamento anterior era policy ampla
  classe A: `DROP POLICY IF EXISTS`, seguido de `CREATE POLICY "Allow all"`
  `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`.
- Não havia policy restrita classe B nem tabela já endurecida classe C nessa
  lista. As tabelas permanecem classe D; `rh_employee_bank_accounts` e
  `rh_employee_documents` possuem consumidor API migrado, mas RLS ainda aberta.
- `billing_usage`, `financial_transaction_payments` e
  `account_balance_snapshots` não constavam no script, portanto não podiam ser
  reabertas diretamente por ele.

### NEUTRALIZAÇÃO

- A lista estrutural das 23 tabelas foi preservada.
- O script agora executa somente `ENABLE ROW LEVEL SECURITY` quando a tabela
  existe.
- Foram removidos todos os caminhos de `CREATE`, `DROP` e `ALTER POLICY`.
- Não existe `FOR ALL`, concessão para `anon`/`authenticated`, `USING (true)`,
  `WITH CHECK (true)`, DML, grant, revoke ou alteração de schema.
- A migration histórica `2026_07_07_rh_rls_policies.sql` permaneceu imutável.
- O script não foi executado localmente nem no Supabase; zero `execute_sql`,
  SQL Editor, dry-run live ou alteração de banco.

### TESTES

- Hardening novo: **6/6**.
- Segundo piloto RH + Foundation + auth + Realtime: **41/41**.
- Regressões RLS de billing, pagamentos e snapshots: **21/21**.
- Total dirigido: **68/68**.
- `npm run build`: **OK**.
- `git diff --check`: **OK**.
- Bundles gerados pelo build foram removidos do diff.

### PUBLICAÇÃO E HOMOLOGAÇÃO

- Publicação controlada em 2026-08-26 (UTC-3).
- Fluxo oficial `publicar.ps1`: merge fast-forward `dev` → `main`, push de
  ambas as branches e retorno para `dev`: **OK**.
- Primeiro commit efetivamente servido:
  `14e0a3bf0176168e56e6771382df79e3feafba2a`.
- Produção oficial: `https://sistema.grupotmseg.com.br`.
- `/api/version`: buildId `14e0a3bf0176168e56e6771382df79e3feafba2a`,
  versão `3.7.60`, builtAt `2026-08-26T19:10:16.842Z`.
- `/api/health`: HTTP 200 e `{"status":"ok","source":"api/health"}`.
- `/`: HTTP 200, HTML carregado e configuração Supabase pública injetada.
- Zero execução de `scripts/rh-rls-policies.sql`, SQL Editor, `execute_sql`,
  migration, leitura/escrita de dado live ou alteração de policy/RLS.

### ESCOPO E PRÓXIMO PASSO

- Diff exclusivo: script operacional, teste estático e este handoff.
- Zero alteração em frontend, API, Realtime, migrations, schema, RLS live,
  financeiro, NF, Asaas, Investment, DRE, Z-API, ponto ou OS.
- Repreparar o lockdown de `rh_employee_bank_accounts` em execução e PR
  separados, com nova revalidação live, forward e rollback exclusivos.

### DECISÃO

# 🟢 SCRIPT RLS LEGADO NEUTRALIZADO — LOCKDOWN PODE SER REPREPARADO

---

> Handoff oficial — **F4 SEGUNDO PILOTO RH BANCÁRIO PUBLICADO E HOMOLOGADO**
> **PR #286 em produção; RLS e banco preservados.**

---

## F4 — SEGUNDO PILOTO RH `rh_employee_bank_accounts` — HOMOLOGAÇÃO

### PROGRESSO CONSERVADOR

**Programa geral: 84,0%**

`█████████████████░░░`

**Fase 4: 50%**

`██████████░░░░░░░░░░`

**Execução: 100%**

`████████████████████`

Fórmula: base pré-Fase 4 de 82% + `4 × 0,50 = 2,00`, totalizando
84,0%. A Fase 4 avançou conservadoramente de 48% para 50% pela publicação e
homologação de um segundo consumidor RH sensível. O lockdown RLS não foi
contabilizado porque continua pendente.

### ESTADO

- Data: 2026-08-26 (UTC-3).
- [PR #286](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/286)
  revisado no HEAD funcional `07389efed75cce6a809ab97ac088cb70e9b364ec`.
- Base pré-merge: `origin/main = origin/dev = 1a094ab6`.
- Merge em `dev` e build homologado:
  `8b299e6a3db5101e8e6e354287c570de0d7d0cab`.
- `main` e `dev` publicados pelo fluxo oficial `publicar.ps1`.
- Produção oficial: projeto Vercel `sistema-grupo-tm-seg`.
- `builtAt`: `2026-08-26T16:29:13.916Z`.
- Tag pré-publicação:
  `baseline-fase4-pre-rh-bank-accounts-api-20260826` → `1a094ab6`.
- Tag pós-homologação:
  `baseline-fase4-rh-bank-accounts-api-merged-20260826` → `8b299e6a`.
- A RH API Foundation homologada foi reutilizada: `authFetch`, endpoint
  autenticado, autorização exclusiva de Diretoria/RH, `service_role` somente no
  backend, fail-closed e SSOT backend.
- O único consumidor CRUD, `RhEmployeeForm`, não acessa mais
  `rh_employee_bank_accounts` diretamente.
- Leitura, criação e edição mantêm filtro de `deleted_at`, associação ao
  funcionário, campos bancários existentes e `is_primary = true`.
- Não foi criada exclusão porque o fluxo legado não possuía essa operação.
- Falha de criação ou edição bancária agora interrompe o salvamento antes da
  notificação de sucesso e exibe somente `Falha ao salvar dados bancários`.
- Nenhuma regra de funcionário, salário, folha, ponto, documentos, exames ou
  advertências foi alterada.

### TESTES

- Segundo piloto bancário: **11/11**.
- Regressão Foundation/documentos + acesso RH + Realtime: **30/30**.
- `npm run build`: **OK**.
- Supabase público presente em `dist/public/index.html`: **OK**.
- Import React/hooks em `RhEmployeeForm.tsx`: **OK**.
- `git diff --check`: **OK**.
- `/api/version`, `/api/health` e `/`: **200**.
- Nova API sem autenticação: GET público e handler direto **401**; POST **401**;
  PATCH **401**; DELETE **405**. Nenhuma escrita foi executada.
- Bundle publicado: zero `.from('rh_employee_bank_accounts')`; endpoint
  autenticado e mensagem genérica de escrita presentes.
- RH documentos, NF, Asaas Payments, Supabase NB-07, Investment, DB Capacity,
  Platform Costs, Client Registries e relatório operacional permaneceram
  protegidos sem autenticação.

### SEGURANÇA, RLS E INTEGRIDADE

- API exige autenticação e role RH/Diretoria.
- UUIDs são validados antes da operação.
- Erros 5xx e erros propagados ao formulário não expõem detalhes internos.
- Ausência de `service_role` falha fechado; não existe fallback anon.
- Nenhuma migration, policy, schema, SQL ou banco foi alterado.
- RLS de `rh_employee_bank_accounts` permanece exatamente no estado anterior;
  esta execução não é lockdown.
- O primeiro `publicar.ps1` encontrou o clone local atrasado e teve os pushes
  rejeitados sem alterar remotos. Após fast-forward seguro de `dev` e `main`, a
  segunda execução concluiu merge e push sem force.
- Mudanças externas de OS foram preservadas e não integram este diff.
- Rollback de código: republicar o estado marcado por
  `baseline-fase4-pre-rh-bank-accounts-api-20260826`. Não existe rollback SQL.

### PRÓXIMO PASSO

Planejar o lockdown RLS de `rh_employee_bank_accounts` em execução separada,
com inventário live e rollback próprios. Não iniciar terceiro piloto RH,
`time_clock`, Z-API ou qualquer alteração financeira neste handoff.

### DECISÃO

# 🟢 SEGUNDO PILOTO RH PUBLICADO E HOMOLOGADO

---

> Handoff oficial — **F4-RH-API-FOUNDATION + PILOTO DOCUMENTOS PUBLICADO**
> **PR #284 homologado em produção; RLS e banco preservados.**

---

## F4-RH-API-FOUNDATION — PUBLICAÇÃO E HOMOLOGAÇÃO

### PROGRESSO CONSERVADOR

**Programa geral: 83,9%**

`█████████████████░░░`

**Fase 4: 48%**

`██████████░░░░░░░░░░`

**Execução: 100%**

`████████████████████`

Fórmula: base pré-Fase 4 de 82% + `4 × 0,48 = 1,92`, totalizando
83,92%, reportado como 83,9%. O avanço da Fase 4 foi limitado a 2 pontos pela
publicação da fundação API e de um único consumidor piloto. O lockdown RLS de
`rh_employee_documents` não foi contabilizado porque continua pendente.

### RESULTADO CONTROLADO

- Data: 2026-08-26 (UTC-3).
- [PR #284](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/284)
  revisado no HEAD `0f285b51` e mergeado em `dev`.
- Merge `dev`: `06ff0b17e82aba8f1d54face22552f132817d777`.
- `main` e `dev` publicados pelo fluxo oficial `publicar.ps1`.
- Preview Vercel do PR: `SUCCESS`.
- Produção oficial: projeto `sistema-grupo-tm-seg`.
- Build homologado: `06ff0b17e82aba8f1d54face22552f132817d777`.
- `builtAt`: `2026-08-26T13:32:20.817Z`.
- Tag de retorno:
  `baseline-fase4-pre-rh-api-foundation-20260826` → `dc72f824`.
- Tag pós-homologação solicitada:
  `baseline-fase4-rh-api-foundation-merged-20260826` **não criada** porque a
  aprovação nativa da escrita remota foi ignorada; não houve nova tentativa.

### TESTES E SMOKES

- Piloto/auth/API: **21/21**.
- Componente: **3/3**.
- RH + segurança + F4: **220/220**.
- React: **7/7**.
- TypeScript: **1084/1085**; única falha
  `invoice-control-loading.test.ts`, idêntica ao baseline da main.
- `npm run build`: **OK**; Supabase público injetado.
- `GET /api/version`: **200**, build `06ff0b17`.
- `GET /api/health`: **200**.
- `GET /`: **200**.
- API RH sem auth, GET/POST/DELETE: **401**; nenhuma escrita executada.
- NF, Asaas, Supabase NB-07, Investment, DB Capacity, Platform Costs,
  Client Registries e relatório operacional: proteções **401** preservadas.

### SEGURANÇA, RLS E ROLLBACK

- `employeeId` e `id` inválidos são rejeitados com 400 antes do Supabase.
- Erro HTTP 500 não devolve detalhes internos.
- `fileUrl` exige HTTPS, origem Supabase TM SEG, bucket `mission-evidence` e
  path `rh/{employeeId}/`.
- `service_role` permanece somente backend, fail-closed e sem fallback anon.
- Frontend runtime permanece sem acesso direto a `rh_employee_documents`.
- Soft delete continua alterando somente `deleted_at`, sem `updated_by` e sem
  hard delete.
- RLS de `rh_employee_documents` permanece no estado anterior. O diff não
  contém policy, migration, SQL, schema ou bootstrap RLS; esta publicação não
  é lockdown.
- Não houve alteração de banco, portanto não existe rollback SQL. Rollback de
  código: retornar/republicar `dc72f824`, marcado pela tag pré-publicação.
- Oito stashes preexistentes foram preservados; nenhum `pop/apply/drop`.

### PRÓXIMO PASSO

Registrar a tag pós-homologação somente com autorização explícita de escrita
remota. Não fechar RLS, não iniciar segundo piloto RH, `time_clock`, Z-API ou
qualquer alteração financeira neste handoff.

### DECISÃO

# 🟡 PUBLICADO COM PENDÊNCIA — TAG PÓS-HOMOLOGAÇÃO NÃO CRIADA

---

## F4-RH-API-FOUNDATION

### PROGRESSO

**Programa geral: 83,8%**

`█████████████████░░░`

**Fase 4: 46%**

`█████████░░░░░░░░░░░`

**Execução desta branch: 100%**

`████████████████████`

A implementação em branch não aumenta os percentuais. Somente merge, deploy e
homologação futuros podem alterá-los.

### BASE LIMPA E PRESERVAÇÃO

| Campo | Valor |
|-------|-------|
| Data | 2026-08-19 (UTC-3) |
| `origin/main` | `5faf8b452daf6207dcaa8fdf92ebf2b3fbb5423c` |
| `origin/dev` | `5faf8b452daf6207dcaa8fdf92ebf2b3fbb5423c` |
| Alinhamento | main = dev |
| Branch | `cursor/fase4-rh-api-foundation-eaa8` |
| Base | criada diretamente de `origin/main` |
| PR | [#284](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/284) — draft |

O working tree histórico `tmseg-pr278-main-baseline` não foi usado como base e
permanece com o handoff local do inventário anterior. Nenhum stash foi aplicado,
restaurado ou removido. Em especial, `stash@{0}` permanece intocado.

### INVENTÁRIO RH REVALIDADO NA MAIN

| Domínio | Tabelas reais | Estado relevante |
|---------|---------------|------------------|
| Cadastro/identidade | `rh_employees`, `rh_departments`, `rh_positions` | muitos consumidores, API parcial, alto lockout |
| Dados bancários | `rh_employee_bank_accounts` | um consumidor direto; PII crítica |
| Documentos | `rh_employee_documents` | um componente runtime direto; sem API anterior |
| Dependentes | `rh_employee_dependents` | sem consumidor runtime |
| Emergência | `rh_employee_emergency_contacts` | sem consumidor runtime |
| Salários/remuneração | `rh_salary_configs`, `rh_awards`, `rh_bonuses` | folha/cockpit; bloqueado para piloto |
| Folha | `rh_payroll_runs`, `rh_payroll_items`, `rh_tax_brackets` | crítico; client e server paralelos |
| Holerites | `rh_payslips` | consumidor genérico; não escolhido |
| Comissões | `rh_commission_rules`, `rh_commissions` | acoplado a OS e folha |
| Férias | `rh_vacations` | não escolhido por potencial dependência de folha |
| Afastamentos | `rh_leaves` | não escolhido por potencial dependência de folha |
| Advertências | `rh_warnings` | consumidor direto |
| Saúde/exames | `rh_medical_exams` | consumidor direto; dado sensível |
| Admissões | `rh_admissions` | sem consumidor runtime |
| LGPD | `rh_lgpd_consents` | sem consumidor runtime |
| Escalas | `rh_work_schedules` | sem consumidor runtime |
| Benefícios/configuração | `rh_benefits`, `rh_employee_benefits`, `rh_settings` | misto; fora do piloto |
| Auditoria | `rh_audit_logs` | writer direto legado e writers backend |
| Ponto | `time_clock` | bloqueado por fallback/realtime; não tocado |
| Presença | `user_presence` live + Broadcast `tmseg-user-presence-v2` | não tocado |

O inventário detalhado anterior permanece no working tree histórico. Esta
branch revalidou os consumidores necessários diretamente contra a main atual.

### PILOTO ESCOLHIDO — `rh_employee_documents`

Preferência e eliminação:

1. `rh_employee_emergency_contacts`: não possui consumidor runtime; não havia
   fluxo frontend para migrar e validar.
2. `rh_employee_dependents`: mesma ausência de consumidor.
3. `rh_employee_documents`: exatamente um componente, baixo acoplamento, sem
   folha/ponto, sem publicação Realtime live e com ganho real sobre PII/URLs.

Operações reais preservadas: **list**, **create de metadados** e
**soft delete**. Não foram inventados `get` individual nem `update`.

O upload do arquivo continua no bucket `mission-evidence`, sem alteração de
Storage, path, `upsert`, content type ou URL. Somente os metadados da tabela
foram migrados para API autenticada.

### DEFEITO PREEXISTENTE E DECISÃO AUTORIZADA

O helper genérico anterior enviava `updated_by` no soft delete, mas essa coluna
não existe em `rh_employee_documents` no schema live. A correção mínima foi
explicitamente autorizada:

- update somente de `deleted_at`;
- auditoria backend preservada;
- nenhuma coluna/schema/regra organizacional criada.

### AUTH RH REUTILIZÁVEL

Arquivo: `lib/rh/rhApiAccess.ts`.

Fluxo:

```text
authFetch
→ token TM SEG válido
→ service_role obrigatória
→ principal ativo em system_users
→ role real do profile
→ Diretoria ou RH
→ SSOT backend
```

- Reutiliza `extractAuthToken`, `extractUserIdFromToken`,
  `roleCanAccessEmployees` e `resolvePrincipalFromToken`.
- Não usa `auth.uid()` nem Supabase Auth.
- Não confia em `x-tmseg-role`, `x-tmseg-permissions` ou dados de role do browser.
- Falha fechado: sem service role retorna 503; token ausente/inválido 401; role
  incompatível 403.

### ROLES E ESCOPO

| Papel | Estado no piloto |
|-------|------------------|
| Diretoria | permitido |
| RH | permitido |
| Administrador | negado — módulo RH atual já o bloqueia |
| CEO | negado — sem acesso atual ao módulo |
| Financeiro | negado |
| Gestor | negado |
| Self-service | inexistente no fluxo atual |

O acesso atual permite Diretoria/RH operar documentos de qualquer funcionário.
Não existe regra comprovada por empresa, filial, departamento, gestor ou
self-service. Nenhuma nova segmentação foi inventada; a lacuna fica registrada
para revisão LGPD futura.

### SSOT, HANDLER E PARIDADE LOCAL

| Camada | Arquivo | Responsabilidade |
|--------|---------|------------------|
| Auth | `lib/rh/rhApiAccess.ts` | principal ativo + role + fail-closed |
| SSOT | `lib/rh/employeeDocumentsApiCore.ts` | list/create/soft delete + auditoria |
| Handler Vercel | `api/rh-employee-documents.ts` | HTTP, validação e status |
| Client | `lib/rh/employeeDocumentsClient.ts` | somente `authFetch`, sem fallback |
| Frontend | `components/rh/RhEmployeeDocuments.tsx` | UX/upload preservados |
| Express local | `server/rhRoutes.ts` | delega ao mesmo handler/SSOT |
| Vercel | `vercel.json` | um rewrite específico antes do catch-all |

`functions{}` permanece com 50 entradas; o novo handler usa auto-discovery e
não aumenta esse bloco.

### RED / GREEN E REAUDITORIA

RED registrado antes da implementação:

```text
ERR_MODULE_NOT_FOUND: api/rh-employee-documents
0 pass / 1 fail
```

GREEN do piloto:

| Verificação | Resultado |
|-------------|-----------|
| Auth + handler + arquitetura | **21/21** |
| Componente real | **3/3** |
| RH + segurança + F4 dirigidos | main **199/199**; branch **220/220** |
| Frontend runtime `.from('rh_employee_documents')` | **zero** |
| Runtime permitido | somente `lib/rh/employeeDocumentsApiCore.ts` |
| RealtimeProvider | referência histórica preservada; tabela não publicada live |

O componente cobre abertura/listagem, create, soft delete, loading, refresh,
erro de API e permissão. O handler cobre 401/401/403/400/503/405+Allow e
operação legítima exatamente uma vez.

Correções finais da revisão independente em 2026-08-26:

- `employeeId` e `id` são validados como UUID antes do core;
- erro HTTP 500 usa mensagem genérica, mantendo o detalhe somente no log backend;
- `fileUrl` exige HTTPS e o padrão já existente do projeto TM SEG:
  bucket `mission-evidence`, path `rh/{employeeId}/...`;
- auth, roles, service role, SSOT e soft delete permaneceram inalterados.

### REGRESSÃO MAIN × BRANCH

| Suíte | Main `5faf8b45` | Branch |
|-------|-----------------|--------|
| TypeScript completa | 1063/1064 | 1084/1085 |
| Falha | `invoice-control-loading.test.ts` | a mesma, mesma asserção |
| React completa | 4/4 | 7/7 |
| `npm run build` | OK | OK |
| Supabase injetado no build | OK | OK |

A única falha TS é baseline reproduzida na main e na branch; não é regressão.
Bundles gerados pelo build foram restaurados ao HEAD e estão fora do diff.

### RLS E ÁREAS PRESERVADAS

- RLS de `rh_employee_documents` continua aberta; nenhuma policy foi alterada.
- Zero migration, SQL, schema ou chamada mutable live.
- `time_clock` não foi alterado.
- `user_presence` e Realtime Broadcast não foram alterados.
- Zero alteração em financeiro, billing, pagamentos, snapshots, NF, Asaas,
  Investment, DRE, custos, pedágio, OS mãe/filha, Z-API e WhatsApp.

### RISCOS E PRÓXIMO PASSO

- A tabela piloto continua exposta enquanto o RLS não for fechado em execução
  futura separada.
- O arquivo continua em bucket/URL pública como antes; Storage não pertenceu a
  este piloto e exige auditoria LGPD própria.
- Auditoria do documento é best-effort para preservar o contrato legado.
- Não há escopo organizacional row-level além da role de módulo.

Próximo passo único: merge/publicação controlada do PR após decisão do
proprietário. O lockdown RLS de `rh_employee_documents` permanece em execução
futura separada; não foi preparada migration nesta branch.

### DECISÃO

# 🟢 PR #284 CORRIGIDO — APTO PARA MERGE/PUBLICAÇÃO CONTROLADA

---

## FASE 4 — APPLY CONTROLADO `account_balance_snapshots`

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-18 (UTC-3) |
| **Branch / HEAD** | `cursor/fase4-rls-account-balance-snapshots-lockdown-eaa8` / `496cbf7e` |
| **`origin/main` / `origin/dev` no apply** | `67e9e5ff` — avanço concorrente somente em menu/teste de fornecedor, sem impacto em snapshots |
| **Projeto oficial** | `ajhmmjuewdsukecaimik` |
| **Migration aplicada** | `migrations/2026_08_18_fase4_p0_rls_account_balance_snapshots.sql` |
| **Rollback** | pronto e **NÃO executado** |
| **Outras tabelas/migrations** | **NÃO tocadas** |

### PROGRESSO

**Programa geral: 84,0%**

`█████████████████░░░`

**Fase 4: 50%**

`██████████░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 LOCKDOWN account_balance_snapshots APLICADO COM SUCESSO

### LIVE — ANTES DO APPLY

| Check | Resultado |
|-------|-----------|
| RLS | ativo |
| Policy | `Allow all for account_balance_snapshots` |
| Policies | 1 (exatamente a esperada) |
| anon / authenticated | 132 / 132 |
| owner / service_role | 132 / 132 |
| Drift guard | aprovado |

### LIVE — APÓS COMMIT E RECHECK FINAL

| Check | Resultado |
|-------|-----------|
| RLS | **ATIVO** |
| Policy permissiva | **AUSENTE** |
| Policies | **0** |
| anon / authenticated | **0 / 0** |
| owner / service_role | **132 / 132** |
| Registros preservados | **132** |
| Rollback | **NÃO executado** |

Sem INSERT, UPDATE, DELETE ou snapshot artificial. A contagem permaneceu íntegra.

### API / BACKEND

- `GET /api/investment/snapshots-all?days=3650` sem autenticação: **401**.
- Nenhum POST de teste e nenhuma alteração de saldo.
- Backend permanece auth TM SEG → `service_role` fail-closed.

### BOOTSTRAP PÓS-APPLY

- Regressões estáticas confirmam que `ensureSnapshotsTable`, `snapshotsStructuralSql`, `investment-init` e CLI não recriam policy.
- Recheck live final após testes/build: policies continuam **0**.
- Após qualquer deploy/startup futuro, repetir o smoke; reaparecimento da policy é regressão crítica.

### TESTES PÓS-APPLY

| Suíte | Resultado |
|-------|-----------|
| Teste RLS | **9/9 OK** |
| API snapshots | **9/9 OK** |
| Regressão dirigida | **139/139 OK** |
| TypeScript completa | **1063/1064** — única falha **BASELINE CRLF Windows** em `invoice-control-loading.test.ts` |
| React | **4/4 OK** |
| `npm run build` | **OK** |

### CONTROLE GIT / ESCOPO

- Nenhum merge, commit, push ou publicação após o apply.
- Arquivos `.cjs` regenerados pelo build permanecem somente locais e **não devem ser adicionados**.
- `billing_usage`, `financial_transaction_payments`, RH, `time_clock`, Z-API, NF, Asaas, SEC-03, DRE, pedágio, OS, ENV e Vercel não foram alterados.

---

## FASE 4 — REVISÃO INDEPENDENTE PRÉ-APLICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-18 (UTC-3) |
| **Branch** | `cursor/fase4-rls-account-balance-snapshots-lockdown-eaa8` |
| **HEAD revisado** | `496cbf7e` |
| **Base `origin/main` / `origin/dev`** | `4f6d004c` |
| **Diff revisado** | migration forward + rollback + teste RLS + handoff; **zero código funcional** |
| **SQL/DDL/DML no Supabase oficial nesta revisão** | **NÃO executado** |

### DECISÃO DA REVISÃO

# 🟢 account_balance_snapshots APTO PARA APLICAÇÃO CONTROLADA

### EVIDÊNCIAS

- **Forward — SEGURO:** toca somente `public.account_balance_snapshots`; exige tabela existente, RLS ativo e exatamente a policy permissiva esperada; valida nome, roles, comando, `USING` e `WITH CHECK` antes do `DROP`; não usa contagem de registros; não cria policy substituta; zero DML e zero `auth.uid()`.
- **Rollback — SEGURO:** exige tabela existente, RLS ativo e zero policies; aborta em estado inesperado; restaura exatamente `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`; zero DML.
- **Live read-only:** `list_tables` confirmou tabela existente, RLS ativo e **132** registros. A definição da única policy permanece a evidência read-only imediatamente anterior: `Allow all for account_balance_snapshots`, `PERMISSIVE`, `{anon, authenticated}`, `ALL`, `true` / `true`. Nenhuma linha foi exibida.
- **Consumidores:** frontend runtime direto = **ZERO**. Diretoria, Contas a Pagar e Investment usam `snapshotClient` → `authFetch` → API autenticada.
- **Backend:** auth TM SEG → SSOT backend → `requireSnapshotsAdminClient`; ausência de `service_role` falha fechado. Sem fallback anon no caminho de snapshots.
- **Bootstrap:** `ensureSnapshotsTable`, `snapshotsStructuralSql`, `investment-init` e CLI filtrada não recriam a policy permissiva.
- **Segredos:** build frontend contém configuração pública Supabase e não contém `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY` ou `sb_secret_`.
- **Regressão dirigida:** **139/139 OK**.
- **Suíte TS completa:** **1063/1064**; única falha = **BASELINE CRLF Windows** em `invoice-control-loading.test.ts`.
- **React:** **4/4 OK**.
- **Build:** **OK**, Supabase oficial injetado.

### RISCO RESIDUAL / CONTROLE DE APPLY

- Não houve dry-run live com DDL, conforme proibição.
- Aplicar somente em janela controlada, sem alteração concorrente de schema/policies, e executar imediatamente os smokes anon/authenticated/service_role previstos.
- A contagem de registros é evidência operacional variável e não participa do drift guard.

---

## FASE 4 — F4-P0-RLS `account_balance_snapshots` (PREPARAÇÃO LOCKDOWN)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-18 (UTC-3) |
| **Branch** | `cursor/fase4-rls-account-balance-snapshots-lockdown-eaa8` |
| **Base `origin/main` / `origin/dev`** | `4f6d004c` |
| **Commit funcional consumidores** | `c4aaab81` |
| **Projeto oficial** | Grupo TMSEG `ajhmmjuewdsukecaimik` |
| **Apply / migration / DML live** | **NÃO executados** |
| **Migration forward** | `migrations/2026_08_18_fase4_p0_rls_account_balance_snapshots.sql` |
| **Rollback** | `migrations/rollback/2026_08_18_fase4_p0_rls_account_balance_snapshots.sql` |
| **Teste RLS** | `scripts/fase4-p0-rls-account-balance-snapshots.test.ts` |

### PROGRESSO

Preparação de lockdown ≠ lockdown aplicado. **Fase 4 permanece 50%.**

**Programa geral: 84,0%**

`█████████████████░░░`

**Fase 4: 50%**

`██████████░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 RLS account_balance_snapshots PREPARADO — APTO PARA REVISÃO

### REAUDITORIA DE CONSUMIDORES

| Classificação | Ocorrências |
|---------------|-------------|
| **FRONTEND RUNTIME DIRETO** | **ZERO** |
| BACKEND (SSOT) | `lib/investment/accountBalanceSnapshots.ts`, handlers `api/investment-snapshots*`, `server/routes.ts` |
| TESTE | `scripts/fase4-account-balance-snapshots-api.test.ts`, `scripts/fase4-p0-rls-account-balance-snapshots.test.ts`, demais testes snapshots/Diretoria |
| DOC | `docs/auditoria/*`, `MAPA_ENGENHARIA_REVERSA_TMSEG.md` |
| MIGRATION HISTÓRICA | `migrations/2026_07_08_account_balance_snapshots.sql` (**imutável**) |

Verificados: Dashboard Diretoria (`useDashboardDiretoriaData`), Contas a Pagar (`FinancialTransactionList`), Investment (`FinancialAccountManager`), `snapshotClient.ts` — todos via `authFetch` → API autenticada. Zero fallback anon.

### BACKEND — FAIL-CLOSED

```
Frontend → authFetch → API TM SEG → denyInvestmentApiUnlessAuthorized
         → requireSnapshotsAdminClient → service_role → account_balance_snapshots
```

- `service_role` ausente → **503 / erro fail-closed** (sem fallback anon).
- Nenhuma chave `service_role` no frontend, bundle ou testes.

### BOOTSTRAP / CLI

| Caminho | Recria policy permissiva? |
|---------|---------------------------|
| `ensureSnapshotsTable` / `snapshotsStructuralSql()` | **NÃO** — somente estrutura + `ENABLE RLS` |
| `api/investment-init.ts` | **NÃO** |
| `scripts/apply-account-balance-snapshots-migration.mjs` | **NÃO** — filtra `CREATE/DROP POLICY` |

### ESTADO LIVE — SOMENTE LEITURA

Projeto `ajhmmjuewdsukecaimik`. Nenhuma linha exibida. Nenhum DML.

| Check | Resultado |
|-------|-----------|
| Tabela | `public.account_balance_snapshots` — **existe** |
| RLS | **ATIVO** |
| Policies | **exatamente 1** |
| Policy | `Allow all for account_balance_snapshots` |
| Tipo / roles / comando | `PERMISSIVE` / `{anon, authenticated}` / `ALL` |
| USING / WITH CHECK | `true` / `true` |
| Total registros (service_role) | **132** |
| Paridade pré-lockdown | anon = authenticated = owner = service_role (**132**) |

Contagem pode crescer por operação legítima; migration **não** valida quantidade de registros.

### DRIFT GUARD (forward)

Aborta antes do `DROP POLICY` se:

- tabela ausente ou RLS inativo;
- total de policies ≠ 1;
- nome/roles/cmd/USING/WITH CHECK divergirem do esperado.

### MIGRATION FORWARD

- `BEGIN` → validação `pg_class` / `pg_policies` → `ENABLE ROW LEVEL SECURITY` → `DROP POLICY "Allow all for account_balance_snapshots"` → `COMMIT`.
- Zero DML. Zero policy substituta. Zero outras tabelas. Zero `auth.uid()`.

### ROLLBACK

- Valida tabela + RLS + zero policies → recria exatamente a policy permissiva anterior.
- **NÃO executado.**

### SERVICE_ROLE

`service_role` bypassa RLS por privilégio Postgres — **não requer policy dedicada**. Lockdown fecha anon/authenticated; backend TM SEG preserva acesso via API + `service_role`.

### TESTES

| Suíte | Resultado |
|-------|-----------|
| `fase4-p0-rls-account-balance-snapshots.test.ts` | **9/9 OK** |
| `fase4-account-balance-snapshots-api.test.ts` | **9/9 OK** |
| `investment-snapshots.test.ts` | **4/4 OK** |
| `dashboard-diretoria.test.ts` | **28/28 OK** |
| `financial-transaction-operational-balance.test.ts` | incluído em dashboard suite |
| `fase4-p0-rls-billing-usage.test.ts` | **4/4 OK** |
| `fase4-p0-rls-financial-payments.test.ts` | **8/8 OK** |
| TS completo `scripts/*.test.ts` | **1063/1064** — 1 **BASELINE** (`invoice-control-loading.test.ts`, CRLF Windows) |
| React `scripts/*.test.tsx` | **4/4 OK** |
| `npm run build` | **OK** |

### ÁREAS PROTEGIDAS

**Zero diff funcional:** billing_usage, financial_transaction_payments, RH, time_clock, Z-API, NF, Asaas, SEC-03, DRE, pedágio, OS, ENV, Vercel.

### PRÓXIMO PASSO (FORA DESTA EXECUÇÃO)

1. Revisão humana do SQL forward + rollback.
2. Apply autorizado em janela controlada.
3. Smoke pós-apply: anon/authenticated → 0; service_role → preservado; API autenticada → OK.

### ENCERRAMENTO

**PARAR.** Não aplicar migration. Não iniciar RH, `time_clock` ou Z-API.

---

> Handoff anterior — **consumidores de `account_balance_snapshots` PUBLICADOS E HOMOLOGADOS**
> **RLS/policy live não alteradas naquela execução. Sem migration naquela fase.**

---

## FASE 4 — API AUTENTICADA `account_balance_snapshots`

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC-3) |
| **Branch** | `cursor/fase4-account-balance-snapshots-api-eaa8` |
| **Base `origin/main` / `origin/dev`** | `d893e386` |
| **Handoff anterior incorporado** | conteúdo de `f0bcd58e` (homologação do PR #279) |
| **Commit funcional** | `ef5d3897` |
| **HEAD mergeado em `dev` / `main`** | `c4aaab81` |
| **Merge concorrente posterior** | `99a563e2` — mapa de acionamento de fornecedores; contém `c4aaab81` como ancestral |
| **`origin/main` / `origin/dev` no fechamento documental** | `947b8235` — avanços posteriores de fornecedores, sem alteração em snapshots |
| **Produção observada no fechamento** | `99a563e2` |
| **PR** | draft não criado; branch integrada diretamente por fast-forward no fluxo autorizado |
| **Tag pré-publicação** | `baseline-fase4-pre-account-balance-snapshots-api-20260817` → `d893e386` |
| **Tag pós-homologação** | `baseline-fase4-account-balance-snapshots-api-merged-20260817` → `c4aaab81` |
| **Projeto oficial** | Grupo TMSEG `ajhmmjuewdsukecaimik` |
| **Apply / migration / DML live** | **NÃO executados** |

### PROGRESSO

Migração de consumidores em branch ≠ lockdown homologado. Programa e Fase 4 não aumentam.

**Programa geral: 84,0%**

`█████████████████░░░`

**Fase 4: 50%**

`██████████░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 CONSUMIDORES account_balance_snapshots PUBLICADOS E HOMOLOGADOS

### MERGE / DEPLOY / SMOKE

| Check | Resultado |
|-------|-----------|
| Integração branch → `dev` | **fast-forward** para `c4aaab81` |
| Integração `dev` → `main` | **fast-forward** via `publicar.ps1` |
| Push da publicação de snapshots | **OK**, `main` / `dev` avançaram para `c4aaab81` |
| Merge concorrente posterior | `99a563e2`, não relacionado; preserva `c4aaab81` no histórico |
| `main` / `dev` mais atuais | `947b8235`, mudanças exclusivas de fornecedores após `99a563e2` |
| Retorno local | branch `dev` |
| Projeto/domínio oficial | `sistema-grupo-tm-seg` / `https://sistema.grupotmseg.com.br` |
| Version | `3.7.60` |
| Build funcional homologado | `c4aaab81188f83e37236fd08d0ab2bafb949e2e8` (`2026-08-18T00:14:48.868Z`) |
| Build atual observado | `99a563e24aa73b5fa802a85308226da71a6b5905` |
| BuiltAt atual | `2026-08-18T00:16:35.502Z` |
| `GET /api/version` | **200** |
| `GET /api/health` | **200** |
| `GET /` | **200** |
| `GET /api/investment/snapshots-all?days=3650` sem auth | **401** em 0,275 s |

Smoke sem INSERT/UPDATE/DELETE e sem snapshot artificial.

### ESTADO LIVE — PRESERVADO

Somente leitura; nenhuma linha exibida.

| Check | Resultado |
|-------|-----------|
| RLS | **ATIVO** |
| Policy | `Allow all for account_balance_snapshots` |
| Tipo / roles / comando | `PERMISSIVE` / `{anon, authenticated}` / `ALL` |
| USING / WITH CHECK | `true` / `true` |
| anon / authenticated | **132 / 132** |
| owner / service_role | **132 / 132** |

A policy permanece aberta deliberadamente. O fechamento RLS exige execução separada após esta homologação.
O aumento de 129 para 132 ocorreu por atividade externa durante a homologação; o smoke foi somente leitura.

### REGRA FINANCEIRA PRESERVADA

- Campos: `account_id`, `balance`, `notes`, `created_by`, `recorded_at`.
- Criação continua manual no Painel de Investimentos ao atualizar saldo ou criar/editar conta.
- Períodos preservados: Investment usa o filtro atual (`3650` para “todos”); Diretoria e Contas a Pagar usam `3650` dias.
- Ordenação preservada: `recorded_at ASC`.
- Latest preservado: último snapshot cronológico por conta.
- Ausência legítima de snapshots continua usando `financial_accounts.initial_balance`.
- `[]` da API é conjunto vazio válido; não dispara segunda consulta.
- Histórico continua append-only por INSERT; não foi introduzido UPDATE.
- Exclusão pontual e limpeza ao excluir/desativar conta foram preservadas.
- Nenhum cálculo, filtro financeiro, vínculo de conta ou lançamento de ajuste foi alterado.

### FLUXO APÓS A MIGRAÇÃO

```text
Dashboard Diretoria ─┐
Contas a Pagar ──────┼→ snapshotClient → authFetch
Investment ──────────┘  → /api/investment/snapshots*
                         → auth TM SEG / role e escopo
                         → SSOT accountBalanceSnapshots
                         → service_role obrigatória
                         → account_balance_snapshots
```

Identidade continua TM SEG customizada (`authFetch` / `assertAsaasApiAccess`). Sem `auth.uid()` e sem Supabase Auth como fonte de identidade.

### CONSUMIDORES MIGRADOS

| Consumidor | Antes | Depois |
|------------|-------|--------|
| Dashboard Diretoria | `listBalanceSnapshotsDirect` / anon | `listBalanceSnapshots` / API autenticada |
| Contas a Pagar | Supabase anon direto | API autenticada |
| Investment — SELECT | API + fallback anon em erro ou `[]` | somente API; `[]` permanece legítimo |
| Investment — INSERT | API + fallback anon | somente `createBalanceSnapshot` |
| Investment — DELETE | API direta no componente | client autenticado compartilhado |

Reauditoria pós-deploy:

- `components/**`: zero `supabase.from('account_balance_snapshots')`.
- `lib/**` frontend: zero acesso direto.
- Ocorrências permitidas: SSOT backend, migration histórica imutável, testes e documentação.

### SSOT BACKEND / FAIL-CLOSED

`lib/investment/accountBalanceSnapshots.ts` é a única operação backend compartilhada:

- `listAllSnapshots`;
- `listSnapshotsForAccount` (rota Express já existente);
- `insertSnapshot`;
- `deleteSnapshot`;
- `deleteSnapshotsForAccount`;
- `ensureSnapshotsTable`.

Handlers Vercel e rotas Express reutilizam essa SSOT. `requireSnapshotsAdminClient` valida `getSupabaseServiceRoleKey()` **antes** de criar cliente. Sem service role, a operação falha fechada; não existe fallback anon.

### BOOTSTRAP / INIT

- `ensureSnapshotsTable`: mantém CREATE TABLE/INDEX/COMMENT/RLS, mas não contém `CREATE POLICY` ou `DROP POLICY`.
- `/api/investment/init`: auth obrigatória e erro fail-closed (`503` sem admin).
- Express `/api/investment/init`: reutiliza o mesmo ensure.
- CLI `apply-account-balance-snapshots-migration.mjs`: exige service role e filtra CREATE/DROP POLICY da migration histórica.
- `migrations/2026_07_08_account_balance_snapshots.sql`: **não editada**.
- Nenhum caminho runtime atual recria `Allow all for account_balance_snapshots`.

### RED → GREEN / TESTES

| Suíte | Total | Pass | Fail |
|-------|------:|-----:|-----:|
| Novo RED/GREEN `fase4-account-balance-snapshots-api` | 9 | 9 | 0 |
| Direcionados snapshots/Investment/Diretoria/segurança/F4 | 106 | 106 | 0 |
| TS completo | 1040 | 1039 | 1 baseline CRLF |
| React com loader | 4 | 4 | 0 |

- Falha única: `invoice-control-loading.test.ts` — **BASELINE** Windows/CRLF, igual à `main`.
- Cancelled / skipped / hang: 0 / 0 / 0.
- `npm run build`: **OK**, Supabase `ajhmmjuewdsukecaimik` injetado em `dist/public/index.html`.
- Smoke local: `/api/health` **200**; list/create/init sem auth **401**; zero escrita.

### RISCOS / PRÓXIMO PASSO

- RLS live continua aberta; anon/authenticated ainda enxergam 132 linhas até o lockdown separado.
- Próximo passo: preparar migration + rollback RLS em execução separada e validar novamente que o bootstrap não recria a policy.
- Não iniciar RH, `time_clock` ou Z-API nesta execução.

### ÁREAS PROTEGIDAS

Zero alteração em `billing_usage`, `financial_transaction_payments`, RH, `time_clock`, Z-API, NF, Asaas, SEC-03, DRE, pedágio, OS mãe/filha, ENV e Vercel.

---

## F4-P0-RLS — HOMOLOGAÇÃO `financial_transaction_payments`

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC-3) |
| **PR** | [#279](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/279) — **MERGED** `dev` + `main` |
| **Branch** | `cursor/fase4-rls-financial-payments-lockdown-eaa8` |
| **Base / main / dev pré-merge** | `4d2710ab` |
| **Commit preparação** | `d62f9e17` |
| **HEAD publicado** | `d893e386` |
| **Código funcional** | `c305e147` (não alterado neste PR) |
| **Tag** | `baseline-fase4-rls-financial-payments-merged-20260817` → `d893e386` |
| **Projeto oficial** | Grupo TMSEG `ajhmmjuewdsukecaimik` |
| **Produção** | `https://sistema.grupotmseg.com.br` |
| **Migration Git** | `migrations/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql` |
| **Rollback Git** | `migrations/rollback/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql` |
| **Reapply / rollback live** | **Não executados nesta execução** |

### PROGRESSO

Homologação completa (merge + deploy + startup + RLS ainda fechado + `service_role` 35).

**Programa geral: 84,0%**

`█████████████████░░░`

**Fase 4: 50%**

`██████████░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

Parcela deste marco: **+5 pp da Fase 4** (mesmo peso do piloto `billing_usage`). **Não** contabiliza os 35% inteiros do bloco F4-P0-RLS. Acumulado RLS: **10/35**. Restante 25 pp: `account_balance_snapshots`, RH, `time_clock` e demais. Fase 4 = 4% do programa → +5 pp da Fase 4 = **+0,2 pp** no geral (`83,8% → 84,0%`; Fase 4 `45% → 50%`).

### DECISÃO

# 🟢 RLS financial_transaction_payments PUBLICADO E HOMOLOGADO

### TESTES / BUILD

| Suíte | Total | Pass | Fail |
|-------|------:|-----:|-----:|
| Direcionados RLS/pagamentos/receivables/segurança/F4 | 195 | 195 | 0 |
| TS completo | 1031 | 1030 | 1 baseline CRLF |
| React | 4 | 4 | 0 |

- Falha única: `invoice-control-loading.test.ts` — **BASELINE** Windows/CRLF, igual à main.
- Cancelled / skipped / hang: 0 / 0 / 0.
- `npm run build`: **OK** (Supabase `ajhmmjuewdsukecaimik`).

### MERGE / DEPLOY

| Campo | Valor |
|-------|-------|
| **PR #279** | merged `2026-08-17T23:23:54Z` → `main` e `dev` |
| **merge_commit** | `d893e386` (fast-forward; 2 commits: `d62f9e17` + `d893e386`) |
| **Diff permitido** | migration + rollback + teste + handoff. Zero código funcional. |
| **Migration no merge/deploy** | **não reaplicada** |
| **version** | `3.7.60` |
| **buildId** | `d893e386dd8056cdecf6892d6c4e27b59b50bfeb` |
| **builtAt** | `2026-08-17T23:24:11.584Z` |

### LIVE — PÓS-STARTUP (critério principal)

Revalidado depois do deploy real. `ensurePaymentTables` / `financial-payments-init` / bootstrap **não** recriaram a policy.

| Check | Resultado |
|-------|-----------|
| RLS | **ATIVO** |
| Policy `Allow all for financial_transaction_payments` | **AUSENTE** |
| policies | **0** |
| anon | **0** |
| authenticated | **0** |
| owner | **35** |
| service_role | **35** |

ANTES: anon 35 / authenticated 35 / service_role 35. DEPOIS: anon 0 / authenticated 0 / service_role 35. RLS continua ativo.

### SMOKE API (sem autenticação, sem escrita)

| Endpoint | Resultado |
|----------|-----------|
| `GET /` | **200** |
| `GET /api/health` | **200** |
| `GET /api/version` | **200** / `buildId=d893e386` |
| `GET /api/financial-transaction-payments?transactionId=fake` | **401** `Não autorizado` |
| `DELETE /api/financial-transaction-payments?id=fake&transactionId=fake` | **401** `Não autorizado` |
| `POST /api/financial-payments-init` | **401** `Não autorizado` |
| `POST /api/financial-transaction-payments` | **não enviado** — aprovação local recusada; o JSON de cliente falhou antes de sair. Count owner permanece **35** (zero escrita). |

Nenhum pagamento artificial criado.

### LIVE — ANTES DO APPLY

| Check | Resultado |
|-------|-----------|
| RLS | ATIVO |
| Policy `Allow all for financial_transaction_payments` | presente |
| anon | 35 |
| authenticated | 35 |
| owner | 35 |
| service_role | 35 |

### APPLY

Autorização humana explícita. Executado **somente** o SQL do PR #279 no projeto `ajhmmjuewdsukecaimik`, via `execute_sql`. Sem `apply_migration`. Sem DML. Sem `billing_usage`, snapshots, RH, `time_clock`, Z-API, NF, Asaas, Investment.

Efeito: `DROP POLICY "Allow all for financial_transaction_payments"` após guard de drift. RLS permaneceu ativo. Nenhuma policy substituta.

### LIVE — DEPOIS DO APPLY (e revalidado nesta execução)

| Check | Resultado |
|-------|-----------|
| RLS | **ATIVO** |
| Policy `Allow all for financial_transaction_payments` | **AUSENTE** |
| policies | **0** |
| anon | **0** |
| authenticated | **0** |
| owner | **35** |
| service_role | **35** |
| Drift | **Não** |

Rollback: pronto e **não executado**.

### DIFF `origin/main...d62f9e17`

| Arquivo | Motivo |
|---------|--------|
| `migrations/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql` | Forward exclusivo |
| `migrations/rollback/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql` | Rollback exato |
| `scripts/fase4-p0-rls-financial-payments.test.ts` | RED/GREEN + bootstrap |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Handoff |

Zero código funcional. Commits do PR: `d62f9e17` (preparação) + `d893e386` (handoff pós-apply). Sem commit funcional posterior. Tag de homologação aponta para `d893e386`.

### ÁREAS PROTEGIDAS

Sem SQL e sem diff em: `billing_usage`, NF, Asaas, Supabase NB-07, Investment, F4-P0/F4-P1 handlers, snapshots, RH, `time_clock`, Z-API.

`billing_usage` permanece o piloto já homologado (não reaberto nesta execução). Nenhuma outra tabela RLS foi iniciada.

---

## F4-P0-RLS — AUDITORIA FINAL + PREPARAÇÃO SEM APPLY

---

## F4-P0-RLS — AUDITORIA FINAL + PREPARAÇÃO SEM APPLY

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC) |
| **Branch** | `cursor/fase4-rls-financial-payments-lockdown-eaa8` |
| **Base** | `origin/main=origin/dev=4d2710ab` |
| **Código funcional** | `c305e147` |
| **Tag funcional** | `baseline-fase4-financial-payments-api-merged-20260817` |
| **Migration preparada** | `migrations/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql` |
| **Rollback preparado** | `migrations/rollback/2026_08_17_fase4_p0_rls_financial_transaction_payments.sql` |
| **Apply / DROP live / dados** | **Não executados** |

### PROGRESSO

**Programa geral: 83,8%**

`█████████████████░░░`

**Fase 4: 45%**

`█████████░░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

Preparation ≠ lockdown aplicado; os percentuais de programa e Fase 4 não foram
aumentados.

### DECISÃO

# 🟡 REQUER DRY-RUN TRANSACIONAL ANTES DO LOCKDOWN

Migration e rollback estão aptos para revisão. O dry-run DDL live, mesmo
envolvido por `BEGIN/ROLLBACK`, não foi executado porque a autorização foi
recusada. Não houve tentativa de contorno. `docker`, Supabase CLI e `psql` não
estão disponíveis para uma simulação Postgres local.

### REAUDITORIA DE CONSUMIDORES

| Classificação | Ocorrências |
|---------------|-------------|
| Frontend runtime direto | **ZERO** |
| Backend SSOT | `lib/financial/receivablePaymentsApiCore.ts` |
| Client autenticado | `lib/financial/receivablePaymentsClient.ts` → `authFetch` |
| Testes | `scripts/fase4-financial-payments-api.test.ts` + teste RLS novo |
| Docs | plano e handoffs |
| Migration histórica | `2026_07_20_financial_transaction_payments.sql` (imutável) |

Fluxo preservado:

```text
Frontend → API autenticada → auth TM SEG → role/escopo
         → service_role fail-closed → SSOT → financial_transaction_payments
```

GET, POST e DELETE continuam no handler publicado. Sem `service_role`, a API
retorna 503 e não degrada para anon.

### POLICY LIVE / RED SOMENTE LEITURA

Projeto oficial: `ajhmmjuewdsukecaimik`. Nenhuma linha foi exibida.

| Check | Resultado |
|-------|-----------|
| RLS enabled | true |
| Policy | `Allow all for financial_transaction_payments` |
| Tipo | `PERMISSIVE` |
| Roles | `anon`, `authenticated` |
| Command | `ALL` |
| USING / WITH CHECK | `true` / `true` |
| anon SELECT | 35 |
| authenticated SELECT | 35 |
| owner SELECT | 35 |
| service_role SELECT | 35 |
| Drift | **Não** |

### MIGRATION

A migration:

- toca somente `public.financial_transaction_payments`;
- exige RLS já habilitado;
- exige exatamente uma policy e valida nome, permissividade, roles, comando,
  `USING` e `WITH CHECK`;
- aborta antes do `DROP POLICY` em qualquer drift;
- remove somente `Allow all for financial_transaction_payments`;
- não cria policy para anon/authenticated;
- não contém DML nem altera dados.

### ROLLBACK

O rollback exige RLS ativo e zero policies antes de restaurar exatamente:

```text
Allow all for financial_transaction_payments
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true)
```

Rollback não executado.

### BOOTSTRAP

- `financial-payments-init` permanece autenticado e fail-closed.
- `ensurePaymentTables` não contém `CREATE/DROP POLICY`.
- O seletor de statements remove policy da migration histórica.
- Nenhum CLI adicional referencia/executa a migration histórica.
- Teste determinístico comprova que startup/init futuro não reabre a policy.

### RED/GREEN / DRY-RUN

- Modelo determinístico local: antes 35/35/35; lockdown 0/0/35;
  rollback 35/35/35 — **PASS**.
- Testes SQL validam exclusividade, drift guard, ausência de DML e rollback.
- Dry-run DDL no projeto live: **NÃO EXECUTADO (autorização recusada)**.
- Estado live final revalidado por leitura: policy permissiva intacta.

### TESTES / BUILD

| Suíte | Total | Pass | Fail |
|-------|------:|-----:|-----:|
| RLS novo | 8 | 8 | 0 |
| Direcionados RLS/financeiro/F4/auth | 84 | 84 | 0 |
| TS completo | 1031 | 1030 | 1 baseline CRLF |
| React | 4 | 4 | 0 |
| **Geral** | **1035** | **1034** | **1 baseline** |

- Falha única: `invoice-control-loading.test.ts`, baseline Windows/CRLF já
  reproduzida na main.
- `bash scripts/run-tests.sh`: bash indisponível; comandos internos executados
  separadamente.
- Cancelled / skipped / hang: 0 / 0 / 0.
- `npm run build`: **OK**.

### ESCOPO / PRÓXIMO GATE

Diff ideal: migration, rollback, teste e handoff; zero código funcional.

Antes de qualquer apply:

1. revisar o PR draft;
2. autorizar e executar dry-run transacional;
3. revalidar estado live intacto;
4. emitir novo GO/NO-GO específico para aplicação.

Não iniciar snapshots, RH, `time_clock` ou Z-API.

---

## F4-P0-RLS — REVISÃO FINAL + PUBLICAÇÃO PR #278

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC) |
| **PR** | [#278](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/278) |
| **Branch** | `cursor/fase4-financial-payments-api-eaa8` |
| **Base / main / dev pré-merge** | `deecde73` |
| **HEAD funcional homologado** | `c305e147` |
| **Produção** | `buildId=c305e147`, `builtAt=2026-08-17T19:49:08.319Z` |
| **Tag pré-publicação** | `baseline-fase4-pre-financial-payments-api-20260817` → `deecde73` |
| **Tag pós-homologação** | `baseline-fase4-financial-payments-api-merged-20260817` → `c305e147` |
| **RLS / migration / dados** | **Não alterados** |

### PROGRESSO

**Programa geral: 83,8%**

`█████████████████░░░`

**Fase 4: 45%**

`█████████░░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

O peso do bloco RLS não foi contabilizado: somente a migração dos consumidores
foi publicada; a policy ainda não foi fechada.

### DECISÃO FINAL

# 🟢 CONSUMIDORES `financial_transaction_payments` PUBLICADOS E HOMOLOGADOS

### DIFF REVISADO

Nove arquivos, todos dentro do escopo:

- handler `api/financial-transaction-payments.ts`;
- SSOT `lib/financial/receivablePaymentsApiCore.ts`;
- client `lib/financial/receivablePaymentsClient.ts`;
- auth `lib/financial/financialPaymentsApiAuth.ts`;
- init `api/financial-payments-init.ts`;
- bootstrap `lib/financial/ensurePaymentTables.ts`;
- rewrites `vercel.json`;
- testes;
- este handoff.

Zero diff em migrations, `billing_usage`, snapshots, NF, Asaas, SEC-03,
Investment, DRE, receita canônica, pedágio, OS, RH, ponto, Z-API e ENV.
A migration histórica `2026_07_20_financial_transaction_payments.sql`
permaneceu imutável.

### API / SSOT / REGRA FINANCEIRA

Fluxo publicado:

```text
Frontend → authFetch → handler autenticado → service_role → SSOT
```

| Método | Rota | Operação |
|--------|------|----------|
| GET | `/api/financial-transaction-payments?transactionId=` | listar |
| POST | `/api/financial-transaction-payments` | adicionar + settlement |
| DELETE | `/api/financial-transaction-payments?id=&transactionId=` | excluir + settlement |

Listagem, campos, filtros, ordenação, datas, descrição, vínculo
`transaction_id`, total recebido, saldo restante, status e fallback histórico
foram transportados sem nova fórmula. `computePaymentSettlement` continua sendo
a fonte do cálculo. Não existe implementação Express paralela nem query
financeira duplicada.

Confirmação idempotente:

```text
1 confirmação → 1 addPaymentToTransaction → 1 POST → 1 INSERT lógico
```

O client usa single-flight para bloquear double-submit idêntico. Teste
determinístico confirma uma única execução.

### AUTH / INIT / BOOTSTRAP

- Identidade TM SEG customizada; não usa Supabase `authenticated` como usuário.
- Roles homologadas: `administrador`, `diretoria`, `financeiro`, `ceo`.
- Permissões homologadas: `*`, `fin-transactions`, `finance-group`, `fin-*`.
- Sem token / token inválido: **401**.
- Role/escopo inválido: **403**.
- Handler financeiro exige `service_role`; sem ela retorna **503** e não degrada
  para anon.
- `/api/financial-payments-init` está fail-closed (**401/403**).
- `ensurePaymentTables` não usa anon para DDL/RPC e não contém/recria
  `Allow all for financial_transaction_payments`.
- Nenhum init real foi chamado no smoke de produção.

### TESTES / BASELINE

| Estado | TS total | Pass | Fail | React |
|--------|---------:|-----:|-----:|------:|
| main `deecde73` | 1000 | 999 | 1 baseline CRLF | 4/4 |
| PR final | 1023 | 1022 | 1 baseline CRLF | 4/4 |

- Novos testes no PR: **23**, todos verdes.
- Regressões direcionadas de financeiro/F4/auth: verdes.
- `invoice-control-loading.test.ts` falha tanto na main quanto no PR no checkout
  Windows CRLF: **BASELINE**, não regressão.
- `bash scripts/run-tests.sh`: bash indisponível neste Windows; os dois comandos
  internos foram executados separadamente e integralmente.
- Cancelled / skipped / hang: **0 / 0 / 0**.
- `npm run build`: **OK**.
- Supabase injetado em `dist/public/index.html`: **OK**.

### DEPLOY / SMOKE

```text
PR #278 → main c305e147 → dev c305e147 → Vercel Production
```

| Smoke sem autenticação | Resultado |
|------------------------|-----------|
| `/` | 200 |
| `/api/health` | 200 |
| `/api/version` | 200 / `c305e147` |
| GET nova API | 401 |
| POST nova API | 401 / nenhuma escrita |
| DELETE nova API | 401 / nenhuma exclusão |
| POST `/api/financial-payments-init` | 401 / init não executado |

Bundle publicado:

- contém `/api/financial-transaction-payments`;
- não contém `supabase.from('financial_transaction_payments')`;
- consumidores anon de runtime: **ZERO**.

### RLS (AINDA ABERTA)

| Check | Resultado |
|-------|-----------|
| RLS enabled | true |
| Policy `Allow all for financial_transaction_payments` | presente (1) |
| anon SELECT | 35 |
| authenticated SELECT | 35 |
| owner | 35 |

Nenhuma policy foi criada, removida ou alterada nesta execução.

### ROLLBACK

- Código: tag `baseline-fase4-pre-financial-payments-api-20260817`
  (`deecde73`) + redeploy.
- Policy: não requer rollback, pois permaneceu intacta.

### PRÓXIMO PASSO (OUTRO BLOCO)

Auditoria final de zero consumidor anon e preparação da migration + rollback
RLS, **ainda sem aplicar** até nova autorização. Não iniciar snapshots, RH,
`time_clock` ou Z-API.

---

## F4-P0-RLS — MIGRAÇÃO PARA API AUTENTICADA (`financial_transaction_payments`)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC) |
| **Branch** | `cursor/fase4-financial-payments-api-eaa8` |
| **Base** | `origin/main` = `deecde73` |
| **Código funcional anterior** | `2636a8e2` |
| **RLS desta tabela** | **NÃO aplicada** |
| **SQL / policy / dados** | **Não alterados** |
| **billing_usage / snapshots / RH / ponto / Z-API** | **Não tocados** |

### PROGRESSO

**Programa geral: 83,8%**

`█████████████████░░░`

**Fase 4: 45%**

`█████████░░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 CONSUMIDORES MIGRADOS — APTO PARA REVISÃO/MERGE

RLS continua aberta. Este bloco só remove o consumidor anon e protege o bootstrap.

### ESTADO ANTES

| Check | Valor |
|-------|-------|
| Policy | `Allow all for financial_transaction_payments` / ALL / anon+authenticated / true |
| anon / authenticated / owner | 35 / 35 / 35 |
| Frontend direto | `receivablePaymentsClient` via `lib/supabase` (anon) |
| Init | `/api/financial-payments-init` sem auth |
| Bootstrap | SQL recriava a policy ampla |

### CONSUMIDORES (auditoria NO-GO confirmada)

| Antes | Depois |
|-------|--------|
| `receivablePaymentsClient.ts` → `supabase.from('financial_transaction_payments')` | `authFetch` → `/api/financial-transaction-payments` |
| `ReceivablePaymentsModal` list/add/delete | mesma interface pública |
| `confirmReceivablePayClient` → `addPaymentToTransaction` (1×) | mesmo caminho, agora API |
| `FinancialTransactionList` | monta os fluxos; init autenticado |
| `api/` / `server/` CRUD | inexistente → SSOT backend novo |

### API

| Método | Rota | Operação |
|--------|------|----------|
| GET | `/api/financial-transaction-payments?transactionId=` | list |
| POST | `/api/financial-transaction-payments` | add + settlement idêntico |
| DELETE | `/api/financial-transaction-payments?id=&transactionId=` | delete + settlement idêntico |

SSOT: `lib/financial/receivablePaymentsApiCore.ts` (`createReceivablePaymentsOps`).
Handler leve: `api/financial-transaction-payments.ts` — **sem** entrada em `functions{}` (continua 50).
Rewrites antes do catch-all.

### AUTH / ROLES

Reutiliza `assertAsaasApiAccess` (não inventa papéis):

- Roles: `administrador`, `diretoria`, `financeiro`, `ceo`
- Permissões: `*`, `fin-transactions`, `finance-group`, `fin-*`
- Sem token / token inválido → **401**
- Role/escopo inválido → **403**
- Identidade: token TM SEG customizado (não JWT Supabase `authenticated`)

Sem regra nova por empresa/filial — o módulo não tinha escopo por transação além do acesso à tela.

### BOOTSTRAP / INIT

- `api/financial-payments-init.ts`: fail-closed (401/403). Testes não executam init real.
- `ensurePaymentTables`: SQL de estrutura **sem** `CREATE/DROP POLICY`. Filtro `selectFinancialPaymentsBootstrapStatements` bloqueia recriação da policy ampla.
- Migration histórica `2026_07_20_financial_transaction_payments.sql` **não editada**.

### TESTES

| Suíte | Total | Pass | Fail |
|-------|------:|-----:|-----:|
| TS `scripts/*.test.ts` | 1020 | 1019 | 1 baseline CRLF (`invoice-control-loading`) |
| React | 4 | 4 | 0 |
| **Geral** | **1024** | **1023** | **1 baseline** |
| Novos deste bloco | 20 | 20 | 0 |

Diferença vs baseline anterior (1000 TS): +20 testes do bloco. A falha CRLF é a mesma da main.

### DIFF PERMITIDO

API/handler, core SSOT, client, init, ensurePaymentTables, vercel rewrites, testes, handoff.

### PRÓXIMO PASSO (outro bloco)

1. Reauditoria final: zero consumidor anon.
2. Preparar migration + rollback RLS.
3. **Ainda sem aplicar** até nova autorização.

Não iniciar snapshots / RH / `time_clock` / Z-API.

---

## F4-P0-RLS — REVISÃO FINAL PR #277 + PUBLICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC) |
| **PR** | [#277](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/277) → `main` |
| **Branch** | `cursor/fase4-rls-billing-usage-eaa8` |
| **Produção funcional pré-merge** | `28ae11d8` |
| **main/dev pré-merge** | `5ce02aff` |
| **HEAD publicado** | `2636a8e2` |
| **Produção** | `buildId=2636a8e2`, `builtAt=2026-08-17T18:39:09.580Z` |
| **Tag pré-publicação** | `baseline-fase4-pre-rls-billing-usage-20260817` → `5ce02aff` |
| **Tag homologada** | `baseline-fase4-rls-billing-usage-merged-20260817` → `2636a8e2` |
| **Projeto oficial** | Grupo TMSEG `ajhmmjuewdsukecaimik` |
| **Migration MCP** | `20260817175715` e `20260817175827` / `fase4_p0_rls_billing_usage` (segunda entrada idempotente; **não reaplicar**) |
| **Migration Git** | `migrations/2026_08_17_fase4_p0_rls_billing_usage.sql` |
| **Rollback Git** | `migrations/rollback/2026_08_17_fase4_p0_rls_billing_usage.sql` |

### PROGRESSO

**Programa geral: 83,8%**

`█████████████████░░░`

**Fase 4: 45%**

`█████████░░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO FINAL

# 🟢 RLS billing_usage PUBLICADO E HOMOLOGADO

### DECISÃO PRÉ-MERGE (histórico)

# 🟡 PR #277 APTO COM FALHA BASELINE NÃO RELACIONADA

### LIVE REVALIDADO (somente contagens)

| Check | Resultado |
|-------|-----------|
| RLS enabled | **true** |
| Policy `Allow all for billing_usage` | **AUSENTE** (0 policies) |
| anon SELECT | **0** |
| authenticated SELECT | **0** |
| service_role | **137** |
| owner | **137** |
| Drift | **Não** |

### DIFF `origin/main...HEAD`

| Arquivo | Motivo | Risco | Necessário |
|---------|--------|-------|------------|
| `migrations/2026_08_17_fase4_p0_rls_billing_usage.sql` | Forward exclusivo | Baixo | Sim |
| `migrations/rollback/2026_08_17_fase4_p0_rls_billing_usage.sql` | Rollback exato | Baixo | Sim |
| `lib/billing/usageMigrations.ts` | Filtra CREATE/DROP POLICY no bootstrap | Médio (positivo) | Sim |
| `scripts/apply-billing-usage-migration.mjs` | Mesmo filtro no CLI manual | Baixo | Sim |
| `scripts/fase4-p0-rls-billing-usage.test.ts` | Exclusividade + bootstrap | Nulo | Sim |
| `docs/auditoria/*` | Plano + handoff | Nulo | Sim |

**Zero diff:** NF, Asaas, SEC-03, Investment, DRE, Diretoria, OS, pedágio, RH, ponto, `financial_transaction_payments`, `account_balance_snapshots`, `time_clock`, Z-API, ENV, Vercel, `2026_07_12_billing_usage.sql`.

Migration Git ≡ SQL MCP: `ENABLE ROW LEVEL SECURITY` + `DROP POLICY IF EXISTS "Allow all for billing_usage"`. Sem INSERT/UPDATE/DELETE. Sem validação de drift no SQL (não estava no auditado; não foi acrescentada).

### BOOTSTRAP

`runBillingUsageMigrations()` e o CLI `apply-billing-usage-migration.mjs` **ignoram** statements `CREATE/DROP POLICY` de `billing_usage`. O SQL histórico continua imutável e ainda contém a policy ampla, mas **não é reaplicada**.

### invoice-control-loading

| Ambiente | Resultado |
|----------|-----------|
| Working tree Windows (CRLF) | 1 fail no needle `\n` |
| Blob `origin/main` (LF) | asserção **OK** |
| Blob `HEAD` (LF) | asserção **OK** |
| `git diff origin/main HEAD -- server/routes.ts` | **vazio** |

Classificação: **BASELINE / line endings do checkout**. Não é regressão do PR. `routes.ts` não foi alterado.

### TESTES / BUILD / SMOKE PRÉ-MERGE

| Suíte | Total | Pass | Fail |
|-------|-------|------|------|
| TS `scripts/*.test.ts` | 1000 | 999 | 1 baseline CRLF |
| React `*.test.tsx` | 4 | 4 | 0 |
| **Geral** | **1004** | **1003** | **1 baseline** |
| skip/cancel/hang | 0 / 0 / 0 | | |
| `npm run build` | OK | | |
| `/api/health` | 200 | | |
| `/api/version` | 200 `buildId=28ae11d8` | | |
| `/api/billing/dashboard` | 401 | | |

### PUBLICAÇÃO

```text
PR #277 merge → main 2636a8e2
  → origin/dev fast-forward 2636a8e2
  → Vercel Production buildId=2636a8e2
```

Migration Supabase **não reaplicada**.

### PÓS-DEPLOY — CRITÉRIO OBRIGATÓRIO

Após o código novo (startup/bootstrap possível):

| Check | Resultado |
|-------|-----------|
| Policy ampla | **AUSENTE** (0) |
| anon SELECT | **0** |
| service_role | **137** |
| `/api/health` `/` `/api/version` | 200 |
| `/api/billing/dashboard` | 401 |
| `/api/db/capacity` (F4-P0) | 401 |
| `/api/nf/invoices` | 401 |
| `/api/asaas/payments` | 401 |
| `/api/supabase/status` | 401 |
| `/api/investment/snapshots-all` | 401 |

`runBillingUsageMigrations()` **não reabriu** a exposição.

### ROLLBACK (independentes)

| Tipo | Como |
|------|------|
| Código | `baseline-fase4-pre-rls-billing-usage-20260817` → `5ce02aff` + redeploy |
| Policy | `migrations/rollback/2026_08_17_fase4_p0_rls_billing_usage.sql` — **não executado** |

### PENDÊNCIAS

1. **NÃO** iniciar segunda tabela RLS.
2. Backlog: `financial_transaction_payments`, `account_balance_snapshots`, RH, `time_clock`.
3. F4-P0-ZAPI — separado.

---

## F4-P0-RLS — PILOTO `billing_usage`

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC) |
| **Branch** | `cursor/fase4-rls-billing-usage-eaa8` |
| **HEAD** | `0b427366` |
| **PR** | [#277](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/277) — aberto, não mergeado |
| **Base** | `origin/dev=origin/main=5ce02aff` |
| **Projeto oficial** | Grupo TMSEG `ajhmmjuewdsukecaimik` |
| **Migration MCP** | `20260817175715 / fase4_p0_rls_billing_usage` |
| **SQL** | auditado em `docs/auditoria/F4_P0_RLS_PLANO_SQL_NAO_EXECUTAR.md` (Fase RLS-0) — sem alteração |
| **Banco** | Somente `public.billing_usage` |
| **ENV / Vercel / outras tabelas** | **Não alterados** |

### PROGRESSO

**Programa geral: 83,8%**

`█████████████████░░░`

**Fase 4: 45%**

`█████████░░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 PILOTO `billing_usage` APLICADO — SEM LOCKOUT

### PRÉ-CHECKS (antes do apply)

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Supabase MCP `needsAuth` | **Não.** Server `ready`. |
| 2 | Projeto oficial | **Grupo TMSEG** `ajhmmjuewdsukecaimik` (não Torres). |
| 3 | Policy atual | `Allow all for billing_usage` / `FOR ALL TO anon, authenticated` / `USING true` — **sem drift**. |
| 4 | ANON SELECT | **137 linhas visíveis** (aberto, como na auditoria). |
| 5 | Migration exclusiva | Só `billing_usage`. Sem GRANT/REVOKE/DROP TABLE. |
| 6 | Rollback exato | Recria a mesma policy ampla. |
| 7 | Consumidor frontend direto novo | **Nenhum.** `billingService` usa `createSupabaseAdminClient`. |

HEAD informado `2b906cd8` **não estava no origin**. SQL usado = SSOT da auditoria F4-P0-RLS, sem reescrever o desenho.

### DRY-RUN

`BEGIN; DROP POLICY; SET LOCAL ROLE anon; SELECT count; ROLLBACK;`

- Após DROP: anon = **0**
- Após ROLLBACK: policy restaurada; 137 linhas intactas

### APPLY

```sql
ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for billing_usage" ON public.billing_usage;
```

### COMPROVAÇÃO LIVE

| Principal | Resultado |
|-----------|-----------|
| Policies em `billing_usage` | **0** |
| RLS enabled | **true** |
| ANON SELECT | **0** (antes 137) |
| authenticated SELECT | **0** |
| service_role SELECT | **137** |
| owner/postgres SELECT | **137** |
| `financial_transaction_payments` | policy ampla **intacta** |
| `account_balance_snapshots` | policy ampla **intacta** |
| `time_clock` | policy ampla **intacta** |

### COMPANION OBRIGATÓRIO

`runBillingUsageMigrations()` reaplicava `CREATE POLICY "Allow all..."` no startup e em `/api/billing/ensure-schema`. O bootstrap agora **ignora** statements `CREATE/DROP POLICY` de `billing_usage`. O SQL histórico `2026_07_12_billing_usage.sql` **não foi editado**.

### TESTES / BUILD / SMOKE

| Verificação | Resultado |
|-------------|-----------|
| `scripts/fase4-p0-rls-billing-usage.test.ts` | **4/4** |
| Suíte `scripts/*.test.ts` | **999/1000** — 1 fail pré-existente CRLF em `invoice-control-loading.test.ts` (`registerRoutes não await migrations`); `routes.ts` não foi alterado |
| React `*.test.tsx` | **4/4** |
| `npm run build` | **OK** |
| `/api/health` | 200 |
| `/api/version` | 200; `buildId=28ae11d8` (código ainda o publicado F4-P1) |
| `/api/billing/dashboard` sem auth | **401** |

### ROLLBACK

```bash
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/rollback/2026_08_17_fase4_p0_rls_billing_usage.sql
```

Não executado. Restaura `Allow all for billing_usage`.

### PENDÊNCIAS

1. Revisar e mergear [PR #277](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/277) — **não publicar** até revisão.
2. F4-P0-RLS restante: pagamentos parciais, snapshots, RH, `time_clock` — **não iniciar** sem APIs preparatórias (RLS-1).
3. F4-P0-ZAPI — separado.
4. Segurança residual/finalização.

### ARQUIVOS

| Arquivo | Motivo |
|---------|--------|
| `migrations/2026_08_17_fase4_p0_rls_billing_usage.sql` | Forward exclusivo |
| `migrations/rollback/2026_08_17_fase4_p0_rls_billing_usage.sql` | Rollback exato |
| `lib/billing/usageMigrations.ts` | Impede reabrir policy no bootstrap |
| `scripts/fase4-p0-rls-billing-usage.test.ts` | Exclusividade, rollback, consumidores, guard |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Handoff |

**Zero diff:** NF, Asaas, SEC-03, Investment, DRE, Z-API, outras tabelas, ENV.

---

## F4-P1 — HANDLERS VERCEL DEDICADOS PARA AS ROTAS F4-P0

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 (UTC) |
| **Branch** | `cursor/fase4-p1-dedicated-handlers-eaa8` |
| **Base pré-merge** | `origin/main=origin/dev=d5565321` |
| **PR** | #276 — mergeado por fast-forward |
| **HEAD funcional** | `4433c295` |
| **HEAD testes** | `5f6ae8b7` |
| **HEAD publicado** | `28ae11d8` |
| **Produção** | `buildId=28ae11d8`, `builtAt=2026-08-17T13:47:42.771Z` |
| **Rollback pré-P1** | `baseline-fase4-pre-p1-dedicated-handlers-20260817` → `d5565321` |
| **Tag homologada** | `baseline-fase4-p1-dedicated-handlers-merged-20260817` → `28ae11d8` |
| **Banco/schema/migrations/RLS/ENV** | **Não alterados** |

### PROGRESSO

**Programa geral: 83,6%**

`█████████████████░░░`

**Fase 4: 40%**

`████████░░░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 F4-P0 + F4-P1 PUBLICADOS E HOMOLOGADOS

### RESUMO SIMPLES

As 13 rotas protegidas no F4-P0 deixaram de depender do Express/catch-all em produção. Doze rewrites específicos, posicionados antes de `/api/(.*)`, apontam para quatro handlers Vercel leves. Sem autenticação, todas responderam 401 entre 0,05s e 0,49s, sem timeout/504 e sem criar cliente Supabase admin.

Express e Vercel agora compartilham as mesmas operações/contratos. Autenticação, roles e client scope do F4-P0 foram preservados. Nenhuma regra financeira ou área protegida foi alterada.

---

### PUBLICAÇÃO / HOMOLOGAÇÃO

```text
PR #276 @ 28ae11d8
  → dev (fast-forward)
  → main (fast-forward)
  → Vercel Production (projeto sistema-grupo-tm-seg)
```

| Verificação | Resultado |
|-------------|-----------|
| `/api/version` | 200; `buildId=28ae11d8` |
| `/api/health` | 200 em 0,08s |
| `/` | 200 em 0,08s |
| Deploy Production | Ready; `builtAt=2026-08-17T13:47:42.771Z` |
| Banco/ENV | Nenhuma alteração |

### SMOKE REAL — 13 CAMINHOS F4-P0

| Rota | Resultado | Tempo |
|------|-----------|-------|
| `GET /api/db/capacity` | 401 | 0,47s |
| `POST /api/db/vacuum` | 401 | 0,09s |
| `GET /api/platform/costs` | 401 | 0,07s |
| `POST /api/platform/costs/overrides` | 401 | 0,08s |
| Relatório operacional GET | 401 | 0,44s |
| Relatório operacional PATCH | 401 | 0,06s |
| Registries init POST | 401 | 0,47s |
| Registries list GET | 401 | 0,06s |
| Registries POST | 401 | 0,06s |
| Registries DELETE | 401 | 0,23s |
| Mission note GET | 401 | 0,49s |
| Mission note POST | 401 | 0,05s |
| Mission notes bulk GET | 401 | 0,06s |

Payloads vazios/sentinelas sem correspondência foram negados antes da operação. Nenhum dado foi escrito/removido.

### SMOKE ÁREAS PROTEGIDAS

| Rota | Resultado |
|------|-----------|
| `/api/nf/invoices` | 401 em 0,08s |
| `/api/asaas/payments` | 401 em 0,06s |
| `/api/supabase/status` | 401 em 0,12s |
| `/api/investment/snapshots-all` | 401 em 0,07s |

---

### INVENTÁRIO DAS 13 ROTAS

| Domínio | Rota/método | Consumidor | Auth/escopo | Operação/fonte | Antes |
|---------|-------------|------------|-------------|----------------|-------|
| DB | `GET /api/db/capacity` | Maintenance/ServerStats | Admin | contagens Supabase | catch-all >90s |
| DB | `POST /api/db/vacuum` | Maintenance | Admin | count-only | catch-all |
| Platform | `GET /api/platform/costs` | CostOptimization/ServerStats | Admin | custos + overrides | catch-all |
| Platform | `POST /api/platform/costs/overrides` | CostOptimization | Admin | upsert `platform_cost_overrides` | catch-all |
| Report | `GET /api/missions/:id/operational-report` | MissionOperationalReport | principal + missão/cliente | select `operational_reports` | catch-all |
| Report | `PATCH /api/missions/:id/operational-report` | MissionOperationalReport | roles internas | upsert `operational_reports` | catch-all |
| Registries | `POST /api/client-registries/init` | ClientReportsTab | Admin | probes read-only | catch-all |
| Registries | `GET /api/client-registries/:clientId/:type` | ClientReportsTab | client scope | select | catch-all |
| Registries | `POST /api/client-registries` | ClientReportsTab | client scope | upsert | catch-all |
| Registries | `DELETE /api/client-registries/:id` | sem consumidor UI localizado | Admin | delete | catch-all |
| Notes | `GET /api/client-mission-notes/:missionId` | ClientReportsTab | mission scope | select | catch-all |
| Notes | `POST /api/client-mission-notes` | ClientReportsTab | client + mission scope | upsert | catch-all |
| Notes | `GET /api/client-mission-notes/bulk/:clientId` | ClientReportsTab | client scope | select lote | catch-all |

---

### ARQUITETURA / SSOT

```text
Express (fallback) ─┐
                    ├─ auth F4-P0 → client/mission scope → f4ApiOperations
Vercel dedicado ────┘
```

| Peça | Responsabilidade |
|------|------------------|
| `lib/f4ApiOperations.ts` | SSOT de DB, platform costs, operational report, registries/notes |
| `lib/auth/f4ClientScope.ts` | SSOT do escopo missão↔cliente |
| `lib/f4HandlerUtils.ts` | query/result/405 compartilhados |
| `api/f4-db.ts` | capacity + vacuum |
| `api/f4-platform-costs.ts` | costs + overrides |
| `api/f4-operational-report.ts` | GET/PATCH report |
| `api/f4-client-data.ts` | registries + notes |
| `server/routes.ts` | fallback Express delegando às mesmas operações |

O principal é resolvido antes de `createSupabaseAdminClient()`. Query, insert, update e delete só ocorrem após auth e escopo.

---

### REWRITES / LIMITE VERCEL

- `functions{}`: **50 entradas antes e depois**.
- Novos handlers: auto-discovery; nenhuma entrada adicionada em `functions{}`.
- Rewrites: 120 → 132.
- 12 rewrites F4-P1 antes do catch-all.
- `/api/(.*) → /api/index` preservado, sem refatoração.
- Rewrites NF, Asaas, Supabase, Investment, SEC-03 e NB-07 intactos.

---

### PARIDADE EXPRESS × VERCEL

| Cenário | Express | Vercel | Igual? |
|---------|---------|--------|--------|
| Sem auth | 401 | 401 | Sim |
| Token inválido/inativo | 401 | 401 | Sim |
| Role inválida | 403 | 403 | Sim |
| Client/mission scope inválido | 403 | 403 | Sim |
| Payload obrigatório ausente | 400 | 400 | Sim |
| Método incorreto | 405 + `Allow` | 405 + `Allow` | Sim |
| Erro interno | contrato da operação SSOT | mesmo contrato | Sim |
| Sucesso mockado | operação 1× | operação 1× | Sim |

---

### RED → GREEN / TESTES

| Marco | Resultado |
|-------|-----------|
| RED roteamento | **2/15 pass; 13 fail** |
| Roteamento GREEN | **15/15 pass** |
| F4-P0 + F4-P1 (handlers/paridade/contratos) | **52/52 pass** |
| Segurança ampliada | **144/144 pass** |
| TS completa | **996/996 pass** |
| React | **4/4 pass** |
| **Total** | **1000/1000 pass**, 0 fail/skip/cancel/hang |
| `npm run build` | **OK** |
| Bundle isolado handlers | 4/4 OK; ~813–817 kB cada |

### RUNTIME EQUIVALENTE

Chamada direta dos handlers com dependências reais de auth e sem token, sem app/DB:

| Handler | Resultado | Tempo |
|---------|-----------|-------|
| DB | 401 | 0,19ms |
| Platform | 401 | 0,08ms |
| Operational report | 401 | 0,05ms |
| Client data | 401 | 0,10ms |

Nenhuma conexão/admin/operação foi criada nessas negações.

---

### DIFF

| Arquivo | Classificação |
|---------|---------------|
| `api/f4-{db,platform-costs,operational-report,client-data}.ts` | Handlers Vercel |
| `lib/f4ApiOperations.ts` | SSOT operações |
| `lib/auth/f4ClientScope.ts` | Escopo compartilhado |
| `lib/f4HandlerUtils.ts` | Contrato handler |
| `server/routes.ts` | Delegação Express à SSOT + 405 |
| `vercel.json` | 12 rewrites específicos |
| `scripts/fase4-p1-dedicated-handlers.test.ts` | RED/GREEN/paridade/runtime |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Handoff |

**Zero diff:** RLS, Z-API, NF, Asaas/SEC-03, Investment, Supabase NB-07, DRE, canônico, pedágio, OS mãe/filha, financeiro, banco, schema, migrations e ENV.

---

### ROLLBACK PROPOSTO

Rollback: `baseline-fase4-pre-p1-dedicated-handlers-20260817` → `d5565321`. Nenhum rollback foi necessário. Em regressão futura, reverter os commits F4-P1 e redeployar; nenhuma ação de banco/ENV será necessária.

### COMPOSIÇÃO DO PROGRESSO FASE 4

| Sub-bloco | Peso interno | Estado |
|-----------|--------------|--------|
| API Auth F4-P0 + handlers F4-P1 | **40%** | Publicado/homologado |
| F4-P0-RLS | **35%** | Pendente separado |
| F4-P0-ZAPI | **15%** | Pendente separado |
| Segurança residual/finalização | **10%** | Pendente |

Como a Fase 4 representa 4% do programa, 40% concluídos contribuem **1,6 ponto percentual**: programa geral `82% → 83,6%`.

### PENDÊNCIAS

1. F4-P0-RLS — separado.
2. F4-P0-ZAPI — separado.
3. Segurança residual/finalização.
4. PR documental #274 — reconciliação histórica separada.

---

## F4-P0 — SEGURANÇA RESIDUAL DAS APIs E ACESSOS ADMINISTRATIVOS

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Branch** | `cursor/fase4-p0-api-auth-eaa8` |
| **Base pré-merge** | `origin/main=origin/dev=5f7d73b2` |
| **PR** | #275 — mergeado por fast-forward |
| **PR documental Raio-X** | #274 — separado, não incorporado nesta branch |
| **HEAD funcional/publicado** | `c47cba5a` |
| **Produção** | `buildId=c47cba5a`, `builtAt=2026-08-16T22:41:13.562Z` |
| **Rollback pré-P0** | `baseline-fase4-pre-p0-api-auth-20260816` → `5f7d73b2` |
| **Tag pós-P0** | Não criada — smoke 401 bloqueado pelo timeout |
| **Banco/schema/migrations/ENV/Asaas** | **Não alterados** |

### PROGRESSO

**Programa geral: 82%**

`████████████████░░░░`

**Fase 4: 0%**

`░░░░░░░░░░░░░░░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟡 F4-P0 PUBLICADO COM PENDÊNCIA NÃO BLOQUEANTE

As vulnerabilidades dos handlers F4-P0 foram corrigidas, testadas, mergeadas e deployadas. Em produção, as rotas ainda excedem 90s no catch-all antes de tornar o 401 observável. Isso é dívida F4-P1 preexistente e falha de forma segura (nenhum handler/escrita alcançado), mas impede tag pós-P0 e avanço percentual. RLS e Z-API continuam separados.

### RESUMO SIMPLES

Treze caminhos de API que podiam alcançar dados/operações administrativas apenas pela URL agora validam um usuário ativo antes do handler. Rotas administrativas exigem Diretoria/Administrador/CEO; relatórios e dados de cliente validam também o escopo do cliente no backend. Sem token ou com token inválido retornam 401; role/cliente incorreto retorna 403. Nenhuma regra financeira, NF, Asaas, SEC-03, Investment, DRE, pedágio ou OS mãe/filha foi modificada.

O RED inicial provou **13 falhas em 14 testes estruturais**. Depois da correção, a suíte F4-P0 fechou **21/21** e a suíte completa **969/969**.

---

### PUBLICAÇÃO CONTROLADA PR #275

```text
cursor/fase4-p0-api-auth-eaa8 @ c47cba5a
  → dev (fast-forward)
  → main (fast-forward)
  → Vercel Production @ c47cba5a
```

| Verificação | Resultado |
|-------------|-----------|
| HEAD revalidado | `c47cba5a` — sem commits posteriores |
| Commits | `b3cb3f3e` funcional; `86d17b5c` teste; `c47cba5a` documentação |
| Diff | Somente os quatro arquivos F4-P0 documentados |
| Deploy | 200 `/api/version`; `builtAt=2026-08-16T22:41:13.562Z` |
| `/api/health` | 200 em 0,11s |
| `/` | 200 em 0,07s |
| Rotas F4-P0 sem auth | Timeout >15s; `/api/db/capacity` confirmado >90s |
| Handler/escrita F4-P0 | Não alcançado durante os timeouts |
| NF / Asaas / Supabase / Investment | 401 entre 0,09s e 0,13s |

**Conclusão de smoke:** código exato está em produção e a negação é comprovada em runtime isolado; o caminho Vercel catch-all permanece indisponível antes do middleware. Não corrigir aqui — destino F4-P1.

---

### FLUXO E INFRAESTRUTURA REUTILIZADA

```text
Vercel /api/(.*)
  → api/index
  → Express
  → authorizeF4ApiRequest
  → resolvePrincipal existente (system_users)
  → role / permission / client scope
  → handler
  → supabaseAdmin
```

Não foi criado segundo mecanismo de identidade. `lib/auth/f4ApiAccess.ts` é um adaptador fail-closed sobre o resolver homologado.

---

### ROTAS — ANTES / DEPOIS

| Rota | Tipo/consumidor | Antes | Depois | Roles/escopo | Status |
|------|-----------------|-------|--------|--------------|--------|
| `GET /api/db/capacity` | Diagnóstico; Maintenance/ServerStats | Público; service role; timeout | 401/403 antes da consulta | Diretoria, Administrador, CEO ou `*` | Corrigido |
| `POST /api/db/vacuum` | Admin count-only; Maintenance | Público | Fail-closed | mesmas roles admin | Corrigido |
| `GET /api/platform/costs` | Diagnóstico/custos; CostOptimization | Público | Fail-closed; auth propagada à leitura interna de capacidade | mesmas roles admin | Corrigido |
| `POST /api/platform/costs/overrides` | Escrita `platform_cost_overrides` | Público; upsert admin | Fail-closed | mesmas roles admin | Corrigido |
| `POST /api/client-registries/init` | Probe administrativo de tabelas | Público | Fail-closed | mesmas roles admin | Corrigido |
| `DELETE /api/client-registries/:id` | Escrita destrutiva sem consumidor UI localizado | Público | Fail-closed | mesmas roles admin | Corrigido |
| `GET /api/missions/:id/operational-report` | Leitura relatório/fotos/WhatsApp | Público | Principal ativo + missão no escopo do cliente | Internos; cliente somente sua OS | Corrigido |
| `PATCH /api/missions/:id/operational-report` | Upsert `operational_reports` | Público | Role interna antes do upsert | Diretoria/Admin/CEO/Controller/Avançado/Operador/Financeiro/Comercial | Corrigido |
| `GET /api/client-registries/:clientId/:type` | Leitura relatório cliente | Público | Principal + client scope | Internos ou próprio `client_id`/`client_view` | Corrigido |
| `POST /api/client-registries` | Upsert cadastro cliente | Público | Principal + client scope | mesmo escopo | Corrigido |
| `GET /api/client-mission-notes/:missionId` | Leitura nota operacional | Público | Principal + missão no escopo | mesmo escopo | Corrigido |
| `POST /api/client-mission-notes` | Upsert nota operacional | Público | Client ID e missão validados | mesmo escopo | Corrigido |
| `GET /api/client-mission-notes/bulk/:clientId` | Leitura em lote | Público | Principal + client scope | mesmo escopo | Corrigido |

Métodos incorretos continuam no contrato Express existente (404 quando rota não registrada); não foi adicionado comportamento 405 artificial.

---

### RED → FIX → GREEN

| Marco | Resultado |
|-------|-----------|
| RED — antes do middleware | **1/14 pass, 13 fail** |
| GREEN estrutural + unidade | **20/20 pass** |
| Runtime equivalente isolado | 401 sem auth; 401 inválido; 403 role errada; 200 role correta; operação chamada 1× |
| F4-P0 final | **21/21 pass** |
| Segurança ampliada | **113/113 pass** (delta +1 runtime isolado) |
| TS completa | **965/965 pass** |
| React | **4/4 pass** |
| **Total** | **969/969 pass**, 0 fail/skip/cancel/hang |
| `npm run build` | **OK** |

O runtime equivalente usa Express efêmero + resolver fake, sem conectar/escrever no banco.

---

### RLS — AUDITORIA SEPARADA (NENHUMA ALTERAÇÃO)

As migrations declaram `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`. Uma consulta `head/count` anon, sem retornar linhas, confirmou SELECT permitido nas amostras:

| Tabela/grupo | Policy observada | Consumidor | Classificação |
|--------------|------------------|-----------|---------------|
| `financial_transaction_payments` | Allow all anon/authenticated | Financeiro parcial | **Permissivo indevido — crítico** |
| `billing_usage` | Allow all anon/authenticated | Cockpit/custos IA | **Permissivo indevido — alto** |
| `account_balance_snapshots` | Allow all anon/authenticated | Investment/Diretoria | **Permissivo indevido — alto** |
| `time_clock` | Allow all anon/authenticated | Ponto | **Permissivo indevido — alto** |
| `rh_employees`, bank accounts, salary configs, commissions, payroll items | Policy dinâmica Allow all | Frontend RH direto | **Permissivo indevido — alto; impacto amplo** |

**Plano obrigatório F4-P0-RLS (PR separado):**

1. Inventariar policies efetivas e todos os consumidores por tabela/operação.
2. Definir modelo de roles/RLS ou mover writes sensíveis para backend.
3. Criar testes anon/authenticated/admin e rollback de policies.
4. Migrar progressivamente por domínio: Financeiro → Investment → RH/Ponto.
5. Não misturar com este PR nem alterar NF/Asaas.

---

### Z-API — AUDITORIA SEPARADA

| Item | Resultado |
|------|-----------|
| Endpoints | `/api/whatsapp/webhook/inbound`, `/api/zapi/webhook/connection` (Vercel + Express) |
| Validação | `x-zapi-secret`, `x-webhook-secret` ou query token |
| ENV ausente | **Fail-open** no código |
| ENV produção | `ZAPI_WEBHOOK_SECRET` **PRESENTE** em Production e Preview (valor não lido/exibido) |
| Estado atual | Protegido operacionalmente; risco latente de configuração |

Destino: **F4-P0-ZAPI** separado para avaliar fail-closed coordenado. Nenhum endpoint/configuração Z-API foi alterado.

---

### SERVICE ROLE

| Verificação | Resultado |
|-------------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` Vercel | Presente em Production/Preview |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` Vercel | Ausente |
| Valor/fingerprint/hash | Não lido nem registrado |
| Bundle frontend | Nenhum valor/JWT service_role localizado |
| Nome em UI | Existe apenas mensagem operacional textual — não segredo |

Há fallbacks `VITE_SUPABASE_SERVICE_ROLE_KEY` em módulos backend legados de auth. Como a ENV está ausente e Asaas é área protegida, não foram alterados; revisar em bloco próprio.

---

### PERFORMANCE / CATCH-ALL

- O catch-all global não foi modificado.
- Rotas continuam sujeitas ao cold-start/timeout até F4-P1; produção excedeu 90s sem resposta.
- Runtime equivalente provou negação rápida sem iniciar o app completo.
- Uma tentativa de subir o app completo foi interrompida porque o startup executa jobs/probes com potenciais efeitos externos; não foi usada como evidência.

---

### ARQUIVOS MODIFICADOS

| Arquivo | Motivo | Risco |
|---------|--------|-------|
| `lib/auth/f4ApiAccess.ts` | Gate compartilhado, roles e client scope | Baixo/médio |
| `server/routes.ts` | Aplicar gates antes de `supabaseAdmin` | Médio |
| `scripts/fase4-p0-api-auth.test.ts` | RED/GREEN, auth, roles, client scope, runtime fake | Nulo |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Handoff | Nulo |

**Zero diff:** `api/asaas-webhook.ts`, `asaasWebhookCore`, NF, Investment, DRE, canônico, pedágio, OS mãe/filha, banco, schema, migrations, RLS e ENV.

---

### ROLLBACK FUTURO

Tag pré-P0: `baseline-fase4-pre-p0-api-auth-20260816` → `5f7d73b2`. Reverter os commits F4-P0 e redeployar restaura os handlers anteriores. Não há rollback de banco/ENV. Nenhum rollback foi necessário porque não houve regressão nova; a indisponibilidade catch-all já existia.

### PENDÊNCIAS

1. F4-P0-RLS — crítico, separado.
2. F4-P0-ZAPI — hardening fail-closed condicional.
3. F4-P1 — performance/handlers dedicados após auth.
4. Merge prévio ou reconciliação documental do PR #274 preservando “ABERTURA FASE 4 — RAIO-X”.
5. Criar `baseline-fase4-p0-api-auth-merged-20260816` somente após smoke 401 observável.

---

## FECHAMENTO FASE 3 — P4-FECHAMENTO — AUDITORIA FINAL

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Tipo** | Auditoria final — somente leitura/testes/documentação |
| **Branch** | `cursor/p4-fechamento-eaa8` |
| **PR** | [#272](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/272) |
| **Produção** | `buildId=d51e9315` |
| **Commit produção** | `d51e9315` |
| **builtAt** | `2026-08-16T14:44:15.247Z` |
| **Código funcional SEC-03** | `79fae7a6` |
| **Tag fechamento** | `baseline-fase3-completa-20260816` → `b9506cb3` |
| **Tag SEC-03** | `baseline-fase3-sec03-merged-20260816` → `79fae7a6` |
| **Rollback pré-SEC-03** | `baseline-fase3-pre-sec03-20260816` → `dfbfc962` |
| **Banco/schema/migration/ENV/RLS/Asaas** | **Não alterados nesta execução** |

### PROGRESSO

**Programa geral: 82%**

`█████████████████░░░`

**Fase 3: 100%**

`████████████████████`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 FASE 3 CONCLUÍDA — 100%

**Observação operacional (não bloqueante):** SEC-03 com segurança negativa e configuração externa comprovadas; **validação positiva real** (`PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` autenticado em produção) **ainda não ocorreu** desde o deploy — aguardar próximo evento legítimo do Asaas (sem forjar pagamento).

### RESUMO SIMPLES

Nesta etapa o sistema passou por uma **auditoria final de toda a Fase 3**, sem alterar código funcional, banco, ENV ou Asaas. Revalidamos produção, executamos **948/948 testes** (0 skipped/cancelled/hang), `npm run build` OK, e smokes de preservação (rotas privadas 401 rápido; webhook sem token 401 rápido). `main`, `dev` e produção estão alinhados em `d51e9315`. Os blocos P0→SEC-03 estão publicados, testados e com rollback documentado. SEC-03 está ativo; as três contas Asaas têm webhooks de pagamento dedicados ativos e `transfer-approval` preservado. Logs Vercel (24h) mostram somente o smoke negativo desta auditoria — nenhum evento financeiro legítimo pós-deploy. Pendências conhecidas foram classificadas como **backlog futuro**.

---

### PRODUÇÃO ATUAL

| Endpoint | HTTP | Tempo | Observação |
|----------|------|-------|------------|
| `GET /api/version` | 200 | 0,14s | `buildId=d51e9315`, `version=3.7.60` |
| `GET /api/health` | 200 | 0,06s | `{"status":"ok"}` |
| `GET /` | 200 | 0,03s | SPA/login |

**Git:** `origin/main` = `origin/dev` = `d51e9315`. Commit `d51e9315` é handoff SEC-03; código funcional SEC-03 em `79fae7a6`.

---

### REGRESSÃO FINAL

| Suíte | Resultado |
|-------|-----------|
| TS | **944/944 pass** |
| React | **4/4 pass** |
| Total `run-tests.sh` | **948/948 pass** |
| Skipped / cancelled / hang | **0 / 0 / 0** |
| `npm run build` | **OK** |
| Secrets no bundle frontend | **Nenhum** |

---

### SMOKE FINAL PRODUÇÃO

| Verificação | Resultado |
|-------------|-----------|
| `GET /api/health` | **200** 0,06s |
| `GET /` | **200** 0,04s |
| `GET /api/nf/invoices` | **401** 0,06s |
| `GET /api/supabase/status` | **401** 0,05s |
| `GET /api/supabase/db-metrics` | **401** 0,05s |
| `GET /api/asaas/payments` | **401** 0,05s |
| `GET /api/investment/snapshots-all` | **401** 0,07s |
| `POST /api/asaas/webhook` sem token | **401** `{error:"unauthorized"}` 0,06s |

---

### SEC-03 — EVENTO LEGÍTIMO PÓS-PUBLICAÇÃO

| Fonte | Resultado |
|-------|-----------|
| Logs Vercel (24h) | 2 hits `POST /api/asaas/webhook` (smoke desta auditoria); nenhum evento Asaas adicional |
| API Asaas `GET /v3/webhooks` | 3 contas: `/api/asaas/webhook` enabled, não interrompido, `hasAuthToken=true`, eventos PAYMENT_* |
| Transfer-approval | Preservado nas 3 contas |
| Evento legítimo PAYMENT_* pós-deploy | **Não identificado** |

---

### CHECKLIST MARCOS (P0 → SEC-03)

Todos os blocos **publicados, testados e validados em produção**, com tags de rollback documentadas. SEC-03: validação positiva real **pendente** (observação operacional). Detalhes por bloco preservados nas seções históricas abaixo.

---

### PENDÊNCIAS BACKLOG (NÃO BLOQUEIAM)

| Item | Destino |
|------|---------|
| SEC-03 validação positiva real | Observação operacional |
| SYNC-07 realtime duplicado | Performance futura |
| SYNC-02 fallback fornecedor | Backlog condicionado |
| 12 órfãos P4-LIMPEZA | Limpeza futura |
| AI Chat inativo | Decisão produto |
| attached_assets | Limpeza futura |
| Catch-all residual NB-07 | Arquitetura futura |

---

### PERCENTUAIS

| Indicador | Antes | Depois |
|-----------|-------|--------|
| Fase 3 | 98% (SEC-03) | **100%** |
| Programa geral | 80% | **82%** |

---

### NOTA HISTÓRICA

Uma auditoria P4-FECHAMENTO **anterior** (pré-SEC-03, commit `0cb62557`) havia classificado SEC-03 como bloqueador e emitido 🔴. Essa conclusão foi **superseded** pela publicação do PR #273 e validação fail-closed em produção. Evidências permanecem no histórico Git.

---

### MERGE DOCUMENTAL PR #272

| Campo | Valor |
|-------|-------|
| **Data merge** | 2026-08-16 (UTC) |
| **PR** | [#272](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/272) |
| **Commit merge** | `e4fd4ea8` |
| **Diff vs `d51e9315`** | Somente `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` (+131 linhas) |
| **Código funcional alterado** | **Nenhum** |
| **Tag fechamento** | `baseline-fase3-completa-20260816` → `b9506cb3` (**preservada, não reescrita**) |
| **Fase 3** | **ENCERRADA — congelada** |

**Regra de congelamento:** nenhum item da Fase 3 deve ser reaberto sem bug reproduzível, regressão comprovada, incidente de produção ou decisão humana explícita. Dívida futura **não** reabre automaticamente a Fase 3.

---

## PUBLICAÇÃO CONTROLADA SEC-03 — PR #273

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **PR** | [#273](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/273) |
| **Branch** | `cursor/fase3-sec03-webhook-eaa8` |
| **HEAD validado/mergeado** | `79fae7a6` |
| **Commit funcional SEC-03** | `3e417e91` |
| **Commits após `c09fb33e`** | `4634d22d`, `79fae7a6` — documentação/configuração |
| **Tag rollback** | `baseline-fase3-pre-sec03-20260816` → `dfbfc962` |
| **Tag SEC-03** | `baseline-fase3-sec03-merged-20260816` → `79fae7a6` |
| **Produção antes** | `dfbfc962` |
| **Produção SEC-03** | `buildId=79fae7a6` |
| **builtAt** | `2026-08-16T14:40:52.218Z` |
| **Banco/schema/migration/RLS** | Não alterados |

### PROGRESSO

**Programa geral: 80%**

`████████████████░░░░`

**Fase 3: 98%**

`████████████████████`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟡 SEC-03 PUBLICADO — VALIDAÇÃO POSITIVA REAL PENDENTE

### RESUMO SIMPLES

O SEC-03 foi mergeado por fast-forward em `dev` e `main`, sem conflitos. Produção agora exige o header `asaas-access-token` antes de criar Supabase, fazer matching ou escrever dados financeiros. Requisições sem token e com token inválido retornaram **401 rápido** usando payload sintético sem correspondência. Não foi criado/pago/cancelado nenhum título e nenhum evento financeiro real foi forjado. As três contas e os webhooks `transfer-approval` continuam ativos. A confirmação positiva com token correto ficou intencionalmente pendente do próximo evento legítimo do Asaas.

---

### REVALIDAÇÃO DO HEAD / DIFF

| Item | Classificação |
|------|---------------|
| `3e417e91` | Funcional — autenticação SEC-03 isolada |
| `561aad1f` | Teste — token com espaços rejeitado |
| `c09fb33e` | Documentação — configuração/rollback |
| `4634d22d` | Documentação — inventário bloqueado |
| `79fae7a6` | Documentação/configuração externa concluída |

Diff publicado:

- `api/asaas-webhook.ts` — auth Vercel antes do core;
- `lib/asaasWebhookAuth.ts` — helper específico;
- `lib/asaasWebhookCore.ts` — injeção para testes, defaults de produção preservados;
- `server/routes.ts` — paridade Express;
- três arquivos de teste;
- handoff.

**Zero diff:** NF, `FinancialInvoiceControl`, `/api/nf/invoices`, balances, PIX, transferências, cobranças, `sync-open-payments`, payments, payment/:id, Supabase, Investment, DRE, Diretoria, RH, Ponto, banco, schema, migration e RLS.

---

### TESTES PRÉ-MERGE

| Suíte | Resultado |
|-------|-----------|
| SEC-03/P4/guardas NF | **62/62 pass** |
| TS completa | **944/944 pass** |
| React | **4/4 pass** |
| Total | **948/948 pass**, 60s |
| Skipped / cancelled / hang | **0 / 0 / 0** |
| `npm run build` | **OK**, 19s |

Provas determinísticas:

- sem ENV → 503, zero core/escrita;
- sem token → 401, zero core/escrita;
- token incorreto → 401, zero core/escrita;
- token correto → alcança fluxo atual mockado;
- Vercel/Express autenticam antes de qualquer side effect.

---

### MERGE / DEPLOY

```text
PR #273 → dev (fast-forward)
dev → main (fast-forward)
main @ 79fae7a6 → Vercel Production
```

Nenhum conflito foi resolvido porque não houve conflito.

---

### SMOKE PRODUÇÃO SEC-03 (SEM EFEITO FINANCEIRO)

| Verificação | Resultado |
|-------------|-----------|
| `POST /api/asaas/webhook` sem token | **401** em 0,10s |
| Mesmo POST com token inválido | **401** em 0,05s |
| Body | Sintético, ID sem correspondência; auth negou antes do matching |
| Resposta | `{error:"unauthorized"}` |
| `GET /api/version` | **200**, `79fae7a6` |
| `GET /api/health` | **200** em 0,06s |
| `GET /` | **200** em 0,10s |
| `GET /api/nf/invoices` | **401** em 0,07s |
| `GET /api/supabase/status` | **401** em 0,07s |
| `GET /api/asaas/payments` | **401** em 0,11s |
| `GET /api/investment/snapshots-all` | **401** em 0,08s |

Nenhum secret foi exibido em comando, log, Git, handoff, PR ou resposta.

---

### TRÊS CONTAS / TRANSFER-APPROVAL

| Conta | Webhook pagamento | authToken | Transfer-approval |
|-------|-------------------|-----------|-------------------|
| TM Gestão | Ativo; fila normal | Configurado | Preservado e ativo |
| TM Segurança | Ativo; fila normal | Configurado | Preservado e ativo |
| TM Security | Ativo; fila normal | Configurado | Preservado e ativo |

Eventos dos webhooks de pagamento: somente `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`.

### VALIDAÇÃO POSITIVA REAL

**Pendente do próximo evento legítimo.** Nenhuma cobrança/pagamento foi criado artificialmente. A pendência não invalida o fail-closed já comprovado, mas deve ser conferida nos logs de entrega Asaas quando ocorrer evento real.

---

### ROLLBACK

Em regressão:

1. reverter somente SEC-03 para `baseline-fase3-pre-sec03-20260816` (`dfbfc962`);
2. redeploy Vercel;
3. não alterar banco;
4. não remover automaticamente ENV nem os novos webhooks;
5. preservar configurações externas para investigação.

Nenhum rollback foi necessário nesta publicação.

---

### PRÓXIMO PASSO

Revisão humana deste handoff. Depois, executar P4-FECHAMENTO separadamente; não declarar Fase 3 em 100% automaticamente.

---

## SEC-03 — CONFIGURAÇÃO EXTERNA CONCLUÍDA (histórico pré-publicação)

### PROGRESSO

**Programa geral: 78%**

`████████████████░░░░`

**Fase 3: 94%**

`███████████████████░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 3 WEBHOOKS SEC-03 CONFIGURADOS — PR #273 LIBERADO PARA PUBLICAÇÃO

### VERCEL

| Projeto | Variável | Production | Preview | Outras ENV alteradas |
|---------|----------|------------|---------|----------------------|
| `sistema-grupo-tm-seg` | `ASAAS_PAYMENT_WEBHOOK_TOKEN` | **Presente** | **Presente** | **Nenhuma** |

### WEBHOOKS DE PAGAMENTO CRIADOS

| Conta | Criado | URL | Eventos | authToken | Status |
|-------|--------|-----|---------|-----------|--------|
| TM Gestão | **Sim** | `https://sistema.grupotmseg.com.br/api/asaas/webhook` | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | Configurado | Ativo; fila não interrompida |
| TM Segurança | **Sim** | `https://sistema.grupotmseg.com.br/api/asaas/webhook` | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | Configurado | Ativo; fila não interrompida |
| TM Security | **Sim** | `https://sistema.grupotmseg.com.br/api/asaas/webhook` | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | Configurado | Ativo; fila não interrompida |

Existe exatamente **um** webhook dedicado de pagamento por conta. O mesmo authToken dedicado foi aplicado nos quatro pontos (Vercel + três contas), sem registrar seu valor.

### TRANSFER-APPROVAL PRESERVADO

| Conta | URL existente | Preservado | Status |
|-------|---------------|------------|--------|
| TM Gestão | `https://sistema.grupotmseg.com.br/api/asaas/transfer-approval` | **Sim** | Ativo; fila não interrompida |
| TM Segurança | `https://sistema.grupotmseg.com.br/api/asaas/transfer-approval` | **Sim** | Ativo; fila não interrompida |
| TM Security | `https://sistema.grupotmseg.com.br/api/asaas/transfer-approval` | **Sim** | Ativo; fila não interrompida |

URLs, eventos, estado e filas dos webhooks `transfer-approval` permaneceram intactos.

### PRESERVAÇÃO

- Nenhum evento financeiro foi executado.
- Nenhuma cobrança, invoice, PIX ou transferência foi criada/alterada.
- Nenhuma API key, emissora, cliente, NF, Supabase, banco, schema, migration ou RLS foi alterado.
- Produção continua no código anterior e ignora o header extra até futura publicação do PR #273.

---

## SEC-03 — PREPARAÇÃO EXTERNA CONTROLADA (inventário anterior — histórico)

### PROGRESSO

**Programa geral: 78%**

`████████████████░░░░`

**Fase 3: 94%**

`███████████████████░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🔴 CONFIGURAÇÃO BLOQUEADA — NÃO PUBLICAR

### STATUS VERCEL

| Projeto | Variável | Production | Preview | Alterada? |
|---------|----------|------------|---------|-----------|
| `sistema-grupo-tm-seg` | `ASAAS_PAYMENT_WEBHOOK_TOKEN` | **Não presente** | **Não presente** | **Não** |

### STATUS DAS CONTAS ASAAS

| Conta | Webhook existente? | URL atual | Eventos atuais | Status | Webhook de pagamento esperado |
|-------|--------------------|-----------|-----------------|--------|------------------------------|
| TM Gestão | Sim | `https://sistema.grupotmseg.com.br/api/asaas/transfer-approval` | 111 eventos; inclui `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` | Ativo; fila não interrompida | **Ausente** |
| TM Segurança | Sim | `https://sistema.grupotmseg.com.br/api/asaas/transfer-approval` | 9 eventos de transferência; não inclui os dois eventos de pagamento | Ativo; fila não interrompida | **Ausente** |
| TM Security | Sim | `https://sistema.grupotmseg.com.br/api/asaas/transfer-approval` | 111 eventos; inclui `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` | Ativo; fila não interrompida | **Ausente** |

### URL / EVENTOS / AUTHTOKEN

| Verificação | Resultado |
|-------------|-----------|
| URL esperada `https://sistema.grupotmseg.com.br/api/asaas/webhook` | **Não cadastrada nas três contas** |
| Eventos atuais | **Preservados; zero alteração** |
| authToken do webhook de pagamento | **Não configurado — webhook correspondente não existe** |
| Token forte gerado | **Não** — parada ocorreu antes da geração |
| API keys / regras financeiras | **Não alteradas** |

O inventário encontrou configuração diferente da esperada. Os webhooks existentes atendem `/api/asaas/transfer-approval` e não podem ser reaproveitados ou alterados sem quebrar esse fluxo protegido. Criar novos webhooks de pagamento adicionaria configuração/eventos e exige autorização arquitetural explícita; portanto a execução parou antes de gerar secret ou configurar Vercel/Asaas.

O contrato oficial permanece confirmado: `authToken` configurado no Asaas é enviado no header `asaas-access-token` e deve corresponder à env backend.

### PR #273

**Não liberado para publicação.** Antes do merge, o proprietário deve autorizar explicitamente a criação de um webhook de pagamento dedicado em cada conta (mantendo os três webhooks `transfer-approval` atuais intactos) ou definir outra arquitetura coordenada.

---

## SEC-03 ISOLADO — HARDENING WEBHOOK ASAAS (implementação anterior)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | GPT-5.6 Sol Medium |
| **Branch** | `cursor/fase3-sec03-webhook-eaa8` |
| **Base limpa** | `origin/main` @ `dfbfc962` |
| **Commit implementação** | `3e417e91` |
| **PR** | [#273](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/273) — draft |
| **PR #262** | **Congelado; não reutilizado/cherry-picked** |
| **Produção** | `dfbfc962` — inalterada |
| **Vercel ENV / painel Asaas** | **Não alterados** |
| **Banco / schema / migration / RLS** | **Não alterados** |

### PROGRESSO

**Programa geral: 78%**

`████████████████░░░░`

**Fase 3: 94%**

`███████████████████░`

**Execução atual: 100%**

`████████████████████`

*(Implementação em branch não aumenta a Fase 3. Falta configuração externa, merge, deploy e smoke.)*

### DECISÃO

# 🟡 SEC-03 APTO COM PENDÊNCIA DE CONFIGURAÇÃO EXTERNA

### RESUMO SIMPLES

O webhook de pagamentos aceitava requisições públicas sem provar que vieram do Asaas e podia alcançar escritas financeiras privilegiadas. O SEC-03 adiciona autenticação servidor-servidor no header oficial `asaas-access-token`, comparado com a env backend `ASAAS_PAYMENT_WEBHOOK_TOKEN`. Sem configuração retorna **503**; token ausente/incorreto retorna **401**; somente token correto alcança o core/Supabase. O fluxo de baixa, eventos, matching e respostas financeiras permanece igual. As três contas continuam usando o mesmo endpoint, sem alterar emissora/API keys. **948/948 testes passam e o build está OK.**

---

### RISCO / CAUSA

| Item | Antes | SEC-03 |
|------|-------|--------|
| Origem da requisição | Não autenticada | Header Asaas validado |
| Secret | Nenhum | `ASAAS_PAYMENT_WEBHOOK_TOKEN` somente backend |
| Falta de configuração | Processava payload | **503** fail-closed |
| Token ausente/incorreto | Processava payload | **401** antes do core |
| Token correto | Processava payload | Mesmo fluxo atual |
| Criação Supabase / matching | Antes da proteção | Somente após auth |

**Causa:** o handler P4-NB07-CRIT retirou a rota do catch-all preservando intencionalmente o contrato legado sem SEC-03. A rota ficou rápida, porém ainda sem validação de origem.

---

### CONTRATO OFICIAL ASAAS

| Campo | Definição |
|-------|-----------|
| Configuração Asaas | `authToken` do webhook |
| Header recebido | `asaas-access-token` |
| Env backend | `ASAAS_PAYMENT_WEBHOOK_TOKEN` |
| Formato | 32–255 caracteres, sem espaços, forte |
| Proibido | Reutilizar API key Asaas |
| Comparação | SHA-256 + `timingSafeEqual` |
| Sem env/env inválida | HTTP **503** `{error:"webhook_not_configured"}` |
| Header ausente/incorreto | HTTP **401** `{error:"unauthorized"}` |

Referência oficial consultada: documentação Asaas “About webhooks” e “Create new webhook”, que define `authToken` → header `asaas-access-token`.

Nenhum valor de secret é logado ou devolvido na resposta.

---

### FLUXO ATUAL MAPEADO (PRESERVADO)

```text
POST /api/asaas/webhook
  → api/asaas-webhook.ts (Vercel) OU server/routes.ts (Express)
  → verifyAsaasPaymentWebhookRequest()                  [NOVO — antes de side effect]
  → handleAsaasPaymentWebhook()                         [inalterado funcionalmente]
  → evento PAYMENT_RECEIVED | PAYMENT_CONFIRMED
  → matching asaas_payment_id e fallback externalReference/número
  → financial_invoices: status=PAGA, asaas_status=...
  → financial_transactions: PENDING → PAID
  → {received:true}
```

| Cenário autenticado | Resposta/efeito preservado |
|---------------------|----------------------------|
| Body inválido | 200 `{received:true,error}` |
| Evento ignorado | 200 `{received:true}`, zero escrita |
| Ausência de payment | 200 `{received:true}`, zero escrita |
| Payment inexistente | 200 `{received:true}`, zero escrita |
| Erro Supabase | Core lança; handler responde contrato legado 200 com erro |
| Evento válido | Baixa atual |

### EVENTOS

Lista mantida exatamente:

1. `PAYMENT_RECEIVED`
2. `PAYMENT_CONFIRMED`

Nenhum evento adicionado/removido.

---

### IDEMPOTÊNCIA

A idempotência existente foi preservada:

- fatura recebe novamente os mesmos valores `PAGA`/`asaas_status`;
- transação só atualiza se ainda estiver `PENDING`;
- evento duplicado não encontra a transação já `PAID`;
- não há `INSERT` no fluxo;
- teste determinístico entrega o mesmo evento duas vezes e confirma uma única transição da transação.

Nenhuma tabela/coluna de deduplicação foi criada.

---

### TRÊS CONTAS ASAAS

| Conta | Endpoint | Token após configuração |
|-------|----------|-------------------------|
| TM Gestão | `/api/asaas/webhook` | Mesmo authToken dedicado |
| TM Segurança | `/api/asaas/webhook` | Mesmo authToken dedicado |
| TM Security | `/api/asaas/webhook` | Mesmo authToken dedicado |

O core atual não seleciona credencial/conta: correlaciona pagamentos com registros persistidos por `payment.id`/`externalReference`. SEC-03 não altera `issuer_company`, API keys, saldo, PIX, transferências, cobranças, clientes, emissoras ou sync. Os testes das três contas confirmam que o payload chega intacto ao core sem introduzir mistura de emissora.

---

### ARQUIVOS / DIFF

| Arquivo | Alteração | Motivo | Risco |
|---------|-----------|--------|-------|
| `lib/asaasWebhookAuth.ts` | Novo helper backend | Contrato/header/comparação segura | Baixo |
| `api/asaas-webhook.ts` | Auth antes do core | Fail-closed Vercel | Médio (exige ENV/painel) |
| `server/routes.ts` | Mesma auth antes do core | Paridade Express | Médio |
| `lib/asaasWebhookCore.ts` | Injeção de deps para teste + comentário idempotência | Testabilidade; produção mantém defaults | Baixo |
| `scripts/fase3-sec03-webhook.test.ts` | 19 testes novos | Auth, eventos, idempotência, 3 contas | Nulo |
| `scripts/p4-nb07-crit.test.ts` | Adapta contrato legado ao SEC-03 | Regressão P4 | Nulo |
| `scripts/sec-safe-nf-hotfix-guard.test.ts` | Atualiza guarda histórica | NF preservada; PR #262 não reutilizado | Nulo |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Handoff | Continuidade | Nulo |

**Zero diff em:** NF, `FinancialInvoiceControl`, `/api/nf/invoices`, Supabase, Investment, DRE, Diretoria, RH, Ponto, OS, banco, schema, migration, RLS, `vercel.json`, package/dependencies.

---

### TESTES

| Suíte | Resultado |
|-------|-----------|
| SEC-03 + P4-NB07 + guarda NF | **62/62 pass** |
| TS completa | **944/944 pass** |
| React | **4/4 pass** |
| `bash scripts/run-tests.sh` | **948/948 pass**, 60s |
| Baseline anterior | 929/929 |
| Delta | +19 testes SEC-03 |
| Cancelled / skipped / hang | **0 / 0 / 0** |
| `npm run build` | **OK**, 19s |
| Secret no bundle público | **Não encontrado** |
| Supabase público injetado | **Confirmado** |

---

### CONFIGURAÇÃO EXTERNA NECESSÁRIA (NÃO EXECUTADA)

Ordem segura recomendada para evitar interrupção:

1. Gerar secret aleatório forte de 32–255 caracteres, sem espaços e diferente das API keys Asaas.
2. Configurar `ASAAS_PAYMENT_WEBHOOK_TOKEN` no projeto Vercel oficial `sistema-grupo-tm-seg` (ainda sem deploy).
3. Nas três contas Asaas, manter URL/eventos atuais e configurar o **mesmo** valor no campo `authToken`.
4. Confirmar filas/webhooks ativos nas três contas.
5. Só então mergear/deployar PR #273.
6. Validar 503 sem configuração em ambiente controlado, 401 token incorreto e 200 token correto.
7. Confirmar baixa real controlada e preservar saldo/PIX/transferências/cobranças/sync/NF.

Como o código atual ignora esse header, configurar ENV/painéis **antes** do deploy SEC-03 não quebra a produção atual. Publicar o código antes da configuração faria o webhook responder 503/401, portanto é proibido.

---

### ROLLBACK

| Item | Valor |
|------|-------|
| Base funcional | `dfbfc962` |
| Produção | `dfbfc962` |
| Branch SEC-03 | `cursor/fase3-sec03-webhook-eaa8` |
| Commit implementação | `3e417e91` |

Antes de futura publicação, criar tag própria. Em regressão após deploy, reverter somente o commit SEC-03 e redeployar; não alterar banco. Manter authToken configurado no Asaas/Vercel é inofensivo para o código anterior, que ignora o header.

---

### PENDÊNCIAS / PRÓXIMO PASSO

1. Revisão humana do PR #273.
2. Execução separada para configurar ENV e três painéis Asaas.
3. Publicação coordenada + smoke autenticado controlado.
4. Reexecutar P4-FECHAMENTO.

---

## PUBLICAÇÃO P4-LIMPEZA — PR #271 (histórico publicado)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **PR** | [#271](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/271) |
| **Branch** | `cursor/p4-limpeza-eaa8` |
| **HEAD validado** | `5f39ecfc` |
| **Tag** | `baseline-fase3-p4-limpeza-merged-20260816` → `5f39ecfc` |
| **Produção funcional anterior** | `c5a98d7f` |
| **Handoff anterior** | `d8119048` |
| **Produção após deploy** | `buildId=8c559a8c` |
| **builtAt** | `2026-08-16T02:14:58.411Z` |
| **Domínio** | `https://sistema.grupotmseg.com.br` |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |
| **SEC-03 / PR #262** | **Congelados** |

### PROGRESSO

**Programa geral: 78%**

`███████████████░░░░░` (+3% — marco P4-LIMPEZA publicado)

**Fase 3: 94%**

`██████████████████░░` (+3% — bloco P4-LIMPEZA / auditoria órfãos publicada)

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 P4-LIMPEZA PUBLICADO E VALIDADO SEM ALTERAÇÃO FUNCIONAL

### RESUMO SIMPLES

Publicamos o PR #271 com a **auditoria de limpeza** codificada em `scripts/p4-limpeza-audit.test.ts` (19 testes). **Nenhum componente foi removido** — os 12 órfãos comprovados permanecem classificados para decisão futura. Áreas ativas preservadas: `/api/chat`, CostOptimizationDashboard, ExecutiveDashboard. AI Chat continua **inativo intencionalmente** (`FeatureInactivePanel`). Suíte **929/929 pass**. Deploy e smoke confirmam produção estável.

### PONTO DE RETORNO (pré-merge)

| Ref | Commit / buildId |
|-----|------------------|
| `main` / `dev` | `d8119048` |
| Produção (`/api/version`) | `d8119048744d8d84988cc4eec5e2829d2d9094c5` |
| Tag anterior | `baseline-fase3-p4-test-merged-20260816` → `c5a98d7f` |
| Código funcional produção | `c5a98d7f` |

**Rollback:** reset `main` para `d8119048` + redeploy Vercel. Sem alteração de banco.

### DIFF PUBLICADO (2 arquivos — zero produção)

| Arquivo | Tipo |
|---------|------|
| `scripts/p4-limpeza-audit.test.ts` | Teste auditoria (19 casos) |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Handoff |

**Confirmado intacto:** BillingControlCenter, AIChatbot, FeatureInactivePanel, CostOptimizationDashboard, ExecutiveDashboard, `attached_assets/*`.

**Zero diff em:** `components/`, `lib/`, `server/`, `api/`, `vercel.json`, `package.json`.

### TESTES PRÉ-MERGE (@ `5f39ecfc`)

| Suíte | Resultado |
|-------|-----------|
| `p4-limpeza-audit.test.ts` | **19/19 pass** |
| `bash scripts/run-tests.sh` | **929/929 pass** |
| `npm run build` | **OK** |
| Falhas novas | **0** |

### MERGE

1. `cursor/p4-limpeza-eaa8` → `dev` (fast-forward @ `5f39ecfc`)
2. Handoff publicação
3. `dev` → `main` (fast-forward)
4. Push + tag `baseline-fase3-p4-limpeza-merged-20260816`

### SMOKE PRODUÇÃO (pós-deploy @ `8c559a8c`)

| Rota | Esperado | Resultado |
|------|----------|-----------|
| `GET /api/version` | buildId deploy | **200** — `8c559a8c` em 0,05s |
| `GET /api/health` | 200 | **200** `{"status":"ok"}` em 0,07s |
| `GET /` | 200 | **200** em 0,08s |
| `GET /api/nf/invoices` | 401 rápido | **401** em 0,12s |
| `GET /api/supabase/status` | 401 rápido | **401** em 0,07s |
| `GET /api/asaas/payments` | 401 rápido | **401** em 0,06s |
| `GET /api/investment/snapshots-all` | 401/403 rápido | **401** em 0,06s |

**Nenhuma escrita executada.** Código funcional auditado @ `5f39ecfc` (testes/docs). Deploy Vercel `sistema-grupo-tm-seg` confirmado.

### ÓRFÃOS CLASSIFICADOS (mantidos — remoção futura)

12 componentes classe **D** documentados em `p4-limpeza-audit.test.ts`. Prioridade futura: `BillingControlCenter` → bloco IA/Replit → `attached_assets/extracted*`.

### PENDÊNCIAS FORA DO ESCOPO

- **P4-FECHAMENTO** (~2%) — regressão final Fase 3
- **SEC-03** — congelado (PR #262)
- Remoção física dos 12 órfãos — decisão humana

---

## P4-LIMPEZA — ÓRFÃOS, LEGADO (investigação — histórico)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **Branch** | `cursor/p4-limpeza-eaa8` |
| **Base** | `main` @ `d8119048` (pós P4-TEST publicado) |
| **HEAD funcional produção** | `c5a98d7f` (inalterado) |
| **Tag anterior** | `baseline-fase3-p4-test-merged-20260816` |
| **SEC-03 / PR #262** | **Congelados** |

### PROGRESSO

**Programa geral: 75%**

`███████████████░░░░░`

**Fase 3: 91%**

`██████████████████░░`

**Execução atual: 100%**

`████████████████████`

*(Percentuais inalterados — P4-LIMPEZA é auditoria/classificação; marco ~3% pendente merge futuro.)*

### DECISÃO

# 🟢 P4-LIMPEZA CONCLUÍDO SEM REMOÇÕES NECESSÁRIAS

Itens futuros classificados (12 órfãos + 2 snapshots Replit) — remoção adiada por conservadorismo e preservação de histórico.

### RESUMO SIMPLES

Auditamos o backlog histórico de limpeza (BillingControlCenter, AI Chat, dashboards, rotas, legado Replit). **Nenhum bug funcional** foi encontrado. **12 componentes** na raiz de `components/` são **órfãos comprovados** (zero import no app), mas **não foram removidos** — risco baixo de regressão oculta e snapshots `attached_assets/` preservados como evidência. **AI Chat** permanece **inativo de propósito** (`FeatureInactivePanel`); `/api/chat` **continua ativo** (Investment usa). **CostOptimizationDashboard** e **ExecutiveDashboard** são **ativos**. Criamos `scripts/p4-limpeza-audit.test.ts` (19 testes) documentando provas. **Zero alteração funcional.**

---

### INVENTÁRIO CLASSIFICADO (A–G)

| Item | Classe | Rota | Menu | Consumidor | Ação P4-LIMPEZA |
|------|--------|------|------|------------|-----------------|
| **ExecutiveDashboard** | **A** — ativo funcional | via MissionTable | Indireto | MissionTable, e-mail worker | **Manter** |
| **ClientExecutiveDashboard** | **A** | via MissionTable | Indireto | MissionTable | **Manter** |
| **CostOptimizationDashboard** | **B** — ativo incompleto | `cost-optimization` | ✅ Configurações | App.tsx, DiretoriaSistemaTab | **Manter** — utilidade Fase 4 |
| **AI Chat / ai-support** | **C** — inativo intencional | `ai-support` | ❌ | FeatureInactivePanel | **Manter** — P2-01 |
| **AIChatbot.tsx** | **C** | preservado (`void AIChatbot`) | ❌ | Reativação futura | **Manter** |
| **FeatureInactivePanel** | **A** | usado em ai-support | — | App.tsx | **Manter** |
| **`/api/chat`** | **A** | POST requireAuth | — | FinancialAccountManager, AIChatbot | **Manter** |
| **BillingControlCenter** | **D** — órfão comprovado | ❌ `fin-billing-control` | ❌ | Nenhum (subst. ClientBillingReport) | **Manter** — candidato remoção futura |
| **11 outros órfãos raiz** | **D** | ❌ | ❌ | Nenhum | **Manter** — ver tabela abaixo |
| **manual-override-settings** | **B** | ✅ | ❌ menu (banner) | App, ReportsDashboard | **Manter** |
| **attached_assets/extracted** | **G** — legado Replit | — | — | Zero no build | **Manter** — evidência/rollback |
| **attached_assets/extracted2** | **G** | — | — | Zero no build | **Manter** |
| **server/replit_integrations** | removido P3 | — | — | — | **Já limpo** (P3) |

---

### 12 COMPONENTES ÓRFÃOS COMPROVADOS (classe D)

Prova: zero `import ... from './Component'` no app principal (App, components/*, lib/* top-level).

| Arquivo | Importadores | Rota | Menu | Teste | Build | Risco remoção |
|---------|--------------|------|------|-------|-------|---------------|
| `BillingControlCenter.tsx` | 0 | ❌ | ❌ | P2-02, p4-limpeza | OK | Baixo — subst. ClientBillingReport |
| `AIImageGenerator.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo — IA experimental |
| `ApiStatusOverlay.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo — return null |
| `BillingAuditor.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo |
| `BiometricLogin.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Médio — auth futura? |
| `BrandGenerator.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo |
| `ClientPriceList.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo — abas ClientForm |
| `CloudCostManager.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo |
| `CltTimeClockBar.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Médio — RH alternativo |
| `FinancialAuditor.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo |
| `ProviderCostList.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo — abas ProviderForm |
| `UniversalDataImporter.tsx` | 0 | ❌ | ❌ | p4-limpeza | OK | Baixo |

**Decisão:** nenhum removido nesta execução. Remoção em lote exige revisão humana item a item.

---

### AI CHAT — DETALHE (C inativo intencional)

| Verificação | Resultado |
|-------------|-----------|
| Menu `constants.ts` | ❌ `ai-support` ausente |
| Sidebar | ❌ ausente |
| Rota App | ✅ `FeatureInactivePanel` (não AIChatbot) |
| AIChatbot preservado | ✅ `import` + `void AIChatbot` |
| `/api/chat` backend | ✅ `requireAuth` em routes.ts |
| Outros consumidores API | ✅ `FinancialAccountManager` (Investment) |
| Gemini em outras áreas | ✅ DHL, conciliação, ponto, etc. (inalterado) |

---

### ROTAS ÓRFÃS UI

| Rota | Classificação | Nota |
|------|---------------|------|
| `ai-support` | C — inativo intencional | Sem menu; deep link possível |
| `manual-override-settings` | B — sub-tela | Acesso via banner/evento |
| Sub-rotas `-form`, `new-mission` | A — navegação interna | Esperado |

**Rotas backend sem UI:** webhooks, crons, admin — classificadas **ATIVA EXTERNA/ADMIN** — **não investigadas para remoção**.

---

### REMOÇÕES EXECUTADAS

**Nenhuma.** Diff = somente `scripts/p4-limpeza-audit.test.ts` + handoff.

---

### TESTES (@ branch `cursor/p4-limpeza-eaa8`)

| Suíte | Resultado |
|-------|-----------|
| `p4-limpeza-audit.test.ts` | **19/19 pass** (novo) |
| `bash scripts/run-tests.sh` | **929/929 pass** (925 TS + 4 React) |
| Baseline anterior | 910/910 |
| Delta | +19 testes auditoria (zero falha nova) |
| `npm run build` | **OK** |

---

### DIFF FINAL

| Arquivo | Ação | Motivo | Risco |
|---------|------|--------|-------|
| `scripts/p4-limpeza-audit.test.ts` | **Criado** | Provas de orfandade/classificação | Nulo |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | **Atualizado** | Handoff P4-LIMPEZA | Nulo |

**Zero diff funcional.**

---

### ITENS FUTUROS (pós-revisão humana)

1. Remover `BillingControlCenter.tsx` (+ atualizar P2-02 test) — prioridade 1
2. Bloco IA/Replit órfãos (AIImageGenerator, BrandGenerator, UniversalDataImporter, CloudCostManager) — prioridade 2
3. Avaliar remoção `attached_assets/extracted*` (~220 arquivos) — prioridade 3 (preservar logo `.png` e seeds)
4. Decisão produto: reativar ou remover definitivamente AI Chat

### PRÓXIMO PASSO

Revisão humana → merge branch → publicação separada. **Não iniciar P4-FECHAMENTO nesta execução.**

---

## PUBLICAÇÃO P4-TEST — PR #270 (histórico publicado)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **PR** | [#270](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/270) |
| **Branch** | `cursor/p4-test-eaa8` |
| **HEAD validado (funcional)** | `c5a98d7f` |
| **HEAD handoff publicação** | `c48e331b` |
| **Tag** | `baseline-fase3-p4-test-merged-20260816` → `c5a98d7f` |
| **Produção anterior** | `buildId=412bf51c` |
| **Produção após** | `buildId=c48e331b` |
| **builtAt** | `2026-08-16T01:45:13.366Z` |
| **Domínio** | `https://sistema.grupotmseg.com.br` |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |
| **SEC-03 / PR #262** | **Congelados** |

### PROGRESSO

**Programa geral: 75%**

`███████████████░░░░░` (+3% — marco P4-TEST publicado)

**Fase 3: 91%**

`██████████████████░░` (+3% — bloco P4-TEST / suíte CI limpa)

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 P4-TEST PUBLICADO E VALIDADO — SUÍTE LIMPA

### RESUMO SIMPLES

Publicamos o PR #270 com correções **somente em testes e harness** — nenhuma funcionalidade alterada. Os 6 baselines desatualizados (investment-accounts, invoice-display, presence-refresh, zapi-sdk-cockpit, dhl-intake-render ×2) foram alinhados ao comportamento real de produção. O hang do NB-06 (subteste `getApp()` deixando `setInterval` abertos) foi resolvido removendo o runtime test redundante. A suíte completa passa **910/910** (`run-tests.sh`). Deploy e smoke confirmam produção estável — rotas protegidas continuam com 401 rápido.

### PONTO DE RETORNO (pré-merge)

| Ref | Commit / buildId |
|-----|------------------|
| `main` / `dev` | `412bf51c` |
| Produção (`/api/version`) | `412bf51cb335d1a3b9cf4ce7e9401ba287b46276` |
| Tag anterior | `baseline-fase3-p4-sync-merged-20260816` → `7dc3b059` |

**Rollback:** reset `main` para `412bf51c` + redeploy Vercel. Sem alteração de banco.

### DIFF PUBLICADO (7 arquivos — zero produção)

| Arquivo | Tipo |
|---------|------|
| `scripts/investment-accounts.test.ts` | Teste |
| `scripts/invoice-display.test.ts` | Teste |
| `scripts/presence-refresh.test.ts` | Teste |
| `scripts/zapi-sdk-cockpit.test.ts` | Teste |
| `scripts/dhl-intake-render.test.tsx` | Teste |
| `scripts/nb06-migration-routes.test.ts` | Harness |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | Handoff |

**Confirmado:** nenhum diff em `components/`, `lib/`, `server/`, `api/`, `vercel.json`.

### TESTES PRÉ-MERGE (@ `c5a98d7f`)

| Suíte | Resultado |
|-------|-----------|
| `bash scripts/run-tests.sh` | **910/910 pass** (906 TS + 4 React) |
| `npm run build` | **OK** |
| Falhas novas | **0** |

### MERGE

1. `cursor/p4-test-eaa8` → `dev` (fast-forward)
2. Handoff publicação
3. `dev` → `main` (fast-forward)
4. Push + tag `baseline-fase3-p4-test-merged-20260816`

### SMOKE PRODUÇÃO (pós-deploy @ `c48e331b`)

| Rota | Esperado | Resultado |
|------|----------|-----------|
| `GET /api/version` | buildId deploy | **200** — `c48e331b` em 0,05s |
| `GET /api/health` | 200 | **200** `{"status":"ok"}` em 0,07s |
| `GET /` | 200 | **200** em 0,09s |
| `GET /api/nf/invoices` | 401 rápido | **401** em 0,13s |
| `GET /api/supabase/status` | 401 rápido | **401** em 0,07s |
| `GET /api/asaas/payments` | 401 rápido | **401** em 0,06s |
| `GET /api/investment/snapshots-all` | 401/403 rápido | **401** em 0,06s |

**Nenhuma escrita executada.** Código funcional publicado @ `c5a98d7f` (testes/harness). Deploy Vercel `sistema-grupo-tm-seg` confirmado.

### PENDÊNCIAS FORA DO ESCOPO

- **P4-LIMPEZA** — órfãos / decisões feature
- **SEC-03** — congelado (PR #262)
- **P4-FECHAMENTO** — regressão final Fase 3 (~2%)

---

## P4-TEST — LIMPEZA E CLASSIFICAÇÃO (investigação — histórico)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **Branch** | `cursor/p4-test-eaa8` |
| **Base** | `main` @ `412bf51c` (pós P4-SYNC publicado) |
| **Produção funcional** | `7dc3b059` (inalterada) |
| **Tag anterior** | `baseline-fase3-p4-sync-merged-20260816` |
| **SEC-03 / PR #262** | **Congelados** |

### PROGRESSO

**Programa geral: 72%**

`██████████████░░░░░░`

**Fase 3: 88%**

`██████████████████░░`

**Execução atual: 100%**

`████████████████████`

*(Percentuais Fase 3 não alterados — P4-TEST é investigação/correção de CI, marco ~3% pendente de merge.)*

### DECISÃO

# 🟢 P4-TEST APTO PARA REVISÃO/MERGE

**Zero mudança funcional.** Todas as correções foram em arquivos `*.test.ts` / `*.test.tsx` (harness). Produção, NF, Investment, RH, DRE, Asaas, Supabase **não alterados**.

### RESUMO SIMPLES

Reexecutamos a suíte completa na `main` atual. Antes havia **4 falhas TS** + **2 falhas React** + **hang NB-06** (processo não encerrava após `getApp()`). Todas eram **testes desatualizados ou harness**, não bugs de produção. `receivable-desc-nf` **já estava corrigido** no P4-SYNC (confirmado 3/3 pass). Após alinhar os 6 testes e remover o subteste `getApp` que deixava `setInterval` abertos, a suíte fecha **906/906 TS + 4/4 React** em ~56s, sem hang.

---

### BASELINE ANTES (reexecução @ `412bf51c`, pré-correção)

| Suíte | Total | Pass | Fail | Cancelled | Duração |
|-------|-------|------|------|-----------|---------|
| TS (`scripts/*.test.ts` excl. hang) | 888 | 884 | **4** | 0 | ~55s |
| TS completa com nb06 | — | — | — | **hang** | >200s (processo não exit) |
| React (`*.test.tsx`) | 4 | 2 | **2** | 0 | ~1,5s |

**Falhas TS (nome exato):**

1. `investment-accounts.test.ts` — `Vercel tem funções leves para CRUD de contas`
2. `invoice-display.test.ts` — `tela dispara sync de pagamentos e retry NF`
3. `presence-refresh.test.ts` — `registerTimeClockPunch dispara requestPresenceRefresh após inserir`
4. `zapi-sdk-cockpit.test.ts` — `DashboardDiretoria não renderiza a seção Detalhe do em aberto`

**Falhas React:**

5. `dhl-intake-render.test.tsx` — `isDhl=false` e `isDhl=true` (etapa Veículo)

**Hang:**

6. `nb06-migration-routes.test.ts` — subteste `getApp()` deixa workers `setInterval` de `registerRoutes` abertos → runner não encerra

**Confirmado fora da lista:** `receivable-desc-nf.test.ts` **3/3 pass** (P4-SYNC).

---

### CLASSIFICAÇÃO INDIVIDUAL (A–F)

| # | Teste | Classificação | Evidência | Comportamento real | Causa | Ação |
|---|-------|---------------|-----------|-------------------|-------|------|
| 1 | investment-accounts | **A** — teste desatualizado | `vercel.json` tem rewrite `investment-accounts-item?id=:id` + handler `api/investment-accounts-item.ts`; entrada explícita em `functions{}` não é obrigatória (auto-descoberta Vercel) | CRUD via rewrite + handlers dedicados OK em prod | Teste exigia `"api/investment-accounts-item.ts"` em `functions{}` | Assert rewrite + handlers |
| 2 | invoice-display | **A** — teste desatualizado | `FinancialInvoiceControl` usa `limit=${limit}` default 15; retry `limit=10` no botão manual e `limit=5` no auto | Sync dinâmico, NF protegida | Teste esperava string fixa `?limit=15` | Assert padrão dinâmico |
| 3 | presence-refresh | **A** — teste desatualizado | Punch primário via `registerTimeClockPunchViaApi` + refresh; fallback Supabase mantém refresh pós-insert | RH/ponto correto em prod | Teste comparava índice global — refresh API vem antes do insert fallback | Assert caminhos API + fallback |
| 4 | zapi-sdk-cockpit | **A** — teste desatualizado | `DashboardDiretoria.tsx` renderiza "Detalhe do em aberto" intencionalmente (linhas 545–596) | Feature ativa no cockpit | Teste negava seção removida antigamente, mas UI foi restaurada | Inverter asserts (presença) |
| 5 | dhl-intake-render | **A** — teste desatualizado | Componente usa `GET /api/dhl-intake-public-get?token=` + `response.text()` | Formulário DHL OK | Mock só tinha `.json()`, sem `.text()` | Mock com `text()` + JSON |
| 6 | nb06 hang | **E** — hang/timeout + **D** — infra | `getApp()` → `registerRoutes` inicia `setInterval` (watchdog, NF retry, e-mail…) | Migration funcional intacta | Subteste runtime redundante com asserts estáticos | Remover `getApp`; asserts estáticos requireAuth |

---

### BASELINE DEPOIS (pós-correção @ branch `cursor/p4-test-eaa8`)

| Suíte | Total | Pass | Fail | Cancelled | Duração |
|-------|-------|------|------|-----------|---------|
| TS completa (`scripts/*.test.ts`) | **906** | **906** | **0** | **0** | **~55,7s** |
| React (`scripts/*.test.tsx`) | **4** | **4** | **0** | **0** | **~1,8s** |
| `bash scripts/run-tests.sh` | **910** | **910** | **0** | **0** | **~56s** |
| `npm run build` | — | **OK** | — | — | ~13s |

**Dívidas restantes:** nenhuma falha injustificada. Hang NB-06 **resolvido** (sem cancelar teste).

---

### DIFF FINAL (somente testes)

| Arquivo | Motivo | Tipo | Risco |
|---------|--------|------|-------|
| `scripts/investment-accounts.test.ts` | Rewrite Vercel vs `functions{}` | Teste | Nulo |
| `scripts/invoice-display.test.ts` | limit dinâmico sync NF | Teste | Nulo |
| `scripts/presence-refresh.test.ts` | punch via API + fallback | Teste | Nulo |
| `scripts/zapi-sdk-cockpit.test.ts` | seção em aberto ativa | Teste | Nulo |
| `scripts/dhl-intake-render.test.tsx` | mock `text()` + endpoint novo | Teste | Nulo |
| `scripts/nb06-migration-routes.test.ts` | remove getApp hang; asserts estáticos | Harness | Nulo |

**Zero diff em:** `components/`, `lib/`, `server/`, `api/`, `vercel.json`, NF, Investment, Asaas, Supabase, DRE, RH runtime.

---

### ÁREAS PROTEGIDAS (confirmado)

Asaas, webhook, SEC-03, PR #262, NF, FinancialInvoiceControl, Supabase NB-07, Investment, P4-NB07, DRE, `computeCanonicalRevenueCost`, OS mãe/filha, banco, schema, migration, ENV, RLS — **intocados**.

### PRÓXIMO PASSO

Revisão humana → merge `cursor/p4-test-eaa8` → publicação separada (fora desta execução).

---

## PUBLICAÇÃO P4-SYNC CONSOLIDADO — PR #268 + PR #269 (histórico publicado)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **Relação Git** | **Caso A** — `#269` contém `#268` integralmente |
| **Base comum** | `563e58b2` (main/dev pós P4-NB07-CRIT) |
| **HEAD #268** | `c359bb97` (`cursor/p4-sync-eaa8`) |
| **HEAD #269** | `2b2e64ce` (`cursor/p4-sync-dre-eaa8`) |
| **Commits extras em #269** | `bd8f2988`, `758e051f`, `2b2e64ce` |
| **Commits em #268 não em #269** | **nenhum** |
| **Estratégia merge** | **Somente #269** → `dev` → `main` (evita duplicação) |
| **PR #268** | [#268](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/268) — incluído via #269 |
| **PR #269** | [#269](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/269) — branch mergeada |
| **Tag** | `baseline-fase3-p4-sync-merged-20260816` → `7dc3b059` |
| **Produção anterior** | `06e0dd88` (P4-NB07-CRIT) |
| **Produção após** | `buildId=7dc3b059` |
| **builtAt** | `2026-08-16T01:14:40.582Z` |
| **Domínio** | `https://sistema.grupotmseg.com.br` |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |
| **SEC-03** | **Congelado — não publicado** |

### PROGRESSO

**Programa geral: 72%**

`██████████████░░░░░░` (+4% — marco P4-SYNC publicado; delta proporcional)

**Fase 3: 88%**

`█████████████████░` (+4% — bloco P4-SYNC / P4-SYNC-DRE publicado)

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 P4-SYNC CONSOLIDADO E PUBLICADO SEM ALTERAÇÃO FUNCIONAL

### RESUMO SIMPLES

Consolidamos PR #268 (teste receivable-desc-nf alinhado ao SSOT quinzena) e PR #269 (formalização regra DRE × Diretoria + testes semânticos) em **uma única publicação**. A relação Git comprovou que **#269 já contém #268** — mergeamos apenas #269 para não duplicar commits. O teste NF agora reflete a regra real `resolveClientReceivableDescription` (formato quinzena). A regra DRE foi **formalizada por comentário** em `FinancialDRE.tsx`: realizado/consolidado, valores persistidos, `end_time`; Diretoria permanece gerencial com `computeCanonicalRevenueCost` e `start_time`. **Nenhuma mudança funcional financeira** — diff funcional de `FinancialDRE.tsx` = zero (só comentário). NF, Asaas, Supabase, Investment, P4-NB07 e motor canônico **não foram tocados**.

### ANCESTRALIDADE GIT (comprovação caso A)

```
563e58b2 (main pós NB-07-CRIT)
    └── 748db7bf test(p4-sync): receivable-desc-nf SSOT quinzena     ← #268
        └── c359bb97 docs: handoff P4-SYNC                            ← #268 HEAD
            └── bd8f2988 test(p4-sync-dre): auditoria DRE             ← #269
                └── 758e051f docs: handoff P4-SYNC-DRE
                    └── 2b2e64ce docs: formaliza regra DRE            ← #269 HEAD = dev/main
```

| Verificação | Resultado |
|-------------|-----------|
| `#268` ancestral de `#269`? | **Sim** |
| Commits exclusivos #268 | **0** (todos em #269) |
| `FinancialDRE.tsx` diff funcional vs main | **Zero** (apenas comentário `REGRA OFICIAL`) |
| Duplicação de testes/handoff? | **Evitada** (merge único #269) |

### COMMITS INTEGRADOS (5)

| Commit | Conteúdo |
|--------|----------|
| `748db7bf` | `receivable-desc-nf.test.ts` alinhado SSOT quinzena |
| `c359bb97` | Handoff P4-SYNC investigação |
| `bd8f2988` | `p4-sync-dre-audit.test.ts` (CASO 1–6) |
| `758e051f` | Handoff P4-SYNC-DRE auditoria |
| `2b2e64ce` | Comentário regra oficial + handoff formalização |

### MERGE

1. `origin/cursor/p4-sync-dre-eaa8` → `dev` (fast-forward @ `2b2e64ce`)
2. Handoff consolidação (este documento)
3. `dev` → `main` (fast-forward)
4. Push `main` + `dev` + tag `baseline-fase3-p4-sync-merged-20260816`

**PR #268 não mergeado separadamente** — conteúdo já incluído via #269.

### TESTES PRÉ-MERGE (HEAD `2b2e64ce`)

| Suíte | Resultado |
|-------|-----------|
| `p4-sync-dre-audit.test.ts` | **20/20 pass** |
| `receivable-desc-nf.test.ts` | **pass** (SSOT quinzena) |
| Escopo P4-SYNC + P4-SYNC-DRE + P0–P3 + P4-NB07 + NF + Asaas + SEC + NB07 | **251/251 pass** |
| `npm run build` | **OK** |
| Falhas novas | **0** |

### SMOKE PRODUÇÃO (pós-deploy @ `7dc3b059`)

| Rota | Esperado | Resultado |
|------|----------|-----------|
| `GET /api/version` | buildId `7dc3b059` | **200** — `7dc3b059` em 0,10s |
| `GET /api/health` | 200 | **200** `{"status":"ok"}` em 0,10s |
| `GET /` | 200 | **200** em 0,10s |
| `GET /api/nf/invoices` (sem auth) | 401 rápido | **401** em 0,12s |
| `GET /api/supabase/status` (sem auth) | 401 rápido | **401** em 0,08s |
| `GET /api/asaas/payments` (sem auth) | 401 rápido | **401** em 0,07s |
| `GET /api/investment/snapshots-all` (sem auth) | 401/403 rápido | **401** em 0,07s |

**Nenhuma escrita executada.** Rotas protegidas preservadas. Deploy Vercel `sistema-grupo-tm-seg` confirmado.

### ÁREAS PROTEGIDAS (confirmado)

Asaas, webhook, SEC-03, PR #262, NF, Supabase, Investment, P4-NB07, `computeCanonicalRevenueCost`, motor canônico funcional, banco, schema, migration, ENV, RLS — **zero diff funcional**.

### PENDÊNCIAS FORA DO ESCOPO (não iniciadas)

- **P4-TEST** — 5 falhas baseline TS (+ nb06 hang)
- **SYNC-07** — realtime refresh duplicado (performance)
- **SYNC-02** — fallback fornecedor (inconclusivo)
- **SYNC-03** — DRE canônico completo (dívida arquitetural; regra formalizada, sem fix)
- **SEC-03** — congelado

---

## P4-SYNC-DRE — FORMALIZAÇÃO DA REGRA OFICIAL (pré-publicação — histórico)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **Branch** | `cursor/p4-sync-dre-eaa8` |
| **PR investigação** | [#269](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/269) — draft |
| **PR receivable** | [#268](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/268) — draft (independente) |
| **Produção** | `06e0dd88` (inalterada) |

### PROGRESSO

**Programa geral: 68%** — `██████████████░░░░░░`

**Fase 3: 84%** — `█████████████████░░░`

**Execução atual: 100%** — `████████████████████`

### DECISÃO OFICIAL DE NEGÓCIO

| Tela | Finalidade | Fonte | Período | Estimativa |
|------|------------|-------|---------|------------|
| **FinancialDRE** | Realizado / consolidado | Valores **persistidos** (`revenue_value`, `cost_value`, `displacement_*`, `toll_*`) | **`end_time`** | **Não** — sem derivar KM nem canônico |
| **Dashboard Diretoria** | Gerencial / operacional | **`computeCanonicalRevenueCost`** | **`start_time`** | **Sim** — `official` / `estimated` / `needs_validation` |

**Diferença intencional.** Não alinhar conjuntos nem semânticas entre telas.

### DECISÃO TÉCNICA

# 🟢 REGRA DRE FORMALIZADA — SEM ALTERAÇÃO FINANCEIRA NECESSÁRIA

O código atual **já respeitava** a regra. Nenhuma violação comprovada. Alterações desta execução: **comentário técnico** em `FinancialDRE.tsx` + **7 testes semânticos** (CASO 1–6) — **zero mudança de comportamento**.

### O QUE FOI FEITO

1. Comentário `REGRA OFICIAL (P4-SYNC-DRE)` em `components/FinancialDRE.tsx`.
2. Testes CASO 1–6 em `scripts/p4-sync-dre-audit.test.ts` (20 testes totais no arquivo).
3. Confirmação: DRE **não** importa/chama `computeCanonicalRevenueCost`, `resolveDisplacementFromAuthorizedKm` nem `calculateMissionFinancials`.

### CASOS PROVADOS (testes)

| Caso | Resultado |
|------|-----------|
| 1 — OS oficial persistida | DRE usa `revenue_value`/`cost_value`/etc. |
| 2 — KM sem displacement | Canônico deriva; DRE **não** |
| 3 — OS Pendente | Fora filtro DRE; canônico `estimated` |
| 4 — needs_validation | DRE receita 0 se não persistida |
| 5 — filha same_os | custo/pedágio/desloc. forn. = 0 |
| 6 — período | `end_time` DRE ≠ `start_time` Diretoria (intencional) |

### TESTES

| Suíte | Resultado |
|-------|-----------|
| `p4-sync-dre-audit.test.ts` | **20/20 pass** |
| Escopo P4-SYNC-DRE + P0–P3 + P4 + NF + SEC + NB07 | **170/170 pass** |
| `npm run build` | **OK** |
| Falhas novas | **0** |

### PRs — RECOMENDAÇÃO (sem merge nesta execução)

| PR | Conteúdo | Recomendação |
|----|----------|--------------|
| **#268** | Teste `receivable-desc-nf` alinhado ao SSOT quinzena | **Mergeável isoladamente** (só teste + handoff P4-SYNC) |
| **#269** | Auditoria DRE + formalização regra + comentário + testes | **Mergeável após revisão** — sem alteração financeira funcional |
| Consolidar? | Não obrigatório | Branches distintas; #268 não depende de #269 |

### ÁREAS PROTEGIDAS

Zero alteração funcional em: Asaas, SEC-03, NF, Supabase, Investment, P4-NB07, motor canônico, schema, ENV.

---

## P4-SYNC-DRE — AUDITORIA CANÔNICA FINANCEIRA (investigação anterior)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | GPT-5.6 Sol Medium |
| **Branch** | `cursor/p4-sync-dre-eaa8` |
| **HEAD desta execução** | `bd8f2988` (+ handoff docs) |
| **PR #268** | Draft — **não alterado** (receivable test isolado) |
| **Produção funcional** | `06e0dd88` (inalterada) |
| **SEC-03** | **Congelado** |

### PROGRESSO

**Programa geral: 68%** — `██████████████░░░░░░`

**Fase 3: 84%** — `█████████████████░░░`

**Execução atual: 100%** — `████████████████████`

### DECISÃO

# 🟡 DIVERGÊNCIA CONFIRMADA — REQUER DECISÃO DE REGRA

**Nenhum código financeiro alterado.** Para OS **oficiais aprovadas com valores persistidos**, DRE e canônico **coincidem**. Divergências reais existem em **deslocamento derivado por KM**, **eixo de período** (`end_time` vs `start_time`), **filtro de status** e **semântica de estimativa** — exigem decisão humana antes de corrigir `FinancialDRE`.

### RESUMO SIMPLES

O DRE soma hoje `revenue_value`, pedágio via `resolveStored*Toll` e deslocamento **bruto** do banco, filtrando missões por `end_time` e status Concluída/Faturada. A Diretoria usa `computeCanonicalRevenueCost`, que aplica `valueStatus` (official/estimated/needs_validation), pode **derivar deslocamento** de KM autorizado e filtra por `start_time`. Quando a OS já está aprovada com tudo salvo, os números batem. Quando há KM sem displacement salvo, o canônico inclui deslocamento e o DRE não. Quando a OS não está oficial, o canônico marca `estimated` e o DRE só mostra o que está persistido (ou zero). **Nada foi alterado em produção.**

---

### COMO O FINANCIALDRE CALCULA (mapeamento)

| Conceito | Função/campo | Tabela | Filtro |
|----------|--------------|--------|--------|
| Receita missões | `Σ revenue_value` | `missions` | status ∈ Concluída/Faturada; `end_time` no período |
| Pedágio cliente | `Σ resolveStoredClientToll(toll_value, toll_value_provider)` | `missions` | idem |
| Deslocamento cliente | `Σ displacement_value` | `missions` | idem |
| Custo fornecedor | `Σ cost_value` onde `is_same_os ≠ true` | `missions` | idem |
| Pedágio fornecedor | `Σ resolveStoredProviderToll(..., is_same_os)` | `missions` | idem |
| Deslocamento fornecedor | `Σ displacement_value_provider` (0 se filha) | `missions` | idem |
| Lucro/margem | receita bruta − deduções − custos variáveis − fixas | + `financial_transactions` PAID | `due_date` no período |
| **Não usa** | `computeCanonicalRevenueCost` | — | — |

### COMO A DIRETORIA CALCULA

| Conceito | Função | Filtro |
|----------|--------|--------|
| Receita/custo/lucro missões | `sumCanonical` → `computeCanonicalRevenueCost` por OS | `filterMissionsByPeriod` por **start_time** |
| valueStatus | `official` / `estimated` / `needs_validation` | fail-closed em aprovada sem oficial |
| Deslocamento | `resolveDisplacementFromAuthorizedKm` | deriva de `dhl_deslocamento_km` se R$ não salvo |

---

### MATRIZ SEMÂNTICA DRE × DIRETORIA

| Conceito | FinancialDRE | Diretoria | Fonte oficial | Diverge? | Risco |
|----------|--------------|-----------|---------------|----------|-------|
| Receita base oficial | `revenue_value` | `revBase` | Persistido + aprovado | **Não** (oficial) | Baixo |
| Pedágio cliente | `resolveStoredClientToll` | `tollRev` (mesma fn) | Persistido | **Não** | Baixo |
| Pedágio fornecedor / filha | `resolveStoredProviderToll` + zera filha | `tollCost` (mesma regra) | P0 homologado | **Não** | Baixo |
| Deslocamento | `displacement_value` bruto | `resolveDisplacementFromAuthorizedKm` | Canônico deriva KM | **Sim** (KM sem R$ salvo) | Médio |
| OS não aprovada | Só persistido (0 se vazio) | `estimated` / estimativa | Canônico | **Semântico** | Médio |
| Aprovada sem receita | receita 0 | `needs_validation`, rev 0 | Canônico fail-closed | **Não** (números) | Baixo |
| Período | `end_time` | `start_time` | Convenção distinta | **Sim** (conjunto OS) | Médio |
| Status | Concluída/Faturada | Todos (REFUSED→0) | Filtro distinto | **Sim** | Baixo |
| OS filha same_os | custo/pedágio forn. 0 | idem | P0/P1 | **Não** | Baixo |
| OS cancelada | Excluída do DRE | Estimativa se incluída | Regra publicada | **Escopo** | Baixo |

---

### CASOS TESTADOS (`scripts/p4-sync-dre-audit.test.ts`)

| Caso | DRE | Canônico | Diferença | Causa |
|------|-----|----------|-----------|-------|
| Normal aprovada oficial | rev/cost OK | official | 0 | Valores persistidos |
| Filha is_same_os | rev 350, cost 0 | official, cost 0 | 0 | P0 preservado |
| Aprovada sem receita | rev 0 | needs_validation | 0 | Fail-closed |
| KM 50 sem displacement | disp 0 | dispRev/dispCost > 0 | **rev diverge** | Derivação KM só no canônico |
| Não aprovada parcial rev 500 | rev 500 | estimated/mixed | 0 numérico | Semântica valueStatus |
| Lote misto oficial | sum DRE | sumCanonical | 0 | — |

---

### CLASSIFICAÇÃO INTERNA (A/B/C/D)

| Item | Decisão |
|------|---------|
| OS oficial persistida | **A** — consistente, sem correção |
| Deslocamento KM | **D** — regra ambígua: DRE contábil (só salvo) vs canônico operacional (deriva) |
| Estimativa não aprovada | **D** — DRE gerencial vs preview Diretoria |
| Eixo end_time/start_time | **D** — convenção de período distinta |
| Motor canônico | **A** — P0 validado; **não alterar** |

**Não é caso C** (motor canônico). **Correção B** (FinancialDRE → `computeCanonicalRevenueCost`) **não aplicada** — aguarda decisão se DRE deve incluir estimativas e deslocamento derivado.

---

### TESTES

| Suíte | Resultado |
|-------|-----------|
| `p4-sync-dre-audit.test.ts` | **13/13 pass** (novo) |
| P0 + P4 + receivable | **68/68 pass** |
| `npm run build` | **OK** |
| Falhas novas | **0** |

---

### ÁREAS PROTEGIDAS

Zero alteração em: Asaas, webhook, SEC-03, NF, Supabase, Investment, P4-NB07, schema, ENV, `FinancialDRE.tsx`, `missionFinancialsCanonical.ts`.

---

## P4-SYNC — SINCRONISMO RESIDUAL

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **Branch** | `cursor/p4-sync-eaa8` |
| **HEAD desta execução** | `748db7bf` |
| **Base** | `main` @ `563e58b2` (handoff) / funcional `06e0dd88` |
| **Tag baseline anterior** | `baseline-fase3-p4-nb07-crit-merged-20260815` |
| **Produção funcional** | `06e0dd88` (inalterada nesta execução) |
| **SEC-03** | **Congelado** |

### PROGRESSO

**Programa geral: 68%**

`██████████████░░░░░░`

**Fase 3: 84%**

`█████████████████░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟡 P4-SYNC COM PENDÊNCIAS

Investigação concluída. **Uma correção mínima** (teste `receivable-desc-nf` alinhado ao SSOT quinzena). **DRE canônico completo** e **realtime duplicado** classificados como **dívida futura** — fora do escopo desta execução (sem refatoração de motor). **Não mergeado / não publicado.**

### RESUMO SIMPLES

Revisamos os sincronismos residuais citados no mapa Fase 3. A falha `receivable-desc-nf` **não era bug de produção**: o código já sincroniza Contas a Receber com o formato quinzena (`Ref. a primeira quinzena de …`) via `resolveClientReceivableDescription`; só o teste estava desatualizado e foi corrigido. OS mãe/filha (`is_same_os`), fornecedor, Diretoria e P0–P3 **permanecem corretos** nos testes existentes. O DRE ainda soma `revenue_value` direto (não usa `computeCanonicalRevenueCost` no agregado) — isso é **dívida arquitetural conhecida**, não regressão nova. Realtime dispara `refreshMissions` 2× no flush — **performance**, sem evidência de inconsistência de dados. NF, Asaas, Supabase, Investment e P4-NB07 **não foram tocados**.

---

### BACKLOG SYNC — CLASSIFICAÇÃO

| ID | Problema | Evidência atual | Arquivo(s) | Consumidor | Status | Ainda existe? | Risco |
|----|----------|-----------------|------------|------------|--------|---------------|-------|
| SYNC-01 | receivable-desc-nf | Teste esperava texto integral; SSOT quinzena em `receivableDescription.ts` | `lib/persistAsaasChargeInvoice.ts`, `lib/billing/receivableDescription.ts` | persist NF, ClientBillingReport, Asaas charge | **TESTE DESATUALIZADO** → **CORRIGIDO** | Não (teste alinhado) | Baixo |
| SYNC-02 | P1-07 fallback fornecedor | Backlog Raio-X opaco; `mission-billing-audit` cobre snapshot órfão; `is_same_os` homologado P1/P2 | `lib/financialUtils.ts`, `VendorVerificationControl.tsx` | Controle fornecedor, audit | **INCONCLUSIVO** | Sem bug reproduzível | Médio |
| SYNC-03 | DRE canônico completo | `FinancialDRE` soma `revenue_value` manual; Diretoria usa `computeCanonicalRevenueCost` | `FinancialDRE.tsx`, `missionFinancialsCanonical.ts` | DRE vs Dashboard Diretoria | **DÍVIDA** | Sim (gap conhecido pré-P0) | Médio |
| SYNC-04 | OS → faturamento | P0-02 pedágio filha OK; charts usam `calculateMissionFinancials` | `ClientBillingReport.tsx`, `financialUtils.ts` | Faturamento | **RESOLVIDO** (P0/P1) | Parcial vs SSOT canônico | Baixo |
| SYNC-05 | OS → fornecedor | `is_same_os` custo/pedágio zero em modal, vendor, routes | `MissionFinancialModal`, `VendorVerificationControl` | Fornecedor | **RESOLVIDO** | Não | Baixo |
| SYNC-06 | Financeiro → Diretoria | KPIs via `dashboardDiretoria/aggregations` + canônico | `lib/dashboardDiretoria/` | Cockpit Diretoria | **RESOLVIDO** | Divergência vs DRE (SYNC-03) | Baixo |
| SYNC-07 | Realtime refresh duplicado | `RealtimeProvider` flush: `refreshMissions` até 2× | `lib/RealtimeProvider.tsx` | MissionTable, dashboards | **DÍVIDA** (performance) | Sim | Baixo |

---

### ÁRVORE DE SINCRONISMO (validação conceitual)

```
OS (missions)
  ↓ campos persistidos: revenue_value, cost_value, toll_*, is_same_os
Faturamento (ClientBillingReport)
  ↓ calculateMissionFinancials + resolveStored*Toll
Contas a Receber
  ↓ resolveClientReceivableDescription (SSOT quinzena) ← SYNC-01 corrigido no teste
Contas a Pagar / Fornecedor (VendorVerificationControl)
  ↓ is_same_os → custo/pedágio 0 (P1/P2 homologado)
NF (FinancialInvoiceControl — protegida, não tocada)
DRE (FinancialDRE — soma manual, DÍVIDA SYNC-03)
Diretoria (computeCanonicalRevenueCost — SSOT canônico)
```

| Ligação | Fonte da verdade | Campo chave | Evento | Cache/refetch | Risco |
|---------|------------------|-------------|--------|---------------|-------|
| OS → recebível | `resolveClientReceivableDescription` | quinzena em notes/serviceDescription | emissão NF/cobrança | persist servidor | Baixo (OK) |
| OS → KPI Diretoria | `computeCanonicalRevenueCost` | billing_approved, is_same_os | load dashboard | realtime 10 tabelas | Baixo |
| OS → DRE | `revenue_value` + `resolveStored*Toll` | end_time, status | generateDRE + realtime | refetch manual | Médio (vs Diretoria) |
| missions UPDATE | RealtimeProvider | flush debounced | refreshMissions 1–2× | duplicado performance | Baixo inconsistência |

---

### CORREÇÃO APLICADA

| Causa | Arquivo | Consumidor | Impacto | Correção |
|-------|---------|------------|---------|----------|
| Teste esperava texto integral da NF; produto adotou formato quinzena (documentado em `persistAsaasChargeInvoice`) | `scripts/receivable-desc-nf.test.ts` | CI/regressão | Nenhum em produção | Assert `Ref. a primeira quinzena de Julho/2026` + nega prefixo NF TMSEG |

**Não alterado:** `FinancialInvoiceControl`, `/api/nf/invoices`, `transformFinancialInvoicesForControl()`, Asaas, SEC-03, Supabase, Investment, schema.

---

### TESTES

| Suíte | Resultado | Δ vs baseline |
|-------|-----------|---------------|
| P4-SYNC escopo (receivable + fase3 P0–P3 + P4 + NB07 + SEC + NF + Diretoria + audit) | **195/195 pass** | receivable-desc-nf: fail→pass |
| `npm run build` | **OK** | — |
| React (`*.test.tsx`) | **4 total / 2 pass / 2 fail** | baseline DHL (inalterado) |
| TS completa | não reexecutada (hang NB-06 conhecido) | 0 falhas novas no escopo |

**Falhas baseline restantes (4):** investment-accounts, invoice-display, presence-refresh, zapi/cockpit (+ nb06 hang).

---

### PENDÊNCIAS P4-SYNC (não bloqueantes nesta execução)

1. **SYNC-03** — Migrar agregação `FinancialDRE` para `computeCanonicalRevenueCost` / `sumCanonical` (refatoração; requer bloco dedicado).
2. **SYNC-07** — Deduplicar `refreshMissions` no flush do RealtimeProvider (performance).
3. **SYNC-02** — Especificar gap P1-07 fornecedor com caso reproduzível ou fechar como resolvido.

---

### ÁREAS PROTEGIDAS (confirmado — zero diff funcional)

Asaas, webhook, SEC-03, NF, Supabase NB-07, Investment, P4-NB07, PIX, transferências, cobranças, banco, schema, RLS.

---

## PUBLICAÇÃO PR #267 — P4-NB07-CRIT

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **PR** | [#267](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/267) |
| **HEAD validado pré-merge** | `1bff03a3` |
| **Commit publicado (`main`)** | `06e0dd88` |
| **Commit imediatamente anterior (`main`)** | `2f2a577a` |
| **`dev` antes** | `58384585` |
| **`dev` após** | `06e0dd88` |
| **Tag rollback** | `baseline-fase3-p4-nb07-crit-merged-20260815` → `06e0dd88` |
| **Produção antes** | `buildId=2f2a577a` (handoff NB-07 funcional: `d39d0309`) |
| **Produção após** | `buildId=06e0dd88` |
| **builtAt** | `2026-08-16T00:59:25.758Z` |
| **Domínio** | `https://sistema.grupotmseg.com.br` |
| **Projeto Vercel** | `sistema-grupo-tm-seg` |
| **SEC-03** | **Congelado — não publicado** |

### PROGRESSO

**Programa geral: 68%**

`█████████████░░░░░░░` (+3% — marco P4 publicado; delta proporcional ao +6% Fase 3)

**Fase 3: 84%**

`████████████████░░░░` (+6% — bloco NB-07-CRIT / P4 publicado)

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 P4-NB07-CRIT PUBLICADO E VALIDADO

### RESUMO SIMPLES

O sistema publicou handlers Vercel dedicados para as quatro rotas Asaas que antes caíam no catch-all Express (~5 min / 504). Sem autenticação, as rotas privadas passaram de timeout (~35s+) para **401 em &lt;0,22s**. O webhook responde **405** em GET em **~0,14s** (fora do catch-all); POST com body inválido retorna `{received:true}` sem efeito financeiro. NF, Supabase e Investment continuam com **401 rápido**. Nenhuma cobrança, PIX, transferência, sync real ou DELETE real foi executada. **SEC-03 continua pendente** (sem token webhook).

### PONTO DE RETORNO (pré-merge)

| Ref | Commit |
|-----|--------|
| `main` | `2f2a577a` |
| `dev` | `58384585` |
| Produção (`/api/version`) | `2f2a577a` |
| Tag anterior | `baseline-fase3-nb07-supabase-merged-20260815` |

**Rollback:** `git revert` ou reset `main` para `2f2a577a` + redeploy Vercel. Sem alteração de banco.

### MERGE

1. `cursor/p4-nb07-crit-eaa8` → `dev` (conflito só em handoff — resolvido preservando histórico)
2. `dev` → `main` (fast-forward)
3. Push `main` + `dev` + tag `baseline-fase3-p4-nb07-crit-merged-20260815`

**Código funcional:** commits `2d745324`, `b647dfff`, `1bff03a3` incluídos no histórico publicado.

### TESTES PRÉ-MERGE (HEAD `1bff03a3`)

| Suíte | Resultado |
|-------|-----------|
| P4-NB07-CRIT | **36/36 pass** |
| Escopo ampliado (P4+Asaas+NB07+SEC+P0–P3+faturas) | **242/242 pass** |
| `npm run build` | **OK** |
| Falhas novas | **0** |

### SMOKE PRODUÇÃO — ANTES × DEPOIS

| Rota | Antes (`2f2a577a`) | Depois (`06e0dd88`) |
|------|-------------------|---------------------|
| `GET /api/asaas/payments` (sem auth) | timeout ~35s | **401** em 0,22s |
| `GET /api/asaas/payment/test-id` | timeout ~35s | **401** em 0,08s |
| `POST /api/asaas/sync-open-payments` | timeout ~35s | **401** em 0,10s |
| `DELETE /api/asaas/payment/test-id` | timeout ~35s | **401** em 0,06s |
| `GET /api/asaas/webhook` | timeout ~35s | **405** em 0,14s |
| `POST /api/asaas/webhook` body inválido | — | **200** `{received:true}` em 0,12s |
| `GET /api/health` | 200 | **200** em 0,07s |
| `GET /` | — | **200** em 0,08s |
| `GET /api/nf/invoices` | 401 em 0,09s | **401** em 0,09s |
| `GET /api/supabase/status` | 401 em 0,06s | **401** em 0,09s |
| `GET /api/investment/snapshots-all` | 401 em 0,10s | **401** em 0,13s |

### QUATRO ROTAS PUBLICADAS

| Rota | Handler | Auth | Smoke |
|------|---------|------|-------|
| `POST /api/asaas/webhook` | `api/asaas-webhook.ts` | Sem auth (legado) | 405 GET / 200 POST seguro |
| `POST /api/asaas/sync-open-payments` | `api/asaas-sync-open-payments.ts` | financeiro+ | 401 sem token |
| `GET /api/asaas/payments` | `api/asaas-payments.ts` | financeiro+ | 401 sem token |
| `GET/DELETE /api/asaas/payment/:id` | `api/asaas-payment.ts` | financeiro+ / admin+ | 401 sem token |

**WEBHOOK FORA DO CATCH-ALL — SEC-03 AINDA PENDENTE**

### ÁREAS PROTEGIDAS (confirmado)

- NF, FinancialInvoiceControl, `/api/nf/invoices` — intactos; 401 rápido
- Supabase NB-07 — intacto; 401 rápido
- Investment — intacto; 401 rápido
- Três contas Asaas — sem alteração ENV/keys/webhooks
- SEC-03 — congelado; sem `ASAAS_PAYMENT_WEBHOOK_TOKEN`

### SEGURANÇA PÓS-DEPLOY

- Nenhuma ENV nova
- Nenhuma key exposta em responses testadas
- Auth fail-closed nas rotas privadas (401 antes de Asaas)

---

## CORREÇÃO DE PARIDADE PR #267 — P4-NB07-CRIT (pré-publicação)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-16 (UTC) |
| **Modelo Cursor** | Composer 2.5 |
| **PR** | [#267](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/267) — draft |
| **Branch** | `cursor/p4-nb07-crit-eaa8` |
| **HEAD anterior revisado** | `cd579a8c` |
| **HEAD desta execução** | `b647dfff` |
| **Base** | `origin/main` @ `2f2a577a96e93f26212025b5b5662747fdbc2f6a` |
| **Produção** | **NÃO ALTERADA** (`buildId=2f2a577a`) |
| **Tag baseline** | `baseline-fase3-nb07-supabase-merged-20260815` |
| **PR #262 / SEC-03** | **Congelado** |

### PROGRESSO

**Programa geral: 65%**

`█████████████░░░░░░░`

**Fase 3: 78%**

`████████████████░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🟢 PR #267 APTO PARA MERGE

As três divergências bloqueantes foram corrigidas com testes de paridade Express × Vercel. Nenhuma regra Asaas, SEC-03, NF ou Supabase foi alterada. **Não mergeado nesta execução** (aguarda ação humana).

### RESUMO SIMPLES

Corrigidas exclusivamente as três divergências comprovadas na validação `cd579a8c`: (1) removido `limit=20` de `getInvoicesByPayment` para igualar `getInvoiceByPayment` do Express; (2) webhook sem body volta a lançar erro de destructuring capturado como `{received:true,error}`; (3) evento em array volta a ser ignorado via `includes(event)` estrito. Handler Vercel passa `req.body` direto, sem `parseBody` que convertia ausente em `{}`. Testes P4 ampliados (A–H). Build OK. Suíte escopada 167/167. P4 36/36. Falhas novas: zero.

### DIVERGÊNCIAS — CAUSA E CORREÇÃO

| # | Divergência | Causa | Correção | Arquivo |
|---|-------------|-------|----------|---------|
| 1 | sync-open-payments com `limit=20` na NF | `getInvoicesByPayment()` adicionou `&limit=20` | Removido parâmetro; URL igual Express `/invoices?payment=<id>` | `lib/asaasChargeApi.ts` |
| 2 | webhook sem body → sucesso silencioso | `body \|\| {}` no core + `parseBody` no handler | Destructuring direto (lança se ausente); `handleWebhook(req.body)` | `lib/asaasWebhookCore.ts`, `api/asaas-webhook.ts` |
| 3 | evento em array processado | `includes(String(event))` coerciona array | `includes(event)` estrito como Express legado | `lib/asaasWebhookCore.ts` |

### DIFF INCREMENTAL (`cd579a8c...HEAD`)

Somente:

- `lib/asaasChargeApi.ts` — remove `limit=20`
- `lib/asaasWebhookCore.ts` — paridade destructuring + includes estrito
- `api/asaas-webhook.ts` — remove `parseBody`, repassa `req.body`
- `scripts/p4-nb07-crit.test.ts` — testes A–H de paridade
- `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` — handoff

### TESTES

| Suíte | Resultado | Δ vs baseline |
|-------|-----------|---------------|
| P4-NB07-CRIT (`p4-nb07-crit.test.ts`) | **36/36 pass** | +1 teste (A–H) |
| Escopo P4+Asaas+NB07+SEC+faturas | **167/167 pass** | 0 falhas novas |
| `npm run build` | **OK** | — |
| React (`*.test.tsx`) | **4 total / 2 pass / 2 fail** | baseline DHL (inalterado) |
| TS completa (`scripts/*.test.ts`) | **parcial até ok 315**; trava após NB-06 `getApp` (baseline: 878/872/5/1) | 0 falhas novas na parte concluída; 2 falhas baseline visíveis (investment-accounts, invoice-display) |

**Falhas baseline preservadas (5):** investment-accounts, invoice-display, presence-refresh, receivable-desc-nf, zapi/cockpit (+ nb06 timeout cancelado).

### PARIDADE PÓS-CORREÇÃO

- **sync-open-payments:** consulta NF sem `limit` adicional; auth/roles/payload inalterados.
- **webhook:** body ausente/null → `{received:true,error}`; array ignorado; eventos válidos `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` preservados; sem SEC-03.
- **payments / payment/:id:** não modificados; testes de auth/rewrites reexecutados OK.

### ÁREAS PROTEGIDAS

Zero diff em NF frontend, FinancialInvoiceControl, `/api/nf/invoices`, Supabase NB-07, Investment, schema, ENV, SEC-03.

---

## VALIDAÇÃO ANTERIOR PR #267 — P4-NB07-CRIT (bloqueio `cd579a8c`)

> Histórico preservado — decisão anterior: 🔴 NÃO APTO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-15 (UTC) |
| **Modelo Cursor** | GPT-5.6 Sol |
| **PR** | [#267](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/267) — draft |
| **Branch** | `cursor/p4-nb07-crit-eaa8` |
| **HEAD funcional validado** | `b061dc40c4024784c519927f6a08e992f5675c8a` |
| **Base** | `origin/main` @ `2f2a577a96e93f26212025b5b5662747fdbc2f6a` |
| **Produção consultada** | `buildId=2f2a577a96e93f26212025b5b5662747fdbc2f6a` |
| **Tag baseline** | `baseline-fase3-nb07-supabase-merged-20260815` |
| **PR #262 / SEC-03** | **Congelado e não reutilizado** |

### PROGRESSO

**Programa geral: 65%**

`█████████████░░░░░░░`

**Fase 3: 78%**

`████████████████░░░░`

**Execução atual: 100%**

`████████████████████`

### DECISÃO

# 🔴 PR #267 NÃO APTO

**Não mergear e não publicar.** A validação determinística encontrou divergências entre o comportamento Express atual e os cores/handlers novos. Nenhuma regra financeira foi corrigida nesta execução, conforme a ordem de parar diante de comportamento inesperado.

### RESUMO SIMPLES

Todo o PR foi revisado, os handlers foram empacotados e as suítes foram executadas. Autorização, roles, seleção das três contas, rewrites, limite de funções e áreas protegidas ficaram consistentes. Porém, o novo código não reproduz exatamente três comportamentos atuais: a consulta de NF do sync ganhou um parâmetro adicional, webhook sem body deixou de devolver o erro legado e um evento em formato array antes ignorado passou a ser aceito. Os testes do PR também não exercitam os efeitos mockados de payments, payment GET/DELETE e sync. Por isso o PR permanece bloqueado para correção controlada posterior.

### REVISÃO INTEGRAL DO DIFF (`origin/main...HEAD`)

| Arquivo | Rota/motivo | Alteração/SSOT | Consumidor | Risco |
|---------|-------------|----------------|------------|-------|
| `api/asaas-webhook.ts` | webhook fora do catch-all | handler Vercel → `asaasWebhookCore` | Asaas | alto; contrato divergente para body inválido |
| `api/asaas-sync-open-payments.ts` | sync fora do catch-all | auth + handler → `asaasSyncOpenPaymentsCore` | `FinancialInvoiceControl` | alto; escrita financeira |
| `api/asaas-payments.ts` | lista fora do catch-all | auth + handler → `asaasPaymentRoutesCore` | sem consumidor frontend localizado | médio |
| `api/asaas-payment.ts` | GET/DELETE fora do catch-all | auth + handler → `asaasPaymentRoutesCore` | DELETE em `FinancialInvoiceControl` | alto; operação destrutiva |
| `lib/asaasWebhookCore.ts` | SSOT webhook | lógica extraída de Express | Express + Vercel | alto |
| `lib/asaasSyncOpenPaymentsCore.ts` | SSOT sync | consulta/atualizações extraídas | Express + Vercel | alto |
| `lib/asaasPaymentRoutesCore.ts` | SSOT payments | GET/list/DELETE compartilhados | Express + Vercel | alto no DELETE |
| `lib/asaasChargeApi.ts` | cliente leve Asaas | adiciona list/delete | cores leves | médio |
| `server/routes.ts` | delegação Express | blocos substituídos por SSOT | catch-all Express | alto; paridade obrigatória |
| `vercel.json` | precedência | quatro rewrites específicos | Vercel | médio |
| `scripts/p4-nb07-crit.test.ts` | testes P4 | auth, rewrites e contratos parciais | QA | cobertura insuficiente dos efeitos |
| `scripts/faturas-clear-processando.test.ts` | guarda existente | aponta asserts ao novo core | QA NF | baixo |
| `scripts/sec-safe-nf-hotfix-guard.test.ts` | guarda SEC | reconhece SSOT sem SEC-03 | QA segurança | baixo |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | handoff | documentação | continuidade | baixo |

Não há diff em componentes frontend, migrations, schema, ENV, API keys, NF API, Supabase NB-07 ou Investment. O conteúdo funcional do PR está limitado ao bloco P4, testes e documentação.

### PARIDADE — RESULTADOS

#### `POST /api/asaas/sync-open-payments`

- Auth e roles: equivalentes (`administrador`, `diretoria`, `financeiro`).
- Limite de lote: mesma regra query → body → default 15, teto 40.
- `issuer_company`: encaminhado para `getPayment` e consulta de NF.
- Pagamentos recebidos/confirmados/em dinheiro, vencidos, patch da fatura, baixa da transação, erro parcial e payload final: extração textual preservada.
- **Divergência bloqueante:** Express chama `/invoices?payment=<id>`; `getInvoicesByPayment()` novo chama `/invoices?payment=<id>&limit=20`. Isso altera a consulta financeira e pode alterar a NF escolhida.
- Os testes P4 não mockam Supabase + Asaas para comparar chamadas/patches; o teste rotulado como sucesso executa o core real de um lado e devolve resultado fixo do outro.

#### `GET /api/asaas/payments` e `GET /api/asaas/payment/:id`

- Roles, query `company`, filtros, paginação, formato de sucesso e 500 `{error}` aparecem equivalentes por revisão.
- Resolução mock das três contas produziu a mesma URL e a mesma credencial fictícia para TM Gestão, TM Segurança e TM Security.
- **Paridade não comprovada por teste:** não há casos determinísticos de sucesso, paginação/filtros, ID inexistente ou erro Asaas comparando status + payload + chamadas.

#### `DELETE /api/asaas/payment/:id`

- Auth ocorre antes da operação no handler Vercel.
- Roles são idênticas ao Express.
- `id` e `company` chegam ao core; sucesso pretendido permanece `{success:true}` e falha Asaas permanece 500 `{error}`.
- Nenhum DELETE real foi executado.
- **Bloqueio de cobertura:** os testes não invocam sucesso mockado, ID inexistente, erro Asaas nem comprovam que sem auth/role incorreta a função `remove` recebeu zero chamadas.

#### `POST /api/asaas/webhook`

Eventos reais do código:

| Evento/entrada | Tratamento atual | Ação | Retorno |
|----------------|------------------|------|---------|
| `PAYMENT_RECEIVED` + `payment.id` | processado | busca por payment id/ref, baixa fatura/transação | 200 `{received:true}` |
| `PAYMENT_CONFIRMED` + `payment.id` | processado | mesma ação | 200 `{received:true}` |
| eventos acima sem id | ignorado | nenhuma escrita | 200 `{received:true}` |
| qualquer outro evento string | ignorado | nenhuma escrita | 200 `{received:true}` |
| erro interno | capturado | sem propagação HTTP | 200 `{received:true,error}` |

Preservado: sem `requireAuth`, sem `ASAAS_PAYMENT_WEBHOOK_TOKEN`, sem secret novo e sem SEC-03.

Divergências bloqueantes:

1. Express desestrutura `req.body`; body ausente gera erro capturado e `{received:true,error}`. Vercel converte body ausente/inválido em `{}` e responde sucesso silencioso.
2. Express só aceita igualdade estrita do evento. O core converte com `String(event || '')`; `['PAYMENT_RECEIVED']` antes era ignorado e agora é processado.
3. O comentário explicativo original sobre prioridade `asaas_payment_id`/fallback `externalReference` não foi preservado na extração.

### TRÊS CONTAS ASAAS

Com `fetch` e credenciais totalmente fictícias, `server/asaasService` e `lib/asaasChargeApi` produziram a mesma URL e selecionaram a mesma credencial para:

- TM Gestão;
- TM Segurança;
- TM Security.

Os aliases, CNPJs, fallback TM Gestão e leitura runtime das chaves são equivalentes. Nenhuma credencial real foi exibida.

### FINANCIAL INVOICE CONTROL E ÁREAS PROTEGIDAS

- `FinancialInvoiceControl` continua chamando `authFetch('/api/asaas/sync-open-payments?limit=...')`, POST, timeout 25 s e tratamento de erro.
- DELETE continua usando `authFetch`, `asaas_payment_id` e `issuer_company`.
- Listagem NF continua independente em `/api/nf/invoices`.
- **Zero diff funcional** em `FinancialInvoiceControl`, `lib/nfInvoiceControlApi.ts`, `api/nf-control.ts`, RLS, filtros ou status.
- Rewrites NB-07 Supabase, Investment, health e version continuam antes do catch-all.

### VERCEL

- `functions`: **50/50**; nenhuma entrada nova.
- Os quatro handlers exportam `config.maxDuration` (30/60 s), formato suportado para Node `/api` routes segundo documentação Vercel.
- Empacotamento ESM dos quatro handlers via esbuild: **OK**.
- Rewrites novos: índices 85–88; catch-all: índice 118.
- Controles preservados: NF índice 90, Supabase status 24, Investment snapshots-all 30, health 0, version 76.
- Risco de limite `functions`: mitigado; nenhum indício de falha de configuração por exceder 50.

### SEGURANÇA

- Nenhuma alteração de ENV, token, API key, schema ou migration.
- Service role e chaves Asaas permanecem em módulos backend; handlers não retornam esses valores.
- Bundle frontend contém apenas configuração pública Supabase anon já homologada.
- O bundle contém nomes de variáveis Asaas em mensagens/diagnósticos existentes, mas nenhum valor secreto foi introduzido pelo PR.
- PR #262/SEC-03 permanece congelado.

### TESTES E BUILD

| Verificação | Resultado |
|-------------|-----------|
| P4 + Asaas + NF + NB-07 + SEC-01/02 + P0/P1/P2/P3 | **235/235** |
| TS completa | **878 total / 872 pass / 5 fail / 1 cancelled** |
| Falhas novas da suíte TS | **0** (mesmo baseline informado) |
| React | **4 total / 2 pass / 2 fail baseline DHL** |
| Build | **OK** |
| Empacotamento dos 4 handlers | **OK** |
| Produção `/api/health` | 200, 0,20 s |
| Produção `/api/version` | 200, `buildId=2f2a577a` |
| Produção `/api/supabase/status` sem auth | 401, 0,07 s |

Falhas baseline TS preservadas: investment-accounts, invoice-display, presence-refresh, receivable-desc-nf e zapi/cockpit. `nb06-migration-routes` foi cancelado por timeout de 90 s, como no baseline conhecido. As duas falhas React são de render DHL e não têm diff neste PR.

### RISCOS E PRÓXIMO PASSO

Correção futura controlada deve:

1. restaurar a query exata de NF do Express;
2. preservar body/evento webhook exatamente, sem introduzir SEC-03;
3. adicionar mocks injetáveis para Supabase/Asaas;
4. cobrir efeitos de sync, list, GET e DELETE (incluindo zero chamadas sem autorização);
5. repetir esta validação integral.

---

## HISTÓRICO — IMPLEMENTAÇÃO P4-NB07-CRIT (PR #267)

## P4-NB07-CRIT — ROTAS ASAAS CRÍTICAS (REVISÃO)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-15 (UTC) |
| **Agente / modelo** | Composer 2.5 (Cursor Cloud) |
| **Branch** | `cursor/p4-nb07-crit-eaa8` |
| **Base** | `main` @ `2f2a577a` |
| **Tag baseline** | `baseline-fase3-nb07-supabase-merged-20260815` |
| **Produção atual** | `buildId=2f2a577a` (NB-07 Supabase + handoff) |
| **PR #262 / SEC-03** | **Congelado** — webhook sem token |

## PROGRESSO

| Indicador | Valor |
|-----------|-------|
| **EXECUÇÃO ATUAL** | **100%** |
| **FASE 3** | **78%** (incremento oficial só após publicação futura) |
| **PROGRAMA GERAL** | **65%** |

## DECISÃO FINAL

# 🟢 P4-NB07-CRIT APTO PARA REVISÃO/MERGE

**Não mergeado. Não publicado.** Aguardando revisão humana.

## RESUMO SIMPLES

O sistema tinha quatro rotas do Asaas que ainda passavam pelo servidor pesado (catch-all) e demoravam ~5 minutos até dar timeout (504). Foram criados handlers leves na Vercel para essas rotas, copiando exatamente as mesmas regras que já existiam — sem mudar cobranças, PIX, saldo, NF, tokens ou painel Asaas. O webhook continua sem senha extra (SEC-03 fica para outro bloco). NF, Supabase e Investment não foram alterados no frontend.

## ROTAS INVESTIGADAS

| Rota | Consumidor | Timeout prod | Migrada | Motivo |
|------|------------|--------------|---------|--------|
| `POST /api/asaas/webhook` | Asaas server-to-server | **504 ~300s** | ✅ | Problema A (catch-all); contrato legado preservado |
| `POST /api/asaas/sync-open-payments` | `FinancialInvoiceControl.tsx` (auto-heal) | **504 ~300s** | ✅ | Uso real + timeout |
| `GET /api/asaas/payments` | Sem frontend direto | **504 ~300s** | ✅ | Mesmo fluxo API |
| `GET/DELETE /api/asaas/payment/:id` | `FinancialInvoiceControl.tsx` (DELETE) | catch-all | ✅ | Par com payments |

## EVIDÊNCIA TIMEOUT PRODUÇÃO (read-only, 2026-08-15)

| Rota | Status | Tempo |
|------|--------|-------|
| `/api/health` | 200 | 0,15s |
| `/api/supabase/status` | 401 | 0,09s |
| `/api/asaas/payments` (sem auth) | **504** | **300s** |
| `GET /api/asaas/webhook` | **504** | **300s** |
| `POST /api/asaas/sync-open-payments` (sem auth) | **504** | **300s** |

## SSOT (funções compartilhadas)

| Rota | Core | Handler Vercel |
|------|------|----------------|
| sync-open-payments | `lib/asaasSyncOpenPaymentsCore.ts` | `api/asaas-sync-open-payments.ts` |
| payments / payment | `lib/asaasPaymentRoutesCore.ts` | `api/asaas-payments.ts`, `api/asaas-payment.ts` |
| webhook | `lib/asaasWebhookCore.ts` | `api/asaas-webhook.ts` |

Express (`server/routes.ts`) chama as mesmas funções SSOT.

## REWRITES VERCEL (antes de `/api/(.*)`)

- `/api/asaas/webhook` → `/api/asaas-webhook`
- `/api/asaas/sync-open-payments` → `/api/asaas-sync-open-payments`
- `/api/asaas/payments` → `/api/asaas-payments`
- `/api/asaas/payment/:id` → `/api/asaas-payment?id=:id`

**Nota:** entradas `functions` mantidas em **50** (limite Vercel). `maxDuration` via `export const config` nos handlers.

## SEGURANÇA

| Rota | Auth |
|------|------|
| sync-open-payments, payments, payment | `requireAuth` + roles `administrador/diretoria/financeiro` (Express) = `authorizeSupabaseAdminRequest` (Vercel) |
| webhook | **Sem** requireAuth; **sem** `ASAAS_PAYMENT_WEBHOOK_TOKEN` (SEC-03 congelado) |

Contrato webhook: sucesso `{ received: true }`; erro `{ received: true, error }` HTTP **200**.

## PRESERVAÇÃO (diff funcional ZERO)

- NF / `FinancialInvoiceControl` / `/api/nf/invoices` — **não alterados**
- 6 rotas NB-07 Supabase — rewrites intactos
- SEC-01 Investment — intacto
- Asaas keys / ENV / issuer / PIX / transferências — **não alterados**
- PR #262 / SEC-03 — **não reutilizado**

## TESTES

| Suíte | Resultado |
|-------|-----------|
| P4-NB07-CRIT (`scripts/p4-nb07-crit.test.ts`) | **27/27** |
| NB-07 Supabase | pass |
| SEC safe + NF hotfix | pass |
| TS completa | **878 / 872 / 5** (+27 novos, **0 falhas novas** vs baseline main) |
| `npm run build` | **OK** |

Falhas baseline pré-existentes (5): investment-accounts, invoice-display, nb06-migration-routes, receivable-desc-nf, zapi/cockpit (+ 1 cancelled hang).

## ARQUIVOS ALTERADOS (vs `main`)

**Novos:** `api/asaas-{webhook,sync-open-payments,payments,payment}.ts`, `lib/asaas{Webhook,SyncOpenPayments,PaymentRoutes}Core.ts`, `scripts/p4-nb07-crit.test.ts`

**Modificados:** `server/routes.ts` (delegação SSOT), `vercel.json` (4 rewrites), `lib/asaasChargeApi.ts` (`listPayments`, `deletePayment`), testes de guarda (`sec-safe`, `faturas-clear-processando`)

## ROLLBACK FUTURO

Reverter merge + redeploy Vercel. Rotas voltam ao catch-all (timeout). Sem migration de banco.

## PENDÊNCIAS

- Publicação separada (merge `dev`→`main` + validação prod pós-deploy)
- SEC-03 webhook token — bloco futuro (PR #262 congelado)
- Demais rotas Asaas ainda no catch-all (fora escopo deste bloco)

---

## HISTÓRICO — PUBLICAÇÃO PR #265 NB-07 SUPABASE

> Handoff anterior — **Publicação controlada PR #265 — NB-07 `/api/supabase/*`**
> **Publicado e validado em produção.**

---

## INVENTÁRIO FASE 3 — MAPA 78% → 100%

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-15 (UTC) |
| **Produção funcional** | `d39d0309` |
| **Handoff docs** | `2f2a577a` |
| **Tag** | `baseline-fase3-nb07-supabase-merged-20260815` |
| **Tipo** | Auditoria + planejamento (sem código) |

## PROGRESSO

| Indicador | Valor |
|-----------|-------|
| **EXECUÇÃO ATUAL** | **100%** |
| **FASE 3** | **78%** (inalterada — investigação não incrementa) |
| **PROGRAMA GERAL** | **65%** (inalterado) |

## DECISÃO DESTA EXECUÇÃO

**Mapa concluído.** Aguardar autorização humana para iniciar **P4-NB07-CRIT** (primeiro bloco recomendado).

---

### Metodologia dos percentuais

A evolução **78%** está documentada por marcos publicados, não por soma item a item:

| Marco publicado | Fase 3 acum. | Δ documentado | Programa |
|-----------------|-------------|---------------|----------|
| P0 + NB-06 | 20% | — | 22% |
| P1 | 40% | +20% | 41% |
| P2 | 52% | +12% | 55% |
| P3 | 64% | +12% | 59% |
| Hotfix NF (entre P3 e SEC) | ~70%* | +6%* | ~61%* |
| SEC-01/02 | 74% | +4% | 63% |
| NB-07 `/api/supabase/*` | 78% | +4% | 65% |

\*Estimativa inferida: handoff SEC cita +4% sobre ~70%, mas P3→SEC não tinha linha explícita para hotfix NF. **Inconsistência de acompanhamento** — recomenda-se tabela única de marcos com commit/tag.

**22% restantes** = 100% − 78%. Decomposição abaixo é **proposta baseada em evidência** (backlog Raio-X + handoffs + repo), não percentual oficial pré-existente por item.

---

## TABELA MESTRA — BLOCOS FASE 3

| ID | Item | Objetivo | Status | % Fase* | Risco | Dependências | PR/Commit | Próxima ação |
|----|------|----------|--------|---------|-------|--------------|-----------|--------------|
| P0 | Integridade financeira OS/cômodo/canônico | Pedágio filha, fail-closed, auth migration | **PUBLICADO** | ~20% | — | — | PR #257 / `420e9680` | — |
| NB-06 | Migration routes leves | 2 rotas migration off catch-all | **PUBLICADO** | incl. P0 | Baixo | P0-04 | PR #258 | — |
| P1 | Integridade conjunto | Busca OS, realtime, quotes, is_same_os | **PUBLICADO** | ~20% | Baixo | P0 | PR #259 | Itens residuais → P4-SYNC |
| P2 | Operacional / órfãos | AI inativo, billing órfão, OS mãe, pedágio | **PUBLICADO** | ~12% | Baixo | P1 | PR #260 | Decisões órfãos → P4-LIMPEZA |
| P3 | Limpeza / segurança | replit_integrations, billing-override auth, PDF | **PUBLICADO** | ~12% | Baixo | P2 | PR #261 | — |
| HOTFIX-NF | Lista faturas vazia | `/api/nf/invoices` + authFetch | **PUBLICADO VALIDADO** | ~6%* | — | SEC-02 | PR #263 / `c8f7c59d` | **NÃO TOCAR** |
| SEC-01 | Investment auth | Fail-closed investment/* | **PUBLICADO** | ~2%* | Baixo | HOTFIX-NF | PR #264 | — |
| SEC-02 | Supabase auth | requireAuth 6 rotas | **PUBLICADO** | ~2%* | Baixo | SEC-01 | PR #264 | — |
| NB-07-SUP | 6 rotas `/api/supabase/*` | Handlers dedicados + paridade | **PUBLICADO VALIDADO** | +4% | Baixo | SEC-02 | PR #265 / `d39d0309` | **NÃO REFAZER** |
| SEC-03 | Webhook Asaas token | Auth S2S fail-closed nas 3 contas | **PUBLICADO — POSITIVO REAL PENDENTE** | ~4% est. | Baixo residual | Próximo evento legítimo | PR #273 / `79fae7a6` | Monitorar entrega real |
| NB-07-CRIT | Catch-all rotas críticas | Webhook/sync/recalc off catch-all | **PUBLICADO VALIDADO** | ~6% | Alto | NB-07-SUP | PR #267 / `06e0dd88` | **NÃO REFAZER** |
| P4-SYNC | Sincronismo residual | DRE canônico, fornecedor, receivable desc | **PUBLICADO VALIDADO** | ~4% | Médio | NB-07-CRIT | PR #268+#269 / `2b2e64ce` | **NÃO REFAZER** |
| P4-TEST | Baseline 5+2 + nb06 hang | CI confiável | **PUBLICADO VALIDADO** | ~3% | Baixo | P4-SYNC | PR #270 / `c5a98d7f` | **NÃO REFAZER** |
| P4-LIMPEZA | Órfãos / decisões feature | BillingControlCenter, AI Chat, replit restos | **PUBLICADO VALIDADO** | ~3% | Baixo | P4-TEST | PR #271 / `5f39ecfc` | **NÃO REFAZER** |
| P4-FECHAMENTO | Regressão final + 100% | Build, smoke, handoff fechamento | **PENDENTE** | ~2% est. | Baixo | SEC-03 publicado | PR #272 (auditoria anterior) | Reexecutar separadamente |

\*% por item = estimativa para explicar 22%; marcos publicados (78%) são a fonte oficial.

**Soma estimada pendente:** ~22% (4+6+4+3+3+2).

---

## BACKLOG CONHECIDO — CLASSIFICAÇÃO A–F

| Item | Classe | Pertence Fase 3? | Evidência |
|------|--------|------------------|-----------|
| NB-07 catch-all remainder | **A** | Sim (~6%) | ~82 rotas Express ainda no catch-all; webhook timeout 25s prod |
| SEC-03 webhook Asaas | **D** (congelado) | Sim (~4%) quando autorizado | PR #262; sem token; webhook sem auth |
| 5 testes TS baseline | **C** | Sim (~3%) fechamento | 820/815/5; Raio-X P3-04 |
| 2 testes TSX DHL | **C** | Opcional Fase 3 | Pré-existentes |
| nb06-migration-routes hang | **C** | Sim | Excluído da suíte |
| Realtime refresh duplicado | **C** | Parcial | P1 handoff: possível duplo fetchMissions; `RealtimeProvider` dispara `refreshMissions` 2× em flush |
| P1-07 fallback fornecedor | **A** | Sim | Backlog Raio-X; sem teste fase3 |
| DRE canônico completo | **A** | Sim | Backlog Raio-X P1-04 original |
| receivable-desc-nf | **A** | Sim | Teste falha: `resolveNfServiceDescription` retorna texto diferente |
| Gestão Investimento trading ~70% | **B** | Não obrigatório | P2-03 mapeado, não ativado |
| AI Chat inativo | **E/B** | Decisão | P2-01 FeatureInactivePanel |
| BillingControlCenter órfão | **E** | Limpeza futura | P2-02; substituto ClientBillingReport |
| CostOptimizationDashboard | **B** | Investigar Fase 4 | Ativo em App.tsx |
| ExecutiveDashboard | **F** parcial | — | P1-02 realtime OK; 60% Raio-X |
| Idempotência webhook Asaas | **D** | SEC-03 dependência | Sem migration neste ciclo |
| Plinio backend validation | **C** | P3 UI-only | Server-side futuro |
| Catch-all global api/index | **B/C** | Fora escopo total | Deliberado não reparar globalmente |

---

## ÁREAS PROTEGIDAS (NÃO TOCAR)

| Área | Estado | Regra |
|------|--------|-------|
| NF / FinancialInvoiceControl | Validado visualmente pelo usuário | Não alterar lista, filtros, `/api/nf/invoices`, `transformFinancialInvoicesForControl()`, RLS |
| Asaas 3 contas | Funcional | Não alterar keys, ENV, webhooks, saldo, PIX, transferências, cobranças, sync |
| NB-07 Supabase 6 rotas | Publicado `d39d0309` | Não refazer |
| SEC-01/02 | Publicado | Não reabrir |
| SEC-03 / PR #262 | Congelado | Não iniciar sem autorização |
| Financeiro (cálculos) | Homologado P0 | Não alterar regras |

---

## TESTES BASELINE (820/815/5 + 2 TSX)

| # | Teste | Classificação | Obrigatório p/ 100%? |
|---|-------|---------------|----------------------|
| 1 | `investment-accounts.test.ts` | **TESTE DESATUALIZADO** — exige `investment-accounts-item.ts` em `functions{}`; rewrite existe, entrada functions ausente | Recomendado (não bloqueia prod) |
| 2 | `invoice-display.test.ts` | **TESTE DESATUALIZADO** — espera `limit=15` fixo; código usa variável dinâmica | Recomendado |
| 3 | `presence-refresh.test.ts` | **TESTE DESATUALIZADO** — punch migrou para API; `.insert([payload])` não é mais o caminho principal | Recomendado |
| 4 | `receivable-desc-nf.test.ts` | **BUG REAL ou REGRA ALTERADA** — expected texto longo vs actual `'Ref. a primeira quinzena...'` | **Sim** se sincronismo NF/recebíveis for escopo P4-SYNC |
| 5 | `zapi-sdk-cockpit.test.ts` | **TESTE DESATUALIZADO** — DashboardDiretoria ainda renderiza "Detalhe do em aberto" | Baixa prioridade |
| TSX | `dhl-intake-render.test.tsx` (2 fail) | **TESTE DESATUALIZADO / UI** | Fase 4 ou DHL |
| — | `nb06-migration-routes.test.ts` | **INFRAESTRUTURA** — hang na suíte | Corrigir runner ou teste |

---

## NB-07 RESIDUAL — CATCH-ALL (inventário, sem migrar)

**Estado:** 112 rewrites dedicados; ~82 rotas Express ainda dependem de `/api/(.*)` → `/api/index`.

### Smoke produção (2026-08-15, pós NB-07-SUP)

| Rota | Método | Status | Tempo | Handler dedicado? | Criticidade |
|------|--------|--------|-------|-------------------|-------------|
| `/api/supabase/status` | GET | 401 | **0,08 s** | ✅ NB-07 | — |
| `/api/nf/retry-now` | POST | 401 | **0,14 s** | ✅ nf-control | — |
| `/api/asaas/webhook` | POST | timeout | **~25 s** | ❌ catch-all | **🔴 CRÍTICA** |
| `/api/asaas/sync-open-payments` | POST | timeout | **~25 s** | ❌ catch-all | **🔴 CRÍTICA** (InvoiceControl) |
| `/api/asaas/payments` | GET | timeout | **~25 s** | ❌ catch-all | Alta |
| `/api/missions/recalculate-all` | POST | timeout | **~25 s** | ❌ catch-all | Alta (admin) |
| `/api/chat` | POST | timeout | **~25 s** | ❌ catch-all | Baixa (inativo) |

### Recomendação de prioridade migração (futuro P4-NB07-CRIT)

1. `POST /api/asaas/webhook` — financeiro + SEC-03 overlap
2. `POST /api/asaas/sync-open-payments` — consumido por FinancialInvoiceControl
3. `GET /api/asaas/payments`, `GET/DELETE /api/asaas/payment/:id`
4. Rotas admin financeiras: `recalculate-all`, `scan-divergences`, `fix-divergences`
5. Demais ~70 rotas — **somente se evidência de timeout em produção**

**NÃO** migrar ~138 rotas em massa.

---

## SEGURANÇA RESIDUAL

| Risco | Exposição | Impacto | Explorabilidade | Proteção atual | Urgência |
|-------|-----------|---------|-----------------|----------------|----------|
| `POST /api/asaas/webhook` sem token | Público | Baixa automática NF errada/ausente | Alta (URL conhecida) | Nenhuma validação secret | **Alta** — SEC-03 congelado |
| Catch-all timeout | Rotas autenticadas | UX/ops; webhook Asaas falha | Média | Auth fail-closed após cold start | **Alta** runtime |
| Rotas webhook Z-API/WhatsApp | Público intencional | Mensageria | Média | Tokens Z-API | Média — fora escopo |
| `/api/chat` sem auth aparente | Catch-all | Custo Gemini se ativado | Baixa hoje | Feature inativa UI | Baixa |
| Service role | Backend only | Crítico se vazasse | Baixa | SSOT admin handlers | OK pós NB-07 |

SEC-01/02: **concluídos** — não reabrir.

---

## PAGINAÇÃO / UNIVERSO COMPLETO — RESÍDUOS

| Local | Limite | Classificação | Tratado? |
|-------|--------|---------------|----------|
| MissionForm / ClientMissionRequest | `.limit(300)` id | **BAIXO** — autocomplete | Parcial |
| UpdateMissionModal drivers | `.limit(200)` | **BAIXO** — autocomplete | OK apresentação |
| VendorVerificationControl | `.limit(500)` | **MÉDIO** — verificação | Revisar escopo |
| MissionFinancialModal | `.limit(1000)` | **MÉDIO** | P1 quotes usa fetchAllPages |
| P1 busca OS / OS mãe | paginado | **CRÍTICO** | ✅ P1/P2 |
| P1 quotes Diretoria | fetchAllPages 10k | **CRÍTICO** | ✅ P1 |
| PendingTollConfirmationBanner | fetchAllPages | **CRÍTICO** | ✅ P2-05 |

---

## FUNCIONALIDADES INACABADAS

| Feature | Estado | Classificação |
|---------|--------|---------------|
| AI Chat | Código existe; UI inativa | INATIVO INTENCIONALMENTE |
| BillingControlCenter | Componente existe; sem rota App | ÓRFÃO |
| Gestão Investimento trading | API parcial; sem ativação F2 | ATIVO MAS INCOMPLETO |
| CostOptimizationDashboard | Rota ativa; lê logs AIChatbot | ATIVO MAS INCOMPLETO |
| ExecutiveDashboard | Produção; realtime P1 | ATIVO E FUNCIONAL |
| Investment accounts Vercel | Rewrite OK; functions item incompleto | INCOMPLETO infra |

---

## ORDEM RECOMENDADA DE EXECUÇÃO

1. **P4-NB07-CRIT** (~6%) — migrar catch-all crítico (webhook + sync-open-payments + asaas payments); **Composer 2.5**; GPT-5.6 Sol Medium se paridade Express×Vercel
2. **P4-SEC03** (~4%) — **somente após decisão humana** descongelar PR #262 + config token 3 contas; Composer 2.5
3. **P4-SYNC** (~4%) — receivable desc, P1-07 fornecedor, DRE canônico residual; Composer 2.5
4. **P4-TEST** (~3%) — alinhar 5 baseline + nb06 hang; Composer 2.5
5. **P4-LIMPEZA** (~3%) — órfãos/decisões AI Chat, BillingControlCenter; Composer 2.5
6. **P4-FECHAMENTO** (~2%) — regressão completa, smoke prod, tag baseline fase3-100%; Composer 2.5

---

## O QUE NÃO DEVE SER TOCADO

- FinancialInvoiceControl, `/api/nf/invoices`, hotfix NF
- Asaas ENV, contas, fluxos PIX/transferência/cobrança existentes (salvo SEC-03 autorizado)
- 6 rotas NB-07 Supabase publicadas
- SEC-01/02 publicados
- Cálculos financeiros OS/comissão/DRE homologados P0
- Catch-all global `api/index` como refatoração única
- Banco/schema/migrations

---

## HISTÓRICO — PUBLICAÇÃO NB-07 (mantido abaixo)

---

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-15 (UTC) |
| **PR** | [#265](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/265) |
| **Branch origem** | `cursor/nb07-supabase-routes-eaa8` |
| **HEAD validado** | `d5511ab1` |
| **Commit funcional correção** | `9b31c98c` |
| **Commit publicado (merge dev→main)** | `d39d0309` |
| **Tag criada** | `baseline-fase3-nb07-supabase-merged-20260815` |
| **PR #262 / SEC-03** | **Congelado** |

## PROGRESSO

| Indicador | Valor |
|-----------|-------|
| **EXECUÇÃO ATUAL** | **100%** |
| **FASE 3** | **78%** |
| **PROGRAMA GERAL** | **65%** |

## DECISÃO FINAL

# 🟢 NB-07 SUPABASE PUBLICADO E VALIDADO

## PONTO DE RETORNO (pré-publicação)

| Item | Valor |
|------|-------|
| `main` / `dev` antes | `5bb4364c` |
| `buildId` produção antes | `5bb4364cc76b5a00074dff25cc322fe4993e7916` |
| Tag anterior | `baseline-fase3-sec01-sec02-merged-20260814` |
| HEAD PR validado | `d5511ab1` |

Rollback git: `git revert d39d0309` ou reset para tag `baseline-fase3-sec01-sec02-merged-20260814` + redeploy Vercel. **Sem rollback de banco necessário.**

## REVALIDAÇÃO HEAD E DIFF

| Verificação | Resultado |
|-------------|-----------|
| HEAD PR = `d5511ab1` | ✅ |
| Commits posteriores não validados | **Nenhum** |
| Diff vs `main` (pré-merge) | 8 arquivos NB-07 exclusivamente |
| Asaas / webhook / SEC-03 / NF / Investment / schema | **ZERO diff funcional** |

Arquivos publicados: `api/supabase-admin.ts`, `lib/supabaseAdminApiAuth.ts`, `lib/supabaseAdminOperations.ts`, `server/routes.ts`, `vercel.json`, testes NB-07, handoff.

## TESTES PRÉ-MERGE (HEAD `d5511ab1`)

| Suíte | Resultado |
|-------|-----------|
| NB-07 + paridade | **51/51** |
| SEC-01/02 + NF | **37/37** |
| Asaas + P0/P1/P2/P3 | **123/123** |
| TS completa (excl. hang `nb06-migration-routes`) | **820 / 815 / 5** |
| `npm run build` | **OK** |

Paridade `init-invoices`: HTTP 200 `{ok:false,error}` Express = Vercel. Matriz **6/6**.

## MERGE E PUBLICAÇÃO

| Etapa | Resultado |
|-------|-----------|
| PR #265 → `dev` | merge limpo (`d39d0309`) |
| `dev` → `main` | fast-forward |
| Push `main` + `dev` | ✅ |
| Conflitos | **Nenhum** |
| Alteração de código durante publicação | **Nenhuma** |

## DEPLOY VERCEL

| Campo | Valor |
|-------|-------|
| `GET /api/version` | `buildId=d39d0309bbb39d4b227503dda22f1b0f896dda7e` |
| `builtAt` | `2026-08-15T22:04:02.844Z` |
| `GET /api/health` | **200** (0,06 s) |
| `GET /` | **200** (0,45 s) |
| Projeto | `sistema-grupo-tm-seg` |

## SMOKE PRODUÇÃO — 6 ROTAS `/api/supabase/*`

Sem autenticação (fail-closed esperado = **sucesso**):

| Rota | Método | Status | Tempo | Handler dedicado | Resultado |
|------|--------|--------|-------|------------------|-----------|
| `/api/supabase/init-invoices` | POST | **401** | **0,11 s** | sim (401 rápido, não timeout) | ✅ |
| `/api/supabase/status` | GET | **401** | **0,08 s** | sim | ✅ |
| `/api/supabase/db-metrics` | GET | **401** | **0,06 s** | sim | ✅ |
| `/api/supabase/storage-usage` | GET | **401** | **0,11 s** | sim | ✅ |
| `/api/supabase/billing-links` | GET | **401** | **0,07 s** | sim | ✅ |
| `/api/supabase/health-check` | GET | **401** | **0,09 s** | sim | ✅ |

**Comparação timeout antes/depois:**

| Rota | Antes (catch-all) | Depois (handler dedicado) |
|------|-------------------|---------------------------|
| `/api/supabase/status` | ~20 s timeout | **0,08 s** → 401 |
| `/api/supabase/db-metrics` | ~20 s timeout | **0,06 s** → 401 |

`init-invoices` método incorreto (GET): **405** em **0,06 s** — contrato preservado, sem operação destrutiva executada.

## NF — NÃO REGRESSÃO

| Verificação | Resultado |
|-------------|-----------|
| `/api/nf/invoices` sem auth | **401** (0,14 s) |
| Hotfix intacto no bundle | ✅ (rewrite `/api/nf/invoices` inalterado) |
| `transformFinancialInvoicesForControl()` | não alterado neste PR |
| init / reemissão / RLS | **não executados** |

## ASAAS — PRESERVAÇÃO

| Verificação | Resultado |
|-------------|-----------|
| Diff funcional Asaas no PR | **ZERO** |
| `/api/asaas/balances` sem auth | **401** (read-only smoke) |
| Webhook / ENV / três contas | **não alterados** |
| PR #262 / SEC-03 | congelado |

## SEGURANÇA PÓS-BUILD

| Verificação | Resultado |
|-------------|-----------|
| Service role somente backend | ✅ |
| Service role no bundle frontend | apenas string de mensagem UI (preexistente); **sem valor** |
| Segredo em resposta HTTP | **não** |
| Auth fail-closed (401 sem token) | ✅ nas 6 rotas |
| Roles preservadas | ✅ |

## CRITÉRIOS DE SUCESSO (12/12)

1. HEAD validado incluído no merge publicado ✅
2. Build Vercel correto (`d39d0309`) ✅
3. Health = 200 ✅
4. 6 rotas atingem handlers dedicados ✅
5. `/api/supabase/status` sem timeout ✅
6. `/api/supabase/db-metrics` sem timeout ✅
7. Auth fail-closed ✅
8. `init-invoices` contrato preservado (405/401) ✅
9. NF não alterada ✅
10. Asaas não alterado ✅
11. Zero falhas novas nos testes ✅
12. Banco/schema inalterados ✅

## PRÓXIMO PASSO

- SEC-03 / PR #262 permanece **congelado**.
- Catch-all global **não** corrigido nesta execução.
- Nenhuma melhoria adicional iniciada.

---

## HISTÓRICO — CORREÇÃO FINAL PR #265 (pré-publicação)

> Registro preservado da correção de paridade validada em `d5511ab1`.

| Indicador | Valor |
|-----------|-------|
| **Decisão pré-publicação** | 🟢 PR #265 APTO PARA MERGE |
| **Correção** | `init-invoices` HTTP 200 `{ok:false,error}` no handler Vercel |
| **Paridade** | 6/6 rotas |

---

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-14 (UTC) |
| **PR** | [#265](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/265) |
| **Branch** | `cursor/nb07-supabase-routes-eaa8` |
| **Commit anterior (bloqueado)** | `ac48c308` |
| **Commit desta correção** | `9b31c98c` |
| **Base / produção funcional** | `main` / `c8f7c59d` |
| **Tag produção** | `baseline-fase3-sec01-sec02-merged-20260814` |
| **Merge / publicação** | **Não executados** |
| **PR #262 / SEC-03** | **Congelado** |

## PROGRESSO

| Indicador | Valor |
|-----------|-------|
| **EXECUÇÃO ATUAL** | **100%** |
| **FASE 3** | **74%** (inalterada) |
| **PROGRAMA GERAL** | **63%** (inalterado) |

## DECISÃO FINAL

# 🟢 PR #265 APTO PARA MERGE

### Divergência anterior (bloqueador resolvido)

`POST /api/supabase/init-invoices` retornava contrato diferente em erro inesperado:

| Cenário | Express (fonte de verdade) | Vercel antes (`ac48c308`) | Vercel após correção |
|---------|---------------------------|---------------------------|----------------------|
| Operação lança erro inesperado | HTTP **200**, `{ok:false,error}` | HTTP **500**, `{error}` | HTTP **200**, `{ok:false,error}` ✅ |

### Correção aplicada (mínima)

Arquivo: `api/supabase-admin.ts`

No bloco `catch` do handler dedicado, **somente** para `op === 'init-invoices'`:

```typescript
if (op === 'init-invoices') {
  res.status(200).json({ ok: false, error: message });
  return;
}
```

Preservado sem alteração: auth, roles, método POST, sucesso, validações, demais cinco rotas,
Express legado, NF, Asaas, Investment, SEC-03, banco/schema, catch-all global.

### Teste de paridade adicionado

Arquivo: `scripts/nb07-init-invoices-parity.test.ts` (**11 testes novos**)

| Cenário | Express × Vercel |
|---------|------------------|
| Sucesso | HTTP 200 + payload idêntico ✅ |
| Erro inesperado | HTTP 200 + `{ok:false,error}` ✅ |
| Sem auth | HTTP 401 `{error}` ✅ |
| Role inválida | HTTP 403 `{error}` ✅ |
| Método incorreto | HTTP 405 `{error}` + `Allow: POST` ✅ |
| Matriz 6 rotas (erro inesperado) | **6/6** semanticamente equivalentes ✅ |

## PARIDADE DAS SEIS ROTAS (REVALIDADA)

| Rota | Método | Roles Express = Vercel | Erros inesperados | Resultado |
|------|--------|-------------------------|-------------------|-----------|
| `/api/supabase/init-invoices` | POST | diretoria/admin/ceo/financeiro/controller | 200 `{ok:false,error}` em ambos | ✅ |
| `/api/supabase/status` | GET | diretoria/admin/ceo | 500 `{error}` em ambos | ✅ |
| `/api/supabase/db-metrics` | GET | diretoria/admin/ceo | 500 `{error}` em ambos | ✅ |
| `/api/supabase/storage-usage` | GET | diretoria/admin/ceo | 500 `{error}` em ambos | ✅ |
| `/api/supabase/billing-links` | GET | diretoria/admin/ceo | estático, sem I/O operacional | ✅ |
| `/api/supabase/health-check` | GET | diretoria/admin/ceo | 500 `{error}` em ambos | ✅ |

**Critério atingido: 6/6 semanticamente equivalentes.**

## DIFF DESTA CORREÇÃO (INCREMENTAL)

| Arquivo | Alteração |
|---------|-----------|
| `api/supabase-admin.ts` | contrato de erro `init-invoices` alinhado ao Express |
| `scripts/nb07-init-invoices-parity.test.ts` | testes de paridade Express × Vercel |
| `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md` | handoff |

**ZERO** alterações em: Asaas, webhook, NF, Investment, banco, schema, regras financeiras,
catch-all global, demais cinco rotas Supabase.

## REGRESSÃO REEXECUTADA

| Suíte | Resultado |
|-------|-----------|
| NB-07 + paridade init-invoices | **51/51** |
| SEC-01/02 + NF | **37/37** |
| TS completa (exclui hang `nb06-migration-routes`) | **820 total / 815 pass / 5 fail** |
| Componentes React | **4 total / 2 pass / 2 fail** |
| `npm run build` | **OK** |

Baseline anterior: **809 total / 804 pass / 5 fail**. Os **+11 testes / +11 pass** são
exclusivamente os novos testes de paridade. **Nenhuma falha nova** introduzida.

## NF, ASAAS E SEC-03

| Verificação | Resultado |
|-------------|-----------|
| NF hotfix (`/api/nf/invoices`) | intacto |
| Asaas (saldo/Pix/transferência/webhook) | diff funcional **ZERO** |
| Investment | diff funcional **ZERO** |
| SEC-03 / `ASAAS_PAYMENT_WEBHOOK_TOKEN` | ausente da branch |

## PRÓXIMO PASSO

- PR #265 está **apto para merge** após revisão humana.
- **Não** mergear/publicar nesta execução (conforme instrução).
- PR #262 / SEC-03 permanece congelado.

---

## HISTÓRICO — VALIDAÇÃO FINAL PR #265 (BLOQUEADA em `ac48c308`)

> Registro preservado da validação que identificou o bloqueador.

| Indicador | Valor na validação bloqueada |
|-----------|------------------------------|
| **Commit funcional validado** | `b45d43d5` |
| **Decisão** | 🔴 PR #265 NÃO APTO |
| **Bloqueador** | `init-invoices`: Express 200 `{ok:false,error}` × Vercel 500 `{error}` |
| **Correção** | Nenhuma aplicada naquela execução |

---

## HISTÓRICO — IMPLEMENTAÇÃO NB-07 SUPABASE

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
