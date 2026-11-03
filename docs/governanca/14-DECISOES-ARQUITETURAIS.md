# 14 — Registro de decisões arquiteturais

Decisão aceita obriga a próxima sessão. Decisão pendente não vira regra.

| ID | Data | Estado | Decisão | Evidência | Consequência |
| --- | --- | --- | --- | --- | --- |
| ADR-001 | Fase 0, código `c714a624` | aceita | A OS da TM SEG é `missions`. O motor canônico é `calculateMissionFinancials` | `docs/governanca/00`, `lib/financialUtils.ts` | Proibido segundo motor |
| ADR-002 | Fase 0 | aceita | App e TORRES são Supabase diferentes | `lib/supabaseDefaults.ts`, `lib/comissao/torresSupabase.ts`; sonda 404 de `service_orders` na TM SEG | SQL separado por ref |
| ADR-003 | 2026-10-16 | aceita em produção | KM extra e deslocamento seguem a tabela vinculada | PR #344, commit `c714a624` | Não hardcodar tarifa paralela |
| ADR-004 | 2026-10 | aceita | O PR #339 foi revertido pelo PR #343 (`aac37e13`) | `git log` da `main` | Não reaplicar o #339 sem pedido novo |
| ADR-005 | 2026-10-13, ainda no código | aceita | Lançar pagamento da TORRES é clique. Troca de mês não lança | Fase 0, `contaPagarTorres.ts` | Não recolocar `useEffect` de lançamento |
| ADR-006 | Fase 1 | aceita como preservação | Z-API permanece a integração de WhatsApp | cron `/api/cron/zapi`, commits de webhook, `AGENTS.md` | Não remover e não substituir |
| ADR-006b | Fase 1 | pendente | “Não reintroduzir a Z-API” como se estivesse desligada | Pedido da Fase 1 contra o código vivo | Não executar limpeza até o proprietário confirmar descontinuação |
| ADR-007 | já nas regras; reafirmada na Fase 1 | aceita | Pedir publicar é a autorização de `publicar.ps1` | `.cursorrules`, `publicar.mdc` | Constituição não cria segunda confirmação |
| ADR-008 | Fase 0 | aceita como limite | Não há evidência de banco de homologação separado | Fase 0 | Operar como produção até prova em contrário |
| ADR-009 | outubro/2026 | aceita e incompleta | Houve commits para tirar fatura, conta, comissão, receita e tabela de preço da chave anônima | `cb9f7fe3`, `59f7158a` são ancestrais do HEAD; a sonda ainda leu linhas | Fase 2 mede de novo. Não desfazer esses commits |
| ADR-010 | Fase 1 | aceita | eNotas/Focus não são o emissor vivo. O fluxo de NF vigente não muda | Fase 0, `server/plugnotasService.ts` | Não criar cliente eNotas e não apagar legado sem ordem |
| ADR-011 | regra de reunião | aceita | Trava de prejuízo com os três nomes e, depois, só Diretoria | `subir-reuniao.mdc` | Não ampliar quem edita prejuízo |
