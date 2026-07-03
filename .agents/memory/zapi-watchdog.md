---
name: Vigia da conexão Z-API (WhatsApp)
description: Regras do watchdog anti-desconexão do bot — restart suave com cooldown persistido, nunca loop de reconexão.
---

Regra: reconexão do bot WhatsApp deve ser SUAVE — no máx. 1 restart por incidente, cooldown global de 30 min PERSISTIDO em `system_settings` (chave `zapi_watchdog_last_restart_at`), queda só confirmada com 2 leituras seguidas de /status.

**Why:** reconexões repetidas/insistentes na Z-API aumentam o risco de banimento do número pelo WhatsApp (preocupação explícita do usuário). Cooldown só em memória zerava a cada deploy/restart do servidor — por isso vai ao banco.

**How to apply:** qualquer automação futura que toque a sessão Z-API (restart, re-pareamento, troca de perfil) deve respeitar esse cooldown compartilhado e nunca reagir a UMA leitura isolada de desconexão; falha de REDE ao consultar /status não é queda do bot (ignorar a leitura). Alertas por e-mail: 1 na queda confirmada + 1 na recuperação (com contagem de quedas em 24h), nunca por tick.
