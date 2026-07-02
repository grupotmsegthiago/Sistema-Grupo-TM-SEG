---
name: Print da atualização é só da sessão
description: Regra do print colado no "Atualizar Missão" — nunca persistir; fluxo FOTO→TEXTO para WhatsApp
---

Regra: o print colado na tela "Atualizar Missão" (área COLAR PRINT) é estritamente temporário — NUNCA salvar no Supabase nem em bucket. Ele vive só em memória (blob + preview), recebe a marca d'água TM SEG via canvas e, ao salvar, dispara o fluxo FOTO→TEXTO de `lib/whatsappCopyFlow.ts`.

**Why:** exigência explícita do usuário (fluxo de envio manual ao WhatsApp do cliente; a foto não é dado do sistema). Persistir seria vazamento de escopo.

**How to apply:** qualquer evolução dessa área deve manter: reset do estado ao abrir modal/trocar OS, uso único após cópia bem-sucedida, guard de suporte a `ClipboardItem`/`clipboard.write` com fallback `writeText` (Safari/permissões). Não confundir com o print do hodômetro, que É persistido em bucket.

**Limitação COMPROVADA do WhatsApp Web:** quando o clipboard tem texto+imagem no MESMO `ClipboardItem`, o WhatsApp cola SÓ o texto — a ordem dos formatos NÃO muda nada (testado nas duas ordens). O padrão foto+legenda exige duas colagens: 1) FOTO sozinha no clipboard (abre a pré-visualização com caixa de legenda), 2) TEXTO na legenda. NÃO voltar para a cópia combinada num único ClipboardItem — não funciona.

**Decisão do usuário (pedido explícito):** fluxo GUIADO OBRIGATÓRIO via popup DOM imperativo (`showWhatsappCopyPopup` em `lib/whatsappCopyFlow.ts`, sobrevive ao unmount do modal): botão COPIAR FOTO → funcionário cola no WhatsApp → botão COPIAR TEXTO → cola na legenda → popup fecha sozinho. Sem botão de fechar no caminho feliz ("obriga o funcionário a fazer o certo"); "Fechar sem copiar" só aparece após erro de clipboard. Cada cópia acontece num clique (gesto), o que também atende Safari/iOS. Antes disso houve uma versão com barra flutuante + auto-cópia no focus da aba — o usuário não percebeu a troca e rejeitou; não voltar a ela.

**Limpeza por IA do print (pedido do usuário):** antes da marca d'água TM SEG, o print passa por edição de imagem no Gemini (`gemini-2.5-flash-image`, via rota backend autenticada) que remove logos/marcas/escritas de TERCEIROS, preservando mapa/placas/horários. Fail-soft obrigatório: se a IA falhar, segue com a foto original só com o logotipo TM SEG e a mensagem de status avisa (não mentir que limpou). A imagem continua uso único — nunca persistir.

**Ajustes de UX decididos pelo usuário:** o botão do popup tem barra de preenchimento de ~10s ("COPIANDO FOTO/TEXTO...") — a cópia acontece no clique e a animação segura o passo. NÃO abrir/focar WhatsApp Web via `window.open`: foi testado e abre NOVA aba que desconecta a sessão já aberta do funcionário — o usuário mandou tirar; alt+tab real é impossível a partir de uma página.

**Armadilha (bug real):** o pai (tabela de missões) re-copia o texto do relatório no callback de sucesso — isso SOBRESCREVE o clipboard e apaga a foto. Quando o fluxo foto→texto iniciar com sucesso, o modal deve sinalizar ao pai para NÃO re-copiar (`onSuccess(undefined)` em vez de `onSuccess(report)`). Sintoma: "o formulário colou, mas a foto não".
