---
name: Limpeza de print sem perder qualidade
description: Por que a foto de atualização de OS nunca pode usar a imagem regenerada pela IA como base
---

# Regra

A foto final da atualização de OS é SEMPRE montada sobre a original em resolução cheia. A IA de imagem (gemini-2.5-flash-image) só serve de REMENDO dentro das caixas detectadas — nunca como base da foto inteira.

**Why:** o modelo de imagem devolve ~1024px — usar a saída dele como base deixava as fotos borradas (reclamação do usuário). Além disso, o filtro de segurança do Gemini BLOQUEIA pedidos de remoção de logo/marca d'água (`promptFeedback.blockReason=SAFETY`, confirmado em teste real) — retentar não adianta; quando bloquear, o endpoint devolve 200 só com as caixas e o frontend cobre cada região com borrão local (ctx.filter) ou pixelização (fallback p/ navegador sem filter).

**How to apply:** qualquer edição de imagem por IA no sistema deve seguir esse padrão: detectar regiões (gemini-2.5-flash + responseSchema, box_2d 0-1000), remendar localmente na resolução original e ter fallback determinístico quando o modelo de imagem recusar. Guardas: proporção do patch vs original (>5% → remendo local) e placas de veículo nunca entram nas caixas.
