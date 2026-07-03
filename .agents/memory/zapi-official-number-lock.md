---
name: Trava do número oficial do bot WhatsApp
description: Bot só opera no (11) 92683-9456; envios bloqueados fail-closed se número diferente ou não confirmável.
---

Regra: o bot de WhatsApp (Z-API) só pode operar conectado no número oficial da Central — (11) 92683-9456 (5511926839456). Guarda server-side centralizada (`server/zapiGuard.ts`) aplicada em TODOS os caminhos de envio (send, send-group, alertas de override e intake de fornecedor DHL) e vigiada pelo watchdog (e-mail 1x por incidente de número errado + e-mail quando o oficial volta).

**Why:** decisão da diretoria (jul/2026) — nunca deixar mensagens da empresa saírem por um número pessoal/errado pareado por engano na instância.

**How to apply:** política é FAIL-CLOSED: se o número conectado for diferente do oficial OU não puder ser confirmado (Z-API `/device` responde 400 quando desconectado), o envio é negado — com 1 retry forçado antes de bloquear e cache de 5 min do número para não pesar o caminho de envio. Ao adicionar QUALQUER novo caminho de envio de WhatsApp, chamar `assertOfficialBotNumber()` antes do fetch. Se trocarem o número oficial da Central, atualizar a constante na guarda.
