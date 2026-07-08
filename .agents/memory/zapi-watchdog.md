---
name: Vigia da conexão Z-API (WhatsApp)
description: Regras do watchdog anti-desconexão do bot — monitorar e alertar, nunca reconectar/restartar automaticamente.
---

Regra: reconexão do bot WhatsApp deve ser MANUAL. O vigia pode consultar `/status`, confirmar queda com 2 leituras seguidas, registrar evento e alertar por e-mail, mas **NUNCA** deve chamar `/restart`, bootstrap ou re-pareamento automaticamente.

**Why:** reconexões repetidas/insistentes na Z-API aumentam o risco de banimento do número pelo WhatsApp (preocupação explícita do usuário). A decisão operacional atual é: caiu/desconectou → alerta → humano reconecta manualmente no painel Z-API/WhatsApp.

**How to apply:** qualquer automação futura que toque a sessão Z-API (restart, re-pareamento, troca de perfil, auto-connect) deve ser bloqueada por padrão e exigir ação manual explícita. Falha de REDE ao consultar `/status` não é queda do bot (ignorar a leitura). Alertas por e-mail: 1 na queda confirmada + 1 na recuperação (com contagem de quedas em 24h), nunca por tick.
