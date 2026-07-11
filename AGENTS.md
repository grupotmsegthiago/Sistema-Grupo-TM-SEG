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

### Plano de Ação DHL (`/api/dhl/occurrence-report`)

- Handler: `api/dhl/occurrence-report.ts`
- Bundles gerados no build: `api/dhl/_occurrence-report-{html,pdf,adjust}.cjs` (prefixo `_` evita virarem funções separadas).
- **Importante:** usar `require('./_occurrence-report-*.cjs')` **estático** no handler. `require` dinâmico com `path.join` ou bloco `includeFiles` em `vercel.json` para `api/dhl/occurrence-report.ts` causou deploy **ERROR 0ms** (falha de configuração antes do build).
- PDF no anexo: leitura no **browser** via `pdfjs-dist` (`lib/dhlOccurrenceReport/extractPdfText.ts`).

### Deploy Vercel — troubleshooting

1. **Deployments** → último da `main`: status Ready vs Error.
2. Deploy **ERROR 0ms / builds=[]**: quase sempre `vercel.json` inválido — comparar com commit que passou (ex.: sem entrada `functions` para `occurrence-report.ts`).
3. **Runtime** `Cannot find module .../_occurrence-report-html.cjs`: bundles não empacotados — corrigir requires estáticos no handler, não `includeFiles` em `dist/` gitignored.
4. **Vercel Agent** (painel → Agent): pode listar deploys, inspecionar falhas e redeploy — útil quando o token CLI não está disponível.
5. `VERCEL_TOKEN` no ambiente cloud: precisa ser token válido de [vercel.com/account/tokens](https://vercel.com/account/tokens) (escopo deploy). Token inválido retorna `invalidToken` na API.

### Testes DHL relevantes

```bash
npx tsx --test scripts/dhl-occurrence-integration.test.ts scripts/dhl-occurrence-report.test.ts
node --import tsx --import ./scripts/test-loaders/register.mjs --test scripts/dhl-occurrence-report-render.test.tsx
```

### React / TSX

Após editar cabeçalhos de `.tsx`, manter `import React, { useState, ... } from 'react'` quando usar hooks — build passa sem isso e produção quebra.
