---
name: Conclusão de OS — popup guiado FOTO→TEXTO
description: Conclusão de OS abre o popup guiado COPIAR FOTO → COPIAR TEXTO; diálogo "Fim de Missão concluído" continua como plano B quando não há foto/suporte.
---

# Conclusão de OS: popup guiado obrigatório, diálogo como plano B

Regra atual (pedido explícito do usuário, revisou a decisão anterior): ao
CONCLUIR uma OS com foto disponível, abrir o popup guiado
`showWhatsappCopyPopup` (`lib/whatsappCopyFlow.ts`): PASSO 1 botão COPIAR
FOTO → operador cola no WhatsApp (abre caixa de legenda) → PASSO 2 botão
COPIAR TEXTO → cola na legenda → popup fecha sozinho. Foto: prioriza o
print colado na sessão (COLAR PRINT, já com logo); senão baixa o print do
hodômetro confirmado e converte para PNG via canvas. O popup é DOM
imperativo e sobrevive ao fechamento do modal — chamar `onSuccess(undefined)`
(undefined impede o pai de re-copiar só o texto e sobrescrever o clipboard).
O bloco de auto-cópia do relatório de monitoramento NÃO roda na conclusão.

**Why (histórico das decisões):**
1. Cópia combinada texto+foto num único ClipboardItem NÃO funciona — o
   WhatsApp ignora a imagem e cola só o texto (comprovado em teste, em
   qualquer ordem de formatos).
2. Auto-cópia silenciosa da foto + troca para texto no focus da aba foi
   rejeitada — o operador não percebia a troca.
3. Decisão final do usuário: "obriga o funcionário a fazer o certo" —
   popup bloqueante com os dois botões em sequência. Como cada cópia
   acontece no clique (gesto), também resolve o bloqueio do Safari/iOS.

**How to apply:** sem foto disponível ou sem suporte a ClipboardItem, cai
no fallback: `writeText` do relatório e, em falha, o diálogo
`setFinalizeReport` (plano B) — nele o fechamento + refresh acontecem no
botão "Fechar" e NÃO se chama `onSuccess` antes. Nunca remover o plano B.
No caminho feliz do popup não há botão de fechar; "Fechar sem copiar" só
aparece após erro de clipboard (evita operador preso).
