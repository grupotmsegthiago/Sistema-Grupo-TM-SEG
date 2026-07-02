---
name: Print da atualização é só da sessão
description: Regra do print colado no "Atualizar Missão" — nunca persistir, cópia combinada texto+imagem
---

Regra: o print colado na tela "Atualizar Missão" (área COLAR PRINT) é estritamente temporário — NUNCA salvar no Supabase nem em bucket. Ele vive só em memória (blob + preview), recebe a marca d'água TM SEG via canvas e é copiado JUNTO com o texto do relatório WhatsApp num único `ClipboardItem` (`text/plain` + `image/png`) ao salvar.

**Why:** exigência explícita do usuário (fluxo de envio manual ao WhatsApp do cliente; a foto não é dado do sistema). Persistir seria vazamento de escopo.

**How to apply:** qualquer evolução dessa área deve manter: reset do estado ao abrir modal/trocar OS, uso único após cópia bem-sucedida, guard `typeof navigator.clipboard?.write === 'function'` com fallback `writeText` (Safari/permissões). Não confundir com o print do hodômetro, que É persistido em bucket.

**Armadilha (bug real):** o pai (tabela de missões) re-copia o texto do relatório no callback de sucesso — isso SOBRESCREVE o clipboard e apaga a foto da cópia combinada. Quando a cópia combinada texto+imagem tiver sucesso, o modal deve sinalizar ao pai para NÃO re-copiar (`onSuccess(undefined)` em vez de `onSuccess(report)`). Sintoma: "o formulário colou, mas a foto não".
