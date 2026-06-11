---
name: API Placas / WDAPI2 plate lookup
description: External plate-lookup provider — use the wdapi2.com.br/consulta endpoint server-side; apiplacas.com.br/api.php is Cloudflare-blocked
---

# Consulta de placa — API Placas (WDAPI2)

Provedor único: a conta é em `apiplacas.com.br` (painel/cadastro), mas o ENDPOINT de
consulta que realmente funciona é o `wdapi2.com.br`. Não é caso de trocar de fornecedor.

- **Endpoint correto (funciona server-side):**
  `https://wdapi2.com.br/consulta/{PLACA}/{TOKEN}` (GET, token no path). Servidor nginx,
  responde 200 sem Cloudflare. É o endpoint documentado em `apiplacas.com.br/doc.php`.
- **NÃO usar `https://apiplacas.com.br/api.php?placa=&token=`** nem `api1.php`: esse
  domínio fica atrás do Cloudflare e bloqueia chamada servidor→servidor com 403
  ("Just a moment...") por reputação de IP de datacenter (Replit dev e prod). Nenhum
  cabeçalho de navegador resolve — testado. Foi o bug que travava o lookup.
- **Resposta:** JSON — `MARCA/MODELO/cor/anoModelo/uf/chassi/codigoSituacao`
  (`codigoSituacao !== '0'` = erro). Os forms já fazem o parse desses campos.
- **Secret:** `VITE_WDAPI_TOKEN`.

**Why:** `wdapi2.com.br` (nginx) não tem o desafio Cloudflare; `apiplacas.com.br` tem.
O código havia migrado para `api.php` achando que era "o endpoint oficial novo" — errado.
O oficial/documentado é o `wdapi2.com.br/consulta/...`.

**Padrão = proxy backend (servidor→servidor) para TODAS as telas:**
A chamada direta do frontend dá "Failed to fetch" (CORS). O proxy server-side funciona.
- Telas internas (`VehicleForm`, `ClientVehicleForm`): `GET /api/placa/lookup/:placa`
  em `server/routes.ts` (`requireAuth` + rate limit leve; API é paga). Retorna o JSON
  bruto do provedor.
- Intake público de fornecedor: proxy próprio em `server/dhlSupplierIntake.ts`
  (`/api/dhl/intake/public/:token/lookup-placa/:placa`), validado pelo token do intake.
- Sempre há fallback de preenchimento manual quando o lookup falha.

**How to apply:** ao mexer em consulta de placa, sempre `response.text()` + `JSON.parse`
em try/catch (resposta pode ser HTML); checar `response.ok` antes. Os DOIS proxies
(`server/routes.ts` e `server/dhlSupplierIntake.ts`) devem apontar para `wdapi2.com.br`.
