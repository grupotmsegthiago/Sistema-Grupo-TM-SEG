---
name: Screen authz & deep-link bypass
description: requireRole('*') is "any internal user", not per-screen authz; ?page= deep-links bypass the Sidebar gate
---

# Autorização de tela e o furo de deep-link

**Regra:** o gating do Sidebar NÃO é controle de acesso suficiente. `App.tsx`
inicializa `currentScreen` a partir do query param `?page=`, então qualquer
usuário autenticado pode renderizar uma tela via deep-link mesmo sem o item no
menu. Telas sensíveis precisam de um guard PRÓPRIO no `case` do `renderContent`
(espelhar o padrão de `mission-report`/`shift-handover`: checar `userData` do
localStorage e cair no `<Dashboard/>` quando não autorizado).

**Regra (backend):** `requireRole('*')` significa apenas "qualquer usuário
interno logado" — NÃO é autorização por tela. Usuários-cliente vivem em
`system_users` (com `client_id`) e PASSAM no `requireRole('*')`. Para endpoints
que espelham uma tela interna, a autorização do backend tem que replicar a regra
da UI, senão há Broken Access Control (UI bloqueia, API não).

**Why:** review de segurança pegou que (a) `?page=shift-handover` burlava o menu e
(b) o endpoint de notas só exigia `requireRole('*')`, então cliente restrito e
comercial-sem-permissão liam/escreviam via chamada direta à API.

**How to apply:** ao criar tela/endpoint interno novo:
1. Guard no `case` do `App.tsx` (deep-link).
2. No backend, resolver permissões efetivas no principal
   (`resolvePrincipal` carrega `client_id` + `permissions` = `profiles.permissions`
   ∪ `system_users.permissions`) e negar (403) quem não bate a regra da UI —
   tipicamente: bloquear `clientId` e `role==='comercial'` sem `*`/permissão
   específica. Não confiar só em `requireRole('*')`.
