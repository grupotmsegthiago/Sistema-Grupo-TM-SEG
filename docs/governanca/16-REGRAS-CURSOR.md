# 16 — Regras do Cursor e conflitos

## O que carrega sozinho

| Caminho | Papel | Nesta fase |
| --- | --- | --- |
| `AGENTS.md` | Instruções do repositório, já injetadas no agente | Acrescentado ponteiro para `ESTADO-ATUAL.md`. Texto anterior preservado |
| `.cursorrules` | Regras de ouro e gatilho de publicar | Não editado |
| `.cursor/rules/atualizar-dev-antes.mdc` | Fast-forward da `dev` antes de editar, se a branch for `dev` | Não editado |
| `.cursor/rules/publicar.mdc` | `publicar.ps1` sem segunda pergunta | Não editado |
| `.cursor/rules/subir-reuniao.mdc` | Pacote da frase “subir reunião” | Não editado |
| `.cursor/rules/testar-antes-entregar.mdc` | Evidência antes de dizer pronto | Não editado |
| `.cursor/rules/validar-localhost-primeiro.mdc` | Ver `http://localhost:5000/` antes de sugerir publicação | Só entrou o frontmatter `alwaysApply: true`. O texto da regra permanece |
| `.cursor/rules/constituicao-tmseg.mdc` | Constituição curta, sempre ativa | Novo |
| `.cursor/rules/fontes-verdade-tmseg.mdc` | Fontes e os dois bancos, sempre ativa | Novo |
| `.cursor/rules/protocolo-alteracao-tmseg.mdc` | Ordem de reutilização e protocolo, sempre ativa | Novo |
| `.cursor/hooks/atualizar-dev.cjs` | Bloqueia gravação se a `dev` local estiver atrás | Não editado. Fora da `dev`, o hook permite |

As três regras novas apontam para `docs/governanca/` e não repetem o fluxo de publicação para não competir com `publicar.mdc`.

## Conflitos e tratamento

| # | Tensão | Tratamento |
| --- | --- | --- |
| 1 | Constituição pede autorização para deploy. `.cursorrules` e `publicar.mdc` publicam sem segunda pergunta quando o proprietário pede | Preservado o gatilho. A palavra publicar é a autorização. Deploy espontâneo continua proibido. Arquivos antigos não foram reescritos |
| 2 | `validar-localhost-primeiro.mdc` manda ver o localhost antes de publicar. `publicar.mdc` não verifica se isso ocorreu | Os dois ficam. A IA mostra o localhost antes de sugerir publicação. Se o proprietário já disse publicar, o fluxo antigo executa |
| 3 | Pedido da Fase 1: “não reintroduzir a Z-API”. Código e commits mostram Z-API no ar | Não virou regra de desligamento. ADR-006b pendente. Limpeza bloqueada |
| 4 | Pedido: Asaas “exclusivamente boleto”. O código também faz PIX, transferência e NF quando o provedor já é Asaas | Preservado o fluxo inteiro já homologado. Boleto não é NF. Nada de Asaas foi removido nem ampliado |
| 5 | `.cursorrules` cita eNotas. O emissor vivo é PlugNotas / provedor Asaas | A trava “não mudar NF” permanece. Não se cria cliente eNotas e não se apaga legado |
| 6 | `atualizar-dev-antes.mdc` diz para não trocar de branch fora da `dev`. O agente de nuvem usa branch `cursor/` | A regra não foi editada. Ela só bloqueia quando a branch corrente é `dev`. Esta fase não está na `dev` e não fez fast-forward |
| 7 | `subir-reuniao.mdc` lista um pacote histórico (migrations `2026_09_29`, nomes da trava de prejuízo) | Continua valendo só quando a frase de reunião for dita. Não virou checklist de todo commit |
| 8 | Writers paralelos da OS | Registrados. Não unificados. Isso é a Fase 3, se for pedida |
| 9 | Fase 0 sugeriu ponteiro no `AGENTS.md` só se o dono quisesse. A Fase 1 pediu carga automática | Ponteiro curto acrescentado. Nenhum parágrafo antigo foi apagado |

## O que não foi feito de propósito

Não houve fast-forward da `dev`. Não houve push. Não houve merge. Não houve edição de lógica, RLS, dependência ou credencial.
