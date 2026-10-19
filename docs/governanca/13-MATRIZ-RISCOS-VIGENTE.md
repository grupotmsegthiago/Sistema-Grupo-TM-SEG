# 13 — Matriz de riscos vigente

Herdada de `06-RISCOS-E-DIVIDAS.md`. Nenhum P0 foi corrigido na Fase 1. Status: aberto, salvo nota.

| ID | Sev. | Status na Fase 1 | Proteção instalada agora |
| --- | --- | --- | --- |
| R01 | P0 | aberto | Constituição art. 10: login só muda na Fase 2 autorizada |
| R02 | P0 | aberto | Mesma trava. Commits `59f7158a` e `cb9f7fe3` continuam na história da `main` e a sonda de 2026-10-19 ainda viu linhas. Não declarar fechado |
| R03 | P0 | aberto | Não mexer no ingest nesta fase |
| R04 | P0 | aberto | Não mover o token nesta fase |
| R05 | P1 | aberto | Protocolo de migration: `exec_sql` novo proibido |
| R06 R07 R15 R16 | P1 | aberto | Fase 2, se autorizada |
| R08 R09 | P1 | aberto | Art. 2 e 3: não criar terceiro motor nem “unificar” agora |
| R10 R11 | P1 | aberto | Fase 4 só depois dos P0, e com regra de negócio |
| R12 | P1 | aberto | Protocolo: não passar de 50 funções |
| R13 | P1 | aberto | `dev` continua 31 atrás. Fast-forward não foi pedido |
| R14 | P1 | aberto | Três caminhos de schema reconhecidos; quarto caminho proibido |
| R17 | P2 | aberto | Edge de boas-vindas não é o SMTP vivo; não reativar Resend por limpeza |
| R18 | P2 | aberto | `motor-calculo-padrao` declarado não canônico |
| R19 R24 | P2/P3 | aberto | Legado permanece. Não apagar nesta fase |
| R20 | P2 | aberto | Decisão de negócio até o proprietário revogar acesso por nome |
| R21 | P2 | mitigado na governança | `ESTADO-ATUAL.md` e a regra de fontes obrigam conferir o ref. O conector em si não foi reconectado |
| R22 R23 | P2 | aberto | Sem CI novo e sem troca de Node |
| R25 R26 | P1/P2 | aberto no outro projeto | Proibido tratar aquele catálogo como TM SEG |
| R27 R28 | decisão | vigente | Preservados na constituição |

Riscos novos da própria governança:

| ID | Nota |
| --- | --- |
| G1 | Regra “não reintroduzir Z-API” foi recebida e não foi instalada como descontinuação, porque o código e os commits (`deee0a6f`, `85b831f7`, cron de 1 minuto) mostram Z-API viva. Limpeza segue bloqueada |
| G2 | Push desta fase não foi feito: a proibição desta execução manda. Outra máquina não vê as regras até um push autorizado |
| G3 | `.cursor/rules/validar-localhost-primeiro.mdc` não tinha frontmatter e podia não carregar. O frontmatter foi acrescentado; o texto da regra foi preservado |
