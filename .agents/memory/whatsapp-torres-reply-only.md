---
name: WhatsApp bot só responde grupo Torres
description: Comandos conversacionais (resumo/reinício) só no grupo Torres; demais grupos só recebem atualização de OS com print (formulário + foto).
---

# Regra

O bot Z-API **só pode responder** (comandos `resumo` / `status` / `viaturas` / `reinício`) no **grupo Torres**.

Nos **demais grupos** (clientes/fornecedores) o bot **não conversa**. Só manda atualização quando o operador cola o print no sistema — aí vai formulário (tabela) + foto via `/api/whatsapp/send-group` (`shouldSendClientGroupWhatsApp` exige print explícito).

**How to apply:**
- Gate em `server/whatsapp/torresGroupGate.ts`, chamado por `handleInboundWhatsappMessage`.
- Identificação: `WHATSAPP_TORRES_GROUP_ID` (env) **ou** `chatName` com "Torres" **ou** `providers.whatsapp_group_id` do fornecedor Torres.
- Vínculo de grupo (`@monitoramento cadastra este grupo…`) continua permitido em qualquer grupo (setup de cadastro).
- Não reabrir resposta conversacional em grupos de cliente.
