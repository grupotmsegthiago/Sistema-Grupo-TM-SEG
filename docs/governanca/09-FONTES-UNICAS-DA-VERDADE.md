# 09 — Fontes únicas da verdade

Extraído da Fase 0 e do código em `c714a624`. Writers paralelos existem; a coluna oficial continua uma só. Não criar outra.

| Domínio | Fonte única | Motor ou regra canônica | O que não é fonte |
| --- | --- | --- | --- |
| OS | `missions` no projeto `ajhmmjuewdsukecaimik` | `calculateMissionFinancials`; colunas `revenue_value`, `cost_value`, pedágio, deslocamento | Estimativa de tela antes do save; `motor-calculo-padrao/`; `service_orders` (TORRES) |
| Override de OS | motivo e flags na própria `missions` | `isIntentionalBillingOverride` | Recálculo automático |
| Leitura de total para dashboard | valor gravado quando aprovado ou verificado | `computeCanonicalRevenueCost` | Soma solta do motor em outra tela |
| Tabela de preço | `client_price_tables` e tabela vinculada; fornecedor em `provider_cost_tables` | `lib/providerAutoPricing.ts` e o seletor DHL já chamado pelo motor | Tarifa hardcoded nova |
| Fatura | `financial_invoices` | agregação em `lib/billing/sincronizarFaturaAberta.ts` sobre colunas já salvas | Recálculo de tarifa dentro da fatura |
| Vínculo OS–fatura | `financial_invoice_missions` | `lib/billing/vincularOSFatura.ts` | Lista solta de IDs |
| Título | `financial_transactions` | baixa manual pela RPC já existente, quando o caminho for esse | Planilha, cache de tela |
| Comissão TM SEG | `comissoes` | `lib/comissao/comissaoCalc.ts` e `gerarComissaoAoFaturar` | Conta a pagar (é efeito, não a comissão) |
| Comissão TORRES | comissão na TM SEG; título no Supabase TORRES | `contaPagarTorres.ts` só no clique | `useEffect` de mês (removido; não recriar) |
| Identidade do app | `system_users` + `profiles` | permissões do perfil; token opaco no `localStorage` | Supabase Auth como sessão principal |
| Ponto | `time_clock` | `lib/timeclock/registerPunch.ts` e o ajuste no servidor | Planilha |
| Salário | `rh_salary_configs` | módulo RH já existente | Cálculo novo na tela |
| WhatsApp | `whatsapp_instances` + env Z-API | `lib/zapiMobileEnv.ts`, `lib/whatsappLiteApi.ts` | Outro provedor |
| NF | campos da `financial_invoices` (`nf_provider`, PlugNotas) | `server/plugnotasService.ts` e o provedor Asaas já ligado | eNotas/Focus sem cliente |
| Cobrança | cobrança Asaas ligada à fatura | `lib/persistAsaasChargeInvoice.ts`, webhook em `lib/asaasWebhookCore.ts` | Segunda conta de cobrança |
| Custo de IA do Cursor | `billing_usage` | `lib/billing/billingService.ts` | Financeiro de cliente |
| Produção publicada | `main` no Git e `/api/version` | projeto Vercel `sistema-grupo-tm-seg` | Branch `dev` enquanto estiver atrás; projeto `workspace` |

Banco errado: qualquer objeto cuja OS seja `service_orders` ou cuja fatura seja `escort_billings` / `invoices` sem o prefixo `financial_` é o outro projeto. Confirmar o ref antes de SQL.
