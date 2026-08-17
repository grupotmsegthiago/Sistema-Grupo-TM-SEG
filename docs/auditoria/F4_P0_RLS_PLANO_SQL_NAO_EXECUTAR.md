# F4-P0-RLS — PLANO SQL E ROLLBACK — NÃO EXECUTAR

> Documento de revisão. **Nenhum SQL abaixo foi executado ou aplicado.**
> O projeto usa login TM SEG customizado; o browser opera com a role Postgres `anon`.
> Policies baseadas em `auth.uid()`/`authenticated` não podem ser aplicadas antes de uma decisão de identidade.

## Princípios

1. `service_role` continua apenas no backend e ignora RLS por design.
2. Ausência de policy para `anon`/`authenticated` significa deny-by-default.
3. API Auth e RLS são camadas complementares.
4. Não fechar RLS enquanto existir consumidor browser direto necessário.
5. Aplicar um domínio por vez, com tag, smoke e rollback previamente ensaiado.

## Estado conhecido

Policies versionadas amplas:

```sql
-- ESTADO ATUAL CONHECIDO — NÃO EXECUTAR
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true)
```

Exposição live revalidada por `HEAD/count`, sem retornar linhas: 30 de 31 tabelas
auditadas permitem SELECT anon. `rh_settings` foi a única bloqueada.

## Fase RLS-0 — piloto `billing_usage` (baixo lockout)

Pré-requisitos:

- confirmar `SUPABASE_SERVICE_ROLE_KEY` em Production/Preview;
- smoke do Cockpit Sistema;
- smoke do cron billing-sync e logging Gemini;
- guardar definição atual da policy.

SQL planejado:

```sql
-- NÃO EXECUTAR NESTA AUDITORIA
BEGIN;

ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for billing_usage" ON public.billing_usage;

-- Nenhuma policy para anon/authenticated.
-- service_role mantém bypass para dashboard, cron e logging.

COMMIT;
```

Rollback exato:

```sql
-- ROLLBACK — NÃO EXECUTAR NESTA AUDITORIA
BEGIN;

ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for billing_usage" ON public.billing_usage;
CREATE POLICY "Allow all for billing_usage"
  ON public.billing_usage
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
```

## Fase RLS-1 — preparação sem alterar policies

Antes de qualquer lockdown:

1. criar API autenticada para `financial_transaction_payments`;
2. migrar `receivablePaymentsClient.ts` para a API;
3. proteger `/api/financial-payments-init`;
4. remover fallback anon no servidor;
5. migrar Diretoria/FinancialTransactionList para snapshots via API;
6. remover fallback de `snapshotClient.ts`;
7. migrar CRUD RH sensível e ponto para APIs;
8. decidir identidade de self-service: API custom token ou JWT Supabase custom.

Nenhuma policy muda nesta fase.

## Fase RLS-2 — pagamentos parciais e snapshots

Aplicar somente após RLS-1 e testes E2E.

```sql
-- NÃO EXECUTAR NESTA AUDITORIA
BEGIN;

ALTER TABLE public.financial_transaction_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for financial_transaction_payments"
  ON public.financial_transaction_payments;

ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for account_balance_snapshots"
  ON public.account_balance_snapshots;

-- Sem policies anon/authenticated: API service_role é o único caminho.

COMMIT;
```

Rollback:

```sql
-- ROLLBACK — NÃO EXECUTAR NESTA AUDITORIA
BEGIN;

ALTER TABLE public.financial_transaction_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for financial_transaction_payments"
  ON public.financial_transaction_payments;
CREATE POLICY "Allow all for financial_transaction_payments"
  ON public.financial_transaction_payments
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for account_balance_snapshots"
  ON public.account_balance_snapshots;
CREATE POLICY "Allow all for account_balance_snapshots"
  ON public.account_balance_snapshots
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
```

## Fase RLS-3 — RH administrativo/PII

Estratégia recomendada no modelo de autenticação atual: **API-only** para PII,
banco, remuneração, folha, saúde, auditoria e writes administrativos.

Tabelas críticas:

- `rh_employees`
- `rh_employee_bank_accounts`
- `rh_employee_documents`
- `rh_salary_configs`
- `rh_commission_rules`
- `rh_commissions`
- `rh_awards`
- `rh_bonuses`
- `rh_payroll_runs`
- `rh_payroll_items`
- `rh_payslips`
- `rh_warnings`
- `rh_medical_exams`
- `rh_audit_logs`

SQL conceitual por tabela, apenas após migração do consumidor:

```sql
-- MODELO — NÃO EXECUTAR
BEGIN;

ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for <tabela>" ON public.<tabela>;

-- Sem policy anon/authenticated; backend service_role + API autorizada.

COMMIT;
```

Catálogos de baixa sensibilidade (`rh_departments`, `rh_positions`,
`rh_tax_brackets`, `rh_benefits`) podem ter SELECT anon temporário, mas writes
devem ser backend-only:

```sql
-- TRANSIÇÃO — NÃO EXECUTAR
CREATE POLICY "<tabela> anon read"
  ON public.<tabela>
  FOR SELECT TO anon
  USING (true);
```

Essa policy temporária deve ter justificativa e data de remoção.

## Fase RLS-4 — `time_clock` e self-service

Não usar `auth.uid()` enquanto o login não emitir JWT Supabase.

Opção recomendada imediata:

- punch/listagem própria via API com token TM SEG;
- RH/Diretoria via APIs existentes;
- remover `registerPunch/history/adjustEntriesDirect` anon;
- depois remover a policy ampla de `time_clock`.

```sql
-- NÃO EXECUTAR NESTA AUDITORIA
BEGIN;

ALTER TABLE public.time_clock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for time_clock" ON public.time_clock;

-- API service_role é o único caminho no modelo atual.

COMMIT;
```

Rollback:

```sql
-- ROLLBACK — NÃO EXECUTAR NESTA AUDITORIA
BEGIN;

ALTER TABLE public.time_clock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for time_clock" ON public.time_clock;
CREATE POLICY "Allow all for time_clock"
  ON public.time_clock
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
```

## Correção futura do inventário de nomes RH

A policy versionada referencia nomes legados que não correspondem ao schema:

| Nome na policy | Nome real |
|----------------|-----------|
| `rh_timeclock` | `time_clock` |
| `rh_vacation_requests` | `rh_vacations` |
| `rh_leave_records` | `rh_leaves` |
| `rh_benefit_types` | `rh_benefits` |

Tabelas reais ausentes da lista de policies incluem:

- `rh_commission_rules`
- `rh_payslips`
- `rh_employee_emergency_contacts`
- `rh_work_schedules`
- `rh_admissions`
- `rh_lgpd_consents`

O inventário deve ser corrigido em migration própria antes do lockdown, sem
reaplicar policy ampla.

## Matriz de testes obrigatória

| Principal | Resultado esperado |
|-----------|--------------------|
| anon direto em tabela sensível | bloqueado/zero rows |
| token TM SEG inválido na API | 401 |
| usuário ativo sem role | 403 |
| financeiro legítimo | pagamentos/snapshots permitidos via API |
| RH/Diretoria | CRUD RH permitido via API |
| funcionário comum | somente ponto próprio via API |
| cliente externo | nenhum acesso RH/financeiro |
| service_role | jobs/webhooks/cron continuam funcionando |

## Ordem futura de implantação

1. `billing_usage` isolada.
2. APIs preparatórias de pagamentos/snapshots.
3. `financial_transaction_payments`.
4. `account_balance_snapshots`.
5. RH tabelas sem consumidor.
6. RH PII/bancário/remuneração por grupos pequenos.
7. `time_clock` por último, após remover fallbacks.
8. auditoria final de `anon`, `authenticated`, service_role, realtime e jobs.

Cada passo exige tag, deploy, smoke, monitoramento e decisão explícita antes do
próximo. Não aplicar em big-bang.
