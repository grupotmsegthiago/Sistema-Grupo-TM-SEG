---
name: Z-API Central connection
description: Como a instância Z-API da Central é conectada e o que toda chamada exige
---

- A conta Z-API do usuário exige o header `Client-Token` (token de segurança da conta) em TODA chamada — sem ele a API responde 400 `your client-token is not configured`, inclusive em GETs de status. O código já envia o header quando `ZAPI_CLIENT_TOKEN` está definido.
- Credenciais vivem nos secrets `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` (globais dev+prod; produção precisa de republish para enxergar novos secrets).
- A instância conectada é o número oficial da Central (instância mobile). Reconexão por número usa o fluxo mobile da Z-API (`/mobile/request-registration-code` → SMS → `/mobile/confirm-registration-code`), mas o usuário consegue concluir pelo painel da Z-API sozinho.
- **Why:** em jul/2026 os lembretes WhatsApp de fornecedor falharam em produção com "Z-API não configurada" porque os secrets nunca tinham sido salvos no Replit (só existiam no painel Z-API).
- **How to apply:** ao depurar falha de envio WhatsApp, checar primeiro `viewEnvVars` (os 3 secrets) e `GET {base}/status` + `/device` com o Client-Token antes de mexer em código.
