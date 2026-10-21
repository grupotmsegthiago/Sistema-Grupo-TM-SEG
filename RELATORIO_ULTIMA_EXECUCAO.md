# RELATÓRIO DA ÚLTIMA EXECUÇÃO

## Segredo da sessão no localhost (21/10/2026, não publicado)

A Vercel não exporta `SESSION_SECRET`: a variável é Secret e o pull grava `[SENSITIVE]`. Foi criado um segredo só deste computador, no `.env` da raiz, que o Git ignora. O servidor local foi reiniciado. O login deixou de responder “o segredo da sessão não está configurado” e passou a responder que a fonte confiável não está disponível, porque `SUPABASE_SERVICE_ROLE_KEY` também é Secret na Vercel e não veio no pull. Sem inventar a chave do banco e sem publicação.

---

## Colunas do relatório de OS (21/10/2026, não publicado)

No relatório de OS, o que é receita ficou lado a lado, com fundo verde: Receita, Ped. Recebido, Desl. Recebido e Total Recebido. Depois vêm Custo, Ped. Pago, Desl. Pago e Total Pago. O deslocamento recebido entra no verde porque faz parte do total recebido. Os totais são a soma que o rodapé já usava. Resultado, % lucro, auditoria e faturamento continuam no mesmo lugar. O aviso do pedágio saiu de dentro da célula e ficou num “i”: o texto só aparece com o mouse em cima. A fórmula da OS não foi alterada. Sem commit e sem publicação.

---

## Tabela na criação da OS (21/10/2026, não publicado)

Na criação interna e no portal, a tabela sai das últimas OS do mesmo cliente. Mesma origem e mesmo destino vencem. Se houver tabelas diferentes, fica a do km mais próximo. Sem fornecedor, só a tabela do cliente é gravada. O portal nasce com a receita calculada pelo motor da OS e o valor não vai no e-mail nem na resposta ao cliente. A marca `origemTabela: criacao` não substitui o snapshot da aprovação. Edição manual na auditoria continua gravando só o campo alterado.

---

## Salvamento só do campo editado (21/10/2026, não publicado)

Na auditoria de faturamento, Salvar grava apenas o que foi alterado. Pedágio do cliente grava `toll_value`. Pedágio do fornecedor grava `toll_value_provider` e não mexe no custo. Receita, custo e deslocamento seguem a mesma regra. O snapshot existente troca só a chave correspondente e o total do cliente, e conserva franquia e km extra. A fórmula `calculateMissionFinancials` não foi alterada. Sem migration e sem publicação.

Teste: `npx tsx --test scripts/gravar-somente-alterado.test.ts` — 7 passaram.

---

## Edição do Financeiro na auditoria (21/10/2026, não publicado)

O perfil Financeiro edita a auditoria de faturamento. Ao reaprovar uma OS já aprovada, a tela pede a senha e um texto da alteração. A Diretoria recebe um aviso com OS, quem, hora, texto e mudanças. Marcar como lida grava em `system_logs` e o aviso some. Deixar pendente mantém o aviso. Prejuízo analisado e fatura paga continuam travados. GTM-8763 está Agendada, então a senha só aparece depois da primeira aprovação. Sem migration e sem publicação.

---

# RELATÓRIO ANTERIOR

Fase: equivalência de acesso ANA.FERNANDES e Giovanna Marsili
Data: 2026-10-21
SHA da sessão: `dev` em `640e24b1`, working tree suja, sem commit
SHA de produção (/api/version): não consultado. Não houve publicação.

1. Objetivo e escopo
Fazer o usuário da Ana ter a mesma supervisão financeira da Giovanna. As duas já estão no perfil Financeiro. A diferença era a regra por nome, que reconhecia Giovanna e não reconhecia o cadastro `ANA.FERNANDES`.

2. Baseline
Branch `dev`, alinhada com `origin/dev` em `640e24b1` antes desta alteração. Supabase do app `ajhmmjuewdsukecaimik`. A leitura do cadastro foi só consulta. Nenhum SQL de escrita.

3. Arquivos alterados
- `lib/financeSupervisorAccess.ts` — `isAnaFernandes` e inclusão em `isFinanceSupervisorName`
- `lib/missionAccess.ts`, `lib/missionReportAccess.ts`, `lib/missingTableAccess.ts`, `lib/missionOpsIncomplete.ts`
- `lib/osAnalysisAccess.ts`, `lib/controleDiario.ts`
- `components/RequestOsAnalysisModal.tsx`
- `scripts/finance-supervisor-access.test.ts`, `scripts/mission-access.test.ts`, `scripts/controle-diario.test.ts`
- `scripts/acessos-financeiro-ana.test.ts`
- `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`

4. Regras preservadas
Motor de OS, Asaas, NF, TORRES, comissão e WhatsApp não foram alterados. A trava de prejuízo continua só com Giovanna Marsili, Beatriz Rocha e Thiago Moreira. “Ana” sozinho, “Ana Comercial” e outro sobrenome não entram. O restante do PR #339 (tela inicial de orçamento) não voltou. Nenhuma permissão foi gravada no banco.

5. Banco
Consulta de leitura em `system_users` + `profiles`. ANA.FERNANDES e Giovanna Marsili estão ativas, internas, perfil Financeiro, com a mesma lista do perfil. Giovanna tem no usuário `client-prices` e `provider-costs`. Ana não tem permissão extra no usuário. Essas duas chaves não mudam a tela de tabela, porque o perfil Financeiro já abre preço de cliente e custo de fornecedor. Nada foi gravado.

6. Riscos e rollback
Ana passa a editar OS concluída, ver a lista completa, o card de prejuízo, o alerta de OS sem tabela, reaprovar no estágio financeiro e abrir a auditoria pelo controle diário, como a Giovanna. Rollback: descartar estes arquivos na working tree. Sem migration.

7. Testes executados
`npx tsx --test scripts/finance-supervisor-access.test.ts scripts/mission-access.test.ts scripts/controle-diario.test.ts scripts/acessos-financeiro-ana.test.ts scripts/mission-ops-incomplete.test.ts scripts/missing-table-access.test.ts scripts/fase3-p0-financial-integrity.test.ts`
53 passaram. 1 falhou fora deste escopo: `scripts/fase3-p0-financial-integrity.test.ts` exige o texto `canAccessMissionReport` em `components/Sidebar.tsx`. O menu usa `canAccessScreen`, que chama essa função. O arquivo não foi alterado nesta tarefa. `App.tsx` continua chamando `canAccessMissionReport`.
`npm run build` terminou sem erro. O HTML injeta `__TMSEG_SUPABASE__` do projeto `ajhmmjuewdsukecaimik`.
`GET http://localhost:5000/api/health` retornou `{"status":"ok"}`.

8. Autorização
Pedido explícito de igualar a regra das duas. Não publicar até o proprietário validar no localhost e pedir publicar.

9. Próximo passo
Entrar com o usuário ANA.FERNANDES em `http://localhost:5000/` e conferir a lista de OS, o card de prejuízo e a edição de OS concluída. Se a trava de prejuízo também tiver de ser da Ana, isso é outra regra e precisa de pedido separado.
