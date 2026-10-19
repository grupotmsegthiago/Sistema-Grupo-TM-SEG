# 00 — Raio-X Grupo TM SEG

Fase 0. Somente leitura. Baseline de 2026-10-19.

Nenhuma alteração funcional, nenhuma migration, nenhum merge e nenhuma publicação foram executados para produzir este documento.

## Identidade

| Campo | Valor confirmado |
| --- | --- |
| Nome | Sistema Grupo TM SEG (`grupo-tmseg` em `package.json`) |
| Caminho local desta sessão | `/workspace` |
| Repositório | `grupotmsegthiago/Sistema-Grupo-TM-SEG` |
| Remote | `origin` → GitHub do repositório acima |
| Branch desta sessão no início | `main` |
| HEAD | `c714a624f432e5a471b6347c4afc570382f6aedd` |
| Último commit | Merge PR #344 `regra/tarifa-tabela-vinculada` (2026-10-16, autor do commit de merge: conta `grupotmsegthiago`) |
| `origin/main` | mesmo SHA do HEAD |
| `origin/dev` | `766c9895079fd93342ad50ad28d52d13c0cfdddf` — ancestral de `main`, 31 commits atrás |
| Branch local `dev` | não existe neste checkout |
| Working tree no início | limpa |
| Produção | `https://sistema.grupotmseg.com.br` |
| Projeto Vercel documentado | `sistema-grupo-tm-seg` (`prj_vFuq5oPg20uHhSg59h9z2UCiRtkZ`), fonte `AGENTS.md` |
| Confirmação ao vivo | `GET /api/health` → `status: ok`; `GET /api/version` → `version 3.7.65`, `buildId` igual ao HEAD, `builtAt` 2026-10-16T21:48:03.942Z |
| Supabase do app | `ajhmmjuewdsukecaimik` (`lib/supabaseDefaults.ts`) |
| Supabase TORRES (outro projeto, usado por comissão) | ref documentado `erjhxwbutjyylxdthuuz` (`lib/comissao/torresSupabase.ts`) |
| Ambiente desta auditoria | checkout de produção (`main` = build publicado); Node v22.14.0; npm 10.9.7 |
| Runtime declarado | `package.json` `engines.node` = `24.x` |
| Package manager | npm (`package-lock.json` lockfileVersion 3, `.npmrc` com `legacy-peer-deps=true`) |
| Build | `node scripts/generate-build-meta.mjs && vite build && node build-server.mjs` |
| Deploy | Vercel, `outputDirectory` `dist/public`, install `npm install --no-audit --no-fund --legacy-peer-deps`. A `main` dispara o deploy. Script Windows `publicar.ps1` faz merge `dev` → `main` e push. |

## Dois bancos, não um

O código do app lê e grava o projeto `ajhmmjuewdsukecaimik`. A sonda com a chave anon já commitada enxergou `missions` (6306 linhas visíveis), `system_users` (28), `financial_transactions` (3385). `service_orders`, `invoices` e `escort_billings` não existem nesse schema cache (HTTP 404).

O conector Supabase desta sessão (papel `supabase_read_only_user`, Postgres 17.6) abriu outro catálogo: 129 tabelas em `public`, OS em `service_orders`, faturamento em `escort_billings` / `invoices`, papel `torres_billing_rpc_owner`. Não há `missions` nem `system_users`. Esse catálogo é compatível com o banco TORRES citado no código. O conector não devolveu o project ref; o ref não foi revalidado por chamada autenticada ao host `erjhxwbutjyylxdthuuz`. Tratar esse catálogo como o Postgres da TM SEG seria erro de fonte.

Estado da integridade desta fase:

| Fonte | Estado |
| --- | --- |
| Git, árvore, `package.json`, `vercel.json` | ENCONTRADO |
| Produção `/api/health` e `/api/version` | ENCONTRADO |
| Exposição Data API da TM SEG via chave anon do repositório | ENCONTRADO (tabelas sondadas a partir dos `.from()` do código) |
| Catálogo Postgres interno da TM SEG (policies, triggers, grants, funções) | NÃO CARREGADO |
| Catálogo Postgres do projeto ligado ao conector | ENCONTRADO, rotulado à parte |
| Valores de secrets | não lidos |

## O que o sistema é

Monorepo React 18 + Vite 5 na raiz, Express 5 empacotado para a Vercel, Postgres no Supabase. Não há React Router. A navegação interna é `?page=` mais `sessionStorage` (`lib/screenNavigation.ts`, `App.tsx`). Páginas públicas usam pathname (`/ceva`, `/ibl`, `/fornecedor/dhl`, `/rastreio`, `/cadastro-operacional`, `/reset-password`).

O login não usa Supabase Auth como fonte da sessão. `components/Login.tsx` lê `system_users` com o cliente anon e compara `password` em texto no browser. `bcryptjs` está no `package.json` e não aparece em uso no TypeScript da aplicação.

A ordem de serviço da TM SEG é a tabela `missions`. Receita, custo, pedágio e deslocamento oficiais são colunas dessa tabela. O motor que projeta esses números é `calculateMissionFinancials` em `lib/financialUtils.ts`. Há writers no browser e writers com service role no servidor para a mesma tabela.

## Stack confirmada no código

| Camada | O que roda |
| --- | --- |
| Frontend | React 18, Vite 5, Tailwind (CDN no `index.html` e config local), TanStack Query, Recharts, jsPDF, html2canvas, pdfjs, ExcelJS, xlsx, Leaflet não é a lib de mapa principal — Google Maps (`@react-google-maps/api`) e tiles Esri/OSM |
| Backend | Express 5 (`server/index.ts`, `server/routes.ts`), `serverless-http` em `api/index.ts`, handlers soltos em `api/*.ts` |
| Banco | Supabase Postgres. Drizzle está no repositório (`drizzle.config.ts`, `shared/schema.ts`) e não é o runtime |
| Auth do app | Tabela `system_users` + `profiles`. Token opaco no `localStorage` |
| Auth Supabase | cliente existe; login principal não chama `signIn` |
| Storage | buckets citados no código: `mission-evidence`, `comissoes-comprovantes` |
| Fila | e-mail em `server/clientEmailQueueWorker.ts`; NF retry; throttle Z-API em memória |
| Cron | 9 entradas em `vercel.json`; em dev, `setInterval` no processo longo |
| Cache | memória no Express; `swr_cache_snapshots` existe no catálogo do outro projeto; gestão de investimento tem refresh próprio |
| Observabilidade | `console` no Express, `system_logs`, `api/system-diagnostics.ts`, `api/health.ts`, `api/version.ts` |
| CI | pasta `.github` ausente |
| Testes | 256 arquivos `scripts/*.test.ts` e 4 `*.test.tsx`, runner `scripts/run-tests.sh`. Sem Playwright/Cypress no `package.json` |

## Pontos de entrada

- Browser: `index.html` → `index.tsx` → `App.tsx`
- Dev: `npm run dev` → `npx tsx server/index.ts` (porta 5000, Vite no mesmo processo)
- Vercel estático: `dist/public`
- Vercel API monolítica: rewrite `/api/(.*)` → `api/index.ts` → `dist/vercelApp.cjs`
- Funções com `maxDuration` próprio: 50 chaves em `vercel.json` `functions` (teto documentado em `AGENTS.md`)

## Leitura obrigatória antes da próxima fase

1. Este arquivo e `06-RISCOS-E-DIVIDAS.md`.
2. Não corrigir P0 nesta fase — a Fase 0 só congela o baseline.
3. Não aplicar SQL de `migrations/` nem de `scripts/apply-*-migration.mjs` sem a fase de banco autorizada.
4. Não publicar com `publicar.ps1` enquanto `origin/dev` estiver 31 commits atrás de `main`. O script não regride a `main` se `dev` for ancestral, mas também não avança a `dev`. Trabalho novo em cima da `dev` remota parte de código velho.
