# RELATÓRIO DA ÚLTIMA EXECUÇÃO

Fase 0 — auditoria e baseline. Data da leitura: 2026-10-19. Código: `c714a624f432e5a471b6347c4afc570382f6aedd`.

Nenhuma alteração funcional. Nenhum SQL de escrita. Nenhuma migration. Nenhum merge. Nenhuma publicação.

## 1. Projeto

Sistema Grupo TM SEG (`grupo-tmseg`). Checkout `/workspace`. Produção `https://sistema.grupotmseg.com.br`, projeto Vercel documentado `sistema-grupo-tm-seg` (`prj_vFuq5oPg20uHhSg59h9z2UCiRtkZ`). Supabase do app: `ajhmmjuewdsukecaimik`. Supabase da comissão da outra empresa: `erjhxwbutjyylxdthuuz` (TORRES).

## 2. Git

Remote `grupotmsegthiago/Sistema-Grupo-TM-SEG`. Início da sessão na `main`, working tree limpa, HEAD = `origin/main`. `origin/dev` = `766c9895`, 31 commits atrás, zero commits exclusivos. Branch local `dev` não existe. Histórico com 3229 commits. Produção `/api/version` devolve o mesmo `buildId` e `version` `3.7.65` (`builtAt` 2026-10-16T21:48:03.942Z). `/api/health` ok.

## 3. Stack

React 18 + Vite 5 + TypeScript na raiz. Express 5 + serverless-http na Vercel. Postgres Supabase. Auth do app em `system_users` (texto puro), não Supabase Auth. Tailwind, TanStack Query. npm com lockfile. Node declarado 24.x; esta sessão rodou Node 22.14.0. Drizzle presente e inativo. Sem `.github`. 50 funções no `vercel.json`, 9 crons, 182 rewrites.

## 4. Arquitetura

`index.html` → `index.tsx` → `App.tsx` com `?page=`. Dev: `tsx server/index.ts` na porta 5000. Produção: estático em `dist/public` e API no Express empacotado mais handlers em `api/`. Workers contínuos só no processo longo; na Vercel o cron substitui. Detalhe em `docs/governanca/01-ARQUITETURA-ATUAL.md`.

## 5. Banco

Dois catálogos. O app usa `missions` (6306 linhas visíveis à anon), `financial_transactions` (3385), `financial_invoices` (199), `system_users` (28). `service_orders` não existe nesse projeto.

O conector SQL desta sessão abriu outro Postgres 17.6 (papel read-only): 129 tabelas, OS em `service_orders`, faturamento em `escort_billings`/`invoices`, papel `torres_billing_rpc_owner`. Compatível com a TORRES. Não é o banco da TM SEG. Policies e triggers da TM SEG ficaram NÃO CARREGADOS. Migrations do git (71 arquivos) não são o histórico `supabase_migrations` de nenhum dos dois de forma automática no deploy.

## 6. Domínios

OS, controle diário, faturamento/NF, financeiro, comissões (TM SEG + TORRES), clientes e tabelas, fornecedores/agentes/frota, DHL, portais CEVA/IBL, RH/ponto, WhatsApp, investimento, patrimônio, acesso/plataforma, custo de IA. Jurídico é tela; tabela própria não apareceu. Armas e escolta `escort_*` são do outro catálogo, não da TM SEG. Mapa em `docs/governanca/02-MAPA-DOMINIOS.md`.

## 7. Writers e readers

Valor oficial da OS gravado por modais no browser e por rotas admin com service role. Fatura gravada pelo boletim, pelo controle de NF, pelo Asaas e por workers. Comissão tem três gatilhos (faturar, ingest, Asaas). Schema também é escrito em runtime via `exec_sql`. Leitura canônica existe (`computeCanonicalRevenueCost`) e não é a única leitura. Detalhe em `docs/governanca/03-WRITERS-READERS.md`.

## 8. Cálculos

Motor de OS: `calculateMissionFinancials` em `lib/financialUtils.ts`. Custo de fornecedor: `lib/providerAutoPricing.ts` (cópia em `motor-calculo-padrao/`). Pedágio: QualP, Gemini e colunas persistidas. Comissão: `lib/comissao/comissaoCalc.ts` sobre fatura. Fatura aberta soma colunas já salvas. Frontend calcula e também persiste. Há fallback de estimativa quando não há valor aprovado. Override manual com motivo bloqueia resync. Não foi reexecutado cálculo de OS real nesta fase.

## 9. Integrações

Asaas, PlugNotas, Z-API, Gemini, SMTP, Google/Esri/OSM, QualP, TORRES, CEVA, IBL, DHL público, Cursor/Stripe (custo interno), web push. eNotas/Focus sem cliente ativo. Segredos não foram lidos. `docs/governanca/05-INTEGRACOES.md`.

## 10. Segurança

P0: senha em texto legível pela anon key; anon lê OS, financeiro, preço, salário e ponto; ingest de comissão aceita a anon key; token de logout global no fonte.

P1: `exec_sql` dinâmico (GRANT na TM SEG não validado); Gemini e geocode sem sessão; chave Google no fonte; webhook WhatsApp opcionalmente sem secret; Bearer decorativo; hard delete financeiro; 50/50 funções Vercel; no outro banco, RPC de pedágio executável por anon.

Catálogo de policy da TM SEG: NÃO CARREGADO. Prova de exposição: Data API, 2026-10-19.

## 11. Testes

256 `scripts/*.test.ts`, 4 `*.test.tsx`, runner `scripts/run-tests.sh`. Sem Playwright, sem Cypress, sem GitHub Actions. Nesta fase não se criou teste e não se rodou a suíte (nada de código funcional mudou). Domínios com teste visto no nome dos arquivos: Asaas, comissão, CEVA, DHL, WhatsApp, integridade financeira, controle diário. Lacuna: login/senha e RLS não têm prova automática de que a anon deixa de ler senha — porque hoje ela lê.

## 12. Deploy

`publicar.ps1`: exige `dev` limpa, merge `dev` → `main`, push das duas, volta para `dev`. Não dá fast-forward da `dev`. Vercel publica a `main` no projeto oficial. Migrations não rodam nesse script. Rollback de app é revert de git; rollback de banco está só em 6 arquivos `migrations/rollback/` de agosto/2026. Backup de banco não foi inspecionado no painel.

Risco: publicar a partir da `dev` remota atual não regride a `main` (a `dev` é ancestral), mas também não atualiza a `dev`. Novo trabalho em cima dela parte de código velho.

## 13. Findings

| Sev. | IDs |
| --- | --- |
| P0 | R01 senha, R02 anon no dado vivo, R03 ingest, R04 logout global |
| P1 | R05 exec_sql, R06 Gemini, R07 mapas, R08 writers da OS, R09 totais, R10 hard delete, R11 webhook Asaas, R12 50 funções, R13 dev atrás, R14 três schemas, R15 webhook WhatsApp, R16 Bearer fraco, R25 RPC anon no outro banco |
| P2 | R17 Resend na Edge, R18 código duplicado, R19 legado de template, R20 acesso por nome, R21 conector no projeto errado, R22 sem CI, R23 Node 22 vs 24, R26 RLS opaco no outro banco |
| P3 | R24 SQL vazio na raiz, SEC-19 role helper anon no outro banco |

R27 e R28 são decisão de negócio (comissão em dois cliques; override manual).

## 14. Riscos

O maior risco operacional da próxima sessão é tratar o catálogo do conector como se fosse a TM SEG e alterar `service_orders` / `escort_billings`. O maior risco de dado é a anon key já publicada enxergar senha e financeiro. O maior risco de deploy é acrescentar a 51ª entrada em `functions`.

## 15. Pendências

- Catálogo interno (policies, triggers, grants, funções) do projeto `ajhmmjuewdsukecaimik`: NÃO CARREGADO.
- Confirmar no painel se o conector desta sessão é de fato `erjhxwbutjyylxdthuuz`.
- Contagem de `system_logs`: timeout.
- Prova de bundle: algum módulo de `lib/` com service role entra no JS do browser? Não verificado.
- Storage: buckets citados no código; políticas de objeto não lidas.
- Suíte de testes não executada nesta fase.

## 16. Plano de fases

Fase 1 governança, 2 segurança, 3 integridade e fonte única, 4 correções funcionais, 5 performance, 6 homologação, 7 produção, 8 governança permanente. Gates em `docs/governanca/07-PLANO-DE-FASES.md`. Fase 4 de financeiro não começa com R01 e R02 abertos.

## 17. Próximo passo exato

Autorizar a Fase 1: escrever o mapa de donos por domínio e a regra “conector atual ≠ banco da TM SEG”; não acrescentar função no `vercel.json`; não criar `exec_sql` novo. Em seguida, autorizar a Fase 2 começando por um único change set: login que não lê `password` no browser e policy que impede a anon de selecionar essa coluna e as tabelas financeiras. Sem isso, não há correção segura de cálculo.

## 18. Maturidade

52% na régua da Fase 0 (operação 80, regras 65, segurança 25, governança 35, testes 60; pesos 25/20/25/15/15).

## 19. Arquivos criados

- `docs/governanca/00-RAIO-X-GRUPO-TM-SEG.md`
- `docs/governanca/01-ARQUITETURA-ATUAL.md`
- `docs/governanca/02-MAPA-DOMINIOS.md`
- `docs/governanca/03-WRITERS-READERS.md`
- `docs/governanca/04-BANCO-E-SEGURANCA.md`
- `docs/governanca/05-INTEGRACOES.md`
- `docs/governanca/06-RISCOS-E-DIVIDAS.md`
- `docs/governanca/07-PLANO-DE-FASES.md`
- `RELATORIO_ULTIMA_EXECUCAO.md`

Nenhum arquivo funcional foi editado.

## 20. BLOCO PARA CONTINUAÇÃO EM OUTRA IA

```
CONTEXTO: Sistema Grupo TM SEG. Fase 0 concluída em 2026-10-19.
REPO: grupotmsegthiago/Sistema-Grupo-TM-SEG
SHA DE PRODUÇÃO: c714a624f432e5a471b6347c4afc570382f6aedd
PRODUÇÃO: https://sistema.grupotmseg.com.br build 3.7.65 = esse SHA. Health ok.
VERCEL: somente sistema-grupo-tm-seg. Nunca o projeto workspace.
SUPABASE APP: ajhmmjuewdsukecaimik. Tabela da OS = missions. Login = system_users.password em texto, lido pela anon key commitada em lib/supabaseDefaults.ts.
SUPABASE TORRES: erjhxwbutjyylxdthuuz. OS de lá = service_orders. Fatura = escort_billings/invoices. O conector SQL usado na Fase 0 caiu NESSE modelo, não na TM SEG. Não aplicar DDL nele achando que é o app.
DEV REMOTA: 766c9895, 31 commits atrás de main. Não publicar em cima dela sem fast-forward.
PROIBIDO ATÉ NOVA ORDEM: editar cálculo de OS, Asaas, PlugNotas, refatorar, aplicar migration, merge, deploy.
P0 ABERTO: R01 senha, R02 anon lê financeiro/OS/RH, R03 ingest aceita anon key, R04 token de logout no fonte.
LER ANTES DE CODAR: docs/governanca/00 a 07 e este relatório.
PRÓXIMO PASSO: Fase 1 governança, depois Fase 2 num único change set de login+RLS. Não corrigir fórmula.
```

## VEREDITO FINAL

GRUPO TM SEG — FASE 0 CONCLUÍDA

BASELINE DOCUMENTADO

NENHUMA ALTERAÇÃO FUNCIONAL EXECUTADA
