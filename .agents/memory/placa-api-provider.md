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

**Padrão atual = proxy backend para TODAS as telas (servidor→servidor):**
A chamada direta do frontend (`fetch` no navegador) dava **"Failed to fetch"**
(CORS/Cloudflare bloqueiam a requisição do navegador). O proxy servidor→servidor
funciona — é o mesmo que o intake da DHL já usava. Por isso:
- Telas internas (`VehicleForm`, `ClientVehicleForm`) consultam via
  `GET /api/placa/lookup/:placa` (em `server/routes.ts`, `requireAuth` + rate limit
  leve, pois a API é paga) e usam `authFetch`. O endpoint retorna o JSON BRUTO do
  provedor (os forms já fazem o parse de `MARCA/MODELO/uf/chassi/anoModelo`).
- A página pública de intake do fornecedor (`server/dhlSupplierIntake.ts`) tem o seu
  próprio proxy (`/api/dhl/intake/public/:token/lookup-placa/:placa`), validado pelo
  token do intake, porque o usuário é anônimo.
- Sempre há fallback de preenchimento manual quando o lookup falha.

**Why:** a memória antiga dizia "chamar direto do frontend" — estava errado/ficou
obsoleto; o navegador é bloqueado por CORS/Cloudflare e o proxy server-side é o
caminho confiável.

**How to apply:** ao mexer em consulta de placa, sempre ler `response.text()` e
`JSON.parse` dentro de try/catch (resposta pode ser HTML); nunca chamar `.json()`
direto. Checar `response.ok` antes.
