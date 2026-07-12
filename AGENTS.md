# AGENTS.md — Sistema Grupo TM SEG

## Visão geral

Monorepo React/Vite (frontend) + Express serverless na Vercel (API). Supabase hardcoded em build para o projeto TM SEG. Produção: `https://sistema.grupotmseg.com.br`.

## Comandos principais

| Ação | Comando |
|------|---------|
| Instalar deps | `npm install --legacy-peer-deps` |
| Dev local | `npm run dev` (porta 5000) |
| Build | `npm run build` |
| Testes | `bash scripts/run-tests.sh` |
| Health | `curl http://localhost:5000/api/health` |
| Versão prod | `curl https://sistema.grupotmseg.com.br/api/version` |

## Publicar (fluxo Thiago)

Na máquina Windows: commit na `dev`, depois `.\publicar.ps1` (merge `dev` → `main`, push). A Vercel faz deploy automático da `main`.

## Cursor Cloud specific instructions

### Node

Usar Node 22+ (projeto declara `24.x` em `package.json`; Node 22 funciona para build/testes).

### Variáveis de ambiente

- Dev local: Supabase vem do build (`lib/supabasePublicEnv` / defaults no código).
- Produção (Vercel): `GEMINI_API_KEY`, chaves Supabase service role, etc. configuradas no painel Vercel — não commitar `.env`.

### Chave Gemini (`GEMINI_API_KEY`)

- **Onde configurar:** quase toda a IA (Plano de Ação DHL, chatbot, importadores, estimativa de pedágio) roda na **Vercel** — basta a chave lá. O **Supabase** só precisa da chave para a Edge Function `reconcile-statement` (conciliação de extrato bancário por IA), que lê `API_KEY` ou `GEMINI_API_KEY` via `supabase secrets set`. Se não usa esse recurso, não precisa configurar no Supabase.
- O código lê a chave em cascata: `AI_INTEGRATIONS_GEMINI_API_KEY` → `GEMINI_API_KEY` → `GOOGLE_GEMINI_API_KEY` → `VITE_GEMINI_API_KEY` (ver `server/geminiClient.ts`, `api/gemini/*.ts`, `api/dhl/occurrence-report.ts`).
- **Precedência (gotcha real):** `AI_INTEGRATIONS_GEMINI_API_KEY` é lida **antes** de `GEMINI_API_KEY`. Se você atualizar só a `GEMINI_API_KEY` na Vercel mas a `AI_INTEGRATIONS_GEMINI_API_KEY` tiver uma chave antiga/bloqueada, a antiga continua vencendo e o erro `... GenerateContent are blocked` persiste. Atualize/remova as variáveis de maior precedência e faça **redeploy** (env vars da Vercel só entram em vigor em novo deploy). Nomes são case-sensitive: `Gemini_API_Key`/`Gemini_api_key` **não** são lidas pelo código.
- **Diagnóstico rápido em produção:** `GET /api/gemini/health` (deve responder `{"ok":true}`) e `POST /api/gemini/generate` com `{"contents":"Diga OK","config":{"maxOutputTokens":2048}}`.
- **Referer:** as chamadas Gemini via REST enviam header `Referer` que precisa bater com a restrição da chave. O valor autorizado é `https://sistema-grupo-tm-seg.vercel.app/` (ver `api/gemini/generate.ts`); usar o domínio custom faz o Google responder `GenerateContent are blocked`.
- **Formato de chave:** o Google migrou para chaves `AQ.Ab8...`. Elas funcionam via `?key=` na REST API, mas chaves `AQ.` **não restritas** podem ser bloqueadas pelo Google (`API_KEY_SERVICE_BLOCKED`, HTTP 401 `UNAUTHENTICATED`). Se aparecer 401, gere/regenere a chave no Google AI Studio e restrinja-a à **Generative Language API**.

### Plano de Ação DHL (`/api/dhl/occurrence-report`)

- Handler: `api/dhl/occurrence-report.ts`
- Bundles gerados no build: `api/dhl/_occurrence-report-{html,pdf,adjust}.cjs` (prefixo `_` evita virarem funções separadas).
- **Importante:** usar `require('./_occurrence-report-*.cjs')` **estático** no handler. `require` dinâmico com `path.join` ou bloco `includeFiles` em `vercel.json` para `api/dhl/occurrence-report.ts` causou deploy **ERROR 0ms** (falha de configuração antes do build).
- PDF no anexo: leitura no **browser** via `pdfjs-dist` (`lib/dhlOccurrenceReport/extractPdfText.ts`).

### WhatsApp Z-API (mobile)

Variáveis na Vercel (recomendado):

- `ZAPI_MOBILE_ID` — Instance ID da instância **mobile** (ex. Central Torres)
- `ZAPI_MOBILE_TOKEN` — Token da instância
- `ZAPI_MOBILE_INSTANCIA` — Rótulo exibido no painel (ex. `Central Torres`)

Na subida do servidor, `syncMobileInstanceFromEnv()` atualiza a instância padrão no Supabase quando `ZAPI_MOBILE_ID` + `ZAPI_MOBILE_TOKEN` existem.

Opcional: `ZAPI_CLIENT_TOKEN` (token de segurança do painel Z-API) se a API retornar *client-token is not configured*.

Legado: `ZAPI_INSTANCE_ID` / `ZAPI_TOKEN` continuam como fallback.

### Deploy Vercel — troubleshooting

1. **Deployments** → último da `main`: status Ready vs Error.
2. Deploy **ERROR 0ms / builds=[]**: quase sempre `vercel.json` inválido — limite de **50 entradas** em `functions` ou JSON inválido.
3. **Runtime** `Cannot find module .../_occurrence-report-html.cjs`: bundles não empacotados — corrigir requires estáticos no handler.
4. **Vercel Agent** (painel → Agent): pode listar deploys e inspecionar falhas.
5. `VERCEL_TOKEN` no ambiente cloud: token válido de [vercel.com/account/tokens](https://vercel.com/account/tokens).

### Custos de IA (Cursor / Stripe / Gemini)

- Serviço: `lib/billing/billingService.ts` — `syncCursorBilling()`, `syncBillingUsage()`, conversão USD→BRL (câmbio `BILLING_USD_RATE` padrão 5.50 + IOF `BILLING_IOF_PCT` 4.38%).
- **Espelho real Cursor:** `CURSOR_SESSION_TOKEN` = cookie `WorkosCursorSessionToken` de [cursor.com/dashboard](https://cursor.com/dashboard) (API não oficial). Botão **Sincronizar Cursor** na aba Sistema.
- Tabela Supabase: `billing_usage` — migrations `2026_07_12_billing_usage.sql`, `2026_07_13_billing_cursor_source.sql` (source `cursor_dashboard`).
- UI: Cockpit Diretoria → aba **Sistema** (espelho fatura, termômetro, eventos por modelo).
- Cron diário: `GET /api/cron/billing-sync` às 06:00 UTC (`CRON_SECRET`).
- Variáveis Vercel:
  - `CURSOR_SESSION_TOKEN` (obrigatório para espelho real do dashboard Cursor)
  - `STRIPE_SECRET_KEY`, `STRIPE_CURSOR_CUSTOMER_ID` (opcional — faturas Stripe)
  - `CURSOR_PLAN_MONTHLY_USD` ou `CURSOR_PLAN_MONTHLY_BRL`, `CURSOR_PLAN_NAME`
  - `OPERATIONAL_SAVINGS_BRL` (padrão 715 — planilha Situação Geral Faturamento)
- APIs: `GET /api/billing/dashboard`, `POST /api/billing/sync`, `POST /api/billing/log-usage`.

**Regras do agente (redução de custo e retrabalho):**

- Diff mínimo; não refatorar OS, Financeiro, Asaas ou eNotas sem autorização explícita.
- Testar antes de entregar: `npm run build` + testes do escopo.
- Evitar tokens repetidos no mesmo escopo — reutilizar branch/PR existente.
- Gemini: Flash para tarefas simples; modelos maiores só para relatórios complexos.
- Preservar `import React` em `.tsx` ao editar cabeçalhos.

### Testes DHL relevantes

```bash
npx tsx --test scripts/dhl-occurrence-integration.test.ts scripts/dhl-occurrence-report.test.ts
node --import tsx --import ./scripts/test-loaders/register.mjs --test scripts/dhl-occurrence-report-render.test.tsx
```

### React / TSX

Após editar cabeçalhos de `.tsx`, manter `import React, { useState, ... } from 'react'` quando usar hooks — build passa sem isso e produção quebra.

### WhatsApp Z-API — reconexão

- Diagnóstico: `npx tsx scripts/whatsapp-diagnostics-report.ts 7d`
- Reconectar manual (API): `POST /api/whatsapp/connection/reconnect` ou botão **Reconectar via API** em Configurações → WhatsApp
- Auto-reconnect: restore-session → restart → **wa_old** (pop-up no WhatsApp Business). Retry a cada 5 min. `ZAPI_INSTANCE_TYPE=mobile` (padrão).
- **Não resolve** sozinho: celular offline (`smartphoneConnected=false`), sessão extensão expirada (usar Z-API Conector), WhatsApp Web manual no mesmo número
