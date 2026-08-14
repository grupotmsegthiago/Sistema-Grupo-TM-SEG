# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Handoff oficial — **Hotfix Controle de Faturas / NF — listagem vazia**
> **Não contém segredos. Não mergeado. Não publicado.**

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| Data | 2026-08-14 (UTC) |
| Branch | `cursor/hotfix-nf-invoices-list-empty-eaa8` |
| Base | `main` @ `0eb5cdad` (produção funcional `9a083213`) |
| Origem técnica | Hunks exclusivos do incidente no commit `21f02e10` |
| PR SEC congelado | [#262](https://github.com/grupotmsegthiago/Sistema-Grupo-TM-SEG/pull/262) |
| Banco/schema | Não alterado |
| Asaas/webhooks/env | Não alterados |

## PROGRESSO

| Indicador | Valor |
|-----------|-------|
| EXECUÇÃO ATUAL | **100%** |
| FASE 3 | **70%** (inalterada) |
| PROGRAMA GERAL | **61%** (inalterado) |

## CAUSA RAIZ

**Classificação:** 🔴 regressão de leitura/apresentação; dados preservados.

`FinancialInvoiceControl.fetchInvoices()` consultava `financial_invoices` diretamente
com o cliente Supabase anon. A tabela está com RLS e essa consulta retorna zero linhas
sem erro. Em paralelo, o painel superior chamava `/api/nf/summary`, autenticado e com
service role no servidor, por isso exibia TM Gestão 15 e TM Security 2.

O incidente não foi introduzido pelo hardening SEC: o componente não foi alterado pelo
commit SEC. O PR #262 permanece separado e congelado.

## FLUXO ANTES E DEPOIS

```text
ANTES
FinancialInvoiceControl
  → Supabase anon
  → financial_invoices (RLS)
  → []

DEPOIS
FinancialInvoiceControl
  → authFetch('/api/nf/invoices')
  → api/nf-control?op=list
  → assertFinanceNfAccess
  → listFinancialInvoicesForControl()
  → service role somente no backend
  → financial_invoices
```

## DADOS PRESERVADOS

- O resumo administrativo comprovou 17 faturas ativas (15 TM Gestão + 2 TM Security).
- A consulta anon reproduziu `count=0` sem erro, confirmando RLS em vez de perda.
- Nenhum `DELETE`, `UPDATE`, migration, init ou sincronização destrutiva foi executado.
- Fonte única da verdade permanece `financial_invoices`.
- `financial_transactions` permanece a fonte relacionada de Contas a Receber; não foi alterada.

## ARQUIVOS DO HOTFIX

| Arquivo | Alteração |
|---------|-----------|
| `components/FinancialInvoiceControl.tsx` | Listagem via `authFetch('/api/nf/invoices')` |
| `lib/nfInvoiceControlApi.ts` | Leitura server-side e transformação existente |
| `api/nf-control.ts` | Operação autenticada `list` |
| `vercel.json` | Rewrite específico `/api/nf/invoices` |
| `server/routes.ts` | Rota dev equivalente |
| `scripts/nf-invoices-list.test.ts` | Regressão do incidente |
| `scripts/invoice-control-loading.test.ts` | Fluxo autenticado antes de `init-invoices` |
| `scripts/nb06-migration-routes.test.ts` | Cobertura do rewrite dedicado |

## FILTROS E STATUS PRESERVADOS

- Marco temporal `INVOICE_CONTROL_EPOCH`.
- Exclusão de medição pura `MED-` sem cobrança/NF.
- `EMITIDA` vencida pela data do boleto é apresentada como `VENCIDA`.
- Status `EMITIDA`, `PAGA`, `VENCIDA` e `CANCELADA`.
- Busca por cliente, número, fornecedor, emissora e notas.
- Filtro por emissora e estado da NF.
- Ordenação e comportamento de lista vazia legítima.

## SEGURANÇA

- `/api/nf/invoices` reutiliza `assertFinanceNfAccess`.
- Sem credencial: 401.
- Perfil sem autorização: 403.
- Perfil autorizado alcança o handler.
- Service role permanece apenas em `lib/nfInvoiceControlApi.ts`/backend.
- Nenhum segredo é enviado ao frontend, bundle ou logs.
- Nenhuma rota privilegiada foi tornada pública.

## ISOLAMENTO DO PR SEC

O diff desta branch não contém:

- variável ou handler de webhook Asaas;
- SEC-01 investment;
- SEC-02 hardening geral `/api/supabase/*`;
- SEC-03;
- alteração de env;
- alteração de integração Asaas;
- correção global NB-07.

## TESTES

| Validação | Resultado |
|-----------|-----------|
| `nf-invoices-list.test.ts` | 8/8 |
| `invoice-control-loading.test.ts` | 3/3 |
| Regressões específicas NF/receivables/auth | 38 total / 36 pass / 2 baseline |
| P0–P3 | 56/56 |
| Lint arquivos TS/TSX | 0 erro |
| `npm run build` | OK |
| Supabase público injetado no build | OK |
| Service role no frontend | Nenhum valor secreto encontrado |
| Suíte completa TS, exceto hang conhecido NB-06 | 743 total / 738 pass / 5 fail |
| Suíte TSX | 4 total / 2 pass / 2 fail baseline |

Falhas TS baseline, sem delta:

1. `Vercel tem funções leves para CRUD de contas (não depende do Express)`
2. `FinancialInvoiceControl — auto sync e labels`
3. `registerTimeClockPunch dispara requestPresenceRefresh após inserir`
4. `Contas a Receber — descrição = texto da NF`
5. `cockpit sem detalhe em aberto`

Falhas TSX baseline:

1. `isDhl=false: o formulário público NÃO mostra identidade nem regras da DHL`
2. `isDhl=true: o formulário público mostra identidade e regras da DHL (controle)`

O teste NB-06 possui hang conhecido no ambiente e foi executado separadamente sem
conclusão; o rewrite novo está coberto pelos testes específicos e pela inspeção do diff.

## ROLLBACK

Reverter o commit do hotfix ou restaurar a produção para `9a083213`.
Nenhum rollback de banco é necessário.

## DECISÃO

# 🟢 HOTFIX NF APTO PARA MERGE/PUBLICAÇÃO

Decisão técnica somente. **Não mergeado e não publicado nesta execução.**
