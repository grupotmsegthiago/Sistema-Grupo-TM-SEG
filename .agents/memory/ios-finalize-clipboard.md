---
name: iOS finalize clipboard / report dialog
description: Why concluding an OS must keep the finalize dialog mounted and must not auto-copy outside the click gesture (Safari/iOS).
---

# Conclusão de OS, cópia no iOS e o diálogo "Fim de Missão concluído"

Regra: ao CONCLUIR uma OS (status -> Concluída), NÃO feche o modal de
atualização via `onSuccess(report)` e NÃO dispare auto-cópia do relatório.
O diálogo de fim de missão (com botões "Copiar texto"/"Copiar foto") é
renderizado DENTRO do UpdateMissionModal, que faz `if (!isOpen) return null`.
Fechar o modal desmonta o diálogo na hora, e a auto-cópia roda fora do gesto
do clique.

**Why:** No Safari/iOS, escrever na área de transferência só é permitido
DENTRO do gesto do usuário. Auto-cópia após `await` (save + fetch) é bloqueada
e mostrava o erro "Não foi possível copiar. Tente novamente." — fazendo o
operador achar que a finalização falhou (ela foi salva). Caso real: GTM-5861.

**How to apply:** Na conclusão (`finalStatus===COMPLETED && originalStatus
!==COMPLETED`), pule `onSuccess(report)` — deixe o modal aberto exibindo o
diálogo. O fechamento + refresh da lista acontecem quando o usuário clica em
"Fechar" no diálogo (chama `onSuccess()` sem report, então sem auto-cópia).
Atualizações que NÃO são conclusão mantêm o fluxo normal (auto-cópia no
desktop). A lista também atualiza sozinha via realtime global. Os botões do
diálogo funcionam porque a escrita acontece dentro do clique (writeText para
texto; ClipboardItem para a foto).
