# 03 — Writers e readers

Inventário do código em `c714a624`. Operação confirmada por leitura dos módulos, não por log de produção. “Paralelo” significa outra escrita na mesma tabela que não passa pela mesma função.

Legenda: **F** browser (cliente anon), **S** Express, **A** handler Vercel, **L** `lib/` chamado por mais de uma camada.

## OS — `missions`

| Writer | Camada | Operação | Origem do dado | Paralelo |
| --- | --- | --- | --- | --- |
| `components/MissionForm.tsx` | F | insert / update | formulário interno | sim |
| `components/ClientMissionRequest.tsx` | F | insert | portal do cliente | sim |
| `components/UpdateMissionModal.tsx` | F | update | operação; dispara sync de fatura | sim |
| `components/MissionFinancialModal.tsx` | F | update | auditoria; persiste o número oficial | sim |
| `components/MissionTable.tsx` | F | update (cancelamento) | operação | sim |
| `components/ClientBillingReport.tsx` | F | update | boletim | sim |
| `components/ExecutiveDashboard.tsx` | F | update em lote | recálculo de UI | sim |
| `server/routes.ts` | S | update | force-recalculate, divergências, override, pedágio | sim, service role |
| `api/recalculate-open.ts` | A | update | recálculo de OS aberta | sim |
| `api/vendor-verification.ts` | A | update | verificação de fornecedor | sim |
| intake DHL `server/dhlSupplierIntake.ts` e `lib/dhl-intake/*` | S/L | update | link público do fornecedor | sim, dois arquivos |
| `server/veladaClosureWorker.ts` | S | update | cron | sim |
| fila de e-mail | S | update de flag | cron / intervalo local | sim |

Validações fortes estão no motor e nos modais, não numa única transação de banco compartilhada. O recálculo TypeScript e o save do modal não são uma transação só.

Readers principais: `MissionTable`, `MissionCard`, boletim, cockpit (`lib/missionFinancialsCanonical.ts`), portais, relatórios DHL.

`mission_history` / `mission_logs`: leitura e, na exclusão de OS, delete de log no `MissionTable`. Insert de histórico não foi achado no TS.

## Fatura — `financial_invoices` e vínculo

| Writer | Operação | Nota |
| --- | --- | --- |
| `ClientBillingReport.tsx` | insert / update | emissão e boletim |
| `FinancialInvoiceControl.tsx`, `ManualBilledInvoiceDialog.tsx` | insert / update / delete | NF e fatura manual |
| `FinancialTransactionList.tsx` | update / delete | também apaga fatura |
| `lib/billing/vincularOSFatura.ts` | upsert `financial_invoice_missions` | |
| `lib/billing/sincronizarFaturaAberta.ts` | update de amount e título | só fatura aberta |
| `lib/persistAsaasChargeInvoice.ts` | insert / update | cobrança |
| `lib/asaasWebhookCore.ts` e syncs | update | baixa por pagamento |
| `server/nfRetryWorker.ts`, `server/invoiceBillingEmail.ts` | update | status NF / e-mail |
| `lib/invoiceManualPayment.ts` | RPC `registrar_baixa_manual_fatura` | caminho com função no banco |
| `lib/invoiceReceivableSync.ts` | RPC de sync de pagas | |

Não há uma RPC “atomic billing” no TypeScript da TM SEG. O nome `atomic_billing_*` aparece no histórico de migrations do outro projeto (conector), não como motor desta OS.

## Títulos — `financial_transactions`

Writers F: `FinancialTransactionForm`, `FinancialTransactionList`, `FinancialDocConferencia`, `BankStatementImporter`, `FinancialAccountManager`, boletim.

Writers L: `lib/financial/confirmReceivablePayClient.ts`, `paymentAnticipationClient.ts`, `receivablePaymentsApiCore.ts`, `lib/comissao/comissaoService.ts`, `sincronizarFaturaAberta.ts`, `persistAsaasChargeInvoice.ts`.

Edge `supabase/functions/reconcile-statement` concilia extrato com Gemini. É outro writer, fora do Express.

Delete físico: lista financeira, importador de extrato, comissão (desfaz título).

## Comissão — `comissoes`

| Writer | Gatilho |
| --- | --- |
| `gerarComissaoAoFaturar` | fatura TM SEG |
| `comissaoIngest` / `api/comissoes-ingest.ts` | push / cron da TORRES |
| `comissaoService.ts` | pagar, comprovante, conta a pagar |
| Asaas sync | status após pagamento |
| `contaPagarTorres.ts` | título no banco TORRES e vínculo `conta_pagar_id` |

Idempotência parcial: `findExistingComissao`. Não há estorno simétrico documentado no fluxo dos dois lados.

`comerciais`: `comissaoUsuarios.ts` e `ComissoesComerciaisPage.tsx`.

## Cadastros

| Tabela | Writers de tela | Writer servidor paralelo |
| --- | --- | --- |
| `clients` | `ClientForm`, `ClientList` | `server/routes.ts` (lote) |
| `client_price_tables` | forms e importador | não mapeado um segundo núcleo |
| `providers`, `provider_cost_tables` | forms e importadores | |
| `agents`, `vehicles` | forms de fornecedor | intake DHL grava escolta/viatura de intake |
| `system_users`, `profiles` | `UserForm`, `ProfileForm` | portais CEVA criam usuário (`cadastroSistema.ts`) |

## RH — `time_clock` e folha

`registerPunch` / `server/timeclockPunch.ts` inserem batida. Ajuste (`timeclockAdjust`, `api/rh-timeclock-adjust.ts`) apaga e reinsere, com `rh_audit_logs`. Folha: `server/rhRoutes.ts`, `lib/rh/payrollClient.ts`. Seed: `api/rh-seed-employees.ts`.

## WhatsApp

`whatsapp_instances` e `system_settings`: `instanceStore`, reconnect, lock de um único código. Mensagens e telemetria: insert de log de saída. Webhooks em `api/whatsapp/webhook/inbound.ts` e `api/zapi-webhook-*.ts`.

## DHL, plano, controle diário

| Tabela | Writer |
| --- | --- |
| `dhl_supplier_intakes` | servidor e lib de intake (duplicados) |
| `dhl_occurrence_reports` | `api/dhl/occurrence-report.ts` |
| `dhl_viatura_disponivel` | `api/viaturas-disponiveis.ts` |
| `os_action_plans` | `lib/osActionPlan/salvarPlanoAcao.ts` upsert |
| `controle_diario_notas` | POST em `server/routes.ts` |
| `mission_occurrences` | diálogo de ocorrência e `lib/toll/pedagioDaOs.ts` |
| `os_analysis_requests` | `lib/osAnalysis/osAnalysisService.ts` com service role |

## Investimento, patrimônio, billing interno

`server/gestaoInvestimentoRoutes.ts` grava perfis, posições, trades, audit. Cache em `system_settings`. Patrimônio: `patrimonioStore`. `billing_usage`: `lib/billing/billingService.ts` (Cursor/Stripe), cron diário.

## Plataforma

`system_logs`: `lib/logger.ts` no cliente e vários serviços. `server/forceLogoutAll.ts`: RPC `force_revoke_all_sessions` quando existe, mais `system_settings`. `push_subscriptions` no Express. Upload de print: `multer` em memória em `server/routes.ts`.

## SQL dinâmico (writer de schema, não só de linha)

Estes caminhos chamam ou criam `exec_sql`:

- `lib/rh/ensureRhTables.ts` (cria a função com `EXECUTE` dinâmico e `search_path` ausente no SQL lido)
- `lib/timeclock/ensureTimeClock.ts`
- `lib/investimentos/schemaMigrations.ts`
- `lib/investment/accountBalanceSnapshots.ts`
- `lib/billing/usageMigrations.ts`
- `lib/financial/ensurePaymentTables.ts`
- `lib/osAnalysis/osAnalysisService.ts`
- `api/dhl/occurrence-report.ts`
- `scripts/dhl-migrations.sql` (instrução de rodar no Studio)

Isso é migração em runtime. Não é versão única com `migrations/`.

## Readers que calculam de novo

Quem chama `calculateMissionFinancials` para exibir ou para decidir o save: `MissionCard`, `MissionFinancialModal`, `MissionTable`, `UpdateMissionModal`, `ClientBillingReport`, `ReportsDashboard`, `DailyGoalThermometer`, `VendorVerificationControl`, `lib/cevaPortal/report.ts`.

Quem deve preferir o valor já gravado: `computeCanonicalRevenueCost` em `lib/missionFinancialsCanonical.ts` (aprovado / verificado / valor salvo vence a estimativa). O comentário no próprio arquivo registra divergência histórica de totais entre telas.

## Duplicidade que a próxima fase não pode ignorar

1. OS: browser e service role.
2. Agregação de dashboard: motor cru versus canônico.
3. Custo de fornecedor: `lib/providerAutoPricing.ts` e `motor-calculo-padrao/`.
4. Intake DHL: servidor e `lib/dhl-intake`.
5. Comissão: fatura local, ingest e Asaas.
6. Schema: arquivos `migrations/*.sql` versus `exec_sql` em produção versus aplicadores `scripts/apply-*-migration.mjs`.
