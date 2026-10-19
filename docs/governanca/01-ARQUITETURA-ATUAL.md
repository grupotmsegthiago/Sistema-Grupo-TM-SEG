# 01 — Arquitetura atual

Baseline de código em `c714a624` (igual ao `buildId` publicado em 2026-10-16). Descrição do que o repositório executa, não do que os README antigos sugerem.

## Forma do sistema

```
Browser
  index.html → index.tsx → App.tsx
  ?page=<tela>  ou  pathname público
        │
        ├─ supabase-js (chave anon) → PostgREST do projeto ajhmmjuewdsukecaimik
        │
        └─ fetch /api/*  (Authorization + x-tmseg-user-id)
                 │
                 ├─ função Vercel dedicada (api/<arquivo>.ts) quando listada
                 └─ api/index.ts → Express (server/routes.ts + registerCronRoutes)
```

Dev local sobe o Express e o Vite na mesma porta. Na Vercel o processo não escuta HTTP contínuo: workers de `server/index.ts` só rodam no host longo; em produção o relógio é o Cron da Vercel.

`client/` não é o app Vite ativo. O root do Vite é a raiz do repositório. `client/public` entra no build como estático PWA. `client/src/main.tsx` aponta para um `App` que não está em `client/src`.

## Pastas

| Caminho | Papel |
| --- | --- |
| `index.html`, `index.tsx`, `App.tsx` | entrada e shell de telas |
| `components/` | 221 TSX. Telas grandes por domínio. Subpastas `ceva`, `dashboard`, `investimentos`, `rh`, `icons` |
| `lib/` | 415 TS/TSX. Regras, motores, clientes HTTP, auth lite |
| `server/` | 81 TS. Express, workers, Asaas/PlugNotas/e-mail no processo |
| `api/` | 114 TS. Handlers Vercel e bundles `*.cjs` gerados |
| `migrations/` | 71 SQL manuais + 6 em `migrations/rollback/`. Não são o histórico `supabase_migrations` |
| `scripts/` | testes `node:test`, diagnósticos, 3 aplicadores manuais de migration |
| `supabase/functions/` | 3 Edge Functions: `reconcile-statement`, `send-welcome-email`, `zapi-webhook` |
| `shared/` | schema Drizzle legado (`users` genérico). Sem `drizzle-orm` no `package.json` |
| `motor-calculo-padrao/` | cópia portátil do motor de custo de fornecedor. Produção usa `lib/providerAutoPricing.ts` |
| `public/` | estáticos, manifest, treinamento |
| `docs/` | auditoria, reunião, DNS. Governança desta fase em `docs/governanca/` |
| `types/`, `types.ts`, `constants.ts` | tipos e constantes de UI |
| `.cursor/rules/` | regras operacionais já existentes (publicar, testar, dev) |

Não há pasta `app/` (não é Next.js). Não há workers separados fora de `server/*Worker*.ts` e `api/cron`.

## Navegação e telas

Catálogo de menu: `lib/navItems.ts`.

Grupos reais: Página inicial, Treinamento, Diretoria (cockpit, faturamento, comissões, investimento, pendências de OS, relatório geral), Monitoramento (painel de OS, controle diário, passagem de plantão, relatório de OS, ranking DHL, fornecedor), Rede de apoio, Financeiro (dashboard, boletim, movimento, NF, contas, bancos, categorias, OS fornecedor), Clientes (cadastro, contratos, usuários, veículos de carga, rotas, propostas), Fornecedores (acionamento, cadastro, alvarás, usuários, viaturas, agentes, rastreador), Jurídico, RH (dashboard, funcionários, folha de ponto), Relatórios, Configurações (backup, custos, equipe, patrimônio, perfis, sistema, logs, status).

Autorização de tela: array `permissions` em `profiles` e em `system_users`, com regras extras por nome de perfil e, no cockpit, por nome de pessoa (`lib/diretoriaAccess.ts`, `lib/screenAccess.ts`).

## Backend

| Peça | Função |
| --- | --- |
| `server/createApp.ts` | JSON até 50mb, log de `/api`, rotas |
| `server/routes.ts` | maior superfície REST, inclusive recálculo de OS e manutenção |
| `server/registerCronRoutes.ts` | crons com `CRON_SECRET` |
| `server/cronAuth.ts` | Bearer do cron |
| `api/health.ts` | health sem Express |
| `api/version.ts` | `build-meta.json`; pode ler sinal de logout |
| `build-server.mjs` | gera `dist/vercelApp.cjs` e bundles auxiliares |

`vercel.json` tem 50 funções, 182 rewrites e 9 crons. O teto de 50 funções é incidente conhecido: passar disso quebra o deploy com erro imediato.

Crons publicados:

| Path | Agenda |
| --- | --- |
| `/api/cron/minute` | todo minuto |
| `/api/cron/zapi` | todo minuto |
| `/api/cron/nf-retry` | cada 5 min |
| `/api/cron/email-queue` | cada 5 min |
| `/api/cron/dhl` | cada 15 min |
| `/api/gestao-investimento/refresh-cache` | cada 30 min |
| `/api/cron/maintenance` | a cada 6 h |
| `/api/cron/gestao-investimento-schema` | a cada 6 h |
| `/api/cron/billing-sync` | 06:00 UTC |

## Dados

Cliente browser: `lib/supabase.ts`, URL e anon de `lib/supabaseDefaults.ts`, com override por `VITE_SUPABASE_*` e injeção `__TMSEG_SUPABASE__` no build.

Service role: `lib/supabaseAdmin.ts` e handlers de `api/` / `server/`. Não há import de `supabaseAdmin` em `components/`. Vários módulos de `lib/` usam service role e também são importados por telas; o risco é o bundle do browser puxar esse módulo. Não foi feita prova de bundle nesta fase.

TORRES: `lib/comissao/torresSupabase.ts` só no servidor, projeto separado. Sem a secret, o quadro da TM SEG segue com o que já foi ingerido.

## O que não é arquitetura ativa

- Drizzle / `server/storage.ts` (`MemStorage`) sem outros importadores.
- `netlify.toml` vazio.
- README ainda descreve AI Studio e `GEMINI_API_KEY` em `.env.local` como fluxo principal. O fluxo real é Vercel + Supabase.
- `database_setup.sql` e vários `fix_*.sql` na raiz estão vazios ou com 3 bytes.
- Edge `send-welcome-email` contém chave Resend no fonte. Não é o caminho de e-mail operacional atual (`lib/email/smtp.ts` usa nodemailer).

## Consistência front e servidor

A mesma regra de OS aparece no browser (`MissionFinancialModal`, `UpdateMissionModal`, `MissionForm`) e no servidor (`server/routes.ts`, `api/recalculate-open.ts`), ambos chamando `calculateMissionFinancials` e gravando `missions`.

Fatura aberta é agregada de novo em `lib/billing/sincronizarFaturaAberta.ts` a partir das colunas já salvas, não a partir de um recálculo de tarifa.

Comissão nasce em mais de um gatilho (`gerarComissaoAoFaturar`, ingest TORRES, pós-Asaas), com busca de duplicata em `findExistingComissao`.
