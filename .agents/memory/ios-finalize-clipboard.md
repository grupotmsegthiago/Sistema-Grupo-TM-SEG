---
name: iOS finalize clipboard / report dialog
description: Conclusão de OS copia AUTOMÁTICO (texto+foto num ClipboardItem); o diálogo "Fim de Missão concluído" é só plano B quando a cópia automática falha (Safari/iOS).
---

# Conclusão de OS: cópia automática primeiro, diálogo como plano B

Regra atual (pedido explícito do usuário): ao CONCLUIR uma OS, o sistema
tenta AUTOMATICAMENTE copiar o relatório de fim de missão + foto num único
`ClipboardItem` (`text/plain` + `image/png`), padrão WhatsApp (foto com
legenda). Foto: prioriza o print colado na sessão (COLAR PRINT, já com logo);
senão baixa o print do hodômetro confirmado e converte para PNG via canvas.
Se a cópia automática tiver sucesso, NÃO abrir diálogo: fechar via
`onSuccess(undefined)` (undefined impede o pai de re-copiar só o texto e
apagar a foto do clipboard). O bloco de auto-cópia do relatório de
monitoramento NÃO roda na conclusão (evita duas escritas concorrentes).

**Why:** o usuário rejeitou a tela com botões ("Copiar texto"/"Copiar foto");
quer colar direto no WhatsApp. Mas no Safari/iOS escrever no clipboard fora
do gesto do clique é bloqueado (caso real de erro "Não foi possível copiar"
fazendo o operador achar que a finalização falhou).

**How to apply:** manter a ordem: tentar auto-cópia → em falha, abrir o
diálogo `setFinalizeReport` (os botões funcionam porque a escrita ocorre
dentro do clique) e NÃO chamar `onSuccess` (o modal faz `if (!isOpen) return
null`; fechar desmontaria o diálogo). Nesse plano B o fechamento + refresh
acontecem no botão "Fechar". Nunca remover o plano B: ele é o caminho iOS.
