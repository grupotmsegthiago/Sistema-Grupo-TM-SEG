---
name: API Placas (ex-WDAPI2) plate lookup
description: External plate-lookup provider migrated domains; how to call it and why backend proxy mostly fails
---

# Consulta de placa — API Placas (ex-WDAPI2)

O provedor de consulta de placas migrou de `wdapi2.com.br` para `apiplacas.com.br`.

- **Endpoint atual:** `https://apiplacas.com.br/api1.php?placa={PLACA}&token={TOKEN}` (GET, token na query string).
- **Resposta:** mesmo JSON de antes — `MARCA/MODELO/cor/anoModelo/uf/chassi/codigoSituacao` (`codigoSituacao !== '0'` = erro).
- **Secret:** `VITE_WDAPI_TOKEN` (nome mantido apesar do rebrand).
- Centralizado em `constants.ts` via `API_BRASIL_CONFIG.consultaUrl(placa)`.

**Why:** o domínio antigo `wdapi2.com.br/consulta/{placa}/{token}` passou a dar 301
para a home de apiplacas (path descartado) → retorna HTML → `JSON.parse` quebra com
"Unexpected token '<', \"<!DOCTYPE\"". Esse foi o bug que afetava todos os usuários.

**Cloudflare:** apiplacas.com.br fica atrás de Cloudflare e bloqueia (403 "Just a
moment") requisições de datacenter/servidor. Por isso:
- Consultas das telas internas devem ser **chamada direta do frontend** (o navegador
  real passa o desafio). Proxy backend NÃO é confiável.
- Exceção: a página pública de intake do fornecedor (`server/dhlSupplierIntake.ts`)
  precisa manter proxy backend porque o token não pode ser exposto a usuários
  anônimos — aceitar que o lookup pode falhar pelo Cloudflare; sempre há fallback
  de preenchimento manual.

**How to apply:** ao mexer em consulta de placa, sempre ler `response.text()` e
`JSON.parse` dentro de try/catch (resposta pode ser HTML); nunca chamar `.json()`
direto. Checar `response.ok` antes.
