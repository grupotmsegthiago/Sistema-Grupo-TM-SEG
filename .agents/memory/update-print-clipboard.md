---
name: Print da atualização é só da sessão
description: Regra do print colado no "Atualizar Missão" — nunca persistir, cópia combinada texto+imagem
---

Regra: o print colado na tela "Atualizar Missão" (área COLAR PRINT) é estritamente temporário — NUNCA salvar no Supabase nem em bucket. Ele vive só em memória (blob + preview), recebe a marca d'água TM SEG via canvas e é copiado JUNTO com o texto do relatório WhatsApp num único `ClipboardItem` (`text/plain` + `image/png`) ao salvar.

**Why:** exigência explícita do usuário (fluxo de envio manual ao WhatsApp do cliente; a foto não é dado do sistema). Persistir seria vazamento de escopo.

**How to apply:** qualquer evolução dessa área deve manter: reset do estado ao abrir modal/trocar OS, uso único após cópia bem-sucedida, guard `typeof navigator.clipboard?.write === 'function'` com fallback `writeText` (Safari/permissões). Não confundir com o print do hodômetro, que É persistido em bucket.
