# 10 — Matriz de propriedade

O proprietário do sistema, já nomeado nas regras existentes, autoriza mudança de comportamento, banco e produção. Esta matriz não inventa outro dono humano. Onde o código já cita pessoas, isso é regra de negócio vigente, não nomeação nova.

| Domínio | Custódia técnica | Quem autoriza mudança de regra | Regra já nomeada no repositório |
| --- | --- | --- | --- |
| OS e monitoramento | `components/Mission*`, `lib/financialUtils.ts`, `server/routes.ts` | Proprietário | Trava de prejuízo: Giovanna Marsili, Beatriz Rocha, Thiago Moreira; depois só Diretoria (`.cursor/rules/subir-reuniao.mdc`) |
| Faturamento e boletim | `ClientBillingReport`, `lib/billing/` | Proprietário; tela de auditoria restrita a Diretoria e Financeiro autorizado (commits de outubro/2026 na `main`) | Controller vê auditoria quando o commit vigente assim determina |
| Financeiro | `components/Financial*`, `lib/financial/` | Proprietário | Não recalcular valor aprovado em silêncio |
| NF | `server/plugnotasService.ts`, `server/nfRetryWorker.ts` | Proprietário | Não criar emissor novo |
| Asaas | `lib/asaas*`, `api/asaas-*` | Proprietário | Não ampliar o fluxo |
| Comissão TM SEG | `lib/comissao/` | Proprietário (menu Diretoria) | Pago é botão próprio |
| TORRES | `lib/comissao/torresSupabase.ts`, `contaPagarTorres.ts` | Proprietário, em separado da TM SEG | Mês não lança |
| Clientes e tabelas | `ClientForm`, `client_price_tables` | Proprietário | Tarifa vinculada (PR #344) |
| Fornecedores e frota | `Provider*`, `provider_cost_tables`, `lib/providerAutoPricing.ts` | Proprietário | Não criar segundo motor de faixa |
| DHL | `lib/dhl-intake`, `api/dhl/` | Proprietário | Intake público por token já existe |
| CEVA / IBL | `lib/cevaPortal/` | Proprietário | IBL reusa o núcleo CEVA |
| RH e ponto | `lib/rh/`, `lib/timeclock/` | Proprietário | Não misturar com cálculo de OS |
| WhatsApp | `lib/whatsappLiteApi.ts`, `api/whatsapp/`, `api/zapi-*` | Proprietário | Z-API vigente; limpeza bloqueada |
| Investimento e patrimônio | `lib/investimentos/`, `server/patrimonioStore.ts` | Proprietário | Não é financeiro de cliente |
| Acesso | `Login.tsx`, `system_users`, `profiles` | Proprietário | Fase 2 só com ordem; login atual não pode ser quebrado no meio do caminho |
| Plataforma e deploy | `publicar.ps1`, `vercel.json`, `AGENTS.md` | Proprietário | Vercel `sistema-grupo-tm-seg` |

Dono humano adicional por domínio: **não designado**. A Fase 1 não bloqueia por isso. Bloqueia inventar nome.
