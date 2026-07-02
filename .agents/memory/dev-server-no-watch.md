---
name: Dev server sem watch — rotas novas exigem restart do workflow
description: npm run dev roda tsx SEM watch; mudanças em server/ não recarregam sozinhas e rota nova cai no catch-all do Vite (200 HTML)
---

Regra: o workflow "Start application" roda `npx tsx server/index.ts` **sem** `watch`. Só o frontend (Vite) tem HMR. Qualquer mudança em `server/` (rota nova, prompt, middleware) exige `restart_workflow` para valer.

**Why:** Uma rota `/api/...` recém-adicionada parecia registrada, mas o processo antigo não a tinha; o POST caía no catch-all do Vite e voltava **200 com index.html em ~10ms**. Com fail-soft no frontend, o sintoma era silencioso ("a IA não limpou a foto"), sem nenhum erro.

**How to apply:**
- Depois de editar `server/`, reinicie o workflow antes de testar/entregar.
- Sinal de alerta nos logs do express: rota de IA/pesada respondendo `200 in ~10ms` **sem** o sufixo `:: {json}` = resposta veio do Vite (HTML), não da rota — processo defasado.
- Ao depurar "endpoint não funciona", confirme com `curl -w ct=%{content_type}`: `text/html` numa rota `/api` = servidor velho.
