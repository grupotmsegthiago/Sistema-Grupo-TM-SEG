# 07 — Plano de fases

A Fase 0 fecha aqui. Nenhuma fase abaixo está autorizada por este documento. Cada uma começa só com ordem explícita do proprietário. Preservar cálculo, Asaas e NF até a fase que os cite.

## Fase 1 — Governança

| | |
| --- | --- |
| Objetivo | Congelar como se muda o sistema: dono por domínio, branch, o que é fonte da verdade, o que é proibido |
| Escopo | Documentação e regras do Cursor. Fast-forward da `dev` até `main` somente se o dono pedir. Rotular que o conector Supabase desta sessão não é `ajhmmjuewdsukecaimik` |
| Fora | Código de negócio, RLS, dependency update |
| Riscos | Escrever regra que contradiz `.cursorrules` ou `AGENTS.md` |
| Arquivos | `docs/governanca/`, `.cursor/rules/` novos só se pedidos, `AGENTS.md` se o dono quiser o ponteiro |
| Banco | nenhum |
| Testes | não se aplica; revisar o texto contra `00` a `06` |
| Gate | Mapa de donos (OS, financeiro, RH, WhatsApp, comissão/TORRES) escrito; `dev` e `main` com relação conhecida; proibição de novo `exec_sql` e de nova chave em `vercel.json functions` sem fusão de rota |

## Fase 2 — Segurança

| | |
| --- | --- |
| Objetivo | Fechar P0 e P1 de exposição sem mudar fórmula de OS |
| Escopo | Senha fora do cliente; anon sem leitura de `system_users.password`, financeiro, RH e histórico; ingest sem anon key; logout global só por env; Gemini e geocode com principal; webhook WhatsApp fail-closed; GRANT de `exec_sql` lido no projeto TM SEG e, em separado, no projeto do conector |
| Riscos | Policy nova derruba o login atual, que depende de ler `system_users` com anon. O login tem de ganhar um caminho de servidor no mesmo change set |
| Arquivos | `components/Login.tsx`, `lib/supabase.ts`, `lib/forceLogout.ts`, `api/comissoes-ingest.ts`, `api/gemini/generate.ts`, rotas de geocode, webhook inbound, migrations novas de RLS (ainda não criar na Fase 0) |
| Banco | policies e grants. Sem DML de negócio |
| Testes | testes de auth já em `scripts/fase4-p0-api-auth.test.ts` e de webhook; acrescentar prova de que anon não lê senha nem título |
| Gate | Sonda anon em `system_users?select=password` deixa de voltar a coluna; financeiro anon não lista linhas; login de um usuário de teste ainda entra; produção da TORRES não é alterada no mesmo script da TM SEG |

## Fase 3 — Integridade e fonte única

| | |
| --- | --- |
| Objetivo | Um escritor para o valor oficial da OS e uma função de leitura para totais |
| Escopo | Mapear de novo policies no projeto certo; escolher se o save oficial fica no modal ou na API; readers de dashboard passam por `computeCanonicalRevenueCost`; parar de criar tabela via `exec_sql` |
| Riscos | Recálculo em lote pisa override manual. A trava `isIntentionalBillingOverride` permanece |
| Arquivos | `lib/financialUtils.ts`, `lib/missionFinancialsCanonical.ts`, `MissionFinancialModal.tsx`, `server/routes.ts`, `api/recalculate-open.ts` |
| Banco | só leitura de catálogo até o desenho; escrita de schema apenas para trilha que já existir |
| Testes | paridade OS → boletim → financeiro já coberta em scripts de integridade; repetir no escopo tocado |
| Gate | Um testing de OS com override não muda depois do recálculo; duas telas mostram o mesmo total para o mesmo filtro; nenhum `.limit()` vira “universo” |

## Fase 4 — Correções funcionais

| | |
| --- | --- |
| Objetivo | Só bugs com reprodução, um domínio por vez |
| Escopo | Exemplos já classificados: hard delete financeiro (se o dono quiser cancelar em vez de apagar), webhook Asaas que engole erro, duplicata de intake DHL |
| Riscos | Misturar com mudança de tarifa |
| Arquivos | os do bug, nada de motor inteiro |
| Banco | o mínimo da correção, com migration versionada |
| Testes | o script do domínio, mais build |
| Gate | teste do bug vermelho antes e verde depois; cálculo de OS intocado no diff |

## Fase 5 — Performance

| | |
| --- | --- |
| Objetivo | Consultas que já estouram ou carregam universo no browser |
| Escopo | `system_logs` (timeout 57014 na contagem), `mission_history` (195 mil linhas visíveis), listas sem filtro |
| Riscos | Índice ou RPC nova muda o número exibido |
| Arquivos | telas de log e histórico, SQL de índice |
| Banco | índice, não regra |
| Testes | a mesma contagem de uma OS antes e depois |
| Gate | timeout da listagem some e o total canônico não muda |

## Fase 6 — Homologação

| | |
| --- | --- |
| Objetivo | Pipeline mínimo e ambiente igual ao publicado |
| Escopo | GitHub Actions para o subconjunto de testes que não precisa de secret; Node alinhado ao `engines` quando o dono quiser; roteiro manual das telas P0 (login, OS, boletim, comissão sem lançar título real) |
| Riscos | Suíte completa depende de rede e de chave |
| Arquivos | `.github/workflows/`, `scripts/run-tests.sh` |
| Banco | nenhum, ou projeto de homologação se existir — hoje não há evidência de um terceiro Supabase de homologação |
| Testes | o workflow tem de falhar de propósito uma vez e passar em seguida |
| Gate | PR não entra na `main` sem o check combinado; `dev` não está atrás |

## Fase 7 — Produção

| | |
| --- | --- |
| Objetivo | Publicar só o que passou o gate, no projeto `sistema-grupo-tm-seg` |
| Escopo | `publicar.ps1` depois da `dev` atualizada; conferir `/api/version`, `/api/health` e a tela de login |
| Riscos | Deploy com 51 funções; alias para o projeto `workspace`; store Supabase suspensa |
| Arquivos | os já mergeados |
| Banco | migrations já aplicadas em homologação, nunca “na hora do deploy” por `exec_sql` solto |
| Testes | smoke de produção sem criar título, sem lançar comissão, sem gravar OS |
| Gate | `buildId` da produção igual ao SHA anunciado; health ok; nenhum domínio no projeto Vercel `workspace` |

## Fase 8 — Governança permanente

| | |
| --- | --- |
| Objetivo | Manter o raio-X vivo |
| Escopo | Atualizar `docs/governanca` quando nascer domínio, writer ou integração; arquivo de rollback junto da migration; dono revisa a matriz de riscos |
| Riscos | Documento mentir depois da terceira fase |
| Arquivos | `docs/governanca/`, `RELATORIO_ULTIMA_EXECUCAO.md` no fim de cada fase |
| Banco | catálogo relido, não alterado por esta fase |
| Testes | checklist da regra `testar-antes-entregar` |
| Gate | Fase nova não começa com o relatório da anterior desatualizado |

## Ordem

1 → 2 → 3. A Fase 4 não começa no financeiro enquanto R01 e R02 estiverem abertos. Performance (5) e homologação (6) podem ter preparo em paralelo depois da Fase 1, sem DDL. Produção (7) só com gate da fase que gerou o diff.
