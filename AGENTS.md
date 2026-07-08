# AGENTS.md

## Cursor Cloud specific instructions

Contexto durável e não óbvio para desenvolver o **Grupo TMSEG – Sistema de Gestão Operacional**
(app único: frontend React/Vite + servidor Express + Supabase; deploy na Vercel).

### Runtime / Node
- O `package.json` declara `engines.node: 24.x` e o `.nvmrc` = `24`, **mas** neste ambiente Cloud o `node` do sistema (v22.x, fornecido pelo daemon em `/exec-daemon`) tem prioridade no `PATH` sobre o nvm. O app roda normalmente em Node 22; não é necessário forçar o Node 24.
- Gerenciador de pacotes: **npm** (o `.npmrc` já força `legacy-peer-deps=true`). Instalação: `npm install`.

### Rodar em dev
- Comando único: `npm run dev` (= `npx tsx server/index.ts`). O Express sobe na **porta 5000** servindo TANTO a API (`/api/*`) QUANTO o frontend (o Vite é montado como middleware no mesmo processo/porta em dev). Não há porta separada de frontend.
- Health check: `GET http://localhost:5000/api/health` → `{ "status": "ok", ... }`.
- Build de produção: `npm run build` (gera `dist/public/`, `dist/index.cjs` e `dist/vercelApp.cjs`).

### Supabase / dados (IMPORTANTE)
- **Não é necessário `.env` para subir em dev**: a URL e a anon key do Supabase estão embutidas em `lib/supabaseDefaults.ts` (projeto `ajhmmjuewdsukecaimik`). Sem env, o app conecta ao **Supabase de PRODUÇÃO**.
- Isso significa que o ambiente local lê/escreve no banco **real**. **Evite criar dados de teste/lixo** (missões, cadastros, fornecedores). Rotas públicas como `/cadastro-operacional` e `/fornecedor/dhl` também gravam em produção.
- Sem `SUPABASE_SERVICE_ROLE_KEY`, o servidor opera em modo ANON — algumas rotas de escrita/admin podem falhar por RLS (comportamento esperado, não é bug de ambiente). Integrações externas (Gemini, Asaas, PlugNotas, Z-API, e-mail, push) degradam graciosamente sem as chaves.
- Login: `components/Login.tsx` valida contra a tabela `system_users` (senha comparada no client). Exige credenciais reais — não há conta de teste/seed. Para uma verificação não destrutiva do stack de autenticação, submeter um e-mail inexistente retorna "E-mail não localizado no sistema." (query read-only ao banco).

### Testes / lint
- Testes: `bash scripts/run-tests.sh` (runner nativo do Node via `tsx`; sem Jest/Vitest). O script usa `set -e`, então se os testes server-side (`scripts/*.test.ts`) falharem, os testes de componente React (`scripts/*.test.tsx`) NÃO chegam a rodar — rode as duas partes separadamente se precisar.
- **Testes pré-existentes que falham** (independem do ambiente; falham igual em Node 22 e 24, são bugs de código): `scripts/presence-refresh.test.ts`, `scripts/zapi-image-caption.test.ts` (`throttleZapiSend is not defined` em `server/whatsapp/providers/zapi.ts`) e `scripts/dhl-intake-render.test.tsx` (2). O restante passa (148/150 server-side).
- **Não existe script de lint nem `typecheck` no `package.json`** (só `dev`, `build`, `preview`). Para checar tipos use `npx tsc --noEmit`. Obs.: `replit.md` cita `npm run typecheck`/`db:generate`/`db:push`, mas esses scripts não existem.
- Comandos Drizzle (`npx drizzle-kit ...`) exigem a env `DATABASE_URL`.
