---
name: Test before deliver
description: Regra permanente do usuario — testar tudo antes de entregar qualquer alteracao.
---

# Testar antes de entregar

**Regra do Thiago (permanente):** antes de considerar qualquer tarefa concluida, executar todos os testes possiveis e so entregar quando estiver funcionando. Vale para este projeto e para qualquer sistema neste workspace.

Cursor rule: `.cursor/rules/testar-antes-entregar.mdc` (`alwaysApply: true`).

Fluxo: implementar → testar (build, API, browser se aplicavel) → corrigir → so entao avisar o usuario. Apos publicar, validar producao (deploy + site + health).
