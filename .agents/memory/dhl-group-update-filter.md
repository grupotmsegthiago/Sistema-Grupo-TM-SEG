---
name: Filtro de marcos DHL no grupo de WhatsApp
description: DHL só recebe marcos no grupo (origem, início, pernoite, fim, atípicos); rotina de monitoramento fica só no sistema.
---

Regra: o grupo de WhatsApp da DHL NÃO recebe atualização rotineira de monitoramento (posição, "segue viagem"). Só recebe: chegada na origem, início de missão, fim de missão (fluxo de conclusão), início/reinício de pernoite e situações atípicas (bloqueio, acidente, pane etc.). Cancelamento conta como atípico.

**Why:** pedido explícito do cliente DHL (jul/2026) — não quer o grupo poluído com atualizações de hora em hora, principalmente durante pernoite.

**How to apply:** o gate é frontend, só para clientes DHL, na etapa de envio automático ao grupo (demais clientes seguem recebendo tudo). Pernoite deduplica comparando a ocorrência anterior (currentLocation da missão): repetição com "PERNOITE" sem "REINICIO/FIM/RETOMAD/SAIND/ENCERRA" é suprimida. Detecção atípica é por palavra-chave com ocorrência normalizada SEM acentos — manter a lista de keywords sem diacríticos. Operador vê notificação 'info' quando a atualização não vai ao grupo (fica só no sistema). Cuidado com falso-negativo: situação grave com redação incomum pode não casar keyword — se a DHL reclamar de algo não enviado, ampliar a lista.
