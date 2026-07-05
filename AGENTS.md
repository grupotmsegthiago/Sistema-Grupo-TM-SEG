# AGENTS.md

## Cursor Cloud specific instructions

Sistema **Grupo TM SEG** — app full-stack único na raiz (React 18 + Vite no front, Express 5 + `tsx` no back), banco **Supabase** (PostgreSQL na nuvem, projeto oficial `ajhmmjuewdsukecaimik`). Não há Docker nem banco local: o Supabase é SaaS remoto. Comandos padrão estão no `package.json` e no `README.md`; abaixo ficam apenas os detalhes não óbvios.

### Node 24 (obrigatório) x shim v22
- O projeto exige **Node 24.x** (`engines` no `package.json` e `.nvmrc`).
- O ambiente tem um binário `/exec-daemon/node` (**v22**) que fica no início do `PATH` e sobrescreve o node do nvm. O `~/.nvm` já tem o Node **24.18.0** instalado e o `~/.bashrc` foi ajustado para prepender esse node ao `PATH` — então **shells de login novos (incl. sessões tmux com `-l`) já usam Node 24**.
- Se em algum shell `node --version` mostrar v22, ative o 24 antes de rodar/buildar: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` (ou `. "$HOME/.nvm/nvm.sh"; nvm use 24`).

### `.env` necessário para subir o dev server (gotcha)
- `server/routes.ts` faz `new Resend(process.env.RESEND_API_KEY)` no nível de módulo. Se a var estiver **vazia**, o processo **quebra no boot** (`Error: Missing API key`) — antes mesmo de servir.
- Solução: manter um `.env` (gitignored) na raiz com um placeholder não-vazio:
  ```
  RESEND_API_KEY=re_placeholder_dev_only
  NODE_ENV=development
  PORT=5000
  ```
- Supabase **não** precisa de `.env`: URL e anon key públicas têm defaults embarcados em `lib/supabaseDefaults.ts`, então front/login já apontam para o projeto oficial ao vivo. `SUPABASE_SERVICE_ROLE_KEY` só é necessária para rotas admin do servidor (opera em modo degradado sem ela).
- Chaves de integrações (Gemini, Z-API, Asaas, PlugNotas, Maps, VAPID, etc.) são **opcionais** — as features degradam sem elas, mas o app sobe.

### Rodar / testar / buildar
- **Dev (front + back juntos, porta 5000):** `npm run dev` (`tsx server/index.ts` + Vite middleware/HMR). Health: `GET http://localhost:5000/api/health` → `{"status":"ok"}`. Em dev os workers de background (NF retry, relatórios, DHL, e-mail, Z-API) iniciam automaticamente; em modo Vercel eles são desativados e viram Cron Jobs.
- **Testes:** `bash scripts/run-tests.sh` (Node test runner via `tsx`; testes `.test.tsx` usam o loader em `scripts/test-loaders/register.mjs`).
- **Build:** `npm run build` (`vite build` + `build-server.mjs` → `dist/public/` e `dist/index.cjs`).
- **Sem script de lint/typecheck.** Rodar `tsc --noEmit` cru **falha** com `TS6305` por causa das project references (`composite`) — isso é esperado e **não** é o fluxo do projeto; use `npm run build` para validar tipos/compilação.

### Autenticação / login E2E
- Login é custom: o front consulta a tabela `system_users` no Supabase ao vivo (`components/Login.tsx`) e compara a senha. Para logar de verdade é preciso um usuário válido no banco — **não há credenciais de teste no ambiente**. Sem credenciais, dá para validar a stack até a resposta do banco (ex.: "E-mail não localizado no sistema."), o que já confirma front → Supabase → resposta.
