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

### Redução de retrabalho (regras do agente)

Regras consolidadas — aplicar **sempre**, antes de codar, publicar ou abrir PR.

#### Escopo e preservação

- **Diff mínimo:** resolver só o pedido; não refatorar OS, Financeiro, Asaas, eNotas ou integrações críticas sem autorização explícita.
- **Não remover** comentários explicativos nem lógica existente “por limpeza”.
- **Dúvida = parar:** se não tiver 100% de certeza do impacto, explicar o risco e perguntar antes de alterar.
- **Consistência:** mudou backend (`server/`, `api/`), verificar frontend (`components/`, `lib/`) e vice-versa.

#### Antes de mexer no código — diagnosticar infra

Ordem obrigatória em falhas de integração (WhatsApp, Gemini, Asaas, Supabase):

1. **Ambiente** — variáveis na Vercel / secrets (nomes exatos, case-sensitive).
2. **Produção** — endpoint de health ou smoke test (`/api/health`, `/api/gemini/health`, status Z-API).
3. **Banco** — registro em Supabase (ex.: `whatsapp_instances`) pode ter credencial correta mesmo com env incompleto.
4. **Só então** alterar código.

Evita retrabalho típico: “Z-API não configurada” com token válido no banco mas `ZAPI_MOBILE_TOKEN` ausente na Vercel, ou `ZAPI_CLIENT_TOKEN` errado (HTTP 403) enquanto o Supabase tem o token certo.

#### Testar antes de entregar

Preferência permanente do Thiago — **nunca** dizer “pronto” ou “publicado” sem evidência:

1. Implementar → 2. Testar → 3. Corrigir se falhar → 4. Só então informar (commit/publicar só se pedido).

Checklist mínimo:

| Escopo | Comando / verificação |
|--------|------------------------|
| Build | `npm run build` |
| TS/TSX editado | lints nos arquivos; **manter `import React` quando usar hooks** (build passa sem isso; produção quebra com `useState is not defined`) |
| Backend/API | `GET /api/health`; curl/fetch nas rotas alteradas |
| Frontend | Supabase injetado no build; login sem erro JS se possível |
| Testes do escopo | `bash scripts/run-tests.sh` ou `npx tsx --test scripts/*.test.ts` relacionados |
| Publicação | após merge/push: aguardar deploy; validar prod (`/api/version`, health, tela de login) |

#### Git, PR e publicação

- **Reutilizar** branch/PR existente no mesmo escopo — evitar branches duplicadas.
- Cloud Agent: branch `cursor/<nome>-3b22`; commit + push + PR antes de considerar entregue.
- **Publicar** (`publicar`, `deploy`, `colocar no ar`): commit na `dev` → `.\publicar.ps1` (merge `dev`→`main`, push) → confirmar deploy Vercel — **sem pedir confirmação**.
- Nunca commitar `.env`, segredos nem `package-lock.json` gerado só por `npm install` em ambiente diferente do CI.

#### Custo de tokens (Cursor / Gemini)

- **Gemini:** Flash para tarefas simples; modelos maiores só para relatórios complexos (DHL, conciliação).
- **Cursor:** diff pequeno, uma passada de teste no escopo, evitar re-explorar o codebase quando AGENTS.md ou memória já têm a resposta.
- Billing/espelho Cursor: ver seção [Custos de IA](#custos-de-ia-cursor--stripe--gemini) abaixo.

#### Incidentes conhecidos (não repetir)

- Remoção acidental de `import React` em `.tsx` → produção quebra; build não detecta.
- `AI_INTEGRATIONS_GEMINI_API_KEY` na Vercel vence `GEMINI_API_KEY` — atualizar precedência + redeploy.
- `vercel.json` > 50 entradas em `functions` → deploy ERROR 0ms.
- Z-API: faltam **três** vars (`ZAPI_MOBILE_ID`, `ZAPI_MOBILE_TOKEN`, `ZAPI_CLIENT_TOKEN`); Client-Token errado = 403; `mobile/request-code` pode retornar NOT_FOUND → fallback `phone-code` / QR.

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

Variáveis na Vercel (**as três são obrigatórias** para env + sync):

- `ZAPI_MOBILE_ID` — Instance ID da instância **mobile**
- `ZAPI_MOBILE_TOKEN` — Token da instância (sem isso, fallback env falha mesmo com ID correto)
- `ZAPI_CLIENT_TOKEN` — Token de segurança da **conta** Z-API (header `Client-Token` em toda chamada; valor errado → HTTP 403)
- `ZAPI_MOBILE_INSTANCIA` — Rótulo no painel (ex. `Monitoramento 24h`)

Na subida do servidor, `syncMobileInstanceFromEnv()` atualiza a instância padrão no Supabase quando `ZAPI_MOBILE_ID` + `ZAPI_MOBILE_TOKEN` existem (inclui `zapi_client_token` quando definido no env).

Legado: `ZAPI_INSTANCE_ID` / `ZAPI_TOKEN` continuam como fallback.

**Diagnóstico rápido (antes de alterar código):**

1. Listar vars ZAPI na Vercel — confirmar que `ZAPI_MOBILE_TOKEN` existe (não só ID + CLIENT_TOKEN).
2. Testar `/status` com Client-Token do **Supabase** (`whatsapp_instances.zapi_client_token`) vs env — 403 indica env errado.
3. `GET /api/zapi/health` ou `npx tsx scripts/whatsapp-diagnostics-report.ts 7d`.

**Reconexão do bot (celular obrigatório se desconectado):**

- **Popup global (tempo real):** `WhatsAppOfflineModal` — todos os usuários logados veem modal quando bot offline; lock em `system_settings.zapi_reconnect_lock` garante que **só um** gera código; demais veem quem assumiu. Realtime via `whatsapp_instances` + `system_settings` + broadcast `whatsapp-bot-status`.
- Painel: Configurações → WhatsApp → **Reconectar via API** (restore → GET restart → fallback phone-code).
- Auto-reconnect: retry a cada 5 min; `wa_old` só funciona se a instância no painel Z-API for tipo **MOBILE**.
- Se `mobile/request-code` retorna NOT_FOUND: vincular via **código phone-code** (WhatsApp Business → Aparelhos conectados → Vincular com número) ou QR no painel Z-API.
- **Não resolve** sozinho: celular offline (`smartphoneConnected=false`), sessão extensão expirada (Z-API Conector), WhatsApp Web no mesmo número.

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

Regras gerais de custo/retrabalho: ver [Redução de retrabalho](#redução-de-retrabalho-regras-do-agente) no topo desta seção.

### Testes DHL relevantes

```bash
npx tsx --test scripts/dhl-occurrence-integration.test.ts scripts/dhl-occurrence-report.test.ts
node --import tsx --import ./scripts/test-loaders/register.mjs --test scripts/dhl-occurrence-report-render.test.tsx
```
