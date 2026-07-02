---
name: Print da atualização é só da sessão
description: Regra do print colado no "Atualizar Missão" — nunca persistir; fluxo FOTO→TEXTO para WhatsApp
---

Regra: o print colado na tela "Atualizar Missão" (área COLAR PRINT) é estritamente temporário — NUNCA salvar no Supabase nem em bucket. Ele vive só em memória (blob + preview), recebe a marca d'água TM SEG via canvas e, ao salvar, dispara o fluxo FOTO→TEXTO de `lib/whatsappCopyFlow.ts`.

**Why:** exigência explícita do usuário (fluxo de envio manual ao WhatsApp do cliente; a foto não é dado do sistema). Persistir seria vazamento de escopo.

**How to apply:** qualquer evolução dessa área deve manter: reset do estado ao abrir modal/trocar OS, uso único após cópia bem-sucedida, guard de suporte a `ClipboardItem`/`clipboard.write` com fallback `writeText` (Safari/permissões). Não confundir com o print do hodômetro, que É persistido em bucket.

**Limitação COMPROVADA do WhatsApp Web:** quando o clipboard tem texto+imagem no MESMO `ClipboardItem`, o WhatsApp cola SÓ o texto — a ordem dos formatos NÃO muda nada (testado nas duas ordens). O padrão foto+legenda exige duas colagens: 1) FOTO sozinha no clipboard (abre a pré-visualização com caixa de legenda), 2) TEXTO na legenda. Como clipboard = 1 payload, `startWhatsappPhotoTextFlow` copia a FOTO, mostra barra flutuante não bloqueante e troca para o TEXTO automaticamente no `focus` da janela (após um `blur`), com botão manual de apoio. NÃO voltar para a cópia combinada num único ClipboardItem — não funciona.

**Armadilha (bug real):** o pai (tabela de missões) re-copia o texto do relatório no callback de sucesso — isso SOBRESCREVE o clipboard e apaga a foto. Quando o fluxo foto→texto iniciar com sucesso, o modal deve sinalizar ao pai para NÃO re-copiar (`onSuccess(undefined)` em vez de `onSuccess(report)`). Sintoma: "o formulário colou, mas a foto não".
