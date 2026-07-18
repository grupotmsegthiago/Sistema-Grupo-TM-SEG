---
name: WhatsApp bot kill-switch
description: Bot Z-API é MUDO por padrão; nenhum envio (manual ou automático) sem WHATSAPP_BOT_ENABLED=true.
---

# Regra

O número da Central conectado à Z-API NÃO pode enviar nem responder nada pelo sistema em conversas individuais. Todo envio de WhatsApp é bloqueado por padrão; só libera se o secret `WHATSAPP_BOT_ENABLED` for exatamente `true`.

**Exceção controlada (pedida pelo usuário):** o bot PODE postar atualizações de OS no GRUPO de WhatsApp vinculado ao cliente no cadastro (`clients.whatsapp_group_id`), via `/api/whatsapp/send-group`. O destino é resolvido server-side pelo cadastro (match EXATO name/trading_name) e validado como grupo (id `-group`/`@g.us`) — nunca contato individual, nunca escolhido pelo frontend. Exige print colado no sistema (formulário + foto).

**Exceção conversacional:** só o **grupo Torres** pode receber resposta a comandos (`resumo` / `reinício`). Ver `whatsapp-torres-reply-only.md`.

**Why:** decisão da diretoria (jul/2026): "o bot não pode falar nada com ninguém, nem responder ninguém". O número é usado por humanos no WhatsApp normal; mensagens automáticas do sistema causariam confusão com clientes/fornecedores.

**How to apply:**
- Qualquer NOVO ponto de envio Z-API (send-text, send-image etc.) deve passar pelo helper `isWhatsappBotEnabled()` (routes.ts) ou pelo `sendZapiTextMessage` (dhlSupplierIntake.ts), que já têm o guard embutido.
- Leituras (listar grupos, status da instância) seguem liberadas — só ENVIO é bloqueado.
- Workers em loop devem pular o canal ANTES do loop (1 linha de log por tick), sem auditar falha repetida.
- Não existe autoresponder de mensagens recebidas no sistema (webhook só grava status de entrega) — não criar um.
- Para reativar o bot no futuro: definir `WHATSAPP_BOT_ENABLED=true` nos secrets (dev e produção) e reiniciar/republicar.
