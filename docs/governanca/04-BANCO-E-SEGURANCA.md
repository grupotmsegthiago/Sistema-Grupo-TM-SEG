# 04 — Banco e segurança

Somente leitura em 2026-10-19. Nenhum DDL, DML, `apply_migration` ou `scripts/apply-*-migration.mjs`.

## Dois catálogos

| | TM SEG (app) | Projeto do conector Supabase desta sessão |
| --- | --- | --- |
| Ref no código | `ajhmmjuewdsukecaimik` | não devolvido pelo conector. Modelo compatível com TORRES `erjhxwbutjyylxdthuuz` |
| Como foi lido | Data API com a anon key já presente em `lib/supabaseDefaults.ts`. Sem service role | SQL de catálogo com `supabase_read_only_user` |
| OS | `missions` existe (6306 visíveis) | `service_orders`. `missions` ausente |
| Usuários do app | `system_users` (28) | `users`. `system_users` ausente |
| Fatura do app | `financial_invoices` | `invoices` + `escort_billings` |
| Policies, triggers, grants | NÃO CARREGADO | ENCONTRADO |

A anon key do repositório foi aceita pelo Auth (`/auth/v1/health` 200) e pelo PostgREST de tabelas. O OpenAPI em `/rest/v1/` respondeu 401 pedindo service role. Por isso a lista de tabelas da TM SEG é a interseção com os `.from('...')` do código, não o catálogo inteiro.

## TM SEG — exposição medida

Chave anon do repositório, `select` mínimo, corpo descartado depois da contagem.

| Tabela | HTTP | Linhas visíveis à anon | Leitura |
| --- | --- | --- | --- |
| `missions` | 206 | 6306 | conjunto operacional |
| `mission_history` | 206 | 195274 | histórico |
| `financial_transactions` | 206 | 3385 | financeiro |
| `financial_invoices` | 206 | 199 | faturamento |
| `financial_invoice_missions` | 206 | 1176 | vínculo |
| `financial_accounts` | 206 | 11 | bancos |
| `financial_categories` | 206 | 50 | plano de contas |
| `comissoes` | 206 | 139 | comissão |
| `clients` | 206 | 109 | clientes |
| `client_price_tables` | 206 | 1353 | preço |
| `client_routes` | 206 | 1470 | rotas |
| `client_vehicles` | 206 | 2036 | carga |
| `providers` | 206 | 66 | fornecedores |
| `provider_cost_tables` | 206 | 1185 | custo |
| `agents` | 206 | 2202 | agentes |
| `vehicles` | 206 | 1069 | frota |
| `system_users` | 206 | 28 | identidade; coluna `password` legível |
| `profiles` | 206 | 8 | perfis |
| `rh_employees` | 206 | 19 | RH |
| `rh_salary_configs` | 206 | 16 | salário |
| `time_clock` | 206 | 1061 | ponto |
| `dhl_viatura_disponivel` | 206 | 79 | operação DHL |
| `os_action_plans` | 206 | 8 | plano |
| `mission_occurrences` | 206 | 42 | ocorrência |
| `api_usage_logs` | 206 | 1035 | uso |
| `mission_live_tracks`, `mission_live_positions` | 401 | — | recusa |
| `system_logs` | 500 | NÃO CARREGADO | timeout `57014` |
| `system_settings`, instâncias WhatsApp, várias RH/investimento | 200 | amostra 0 | existe; anon não viu linha |
| `service_orders`, `invoices`, `escort_billings`, `users`, `weapons`, `mission_photos` | 404 | — | não estão neste projeto |

A coluna `password` de `system_users` voltou HTTP 200 para a anon. O valor lido não é hash bcrypt. O conteúdo não foi registrado.

RLS real (policies, FORCE, grants) da TM SEG: **NÃO CARREGADO**. O fato de a anon ler milhares de linhas financeiras já é evidência de policy permissiva ou de grant amplo, não de “RLS desligado” — isso não foi distinguido.

## Migrations versionadas no git

71 arquivos em `migrations/` mais 6 rollbacks de RLS (agosto/2026, billing, pagamentos, snapshots, RH). Nomes cobrem WhatsApp, RH, ponto, billing Cursor, comissões, fatura–OS, CEVA, IBL, ocorrência, velada, controle diário, plano de ação, DHL, pedágio, portal.

Não há pasta `supabase/migrations` no formato CLI. O app não aplica essa pasta no deploy da Vercel. Aplicação conhecida:

- colar SQL no Studio (comentário em `scripts/dhl-migrations.sql`);
- `exec_sql` em runtime;
- `scripts/apply-billing-usage-migration.mjs`, `apply-account-balance-snapshots-migration.mjs`, `apply-gestao-investimento-migration.mjs`.

Consequência: tabela no ar sem arquivo, e arquivo ainda não aplicado, não foram conciliados 1 a 1 no Postgres da TM SEG. Estado: **CONSULTA INCOMPLETA** para “objeto versionado ausente no live” e “objeto live sem migration”. A sondagem mostra tabelas do código que existem no ar (`missions` não tem `CREATE TABLE` neste repositório — o núcleo nasceu fora destes 71 arquivos).

## Projeto do conector (não usar como banco da TM SEG)

Postgres 17.6. Schema `public`: 129 tabelas, RLS em todas, 0 tabelas sem RLS, 70 tabelas com RLS e zero policies (Data API fechada para anon/authenticated se não houver policy; service role segue passando). 81 policies. 13 policies com `USING/CHECK true`. 2 policies envolvendo anon ou public de forma ampla, destaque `dhl_viatura_disponivel` `FOR ALL` para anon e authenticated com `true/true`.

Papel `torres_billing_rpc_owner` tem policy `true` em `invoices`, `escort_billings`, `escort_contracts`, `boletim_approvals`, `service_orders`, `mission_photos`, `financial_transactions` (select), `system_audit_logs` (insert).

Funções SECURITY DEFINER públicas incluem `exec_sql(query text)` sem `search_path`, `sync_os_pedagio_to_billing` (anon pode executar), `get_app_user_role` (anon pode executar), `write_escort_billing_atomic` (só service role), `create_boletim_approval_atomic`, `freeze_boletim_billings_atomic`.

Triggers: guarda de boletim, guarda de `escort_billings`, `block_relink_cancelled_invoice`, guarda de cancelamento de invoice, `trg_ajustar_data_missao`, `trg_validate_service_order_approval`, histórico de localização.

View `v_resumo_financeiro` agrega `financial_transactions` e não declara `security_invoker`. Grants dessa view: a consulta a `information_schema.role_table_grants` voltou vazia para o papel read-only — **NÃO VALIDADO**.

Histórico `supabase_migrations` do conector tem dezenas de versões (nomes como `atomic_billing_expand`, `sync_os_pedagio_to_billing`, `invoices_focus_nfe`). Esses nomes não são os arquivos `migrations/2026_*.sql` deste repositório. Os dois históricos divergem de propósito.

pg_cron: snapshot de memória por minuto e prune diário de amostras. Comandos não foram lidos.

## Segurança da aplicação (código + prova mínima)

Classificação: BUG (comportamento errado), RISCO (pode ser abusado), DÍVIDA (atalho consciente), LEGADO, MELHORIA, DECISÃO DE NEGÓCIO.

### P0

| ID | Classe | Achado |
| --- | --- | --- |
| SEC-01 | RISCO | Senha de `system_users` em texto, comparada no browser (`components/Login.tsx`). A anon key commitada lê a coluna. `bcryptjs` não é usado. |
| SEC-02 | RISCO | A mesma anon key lê OS, histórico, financeiro, preço, RH, salário e ponto. Quem tem o JS publicado tem a chave. |
| SEC-03 | RISCO | `api/comissoes-ingest.ts` trata a anon key da TM SEG como token de ingest, ao lado de `COMISSAO_INGEST_TOKEN` e `CRON_SECRET`. |
| SEC-04 | RISCO | `lib/forceLogout.ts` fixa `FORCE_LOGOUT_EMERGENCY_TOKEN` no fonte. `api/admin/force-logout-all.ts` aceita esse valor. O literal não é repetido aqui. |

### P1

| ID | Classe | Achado |
| --- | --- | --- |
| SEC-05 | RISCO | `exec_sql` SECURITY DEFINER é criado e chamado por vários módulos com SQL dinâmico. No catálogo do conector, anon não executa. No Postgres da TM SEG o GRANT está **NÃO VALIDADO**. |
| SEC-06 | RISCO | `POST /api/gemini/generate` e o health de Gemini não exigem sessão. Custo e abuso da chave. |
| SEC-07 | RISCO | `api/geocode-address.ts`, `reverse-geocode`, `distance-matrix`, `route-progress` sem sessão. Chave Google também está no fonte (`lib/maps.ts`, `lib/routeDistance.ts`). |
| SEC-08 | RISCO | Webhook WhatsApp inbound segue sem secret se a env estiver vazia. |
| SEC-09 | DÍVIDA | Vários POST exigem só “Bearer presente”, sem resolver usuário: reset request, e-mails de missão, pedágio QualP/Gemini. |
| SEC-10 | RISCO | Hard delete de `financial_invoices` e `financial_transactions` no browser. |
| SEC-11 | RISCO | No catálogo do conector, `sync_os_pedagio_to_billing` é executável por anon. Se esse banco for a TORRES de produção, o efeito é escrita de pedágio sem sessão do app. |
| SEC-12 | RISCO | `vercel.json` está com 50 funções, no limite que já derrubou deploy. |

### P2

| ID | Classe | Achado |
| --- | --- | --- |
| SEC-13 | LEGADO | Edge `send-welcome-email` com chave Resend no arquivo. Cópias em `attached_assets/`. |
| SEC-14 | RISCO | `api/zapi/health` e `api/version` públicos. Version expõe `buildId` (já é o git) e pode incluir sinal de logout. |
| SEC-15 | DÍVIDA | `ensureRhTables` e crons de schema aplicam DDL sozinhos. |
| SEC-16 | RISCO | Cockpit da Diretoria também olha nome de pessoa, não só perfil (`lib/diretoriaAccess.ts`). |
| SEC-17 | RISCO | 70 tabelas do outro projeto com RLS e zero policies: fail-closed na API, opaco para operação, e service role ignora. |
| SEC-18 | DÍVIDA | View financeira do outro projeto sem `security_invoker`. |

### P3

| ID | Classe | Achado |
| --- | --- | --- |
| SEC-19 | MELHORIA | `get_app_user_role` no outro projeto é EXECUTE para anon, com `search_path` fixo. |
| SEC-20 | LEGADO | Drizzle, `netlify.toml` vazio, SQL solto na raiz vazio, README de AI Studio. |
| SEC-21 | DÍVIDA | `.env.example` documenta nomes reais de env e um identificador de wallet Asaas. Valores de secret não estão preenchidos. Telefone oficial de exemplo está no exemplo de Z-API. |

## O que não foi feito

Não foi lido service role, não foi listado storage object, não foi dump de linha de negócio, não foi advisor de segurança do painel, não foi teste de escrita. Upload `multer` foi só localizado, não exercido.

## Matriz resumida pedida (TM SEG)

Policies e triggers da TM SEG ficam como NÃO CARREGADO de propósito.

| Domínio | Tabela | Finalidade | Writers | Readers | RLS | Triggers | Migration no git | Risco |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OS | `missions` | ordem de serviço e valores oficiais | F + S + A | painel, boletim, portais | anon lê 6306; policy NÃO CARREGADA | NÃO CARREGADO | núcleo sem CREATE neste repo | P0 exposição + writers paralelos |
| OS | `mission_history` | trilha | não achado insert no TS | telas de histórico | anon lê 195274 | NÃO CARREGADO | não localizado CREATE | P0 volume |
| Faturamento | `financial_invoices` | fatura / NF | F + L + worker + webhook | financeiro, comissão | anon lê 199 | NÃO CARREGADO | alters em `migrations/2026_09_*` e `2026_10_*` | P0 + hard delete |
| Financeiro | `financial_transactions` | títulos | F + L + Asaas + comissão | cockpit, contas | anon lê 3385 | NÃO CARREGADO | pagamentos parciais `2026_07_20` | P0 |
| Comissão | `comissoes` | comissão comercial | L ingest, fatura, Asaas | Diretoria | anon lê 139 | NÃO CARREGADO | `2026_09_08` e `2026_10_13` | P0 + ingest |
| Acesso | `system_users` | login | UserForm, portal | Login, APIs | anon lê senha | NÃO CARREGADO | sem CREATE do núcleo | P0 |
| RH | `rh_salary_configs`, `time_clock` | salário e ponto | APIs RH | RH | anon lê | NÃO CARREGADO | `2026_07_07` e `2026_07_08` | P0 |
| Rastreio | `mission_live_tracks` | posição ao vivo | lib live track | portal público com token | anon 401 | NÃO CARREGADO | `2026_09_14_mission_live_track.sql` | menor que o restante |
| DHL | `dhl_viatura_disponivel` | aviso de viatura | API viaturas | painel | anon lê 79; a migration do git cria policy `true` | NÃO CARREGADO | `2026_10_06` | policy aberta no arquivo |
| WhatsApp | `whatsapp_instances` | credencial da instância | servidor | painel | anon amostra 0 | NÃO CARREGADO | `2026_07_07` | token pode estar só no servidor; não provado |
