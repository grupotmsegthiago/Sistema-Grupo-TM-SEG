# 02 — Mapa de domínios

Domínios extraídos do menu, de `lib/` e das tabelas que o código acessa no projeto `ajhmmjuewdsukecaimik`. Contagens são linhas visíveis à chave anon do repositório em 2026-10-19 (Data API, `Prefer: count=exact`). Não são uma auditoria de RLS no catálogo — esse catálogo da TM SEG não foi carregado.

`*/0` significa HTTP 200 sem linha na amostra e content-range sem total útil: tabela exposta e vazia para essa chave, ou RLS devolvendo zero. Não foi tratado como “não existe”.

## OS e monitoramento

| | |
| --- | --- |
| Fonte da verdade | `missions` |
| Volume visível | 6306 |
| Writers | `MissionForm`, `UpdateMissionModal`, `MissionFinancialModal`, `MissionTable`, `ClientMissionRequest`, `ClientBillingReport`, `ExecutiveDashboard`, rotas admin em `server/routes.ts`, `api/recalculate-open.ts`, workers de e-mail e velada, intake DHL |
| Readers | painel, boletim, cockpit, portais CEVA/IBL, relatórios, comissão (via fatura) |
| Regras | `calculateMissionFinancials`; override manual com motivo; snapshot; trava de prejuízo descrita nas regras de reunião (não reauditada linha a linha nesta fase) |
| Cálculo oficial | colunas persistidas (`revenue_value`, `cost_value`, pedágio, deslocamento). O motor no browser é projeção até o save |
| Risco | dois escritores (browser com anon/RLS e service role) na mesma linha |

Histórico: `mission_history` visível com 195274 linhas. `mission_logs` exposta. O TypeScript encontrado não dá `insert` nessas tabelas de histórico; a gravação pode estar no banco (não lido) ou em caminho não achado.

Ocorrência da OS: `mission_occurrences` (42). Plano de ação: `os_action_plans` (8). Controle diário: `controle_diario_notas` (1 visível). Análise da diretoria: `os_analysis_requests` (18).

Rastreio ao vivo: `mission_live_tracks` e `mission_live_positions` existem e respondem 401 à chave anon. Único par sondado que recusou a anon.

## Faturamento e NF

| | |
| --- | --- |
| Fonte da verdade da fatura | `financial_invoices` (199) |
| Vínculo OS–fatura | `financial_invoice_missions` (1176) |
| NF extra | `financial_invoice_nf_vinculos` (6), `financial_invoice_divergencia_vista` (4) |
| Writers | `ClientBillingReport`, `FinancialInvoiceControl`, `ManualBilledInvoiceDialog`, `lib/persistAsaasChargeInvoice.ts`, `lib/billing/sincronizarFaturaAberta.ts`, `server/nfRetryWorker.ts`, webhook Asaas |
| Integrações | Asaas e PlugNotas. eNotas/Focus não têm cliente ativo no `server/` |
| Cálculo | soma de receita + pedágio cliente + deslocamento já gravados na OS. Não recalcula a tarifa |
| Risco | hard delete de fatura no browser (`FinancialTransactionList`, `ManualBilledInvoiceDialog`); webhook Asaas responde 200 mesmo com erro interno |

## Financeiro

| | |
| --- | --- |
| Fonte da verdade do título | `financial_transactions` (3385) |
| Apoio | `financial_accounts` (11), `financial_categories` (50), `financial_transaction_payments` (exposta, amostra 0), `payment_anticipations` (1), `payment_anticipation_links` (3) |
| Writers | formulários financeiros no browser, baixa manual via RPC `registrar_baixa_manual_fatura`, sync RPC `sincronizar_faturas_pagas_contas_receber`, comissão, Asaas, importação de extrato |
| Readers | cockpit, contas a pagar/receber, boletim, comissão |
| Risco | anon lê o conjunto; importador e lista apagam título; view de resumo não foi localizada neste projeto (a view `v_resumo_financeiro` está no outro catálogo) |

`account_balance_snapshots` está no código e na API; a anon não viu linha.

## Comissões comerciais

| | |
| --- | --- |
| Fonte na TM SEG | `comissoes` (139), `comerciais` (2), `regras_comissao` (1) |
| Cálculo | `lib/comissao/comissaoCalc.ts` sobre valor faturado |
| Writers | `lib/comissao/comissaoCore.ts`, ingest `api/comissoes-ingest.ts`, `comissaoService.ts` (conta a pagar), Asaas |
| TORRES | outro Supabase. Tabelas de lá: `invoices`, `escort_billings`, `service_orders`. Escritor: `lib/comissao/contaPagarTorres.ts` no clique, não na troca de mês |
| Risco | ingest aceita `COMISSAO_INGEST_TOKEN`, `CRON_SECRET` ou a anon key da TM SEG como credencial (`api/comissoes-ingest.ts`) |

## Clientes, preço e rotas

`clients` (109), `client_price_tables` (1353), `client_routes` (1470), `client_vehicles` (2036), `tabela_precos_regioes` (6), `quotes` (23).

Writers de tela: `ClientForm`, listas e importadores de tabela, cotação regional. Há update em massa de clientes em `server/routes.ts`.

`commercial_proposals` e `client_registries` aparecem no código e não estão no schema cache da TM SEG (404). Propostas de tela usam `quotes`.

Contratos de menu (`contract-manager`) não ganharam tabela própria nesta sondagem. Não inventar entidade.

## Fornecedores, agentes, frota

`providers` (66), `provider_cost_tables` (1185), `agents` (2202), `vehicles` (1069), `vehicle_technologies` (6).

`provider_escoltistas` e `provider_intake_vehicles` expostas com amostra 0. `support_agents` amostra 0.

Motor de custo automático: `lib/providerAutoPricing.ts`. Duplicata de referência em `motor-calculo-padrao/`.

## DHL

Intake: `dhl_supplier_intakes`, resends, ocorrência `dhl_occurrence_reports` (amostra 0 para a anon — podem estar fechadas por RLS ou vazias). `dhl_viatura_disponivel` visível com 79 linhas.

Writers: `server/dhlSupplierIntake.ts` e `lib/dhl-intake/*` (lógica espelhada), `api/dhl/occurrence-report.ts` (diretoria), endpoints públicos por token.

## Portais CEVA e IBL

Handlers `api/ceva-portal.ts` e `api/ibl-portal.ts` reutilizam `lib/cevaPortal/httpHandler.ts`. Login próprio de portal. Relatório em memória chama o mesmo motor de OS. IBL não tem writer próprio além do núcleo CEVA.

## RH e ponto

`rh_employees` (19), `rh_salary_configs` (16), `rh_positions` (7), `rh_tax_brackets` (9), `rh_awards` (6), `rh_audit_logs` (46), `rh_departments` (1). Várias tabelas RH expostas com amostra 0 (`rh_payroll_*`, documentos, exames, contas bancárias).

Ponto: `time_clock` (1061) visível à anon. Writers: `lib/timeclock/registerPunch.ts`, `server/timeclockPunch.ts`, ajuste que apaga e reinsere.

Bootstrap: `lib/rh/ensureRhTables.ts` cria `exec_sql` SECURITY DEFINER via `DATABASE_URL` quando roda.

`employees`, `armamentos`, `weapons` do outro catálogo não estão na TM SEG (404).

## WhatsApp

Tabelas `whatsapp_instances`, `whatsapp_messages`, `whatsapp_outbound_log`, `whatsapp_session_events` expostas, amostra 0 para a anon. Não concluir que a instância está vazia: a policy pode esconder a linha e o token.

Writers de servidor: `lib/whatsappLiteApi.ts`, `server/whatsapp/instanceStore.ts`, telemetria, locks em `system_settings`.

`system_settings` respondeu 200 com amostra 0 à anon.

## Investimento e patrimônio

Tabelas `investment_*` e `investor_profiles` expostas, amostra 0. `patrimonio_equipments` e `patrimonio_custom_types` amostra 0. Writers em `server/gestaoInvestimentoRoutes.ts` e `server/patrimonioStore.ts`. Cron de schema e de cache.

## Plataforma, acesso, custo de IA

`system_users` (28) e `profiles` (8) são a identidade do app. `billing_usage` é espelho Cursor/Stripe, não faturamento de cliente. `api_usage_logs` (1035) visível. `system_logs` existe e a contagem estourou timeout do banco (`57014`) — volume NÃO CARREGADO.

`push_subscriptions` amostra 0. E-mail operacional sai por SMTP (`lib/email/smtp.ts`), fila no cron.

## Jurídico, armas, escolta armada

O menu tem Jurídico. Não apareceu tabela `juridico` na sondagem dos `.from()`. Armas e escolta (`weapons`, `armamentos`, `escort_*`, `service_orders`) são do catálogo do outro projeto, não da TM SEG. No app, “escolta” operacional é a OS (`missions`) e o portal de fornecedor. Não promover essas tabelas do outro banco a domínio da TM SEG.

## Domínios do catálogo ligado ao conector (não são o app TM SEG)

129 tabelas `public`, todas com RLS ligado, 70 sem nenhuma policy, 81 policies no total, 59 funções, 349 índices, 9 triggers, 1 view (`v_resumo_financeiro`, sem `security_invoker`).

OS de lá é `service_orders` (triggers `trg_ajustar_data_missao`, `trg_validate_service_order_approval`). Faturamento: `escort_billings`, `invoices`, `mission_costs`, `boletim_approvals`. Há `exec_sql(query text)` SECURITY DEFINER com `search_path` nulo, EXECUTE só para `service_role` nesse catálogo. `sync_os_pedagio_to_billing` é EXECUTE para `anon` e `authenticated` nesse catálogo.

pg_cron nesse projeto: `memory-snapshot-every-minute`, `prune-db-health-samples-daily`.

Extensões instaladas vistas: plpgsql, pgcrypto, uuid-ossp, pg_trgm, supabase_vault, postgis, pg_stat_statements, pg_cron.
