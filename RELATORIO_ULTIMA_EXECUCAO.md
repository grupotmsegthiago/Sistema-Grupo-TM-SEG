# RELATÓRIO DA ÚLTIMA EXECUÇÃO

## Rolagem da Auditoria de Faturamento (22/10/2026)

A publicação de 21/10 trocou a área que rola da auditoria por um `fieldset`, para travar os campos enquanto salva. Nesse elemento o navegador não desce a rolagem, então o restante da OS ficava cortado para quem abre a tela, não só para a Ana e a Giovanna. A rolagem voltou para o div de antes, sem mudar `min-height`. O fieldset continua só para desabilitar os campos durante o Salvando. A suíte agora recusa `overflow` na abertura de um `fieldset`, e o Cursor bloqueia essa edição. Sem mudança de valor, de gravação ou de permissão.

---

## Cockpit lê, zero gravado vale e boletim fecha (21/10/2026)

O Atualizar do Cockpit deixou de chamar o recálculo de hora extra. Ele só busca de novo o que já está no banco. Receita e custo gravados, inclusive 0, entram no Cockpit e no relatório de OS mesmo sem a OS estar conferida. Estimativa só quando a coluna está NULL. Deslocamento 0 também permanece 0. No boletim, se a fórmula de km extra e hora extra não soma o valor gravado, o serviço inteiro fica no valor da OS e os extras de dinheiro zeram, para a linha fechar. A rota `/api/recalculate-open` continua no servidor, fora do botão. Sem mudança da fórmula do motor e sem migration.

---

## Relatório de OS: pagamento ao fornecedor em vermelho claro (21/10/2026, não publicado)

No relatório de OS, Custo, Ped. Pago, Desl. Pago e Total Pago ficaram com fundo vermelho claro, no mesmo bloco do verde da receita. Cabeçalho e totais seguem o vermelho mais forte. Os números não mudaram. Sem publicação.

---

## Auditoria não fecha no meio do salvamento (21/10/2026, não publicado)

A varredura da tela de auditoria achou gravações que seguiam sem a linha de volta do banco: dados operacionais do fornecedor, recálculo, tabela oficial, rota, vínculo de mesma OS, boletim e referência da VS. Essas gravações agora usam a mesma confirmação do Salvar. Se o banco não devolver a OS, a tela mostra o erro e não diz que salvou. Durante o envio o botão de fechar não sai, os campos ficam desabilitados e o painel Salvando cobre a tela. Ao reabrir, a OS é lida de novo no servidor. Sem mudança de fórmula e sem publicação.

---

## Tabela mestre genérica fora do preço (21/10/2026, não publicado)

O recálculo escolhia a linha `__AUTO_MASTER__ SUDESTE` como se fosse a tabela da OS. Na FLASH, essa linha vale R$ 800 e substituía a tabela `SUDESTE - FLASH - 30 DIAS - BARUERI` (R$ 650). Agora essa linha não entra na escolha, nem quando o id salvo é o dela. Se a OS já tem a tabela contratual, ela permanece. Se não houver correspondência, o preço fica zerado e o aviso é “Tabela não encontrada”. O cadastro do cliente deixou de gravar linha nova com esse nome. Nada foi apagado nem desativado no banco. Sem publicação e sem mudança da fórmula de km, hora, pedágio e deslocamento.

---

## Auditoria grava o que a tela mostra (21/10/2026, não publicado)

O Salvar da auditoria envia os seis valores que estão na tela, inclusive zero, sem depender de marca de campo alterado. A chamada pede a linha de volta com `.select()`. Se o banco devolver erro ou nenhuma linha, a tela mostra o erro e não diz que salvou. A lista da auditoria recebe a linha devolvida e busca de novo. No projeto Grupo TMSEG, a política `public_access_missions` permite UPDATE. Sem mudança de fórmula e sem publicação.

---

## E-mail da fatura com NF, boleto e boletim (21/10/2026, não publicado)

O aviso da Asaas de “fatura gerada” ia para o cliente sem a cópia do financeiro e sem os documentos. Na próxima cobrança, o cliente da Asaas recebe `financeiro@grupotmseg.com.br` nas cópias e o e-mail vazio de fatura criada deixa de ir ao cliente. Os lembretes de vencimento continuam. O e-mail do sistema, que já saía quando a NF e o boleto existiam, agora anexa o PDF da NF, o PDF do boleto quando o link é um PDF, e a planilha do boletim com as OS vinculadas. O boletim usa só os valores já gravados na OS. O texto do e-mail aponta para o financeiro, com cópia para o financeiro e para o Thiago. Sem mudança de fórmula, sem migration e sem publicação.

---

## Aviso da alteração já feita (21/10/2026, não publicado)

O aviso da Diretoria só nascia na reaprovação com senha. O Salvar de uma OS já aprovada ficava só no histórico da OS, então a alteração da Giovanna não aparecia. A Diretoria agora também lê esse histórico (perfil Diretoria ou Thiago Moreira / Thiago Santos). Salvar daqui para a frente grava o aviso na hora. Marcar como lida continua valendo. Sem mudança de fórmula e sem publicação.

---

## Senha da reaprovação (21/10/2026, não publicado)

Na OS já aprovada, o botão Reaprovar ficava cinza até o texto ter 8 caracteres, mesmo com a senha digitada. Agora ele libera quando a senha de quem está logado é preenchida. A conferência continua sendo a senha de acesso dessa pessoa: Giovanna com a dela, Ana com a dela. O texto da alteração segue obrigatório no clique. Sem mudança de fórmula e sem publicação.

---

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
