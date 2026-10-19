# 12 — Protocolo de publicação

A mecânica continua a das regras já instaladas. Este arquivo não pede confirmação extra quando o proprietário já pediu publicar.

## Gatilho

Palavras em `.cursorrules` e `.cursor/rules/publicar.mdc`: publicar, publicar o site, publicar o sistema, subir para produção, atualizar o site, atualizar o sistema, deploy, colocar no ar. “Subir reunião” segue `.cursor/rules/subir-reuniao.mdc` e, em seguida, o mesmo script.

Fora dessas palavras: não fazer merge e não publicar.

## Antes

1. Working tree entendida. Segredos e `.env` fora do commit.
2. Saber onde está a `dev`. Em 2026-10-19, `origin/dev` está 31 commits atrás de `origin/main`. Publicar a partir dessa `dev` não regride a `main` (ela é ancestral), e também não a atualiza. Trabalho novo tem de nascer da `main` ou de uma `dev` já avançada com fast-forward pedido pelo proprietário.
3. `vercel.json` com no máximo 50 chaves em `functions`.
4. Localhost `http://localhost:5000/` quando a mudança é de tela ou API, como em `.cursor/rules/validar-localhost-primeiro.mdc`, antes de sugerir a publicação.
5. Testes do escopo com evidência (`.cursor/rules/testar-antes-entregar.mdc`).

## Execução

`publicar.ps1`: checkout `dev`, recusa árvore suja, merge `dev` → `main`, push `main`, push `dev`, volta para `dev`. Sem `--force` na `main`.

## Depois

- Deploy no projeto `sistema-grupo-tm-seg`, domínio `sistema.grupotmseg.com.br`.
- `GET /api/version` com `buildId` igual ao SHA anunciado.
- `GET /api/health` ok.
- Tela de login sem erro de JS quando a mudança for visível.
- Se o deploy falhar, corrigir esse projeto. Não usar o Vercel `workspace`.

## Rollback de app

Revert de git e nova publicação autorizada. Rollback de banco só com o arquivo em `migrations/rollback/` correspondente. Os seis rollbacks versionados são de agosto/2026 (RLS). Não cobrem o núcleo de OS.

## O que publicação não faz

Não aplica `migrations/`. Não separa banco de homologação. Não move domínio.
