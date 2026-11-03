# 05 — Integrações

Nomes de variável apenas. Nenhum valor foi impresso neste relatório. Comportamento tirado do código em `c714a624`.

## Asaas

| | |
| --- | --- |
| Finalidade | cobrança, PIX, saldo, transferência, baixa de fatura, NF municipal quando o provedor é Asaas |
| Arquivos | `api/asaas-*.ts`, `lib/asaasWebhookCore.ts`, `lib/asaasEnvKeys.ts`, `lib/persistAsaasChargeInvoice.ts`, `server/asaasService.ts` |
| Entrada | `POST /api/asaas/webhook` com header `asaas-access-token` |
| Env | `Asaas_TMSEGESTÃO_API` e aliases, `ASAAS_TMSEGURANCA_API`, `ASAAS_TMSECURITY_API`, `ASAAS_API_KEY`, tokens de webhook por conta, `ASAAS_FINANCEIRO_WALLET_ID` |
| Idempotência | atualiza fatura por `asaas_payment_id` ou referência externa. Não há tabela de evento único visível no core |
| Falha | token ausente tende a fail-closed (teste `scripts/fase3-sec03-webhook.test.ts`). Erro depois de aceitar o POST ainda responde HTTP 200 com `received: true` |
| Risco | reprocessar evento; 200 esconde falha do provedor |

## PlugNotas

| | |
| --- | --- |
| Finalidade | NFS-e |
| Arquivos | `server/plugnotasService.ts`, `lib/nfInvoiceControlApi.ts`, `api/nf-control.ts`, `server/nfRetryWorker.ts` |
| Env | `PLUGNOTAS_ENV`, `PLUGNOTAS_API_TOKEN`, `PLUGNOTAS_API_TOKEN_SANDBOX` |
| Retry | cron `/api/cron/nf-retry` e retry manual |
| Falha | sem token em produção o serviço não emite; a fatura permanece para o worker |

eNotas e Focus não têm cliente em `server/` ou `api/`. Comentários e colunas antigas citam esses nomes. A emissão atual é PlugNotas ou Asaas.

## Z-API / WhatsApp

| | |
| --- | --- |
| Finalidade | bot de monitoramento, grupos, reconexão, telemetria |
| Arquivos | `lib/zapiMobileEnv.ts`, `lib/whatsappLiteApi.ts`, `api/whatsapp/*`, `api/zapi-webhook-*.ts`, `server/zapiThrottle.ts` |
| Env | `ZAPI_MOBILE_ID`, `ZAPI_MOBILE_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_WEBHOOK_SECRET`, legado `ZAPI_INSTANCE_ID` / `ZAPI_TOKEN` |
| Webhooks | inbound, message-status, connection. Secret obrigatório só se a env existir |
| Retry | watchdog no cron de 1 minuto; throttle em memória (não sobrevive a outro isolate) |
| Falha | handlers devolvem 200 para não entrar em loop de reenvio |
| Edge | `supabase/functions/zapi-webhook` ainda está no repo |

## Gemini

| | |
| --- | --- |
| Finalidade | plano de ação DHL, pedágio estimado, geração genérica, conciliação de extrato na Edge |
| Arquivos | `api/gemini/generate.ts`, `api/gemini/health.ts`, `api/toll-gemini-estimate.ts`, `server/geminiClient.ts`, `supabase/functions/reconcile-statement` |
| Env | `AI_INTEGRATIONS_GEMINI_API_KEY` vence `GEMINI_API_KEY`, depois `GOOGLE_GEMINI_API_KEY` e `VITE_GEMINI_API_KEY` |
| Retry | cadeia de modelos em `generate` |
| Falha | sem chave, 503. Com chave restrita por referer, a chamada sem o host autorizado falha no Google |
| Risco | generate/health sem sessão |

## E-mail

Operação: nodemailer em `lib/email/smtp.ts` (`EMAIL_USER`, `EMAIL_PASS` / `SMTP_PASSWORD`). Fila no cron de 5 minutos e no `setInterval` do dev.

Reset de senha: `api/password-reset-*.ts`. Confirmar e validar o token não exigem sessão (desenho de reset). O pedido de reset exige Bearer presente, sem checar o usuário.

Resend: só a Edge `send-welcome-email`, chave no fonte. Não é o SMTP do app.

## Mapas e pedágio

| Serviço | Uso | Auth da rota | Falha |
| --- | --- | --- | --- |
| Google Maps / Geocoding / Distance Matrix | mapa e km | rotas GET públicas; chave também no fonte | fallback Nominatim |
| Esri e OpenStreetMap | mapa estático do plano de ação | servidor | timeout curto, troca de provedor |
| QualP | pedágio | Bearer presente, sem usuário | HTTP 200 com `success: false` |
| Gemini | estimativa de pedágio | igual QualP | igual |

Env: `GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `QUALP_API_TOKEN`.

## Supabase TORRES

Projeto separado para lançar conta a pagar da comissão da outra empresa. Env `TORRES_SUPABASE_URL`, `TORRES_SUPABASE_SERVICE_ROLE_KEY`. O código recusa chave da TM SEG e chave publishable. Sem chave, não grava lá. Idempotência do clique: reaproveita `conta_pagar_id`.

O catálogo SQL desta sessão bate com esse modelo (`service_orders`, `escort_billings`). Não foi usada a service role da TORRES.

## CEVA e IBL

Portal com login próprio, rate limit por IP, service role no servidor. IBL reusa o handler CEVA. Arquivos `api/ceva-portal.ts`, `api/ibl-portal.ts`, `lib/cevaPortal/`.

## DHL público

Intake por token opaco (`api/dhl-intake-public-*` e `api/dhl/intake/public/[token]`). Relatório de ocorrência exige papel diretoria. Lookup de placa é rota à parte.

## Cursor, Stripe e web push

`lib/billing/billingService.ts` espelha uso Cursor (`CURSOR_SESSION_TOKEN`) e, se houver, Stripe (`STRIPE_SECRET_KEY`, `STRIPE_CURSOR_CUSTOMER_ID`). Cron 06:00 UTC. Não movimenta financeiro de cliente.

Web push: `server/whatsappAlertPush.ts`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

## F4 / diagnósticos

`api/f4-*.ts` e `api/system-diagnostics.ts` leem custo de plataforma e saúde de integração. Não são um SaaS externo além das chaves já listadas.

## Resumo de falha

Padrão repetido: webhook e pedágio preferem HTTP 200 para não reprocessar ou para não quebrar a UI, e o erro fica no JSON. Isso dificulta alerta. Não há fila durável única; cada integração tem o seu worker.
