---
name: WhatsApp bot kill-switch
description: Bot Z-API é MUDO por padrão; nenhum envio (manual ou automático) sem WHATSAPP_BOT_ENABLED=true.
---

# Regra

O número da Central conectado à Z-API NÃO pode enviar nem responder nada pelo sistema. Todo envio de WhatsApp é bloqueado por padrão; só libera se o secret `WHATSAPP_BOT_ENABLED` for exatamente `true`.

**Why:** decisão da diretoria (jul/2026): "o bot não pode falar nada com ninguém, nem responder ninguém". O número é usado por humanos no WhatsApp normal; mensagens automáticas do sistema causariam confusão com clientes/fornecedores.

**How to apply:**
- Qualquer NOVO ponto de envio Z-API (send-text, send-image etc.) deve passar pelo helper `isWhatsappBotEnabled()` (routes.ts) ou pelo `sendZapiTextMessage` (dhlSupplierIntake.ts), que já têm o guard embutido.
- Leituras (listar grupos, status da instância) seguem liberadas — só ENVIO é bloqueado.
- Workers em loop devem pular o canal ANTES do loop (1 linha de log por tick), sem auditar falha repetida.
- Não existe autoresponder de mensagens recebidas no sistema (webhook só grava status de entrega) — não criar um.
- Para reativar o bot no futuro: definir `WHATSAPP_BOT_ENABLED=true` nos secrets (dev e produção) e reiniciar/republicar.
