---
name: Menu e deep-link só pelo perfil
description: Visibilidade de telas segue profiles.permissions; hardcodes de role no Sidebar foram removidos
---

# Menu = vínculo do perfil

**Regra:** o que estiver marcado em `profiles.permissions` (união com
`system_users.permissions`) aparece no menu e pode abrir via `?page=`.
O que não estiver vinculado fica oculto e bloqueado no `App`.

**Fonte única:** `lib/screenAccess.ts` (`canAccessScreen`) — usada por
`Sidebar`, `App` (navigate/edit/render) e `lib/screenNavigation.ts`.

**Exceções AND (já homologadas):**
- Cockpit / Gestão Investimento: só Thiago Moreira / Thiago Santos
- Faturamento / Comissões: perfil Diretoria **e** tela marcada no perfil
- Pendências de OS / Relatório de OS: helpers existentes

**RH:** UI também exige telas `rh-*` no perfil (role sozinho não libera mais).

**Operação:** ao criar/editar perfil em Configurações → Perfis de Acesso,
marcar exatamente as telas que o funcionário deve ver. Sem marcar = não aparece.
