# RELATÓRIO DA ÚLTIMA EXECUÇÃO

Executado em 30/10/2026 na `dev`. A aba Tabela de Preços voltou a mostrar as linhas de 2026, com a marca 2026 (ANTIGA). A cotação nova e a proposta comercial continuam na Tabela 2027. Arquivos: `components/ClientForm.tsx` e `scripts/trechos-proposta.test.ts`. Sem banco, sem motor da OS e sem função nova na Vercel.

Executado em 30/10/2026 na `dev`. Nova senha temporária do Rafael Lima (id 33), com troca obrigatória. A anterior tinha cifrão e o login em texto recusa `$`. A geração em `lib/senhaTemporaria.ts` deixou de usar cifrão. Em `lib/sessao/gravarSenha.ts`, quando não existe `password_hash`, o valor verdadeiro da troca obrigatória não é regravado a cada login, e o falso da troca de senha é gravado. O login local abriu a tela de alteração obrigatória. A sessão veio com perfil COMERCIAL e as permissões início, clientes, cotações e ordens de serviço. A senha definitiva não foi criada aqui. Ainda não foi publicado.

Executado em 30/10/2026 na `dev`. Isolamento do comercial na aplicação e no perfil gravado.

Objetivo: o comercial vê a própria carteira e não abre agentes, fornecedores, alvará nem contratos.

A SQL enviada não foi executada. O navegador usa a chave anônima e não chama `supabase.auth.signIn`, então `auth.uid()` fica vazio. `system_users` não tem coluna `perfil` e o id do usuário é número, não uuid. As políticas abertas se chamam `public_access_clients`, `public_access_missions`, `public_access_quotes` e `Allow all for comissoes`. Trocar isso pela SQL enviada deixaria clientes, OS, cotações e comissões vazios para a Diretoria também. Enquanto a chave anônima ler essas tabelas, um filtro de tela não substitui RLS.

O que foi feito:
- `lib/screenAccess.ts` nega ao comercial as telas fora da carteira, inclusive formulários derivados.
- Perfil `COMERCIAL` (id 7) atualizado para `dashboard`, `clients-group`, `clients`, `quotes`, `missions`, `monitoring-group`. Os quatro usuários desse perfil não têm permissão extra em `system_users`.
- `ClientList` e o combo de cliente da cotação filtram por `responsavel_comercial_id`. Sem o vínculo, a lista fica vazia.
- No cadastro, o responsável comercial fica travado e o salvamento grava o id do usuário logado.
- O aviso de pedágio da página inicial, para o comercial, só lista OS dos nomes da carteira.

Carteira hoje: Rafael Lima tem cadastro de comercial e 0 clientes vinculados. Miguel Mota tem 16. Cassiane Garcia tem 1. Waldir Comin e Thiago Arruda estão no perfil COMERCIAL e não têm linha em `comerciais`; a lista deles fica vazia até existir o vínculo. Nenhum responsável foi preenchido em massa.

Motor da OS, comissão, Asaas, NF e Torres não mudaram. Ainda não foi publicado.

Executado em 30/10/2026 na `dev`. O cadastro de usuário passa a senha informada para o e-mail, para o modal e para a mensagem copiada. O template de boas-vindas recusa senha vazia ou o texto `undefined`. Não foi criada tabela nova nem usuário no Supabase Auth: o acesso continua em `system_users` e a troca obrigatória continua em `force_password_change`. A senha de Rafael Lima (`rafa.stlima@gmail.com`, id 33) foi regravada com troca obrigatória. O SMTP local não tem senha, então o e-mail não foi disparado daqui.

Validado em 30/10/2026 no localhost, sem publicar. A chave da Torres não está no `.env.local`: a leitura ao vivo não rodou. O espelho tem 170 linhas ativas e nenhuma com prefixo `inv:`. Em outubro/2026 o quadro da Torres soma R$ 298.103,65 em 94 faturas, igual à soma do detalhe, sem id repetido. A simulação `inv:` contra o mesmo espelho manteve 94 faturas e o mesmo valor. Sem a chave, o sincronismo devolveu aviso, não chamou o push e não falhou. As 95 comissões em aguardando ficam com a coluna A pagar vazia. Cassiane Garcia está abaixo do piso, com comissão e bônus zerados. A tela do navegador permaneceu no login.

Executado em 30/10/2026 na `dev`, a partir do plano de correção da auditoria de comissões. `mesclarLinhasQuadro` trata `inv:` e o id cru como a mesma origem. Sem a chave da Torres, `sincronizarComissoesTorres` não dispara o push e devolve aviso, sem falhar a rota. `roundMoney` soma `Number.EPSILON` antes de arredondar o centavo. Não houve UPDATE em `clients.responsavel_comercial_id` na TM SEG nem na Torres: o banco não diz qual vendedor é de cada cliente. As 4.723 OS sem fatura não foram alteradas.

Executado em 30/10/2026 na `dev`, a pedido de "pode tirar isso do cockpit da diretoria". Saíram do Cockpit os blocos Ocorrências em aberto e Tabelas que não combinam com a rota, na Visão Geral e na aba Operação. O componente de ocorrências permanece na Inteligência Financeira. A caixa de cartas permanece. Arquivo: `components/dashboard/DashboardDiretoria.tsx`. Sem banco, sem motor da OS e sem publicação.

Executado em 30/10/2026 na branch `cursor/pre-fatura-desenho-0f12`, depois da frase "Fluxo aprovado, pode executar".

A pré-fatura mensal foi codificada. Menu Financeiro → Pré-fatura, herdando `fin-billing`. Aba Serviços mensais no cliente, só para Diretoria, Administrador e Financeiro, com o cliente já salvo. Aprovar não chama Asaas. Gerar fatura reusa `POST /api/asaas/create-charge` sem OS. A migration `migrations/2026_10_30_pre_fatura_mensal.sql` está no repositório e não foi aplicada. Sem ela a tela mostra o aviso e não grava. O motor da OS, a tabela de preço, DHL/IBL, Asaas e o limite de funções da Vercel não mudaram. Ainda não foi publicado.

Testes: `./node_modules/.bin/tsx --test scripts/pre-fatura-mensal.test.ts` — 8 passaram.

No mesmo pedido, a receita e o custo da OS passam a ser gravados pelo motor oficial. Na criação, a prévia de quilômetro dividido por 45 deixa de ser o valor salvo quando o motor acha a tabela. No salvamento operacional, a mesma gravação reescreve `revenue_value` e `cost_value` se mudaram quilômetro, hora, pedágio ou fornecedor, ou se a OS foi concluída. Não reescreve OS aprovada, conferida, com ajuste manual, cancelada, recusada ou com prejuízo travado. Não zera valor já gravado quando o motor não acha tabela.

Passagem de outubro/2026 (01/10 a 30/10, fuso de Brasília), a mesma conta do card: 11 OS. Gravada só a GTM-8940, da Intermodal, concluída, sem aprovação e com motivo "AGUARDANDO DEFINIÇÃO". Receita de R$ 730 para R$ 876. Custo de R$ 1.000 para R$ 600. Conferido no banco. O card passou a 10. As outras 10 ficaram: cinco aprovadas, uma cancelada e quatro em que o motor já coincidia com o valor salvo (prejuízo real). Ainda não foi publicado.

Testes: `./node_modules/.bin/tsx --test scripts/sincronizar-valores-os.test.ts` — 4 passaram.

Executado em 28/10/2026 na `dev`. A Tabela de Custos do fornecedor ganhou o botão Exportar Excel. O arquivo usa a paleta da grade: faixa escura, custo base vermelho, reajuste pendente cinza e reajuste ativo verde. A busca da tela filtra as linhas. Nenhum valor de custo é alterado. Ainda não foi publicado.

Testes: `npx tsx --test scripts/tabela-custo-fornecedor-export.test.ts` — 1 passou.

Executado em 28/10/2026 na `dev`. A tela financeira ganhou o painel recolhido "Evolução Financeira: Contas a Receber x Contas a Pagar", entre as etapas e os filtros. A agregação está em `lib/financial/fluxoCaixaComparativo.ts` e só lê os títulos já em memória. Cancelado, investimento e transferência interna ficam de fora. O saldo é receber menos pagar. Ainda não foi publicado.

Testes: `npx tsx --test scripts/fluxo-caixa-comparativo.test.ts` — 7 passaram.

Executado em 28/10/2026 na `dev`. A exibição de data no front-end usa `formatDateBR` e `formatDateTimeBR`: `DD/MM/AAAA` e `DD/MM/AAAA HH:mm`, fuso `America/Sao_Paulo`, hora 24h. Uma data civil `AAAA-MM-DD` não recua um dia. Campo de formulário, JSON, API e PostgreSQL continuam ISO. Telas ligadas: Controle de Faturas, quadro de comissões, faturamento da diretoria, cotações e propostas, relatório de OS, boletim, passagem de plantão e medição. O motor da OS não mudou. Ainda não foi publicado.

Testes: `npx tsx --test scripts/ponto-date-brt.test.ts scripts/historico-cotacoes.test.ts` — 16 passaram.

Executado em 27/10/2026 na `dev`. O 500 do portal vinha da numeração GTM lendo só 40 OS. Agora a gravação pede `proximo_numero_gtm` e, enquanto a função não existir, usa o maior número da base. O e-mail sai depois do insert e a falha de SMTP não vira 500. Constraint devolve código e campo. A migration `migrations/2026_10_27_os_gtm_seq.sql` não foi aplicada. TSP, PGR, autorizador, motorista e placa já cabem nas tabelas do portal. O motor da OS não mudou. Ainda não foi publicado.

Executado em 27/10/2026 na `dev`. A OS do portal passa a escolher a tabela do cliente pelas 10 OS aprovadas da mesma rota. Sem fornecedor, a tabela de custo não entra. Quando o fornecedor é escolhido depois, a de custo sai desse par. O aviso vermelho do portal não foi alterado. O motor da OS não mudou. Ainda não foi publicado.

Executado em 27/10/2026 na `dev`, a partir de `af74105e`. A Nova OS passa a sugerir tabela pelas 10 OS aprovadas (`billing_approved`) da mesma rota. Com fornecedor, cliente e custo saem desse par. Sem o par, só a tabela do cliente. Sem histórico, o cálculo manual segue. Portal e auditoria não mudaram. O motor da OS não mudou. Ainda não foi publicado.

Testes: `npx tsx --test scripts/sugestao-tabela-os.test.ts scripts/rota-aprovada-tabela.test.ts` — 15 passaram.

# Próxima Execução Proposta

## Tabela de Preços: mostrar 2026 (ANTIGA) sem cotação nova

Executada em 30/10/2026, com o pedido "pode publicar".

### Objetivo da Tarefa

Na aba Tabela de Preços do cliente, as linhas de 2026 e as rotas que não se chamam `TABELA 2027` voltaram a aparecer, com a marca **2026 (ANTIGA)**. Cotação nova, card da cotação e proposta comercial continuam só com a Tabela 2027. Nada foi apagado do banco.

### Passo a Passo Sequencial

1. Ler `components/ClientForm.tsx`: a lista usa `filtrarPorVigencia(..., '2027')`.
2. A grade passa a listar todas as linhas já carregadas de `client_price_tables`.
3. Linha cuja versão é 2026 ganha o rótulo `2026 (ANTIGA)`.
4. O card de cotação, o botão de proposta da linha 2026 e o Gerar Contrato / Proposta continuam recebendo só linhas 2027.
5. Reajuste, exclusão e edição da linha antiga permanecem na grade.
6. Ajustar o teste que exige a lista presa em 2027 e rodar o teste da vigência.
7. Conferir a aba no localhost.

### Ficheiros Afetados

- `components/ClientForm.tsx`
- `scripts/trechos-proposta.test.ts` (asserção da lista)
- `RELATORIO_ULTIMA_EXECUCAO.md`
- `docs/governanca/ESTADO-ATUAL.md` (só depois da execução)

### Garantias de Não Impacto

- `calculateMissionFinancials` não entra.
- DHL e IBL não mudam.
- Nenhuma coluna, migration ou função nova na Vercel.
- Datas continuam em Brasília, 24 horas.
- Cotação nova não grava vigência 2026.

### Nove pontos

1. Objetivo: a Diretoria enxerga a tabela antiga e não abre cotação nova com ela.
2. Já existe: `versaoDaLinhaTarifaria` e `filtrarPorVigencia` em `lib/precificacao/tabela2027.ts`. A vigência da cotação segue 2027.
3. Fonte única: `client_price_tables`. A tela só deixa de esconder a leitura.
4. Writers: nenhum neste ajuste. Readers: a grade da aba Tabela de Preços.
5. Testes: `scripts/vigencia-tabela.test.tsx` e `scripts/trechos-proposta.test.ts`.
6. OS, financeiro, Asaas, NF, TORRES e WhatsApp não entram.
7. Reutiliza o classificador que já existe. Sem arquivo novo.
8. Arquivo novo: não.
9. O efeito é só de exibição e de bloqueio da cotação nova na linha antiga. Sem banco e sem produção até o pedido de publicar.

## Pré-fatura mensal — executada em 30/10/2026

Autorização recebida: "Fluxo aprovado, pode executar". Baseline de leitura: `main` `3ff6522b`. A migration não foi aplicada e nada foi publicado.

O Gemini fechou os quatro pontos. Este registro corrige o que não cabe no banco atual e deixa a fórmula do proporcional em aberto.

### Objetivo da Tarefa

Cadastrar serviço mensal na ficha do cliente e gerar, no Financeiro, uma pré-fatura da competência. O valor faturado daquele mês pode ser ajustado com justificativa. O valor mensal cadastrado e as outras competências permanecem. O boletim de OS continua só com viagens.

### Decisões trazidas do Gemini

1. Um único título a receber, pelo total a faturar da competência.
2. A pré-fatura é documento interno de conferência. Asaas e PlugNotas só no clique **Gerar fatura**, no fluxo que já existe.
3. Boletim de OS (`missions`) e pré-fatura mensal ficam separados. Cada um gera a própria `financial_invoices`.
4. PDF no modelo Flash: cabeçalho PRÉ-FATURA TM SEG, emissor, cliente, bloco de situação, quatro colunas (COBRANÇA, DESCRIÇÃO DA COBRANÇA, VALOR MENSAL, VALOR) e total. O arquivo modelo não está no repositório; o layout segue a leitura do Gemini.

### Correções em relação ao desenho do Gemini

- `clients.id` é `bigint`. `financial_invoices.id` é `uuid`. `system_users.id` é `bigint`. Quem alterou grava nome e o id numérico do usuário. Não usar UUID de `auth.users`.
- Aprovar congela o snapshot e não chama Asaas. Gerar fatura é o segundo clique, reusando a emissão já existente.
- Não há motor de “fluxo de aprovação configurado” no código. A aprovação fica com Financeiro e Diretoria, o mesmo grupo que já fatura.
- O exemplo R$ 4.555,57 é 60% de R$ 7.592,62. Não é o rateio de 13/10 a 31/10. O proporcional entra como ajuste manual com justificativa. A fórmula automática de dias fica de fora até haver regra escrita.
- Cada alteração de valor guarda valor anterior, valor novo, motivo, usuário e horário de Brasília. Um campo único de motivo não basta.
- Linha extra (extraordinário, reembolso, desconto, complementar, exclusão) não exige serviço cadastrado. Linha excluída sai da soma e permanece no histórico.
- PDF com jsPDF, no caminho que o boletim e o contrato já usam. Sem função nova no `vercel.json`.
- A migration fica no repositório e não é aplicada por este fluxo. Quem aplica é o proprietário.

### Passo a Passo Sequencial

1. Migration nova, sem `exec_sql` e sem rodar no banco: `client_monthly_services`, `client_pre_invoices`, `client_pre_invoice_items`, `client_pre_invoice_adjustments`.
2. Aba Serviços mensais em `ClientForm`, só com cliente já salvo.
3. Tela no Financeiro: cliente + competência `AAAA-MM`. Copia os serviços cuja vigência cobre o mês para um rascunho. Um rascunho aberto por cliente e mês.
4. Ajustes no rascunho, com trilha. Total = soma dos valores a faturar, em `roundMoney`.
5. PDF e histórico. Aprovar trava a edição.
6. Gerar fatura, só com pré-fatura aprovada: grava `financial_invoices`, um `financial_transactions` INCOME com o total, e liga `financial_invoice_id`. Asaas e PlugNotas pelo caminho já existente. Sem OS fictícia.

### Ficheiros previstos

`migrations/2026_10_30_pre_fatura_mensal.sql`, `lib/billing/preFaturaMensal.ts`, `scripts/pre-fatura-mensal.test.ts`, `components/ClientForm.tsx`, `components/ClientMonthlyServicesTab.tsx`, `components/PreFaturaMensal.tsx`, `App.tsx` (entrada de menu, sem função Vercel nova). `lib/financialUtils.ts` não entra.

### Garantias de Não Impacto

Motor da OS, `client_price_tables`, contratos DHL/IBL, boletim de viagens, Asaas, PlugNotas, limite de 50 funções e horário `America/Sao_Paulo` em 24 h permanecem. A pré-fatura não escreve em `missions`.

### Nove pontos

1. Negócio: cobrar mensalidade de posto sem alterar a escolta por viagem.
2. Já existe: cliente, boletim de OS, fatura, título a receber, `roundMoney`, jsPDF.
3. Fonte única futura: serviço em `client_monthly_services`; pré-fatura no snapshot; fatura em `financial_invoices`; título em `financial_transactions`.
4. Writers: a aba do cliente e a tela do Financeiro. Readers: PDF, histórico e o contas a receber já existente.
5. Testes: vigência, soma, ajuste que não volta no cadastro, segunda competência intacta, total único do título. Sem chamada real ao Asaas.
6. OS, pedágio, comissão, NF e WhatsApp não mudam de regra. Asaas só é chamado no Gerar fatura, pelo fluxo atual.
7. Reutilizar fatura, título, arredondamento e PDF. Estender o menu. Não estender a tabela de preço.
8. Arquivos novos porque não há tabela nem tela de mensalidade.
9. Executado em 30/10/2026. A migration continua sem aplicação. O código não foi publicado.

### Telas pedidas em 30/10/2026 — implementadas, aguardando a migration no banco

1. Aba Serviços mensais na ficha do cliente, para Diretoria, Administrador e Financeiro, com o cliente já salvo. Campos: nome curto, descrição que sai no PDF, quantidade, escala, horário, valor mensal, início, fim opcional e ativo. Salvar não mexe em pré-fatura já gerada.
2. Menu Financeiro, ao lado do Boletim, para quem já abre o boletim. Cliente e mês. Monta o rascunho com os serviços vigentes. Valor a faturar nasce igual ao valor mensal. Proporcional, reembolso, extra, desconto, complementar e exclusão pedem justificativa e gravam valor anterior, valor novo, usuário e horário. Sem conta automática de dias.
3. Aprovar só no rascunho. Trava a edição. O PDF oficial sai do snapshot travado. Antes disso o PDF leva a marca Rascunho.
4. Gerar fatura só com status Aprovada e sem fatura ligada. Chama `POST /api/asaas/create-charge` com o total, sem OS. Esse caminho já grava `financial_invoices` e um `financial_transactions` INCOME. A tela só guarda o id e marca Faturada. A nota segue o worker que já existe. Não cria segundo título.

## Suíte comercial do prompt (28/10/2026) — recorte A executado

Baseline `efcb4000` na `dev`. Recorte A aprovado e executado em 28/10/2026. Sem migration, sem tabela nova e sem mudança de preço ou comissão. Ainda não foi publicado.

O cadastro do cliente lê a base inteira em páginas de 1000. CNPJ igual continua no aviso que já existia. Se os 8 primeiros dígitos já pertencem a outro `responsavel_comercial_id`, o salvamento para e mostra: "Cliente já vinculado à carteira do comercial [nome]. Solicite transferência à diretoria." A mesma carteira pode gravar a filial. CPF não entra nessa trava. Editar o cliente sem trocar o documento não reabre a trava. Cliente antigo sem responsável comercial não trava, porque não há titular. Se a leitura da base falhar ou repetir a página, o cadastro não grava.

Teste: `npx tsx --test scripts/client-duplicate-guard.test.ts` — 13 passaram. `npm run build` terminou sem erro. `GET http://localhost:5000/api/health` respondeu `{"status":"ok"}`. Não houve clique de cadastro real: o localhost usa o banco de produção e um cliente novo gravaria lá.

Recorte B executado em 28/10/2026, no mesmo baseline. O comercial não salva sem site `http://` ou `https://` e sem logotipo. O arquivo aceito é PNG ou SVG, até 2 MB, no bucket `mission-evidence` em `portal-logos/`. Cliente novo guarda o arquivo e sobe depois que o id existe; se o envio falhar, o próximo salvar atualiza o mesmo cadastro. Diretoria, administrador e os demais perfis continuam gravando cliente antigo sem site e sem logo. Nenhuma coluna virou `NOT NULL`.

Teste: `npx tsx --test scripts/cliente-marca.test.ts scripts/client-duplicate-guard.test.ts` — 17 passaram.

Recorte C executado em 28/10/2026. O card fica no quadro de comissões, acima de "OS do período × faturamento". Entra OS com status concluída ou faturada, sem `invoice_number` e sem vínculo em `financial_invoice_missions` na TM SEG, e sem nota em `invoices` ou `escort_billings` na Torres. A conclusão precisa ser anterior a hoje menos 35 dias civis, em Brasília. O dia exato do corte fica de fora. Sem data de conclusão, a OS não entra na contagem. Sem valor gravado, o total aparece como não validado. Se a Torres não for lida, o card diz consulta incompleta. Sem migration. O motor da OS e o da comissão não mudaram.

Teste: `npx tsx --test scripts/os-sem-fatura-35.test.ts` — 5 passaram. O filtro do comercial no quadro existente também passou.

Recorte D executado em 28/10/2026. Vários trechos entram na cotação que já existe e são gravados no snapshot de `quotes`. Cada trecho passa por `calculateTripCost`. A soma vira o total da proposta. Na Tabela 2027, acionamento, km extra e hora extra não ficam abaixo do piso da faixa; um valor maior é aceito. DHL e IBL continuam na tabela contratual. A carreta usa o logotipo já gravado em `clients.portal_logo_url`. O e-mail ao emitir a proposta segue o fluxo que já existia: link `/proposta/v/` por 10 dias, cópia para o cliente, para quem cotou e para thiago@grupotmseg.com.br. Sem migration. A fórmula de `tabela2027.ts` não mudou. Ainda não foi publicado.

Teste: `npx tsx --test scripts/trechos-proposta.test.ts scripts/historico-cotacoes.test.ts scripts/portal-cotacao.test.ts scripts/proposta-premium.test.ts scripts/link-proposta.test.ts` — 43 passaram.

Preço por veículo, estorno e base líquida por retenção continuam congelados.

### Objetivo da Tarefa

Recorte A: impedir que uma filial (mesma raiz de CNPJ) entre na carteira de outro comercial, no cadastro que já existe. Sem segunda tabela e sem fórmula nova.

### O que o prompt pedia e o que já é a fonte

- Cliente: tabela `clients`, carteira em `responsavel_comercial_id` e `lib/comercialEscopo.ts`. Duplicidade de CNPJ/CPF inteiro em `lib/clientDuplicateGuard.ts`. Identidade em `system_users` e `profiles`, não em `auth.uid()`.
- Preço: `client_price_tables` e `lib/precificacao/tabela2027.ts` (`calculateTripCost`, franquia 100 km e 3 h, corte de 40 min). DHL e IBL ficam na tabela contratual.
- Cotação e proposta: `quotes`, snapshot, link `/proposta/v/` por 10 dias, PDF, e-mail com cópia para thiago@grupotmseg.com.br e para quem cotou, carreta com logo do cliente.
- Comissão: tabela `comissoes`, motor `lib/comissao/comissaoCalc.ts` (líquido = bruto × (1 − 16%), comissão = 3% do líquido, piso e bônus em `tabelaComissaoPadrao.ts`). Corte do dia 15 em `vencimentoPagamentoComissao`. Torres entra por leitura em `sincronizarComissoesTorres.ts`. Título da Torres só no clique, em `contaPagarTorres.ts`.
- OS sem fatura: já aparece no quadro de comissões e no faturamento. O corte de 35 dias não está escrito como regra.

### O que fica proibido neste fluxo

Não criar `public.clientes`, `public.cotacoes`, `public.cotacao_rotas`, `public.tabela_precos_2027` nem `public.comissoes_unificadas`. Não apontar vendedor para `auth.users`. Não tornar `website` e `logo_url` obrigatórios na base atual. Não instalar BullMQ, Resend nem um segundo leitor da Torres. Não acrescentar função no `vercel.json`. Não alterar `calculateMissionFinancials`, Asaas, PlugNotas nem o contrato DHL/IBL. Não rodar migration. Não publicar.

### Passo a Passo Sequencial

1. Recorte A — executado. Raiz de 8 dígitos em `clientDuplicateGuard` e no salvar/consultar CNPJ de `ClientForm`. Sem pedido de transferência: o aviso pede a diretoria e o cadastro não grava.
2. Recorte B — executado. `lib/clienteMarca.ts` e o upload em `ClientForm`. Sem coluna nova.
3. Recorte C — executado. `lib/comissao/osSemFatura35.ts`, o quadro em `comissaoQuadroApi.ts` e o card em `ComissoesComerciaisPage.tsx`.
4. Recorte D — executado. `lib/portalCliente/trechosProposta.ts`, o snapshot em `historicoCotacoes.ts`, a tela em `CotacaoPortal.tsx` e a carreta em `PropostaPremium.tsx`.
5. Preço por veículo e comissão (estorno, glosa, retenção) permanecem congelados até a fórmula escrita.

### Ficheiros Afetados

Recorte A: `lib/clientDuplicateGuard.ts`, `components/ClientForm.tsx`, `scripts/client-duplicate-guard.test.ts`. Recorte B: `lib/clienteMarca.ts`, `scripts/cliente-marca.test.ts`, `components/ClientForm.tsx`. Recorte D: `lib/portalCliente/trechosProposta.ts`, `scripts/trechos-proposta.test.ts`, `lib/portalCliente/historicoCotacoes.ts`, `lib/portalCliente/cotacao.ts`, `lib/portalCliente/apresentacao.ts`, `components/ceva/CotacaoPortal.tsx`, `components/ceva/PropostaPremium.tsx`.

### Garantias de Não Impacto

`lib/financialUtils.ts`, contratos DHL/IBL, limite de 50 funções na Vercel e horário `America/Sao_Paulo` em 24 h permanecem. Banco, Asaas, NF e título da Torres não são escritos por este desenho.

### Nove pontos

1. Negócio: comercial externo sem segunda carteira, segundo piso de 2027 ou segunda comissão.
2. Já existe: cadastro, cotação multi não existe (a rota é uma), proposta, e-mail, comissão 16%/3% e dia 15, leitura Torres.
3. Fonte única: `clients`, `client_price_tables`, `quotes`, `comissoes`, `missions`, `financial_invoices`.
4. Writers e readers: os módulos citados acima. O prompt criaria writers novos.
5. Testes: `scripts/client-duplicate-guard.test.ts` — 13 passaram. Build ok. Health local ok.
6. OS, financeiro, Asaas, NF, Torres e WhatsApp: sem efeito neste recorte.
7. Reutilizar o guard e o formulário de cliente.
8. Arquivo novo não se justifica.
9. Parado: recortes B, C e D, preço por veículo, estorno e base líquida por retenção.

Publicado nesta entrega, em 27/10/2026, no projeto sistema-grupo-tm-seg, a partir de `cursor/proposta-premium-ia-f513`. A proposta pública abre o cartaz escuro. Baixar Proposta em PDF grava essa tela numa folha só. A CEVA usa o caminhão branco sem fundo, também no mapa. A página não desenha imagem nova. O motor da OS não mudou.

Executado em 26/10/2026. Os cartões da proposta ganharam relevo, a capa ficou com moldura e o mapa inclinou na tela. O PDF achata só a inclinação para a foto não sair vazia. Os valores da cotação não mudaram. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026. A proposta passou a 980 px, com a capa publicada atrás da origem e do destino e os cartões mais próximos. Total, km, franquia e tarifas continuam os da cotação. O PDF fotografa esse container. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026. Baixar Proposta em PDF captura o miolo escuro com html2canvas e grava uma folha na proporção da tela. O caminho bege do Salvar em PDF interno permanece. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026. O backend devolve o JSON da cotação pelo motor já existente, sem desenhar imagem. A tela injeta origem, destino, km, tempo, sub-região e os valores nos cards. Um JSON com total diferente é ignorado. O PDF continua numa folha só. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026. O PDF deixou de sair em seis folhas A4. A impressão mede a altura da tela e gera uma folha contínua de 1100 px, com quatro colunas nos serviços e nos diferenciais e o caminhão limitado a 220 px sem esticar. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026. Gerar proposta abre a tela na hora, com as fotos do site e o mapa do Google. O link público é essa mesma tela. Baixar Proposta em PDF imprime o tema escuro sem captura pesada. O e-mail tem o botão Acessar Proposta Comercial. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026. Salvar cotação grava a polyline e os pontos da rota. O link público redesenha o traço vermelho com esses dados; cotação antiga sem polyline pede o percurso ao Google e não regrava o snapshot. O tempo na proposta sai em horas e minutos, sem mudar o número usado no cálculo. Os indicadores continuam a contagem do banco. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026. Gerar proposta monta a apresentação premium com a carreta oficial, o mapa do Google e os valores já calculados. A IA só pede uma cena sem texto, com tempo limite e cache por transportadora. O link público continua o de 10 dias, depois de Salvar cotação. Ainda não foi publicado. O motor da OS não mudou.

Publicado nesta entrega, em 26/10/2026, no projeto sistema-grupo-tm-seg. Os botões Tabela 2026 e Tabela 2027 saíram da cotação e da lista. Gerar proposta abre a tela, limpa origem e destino e não grava ao fechar. O botão Salvar cotação grava no histórico. A redefinição de senha por e-mail e WhatsApp já estava na main. O motor da OS não mudou.

Publicado nesta entrega, em 26/10/2026, no projeto sistema-grupo-tm-seg. A coluna Distância / Tempo do histórico mostra o km faturado e as horas salvos na cotação. Na cotação 50 isso é 943 km e 24 h. Região, tarifa e total continuam os gravados (SUDESTE, R$ 6,60, R$ 9.583,80). A tela aberta e o tempo do Google não reescrevem a linha. O link público devolve o mesmo snapshot. O motor da OS não mudou.

Executado em 26/10/2026. O link da cotação 49 passa a mostrar a faixa da origem, com o mapa inteiro e a carreta no centro. O endereço já emitido continua o mesmo por 10 dias. O motor da OS não mudou.

Executado em 26/10/2026. Antes de gerar a proposta, o usuário do cliente marca o aceite para uso em ordem de serviço. A equipe interna não marca. O texto fica no snapshot da cotação. O motor da OS não mudou.

Executado em 26/10/2026. O link público da proposta monta a mesma cena do PDF: mapa estático da rota e a carreta do cliente. O histórico, ao gerar PDF ou e-mail, usa essa mesma cena.

Executado em 26/10/2026. O histórico da mesma rota passa a mostrar a faixa, a tarifa e o total do card. A gravação nova e a linha antiga dessa rota deixam de usar a tabela genérica SUDESTE. O motor da OS não mudou.

Executado em 26/10/2026 a partir do pedido de link temporário. O botão Link de visualização copia um endereço válido por 10 dias. A página `/proposta/v/` mostra só a proposta e não entra no sistema. O token fica em `contract_details` da cotação do portal. Cotação em texto livre não é reescrita. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026 a partir dos cinco pontos da cotação. A tabela e o rodapé da proposta usam `numerosDaTela`, a mesma conta do card. `propostaDaConta` não chama a fórmula antiga quando o card tem conta. O PDF copia as cores calculadas da tela e sai em PNG, com o nome `Cotacao_NUMERO_CLIENTE_DATA.pdf`. O botão fica em `isGenerating` com o texto "Gerando PDF da proposta, aguarde...". O e-mail inclui o pernoite só quando a proposta traz o valor. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026 a partir do card em R$ 7,30/km e R$ 6.880,25 e do histórico em R$ 6,60/km e R$ 9.583,80. A rota que está na tela mostra a conta do card. O PDF único continua o da proposta, com o nome `Cotacao_NUMERO_CLIENTE_DATA.pdf` e a espera "Gerando PDF da proposta, aguarde...". O e-mail leva a tabela do acionamento. Ainda não foi publicado. O motor da OS não mudou.

Publicado nesta entrega, em 26/10/2026, no projeto sistema-grupo-tm-seg, a pedido de publicar todas as branches f513. O histórico abre Ações, o PDF guarda texto e imagens, e o e-mail aceita o anexo com cópia para thiago@grupotmseg.com.br e para quem fez a cotação. A branch da tarifa 2027 do portal entrou sem substituir `tarifaDoBotao`. As demais branches f513 já estavam na main. O motor da OS não mudou.

Executado em 26/10/2026 a partir do erro "O PDF da cotação não veio no anexo". O anexo do jsPDF traz o nome do arquivo antes do Base64 e agora é aceito. O envio coloca em cópia thiago@grupotmseg.com.br e o e-mail de quem fez a cotação, junto com os e-mails escolhidos. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026 a partir do pedido de enxugar as ações e corrigir o PDF em branco. A linha do histórico tem um botão Ações. O painel sobreposto guarda PDF, e-mail, copiar a mensagem, criar OS, alterar, desativar e excluir. O Salvar em PDF remove desfoque, animação e a proposta fora da tela antes da foto, para o arquivo levar texto e imagens. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026 a partir do pedido direto de enviar a proposta por e-mail. O botão Enviar para o e-mail fica na proposta gerada. A mensagem leva os dados do Grupo TM SEG e o PDF completo vai em anexo, com a foto do mapa em faixa própria. Sem o PDF, o e-mail não sai. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026 a partir do pedido direto de tirar o painel da foto do PDF. Na hora do print, o quadro Informações da Rota some e volta em seguida. O PDF guarda a rota, os pinos e a carreta. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026 a partir do pedido direto de trocar o menu de ações. PDF, e-mail e copiar a mensagem ficam na linha. Desativar fica com o usuário interno. Excluir fica só com a diretoria. A validade passou de 30 para 10 dias, na tela e na rotina que marca a cotação expirada. Sem migration. Ainda não foi publicado. O motor da OS não mudou.

Executado em 26/10/2026 a partir do pedido direto de mudar o nome do PDF. Ao salvar, o arquivo fica `Cotação Cliente - Cidade-UF x Cidade-UF - número.pdf`. O texto da folha deixa de mostrar `(2026-)` e `(2027-)`. Cada cotação nova recebe um número no snapshot que já existe. A OS continua gravando o sufixo. Ainda não foi publicado. O motor da OS não mudou.

Publicado na entrega anterior, em 26/10/2026, no projeto sistema-grupo-tm-seg, depois de "Fluxo aprovado, pode executar" e do pedido de publicar. O Ver PDF do histórico espera o artigo, as fontes e as imagens, traz a proposta para dentro da janela só na foto e usa o mesmo `desenharPdf` do Salvar em PDF: uma imagem do artigo, cortada entre faixas, sem partir bloco. O mapa espera o idle e centraliza A e B. A OS nascida da cotação leva o sufixo `(2026-)` ou `(2027-)`. A folha do PDF, a partir do pedido seguinte, não imprime esse ano. A linha de preço já gravada não muda de nome. O motor da OS não mudou.

Publicado na entrega anterior, no projeto sistema-grupo-tm-seg: Editar e Remover na lista de pessoas do portal, o botão Redefinir senha com o texto de usuário novo, e o print do mapa na proposta. A branch da tarifa duplicada do portal não entrou.

## Editar e remover pessoa do portal (26/10/2026)

Baseline `fb58e567`. Na tela Liberar uma pessoa, Editar preenche o formulário e grava nome, e-mail e perfil na mesma linha. Remover só aparece no analista e apaga essa linha. Administrador não some da lista por esse botão, nem se o pedido chegar direto na API. O bloqueio do último administrador ativo continua.

- **Objetivo da Tarefa:** o administrador ajusta ou tira o analista da lista sem criar outra pessoa com o mesmo e-mail.
- **Passo a Passo Sequencial:** 1. Editar chama o PATCH que já existia, agora também com nome, e-mail e perfil. 2. Remover chama DELETE na mesma rota da pessoa. 3. O servidor recusa quando o perfil é administrador. 4. Quem é só do portal fica inativo no cadastro do sistema ao sair da lista. 5. Quem também usa o sistema interno não é inativado.
- **Ficheiros Afetados:** `components/ceva/PessoasCeva.tsx`, `lib/cevaPortal/httpHandler.ts`, `lib/cevaPortal/regrasAcesso.ts`, `lib/cevaPortal/acesso.ts`, `server/cevaPortal.ts`, `server/iblPortal.ts`, `scripts/portal-pessoas-editar-remover.test.ts`, `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`.
- **Garantias de Não Impacto:** não altera `lib/financialUtils.ts`, não altera os contratos DHL e IBL, não mexe no limite de 50 funções da Vercel e não muda o padrão de Brasília em 24 horas. Sem migration. Sem função nova. A senha da pessoa não é regravada na edição.

Banco: nenhuma coluna nova. A escrita usa a tabela de usuários do portal que já existe e, só para quem é exclusivo do portal, `system_users`.

O botão Redefinir senha e o print do mapa da proposta entram nesta mesma publicação.

## Redefinir senha com o texto de usuário novo (26/10/2026)

Baseline `fb58e567`. Na edição do usuário, abaixo da senha de acesso, o botão Redefinir senha gera a senha, grava no cadastro e abre a mesma mensagem da criação (`textoDaMensagem`: acesso criado, login, senha e link). No portal, a mensagem é a de acesso ao portal e a senha entra na tabela que a pessoa já usa. O e-mail com link e o WhatsApp com o texto de senha redefinida continuam nos botões que já existiam.

- **Objetivo da Tarefa:** o operador copia a mensagem de acesso novo, com a senha que ficou gravada, sem depender do link de e-mail nem do texto de redefinição do WhatsApp.
- **Passo a Passo Sequencial:** 1. O botão chama o pedido de senha que já existe, no canal `texto`. 2. O servidor gera a senha temporária e grava em `system_users`, com troca no próximo acesso. 3. Se a pessoa já tem linha no portal, a mesma senha entra nessa linha e pede a troca. 4. A tela abre o quadro de credenciais com `textoDaMensagem`. 5. Fechar o quadro permanece na ficha.
- **Ficheiros Afetados:** `components/UserForm.tsx`, `lib/passwordReset.ts`, `scripts/password-reset-whatsapp.test.ts`, `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`.
- **Garantias de Não Impacto:** não altera `lib/financialUtils.ts`, não altera os contratos DHL e IBL, não mexe no limite de 50 funções da Vercel e não muda o padrão de Brasília em 24 horas. Sem migration. Sem tabela nova. A rota de e-mail e a de WhatsApp permanecem.

Banco: nenhuma coluna nova. A escrita usa `system_users` e, quando a linha já existe, a tabela de usuários do portal.

## PDF único da cotação e mapa centrado em A e B (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg, depois de "Fluxo aprovado, pode executar" e do pedido de publicar. O print do mapa que já estava na proposta continua. O Ver PDF do histórico deixou de fotografar cada bloco fora da tela. A proposta marcada com `data-captura-proposta` volta para a esquerda da janela só durante a foto. `desenharPdf` tira uma imagem do artigo e corta no vão entre as faixas verticais. Dois cards lado a lado ficam na mesma faixa. Uma faixa mais alta que a folha é reduzida para caber nela. O CSS continua com `page-break-inside: avoid`.

- **Objetivo da Tarefa:** o download, o Ver PDF e o anexo de e-mail saem do mesmo artigo oficial, sem corte no meio do bloco. Ao gerar a proposta, o mapa fica centrado com o ponto A na origem e o ponto B no destino, os dois dentro do quadro.
- **Passo a Passo Sequencial:** 1. Marcar os blocos da proposta e completar rota, km faturado, tempo, acionamento, km extra, hora extra e pedágio à parte. 2. Antes da foto, enquadrar o mapa no retângulo da origem e do destino, com folga para o A e o B não ficarem sob o painel. 3. O mapa estático da proposta usa `visible` nesses dois pontos, para o centro da imagem ser o meio do trecho. 4. A espera do `idle` do mapa acontece antes da captura. 5. O PDF A4 empilha bloco inteiro, com margem, sem fatiar um card. 6. Salvar em PDF, preview, Ver PDF e os dois e-mails usam esse mesmo arquivo. 7. A OS nascida da cotação grava tabela e rota como `Origem x Destino (2026-)` ou `(2027-)`, pela vigência do snapshot.
- **Ficheiros Afetados:** `components/ceva/abrirPdfCotacao.ts`, `components/ceva/ExperienciaProposta.tsx`, `components/ceva/HistoricoCotacoes.tsx`, `components/ceva/CotacaoPortal.tsx`, `components/ceva/SolicitarEscolta.tsx`, `server/cevaPortal.ts`, `lib/portalCliente/registrarOs.ts`, `lib/portalCliente/historicoCotacoes.ts`, `lib/portalCliente/frotaVisual.ts`, `scripts/gestao-cotacao.test.ts`, `scripts/portal-cotacao.test.ts`, `scripts/historico-cotacoes.test.ts`, `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`.
- **Garantias de Não Impacto:** não altera `lib/financialUtils.ts`, não altera os contratos DHL e IBL, não mexe no limite de 50 funções da Vercel e não muda o padrão de Brasília em 24 horas. Sem migration. A linha de preço já usada por outra OS não é renomeada.

## Unificação de 26/10/2026

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. A unificação autorizada em 26/10/2026 (Tabela 2027, rota Salvador, Nova Rota, fuso de Brasília e o gate de fluxo) é a execução desta entrega. A branch da tarifa duplicada do portal não entrou. Não há outro plano de código aberto. A próxima alteração de código ou de tabela substitui este plano, reapresenta no chat e espera nova aprovação expressa.

## Gate de aprovação prévia (26/10/2026)

Autorizado na mesma mensagem pelo pedido de gravar o complemento. Não altera código de aplicação nem tabela.

- **Objetivo da Tarefa:** consolidar o gate de desenho e aprovação antes de qualquer alteração de código ou de tabela.
- **Passo a Passo Sequencial:** 1. Ler o protocolo, o estado atual e este relatório. 2. Incluir a cláusula no protocolo. 3. Registrar a nota no topo do estado atual. 4. Registrar este plano nesta seção. 5. Conferir o texto gravado.
- **Ficheiros Afetados:** `.cursor/rules/protocolo-alteracao-tmseg.mdc`, `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`.
- **Garantias de Não Impacto:** não altera `lib/financialUtils.ts`, não altera os contratos DHL e IBL, não mexe no limite de 50 funções da Vercel e não muda o padrão de Brasília em 24 horas.

## Fuso de Brasília e smoke check (26/10/2026)

O padrão temporal oficial fica em `America/Sao_Paulo`, hora em 24h (`HH:mm`, sem AM/PM) e data em `DD/MM/AAAA`, na constituição e no artigo 2. O checklist de entrega exige `GET /api/health`, `npm run build`, os testes do escopo e, em notificação ou faturamento, `scripts/email-health-check.ts`. `calculateMissionFinancials` não foi alterado.

## Nova Rota sem tipo e região (26/10/2026)

Baseline `ad3074fa`. A tela Nova Rota pedia Tipo da rota (Fixa ou Esporádica) e mostrava Região só leitura. Os dois campos saíram. Sem tipo escolhido, o salvamento grava só código, nome, cliente, origem, destino, km e pedágio. Se a rota já estava classificada, a edição regrava o tipo que veio do banco, para não apagar fixa ou esporádica. `consumirRotaEsporadica` e `calculateMissionFinancials` não foram alterados. Sem migration.

## Rota Salvador–São Paulo sem ZERO_RESULTS (26/10/2026)

O texto "Salvador, BA" para "São Paulo, SP" não fecha no Directions. Com ", Brasil", a mesma rota responde cerca de 1.986 km e 1.609 min. A cotação passa a pedir placeId ou coordenada, com pedágio, rodovia e balsa liberados, e repete em texto com o país quando o status é ZERO_RESULTS ou NOT_FOUND. O km gravado na tela continua liberando Gerar proposta. Sem migration e sem alteração em calculateMissionFinancials.

## Prioridade da Tabela 2027 na cotação (26/10/2026)

Baseline `ad3074fa`. Fluxo aprovado com o ajuste do seletor: Tabela 2027 começa selecionada e tem prioridade; se o operador muda para Tabela 2026, valem as tarifas 2026 daquele cliente. A vigência continua no prefixo do nome da operação, sem coluna nova e sem migration. Linha antiga de R$ 10,00 não cobre a `TABELA 2027 - NORDESTE`. Sem linha 2027, usa a 2026 do cliente; sem as duas, a faixa de `tabela2027.ts`. O snapshot grava `vigencia` 2027 ou 2026 conforme o que foi usado. Cotação antiga sem marca permanece em 2026. DHL e IBL não entram. `calculateMissionFinancials` não foi alterado.

## Ações do histórico e painel do mapa (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Thiago validou no localhost as colunas, o menu e o painel do mapa. Baseline `882cd3c1`. O histórico passa a mostrar o km e a hora extra gravados na cotação. O menu inativa na hora, pede confirmação para excluir, devolve origem, destino e paradas ao formulário e envia o PDF pelo SMTP que já existe. Não há coluna deleted_at e a migration não foi criada. Administrador, diretoria e o autor inativam e excluem; o servidor grava system_logs. O mapa usa o painel Informações da Rota com a cidade, a distância e o tempo da rota calculada, e o caminhão 3D fica sobre o traçado. O PDF preview não insere cotação. Sem função nova na Vercel e sem alteração em calculateMissionFinancials. Rollback: reverter este commit.

## Rota, mapa e caminhão da cotação (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Baseline `8fb79794`. Thiago validou Salvador, BA → São Paulo, SP: traçado, botão e PDF com mapa e caminhão. A cotação deixava de fechar quando o lugar não vinha da lista ou quando a leitura da polilinha quebrava o km já calculado. O campo agora guarda a coordenada do `place_changed` e, no Enter ou ao sair, consulta o Geocoder no Brasil. O Directions recebe a coordenada. Falha de rota longa mostra o motivo e não apaga um km que já fechou. O mapa ao vivo abre no tema escuro, com pinos A e B e a carreta 3D do cliente (CEVA usa a pintura e o logotipo da CEVA). O PDF não captura o canvas do Google: POST /api/proposta-escolta/mapa, na rota Express já existente, baixa o Static Maps em 640×360 scale 2 e devolve Base64. Rota longa demais para `enc:` segue por pontos. A tela de rota administrativa não envia origem, destino ou km vazio. Não grava `duration_minutes`. Sem migration, sem função nova na Vercel e sem alteração em `calculateMissionFinancials`. Rollback: reverter este commit.

## Express da Vercel responde de novo (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Depois que o bundle passou a iniciar, a função esperava um evento Lambda e não fechava a resposta. A Vercel entrega req e res do Node, então api/index.ts chama o Express direto. O motor calculateMissionFinancials não foi alterado.

## Express da Vercel voltou a iniciar (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. O bundle CJS carregava api/dados-protegidos.ts, e o createRequire(import.meta.url) desse arquivo recebia endereço vazio. O Express inteiro respondia 503, inclusive a rota da vigência. A rota /api/dados-protegidos do Express passou a chamar atenderDadosProtegidos direto. A função solta da Vercel continua no arquivo api/dados-protegidos.ts. O motor calculateMissionFinancials não foi alterado.

## Vigência da tabela regional sem RLS no navegador (26/10/2026)

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Baseline `24da7d9b`. Thiago validou o botão Aplicar valor por região na Tabela 2027, sem o erro de RLS. O clique fazia upsert de system_settings com a chave anon e o Postgres recusava a linha nova. A gravação passou para POST /api/pricing/tabela-regional-vigente, no Express que já existe, sem função nova na Vercel. O servidor exige o perfil diretoria, administrador ou admin em system_users e grava com createSupabaseAdminClient. Linhas de preço, rotas e regional_rates continuam no fluxo que já existia. migrations/2026_10_26_fix_system_settings_rls.sql ficou só no repositório: não consulta users, não abre todas as chaves e não foi executada. O motor calculateMissionFinancials não foi alterado. Rollback: voltar o botão ao upsert do navegador e remover a rota.

## Publicação de 26/10/2026

Publicado nesta entrega, no projeto sistema-grupo-tm-seg. Entram o histórico de cotações do portal, o filtro exclusivo Tabela 2026 / Tabela 2027, a região da cotação pela origem e a redefinição de senha por e-mail e WhatsApp. O motor calculateMissionFinancials não foi alterado.

## Região da cotação pela origem (26/10/2026)

Publicado nesta entrega. Na tela de cotação, Guarulhos, SP acende o botão SUDESTE e o card superior mostra Sudeste SP/RJ. Uma cidade do Sul acende SUL. DHL e IBL continuam na tabela contratual, sem essa troca. No card Origem, destino e km, Horas mostra só o valor faturado e Total mostra só o valor. Saíram o texto do corte de minutos e a legenda de acionamento mínimo e hora extra. O motor calculateMissionFinancials não foi alterado.

## Filtro exclusivo Tabela 2026 / Tabela 2027 (26/10/2026)

Publicado nesta entrega. Na tabela de preços do cliente, Tabela 2027 mostra só as linhas com nome TABELA 2027. Tabela 2026 mostra o restante, inclusive rota de cidade, e esconde a 2027. A seleção em massa e a proposta comercial usam só as linhas visíveis. No histórico do portal e na aba de cotações, o mesmo seletor lista só a vigência escolhida. Cotação nova grava vigencia dentro do snapshot. Cotação antiga, sem essa marca, permanece na 2026. Não foi criada coluna nem migration. O motor calculateMissionFinancials não foi alterado.

## Histórico de cotações no portal (26/10/2026)

Publicado nesta entrega. Abaixo de Gerar proposta, o cliente vê as 10 cotações mais recentes: data, solicitante, origem, destino, distância e tempo de viagem, região com franquia, valor, validade de 30 dias e o botão Ver PDF. O PDF reabre a proposta com o snapshot gravado em quotes.contract_details. Criar OS só abre a solicitação já existente, com origem e destino, sem gravar missão e sem marcar a cotação como convertida. A lista usa a rota de cotação que já existia. Rota acordada e cliente DHL/IBL continuam com a conta de antes; a linha do histórico é só o registro. O motor calculateMissionFinancials não foi alterado.

## Senha por e-mail e WhatsApp do usuário de cliente (26/10/2026)

Publicado nesta entrega. O clique em Enviar nova senha por e-mail respondia texto puro 500 porque a função da Vercel importava o módulo sem extensão e caía antes do SMTP. As três rotas carregam api/_password-reset-core.cjs. Na ficha do usuário de cliente, Redefinir senha e enviar no WhatsApp gera a senha, envia no número informado e só então grava. Se o bot estiver desconectado, a senha atual permanece. Quem entra pelo portal recebe a senha nova com troca obrigatória.

## Cotação, edição regional e imagens (26/10/2026)

Publicado nesta entrega. Thiago aplicou migrations/2026_10_26_cotacoes_validade.sql no banco. Cotação sem converted_to_order_id e com mais de 30 dias recebe is_active = false e status expirada na listagem, no painel da Diretoria e no cron de manutenção. Cotação já ligada a uma OS não expira e não volta para seleção. Com as colunas no banco, a rotina grava a expiração de verdade. Diretoria ou Administrador edita KM, hora extra e franquia da linha TABELA 2026/2027 pelo PATCH /api/clients/:clientId/pricing-tables/:id, gravando só aquele cliente e deixando rastro em system_logs. DHL e IBL não recebem essa linha. O cartão QuoteCalculatorCard aparece na tabela de preços e no portal. Rota acordada e cliente contratual continuam na conta que já existia. Os demais usam calculateTripCost. Antes do PDF e da impressão da proposta, as imagens viram data URL. O motor calculateMissionFinancials não foi alterado.

## Tabela 2027 e rota esporádica (26/10/2026)

Publicado nesta entrega. Thiago aplicou migrations/2026_10_26_tabela_2027_rotas.sql no banco. A rota ganhou tipo Fixa ou Esporádica, região e o vínculo com a OS que consumiu a esporádica. A conta nova é calculateTripCost: até 100 km cobra 100 km e 3 horas; acima disso o km inteiro usa o valor da região e a hora segue o corte de 40 minutos, sem ficar abaixo de 3 horas. DHL e IBL não recebem essa tabela. Guarulhos/SP cai em Sudeste SP/RJ e Belo Horizonte/MG em Sudeste MG/ES. O botão Aplicar valor por região fica só para Diretoria e Administrador, grava a vigência em system_settings e só mexe nas linhas TABELA 2026/2027. O motor calculateMissionFinancials não foi alterado. Com as colunas no banco, a rota esporádica passa a ser consumida de verdade na OS.


## Tabela da mesma rota (22/10/2026)

Publicado nesta entrega. A criação olhava as últimas OS do cliente, de qualquer rota. Guarulhos–Serra acabava em Guarulhos–Aparecida de Goiânia e o fornecedor caía na faixa de 1000KM. A consulta do histórico pedia `original_client_name`, coluna que não existe, e voltava vazia. Agora entram as 10 mais recentes da mesma cidade de origem e de destino. A tabela que mais se repetiu é a selecionada, no cliente e no fornecedor daquela OS. No localhost, DHL Guarulhos–Serra com a TORRES ficou em SUDESTE - GUARULHOS-SERRA 758KM e 800KM. Vale para a OS nova, o portal e a auditoria sem valor gravado. OS aprovada ou já faturada não muda.

## Ceslog sem as tabelas auxiliares (22/10/2026)

Publicado nesta entrega. O Controle da Ceslog respondia “Não foi possível carregar as OS da CESLOG” porque `portal_cliente_catalogo` e `portal_cliente_os_campos` não existem no banco. Só `portal_cliente_usuarios` foi criada. As OS da Ceslog estão em `missions`. Quando essas tabelas auxiliares faltam, a lista e o Ao vivo seguem só com as OS. As tabelas não foram criadas.

## Ao vivo nos portais (22/10/2026)

Publicado nesta entrega. O botão Ao vivo marcava a opção, mas a solicitação aberta continuava na tela e escondia as missões. Agora Cotação, Controle, Ao vivo e Diretoria fecham a solicitação. Na IBL, o painel abriu com as missões em andamento. Na CEVA, o painel abriu e informou que não há missão em andamento. No Ceslog, a tela de entrada deixou de responder “Portal não encontrado”: a consulta de acesso e o login enviam o slug do portal. A rota Ao vivo do Ceslog responde e exige login.

## Tabela da Cassiane (22/10/2026)

Gravado no banco. Cassiane Garcia, usuário 26, perfil Avançado, passou a ter `client-prices` e `provider-costs` só no cadastro dela. O perfil dos demais não mudou. A sessão antiga não enxerga a chave: ela precisa sair e entrar de novo. No cliente, a mesma chave também abre contratos, cancelamento, veículos, rotas, cotações e o simulador. No fornecedor, abre a tabela de custos e os contratos.

## Cotação no portal (22/10/2026)

Publicado nesta entrega. O logotipo oficial do cliente fica sobre o baú da carreta na cotação e na proposta. O número de operações da proposta acompanha a quantidade real de OS e aparece só em milhar, sem o valor exato. O mapa da cotação continua o do Google. A foto estática não substitui mais esse mapa. O caminhão só aparece depois que origem e destino foram escolhidos na lista, para a pessoa conseguir completar o endereço. Ao gerar a proposta, o logotipo vetorizado da TM SEG, com fundo transparente, percorre a rota da origem ao destino, sem girar. Depois que a rota real fecha, a tela mostra Preparando a proposta e troca o mapa pela foto dessa rota no Google, com a carreta do cliente. A imagem da carreta é pedida uma vez, sem marca desenhada, e o logotipo oficial fica por cima. Se a geração não estiver disponível, continua a carreta já gravada. A tela Cotação do portal ganhou o visual da referência, com mapa Google real e a carreta já gravada do cliente. O PDF imprime a mesma proposta da tela, com as fotos. O cadastro do cliente, na aba Cotações, usa esse mesmo modelo. A proposta usa as fotos, os números, os diferenciais e os clientes publicados em www.grupotmseg.com.br. A proposta é uma apresentação da empresa, com os serviços do site, as condições da rota e o aviso de pedágio à parte. O PDF segue esse mesmo material. A proposta mostra o valor do km extra, o valor da hora extra e o aviso de que o pedágio é cobrado à parte. CEVA, IBL e o portal por slug têm o botão Cotação. A região, por exemplo NORTE, mostra o valor por km daquela região. As rotas já cadastradas não aparecem. Origem, parada e destino são escolhidos no Google. O mapa soma o km da rota. A franquia da cotação é o km da rota e as horas dessa divisão por 40. 23,75 h conta como 24 h. Abaixo de 100 km e 3 h, a conta usa esse mínimo. O acionamento continua o valor de acionamento da região. O km acima da franquia usa o valor por km da região. O km da rota também sobe a fração. O valor por km não aparece na tela. Ao gerar, a animação termina numa proposta do Grupo TM SEG, com PDF e e-mail. A gravação na tabela do cliente só acontece no clique de salvar. Rota já cadastrada abre a proposta acordada, sem esse clique.

## Parceria e conta alinhada (22/10/2026)

Ainda não publicado. A análise cabe em uma tela, sem barra de rolagem. No lugar da parceria, o cliente lê um relato de até cinco linhas com o que aconteceu na OS: serviço, rota, motorista, jornada, quilometragem e total. O relato fica por último na coluna esquerda, na faixa cinza, depois dos dados da OS. A análise também mostra as fotos de origem, fim, km inicial e km final. Fim e km final vêm das fotos já gravadas na OS. Origem só aparece quando existe o print de início. Km inicial não tem foto gravada no sistema, então o espaço fica vazio. A evidência da solicitação não entra no lugar da origem. As linhas cobrem serviço e número da OS, trajeto e trecho, motorista, tempo, percurso com a franquia de quilometragem, valores e tarifas. Solicitante, autorização, operação, contrato, PGR, TSP, identificação e observação só aparecem quando estão gravados. Hora extra e km excedente, com o valor, só entram quando são maiores que zero.

## Conta da medição (22/10/2026)

Ainda não publicado. A análise mostra a conta nesta ordem: acionamento, hora inicial / hora final = total = hora extra, km inicial / km final = km extra, pedágio e total. Os números continuam os gravados na OS.

## Aprovar só com De acordo (22/10/2026)

Ainda não publicado. O botão Aprovar abre a análise. A gravação só acontece depois do termo De acordo. O administrador interno vê Voltar para verificar numa OS já aprovada e a linha deixa de ficar verde. O administrador do cliente não desfaz a aprovação.

## Medição só depois da validação (22/10/2026)

Ainda não publicado. Na lista do portal, Analisar, Aprovar e Conferir ficam na última coluna, na mesma linha. Enquanto a OS mostra Aguardando validação, esses botões não aparecem e o servidor recusa a gravação. A análise aberta mostra os dados da OS e o mapa com o ponto A na origem e o ponto B no destino.

## Primeiro acesso do portal novo (22/10/2026)

Ainda não publicado. Ao salvar um cliente ativo com portal, nasce o administrador `portal@domínio` do site, com senha igual ao CNPJ e perfil administrador. No primeiro acesso ele troca o e-mail e a senha. A equipe interna continua entrando com o usuário do sistema. Quem o administrador cadastra no portal também entra no Cadastro de Usuário do cliente. O botão Ler prefere SVG e descarta o retângulo branco de fundo. A cor escura vira a marca e a cor viva vira o botão. CEVA e IBL não recebem esse e-mail automático.

## Medição do portal do cliente (22/10/2026)

Ainda não publicado. CEVA, IBL e o portal por slug usam a mesma lista. Cada OS ganhou Analisar medição, Aprovar e Conferir. Aprovar grava a decisão e a linha fica verde. Conferir pede os itens recusados, justificativa e anexo opcional; a linha fica amarela e o e-mail vai para financeiro@grupotmseg.com.br. Quando a equipe grava a OS depois desse pedido, a linha mostra Modificação realizada e o cliente pode aprovar. A tabela é `portal_medicao_cliente`. O gatilho na OS engole o próprio erro, então uma falha dessa tabela não impede salvar a OS. O cálculo da OS não mudou.

## Salvamento do cliente com site e logotipo (22/10/2026)

O botão Finalizar e salvar respondia “Erro desconhecido”. O PostgREST devolve o erro como objeto simples, e o código só lia `instanceof Error`. Sem as colunas, o banco responde `PGRST204`, e o formulário só tentava de novo no código `42703`, então o cadastro inteiro era recusado. As colunas `portal_ativo`, `portal_slug`, `portal_site`, `portal_logo_url`, `portal_cor` e `portal_cor_acao` foram criadas em `clients`, com índice único do slug. O restante de `migrations/2026_10_21_portal_cliente.sql` não foi executado. Publicado nesta entrega.

## Leitura do site no cadastro do cliente (22/10/2026)

O botão Ler respondia “Portal não encontrado” no localhost. O Express 5 recalcula `req.query` a cada leitura, então a marca da operação sumia e a rota procurava um portal sem slug. O endereço `/api/cliente-portal/...` agora entra no mesmo leitor. Na ficha da IBL, `https://ibllogistica.com.br/` devolveu o ícone do site e a cor `#f7941e`. A ficha ainda precisa ser salva para gravar. Publicado nesta entrega.

---

## Abertura da Auditoria sem leitura morta (22/10/2026)

A Auditoria deixou de disparar a busca que pedia `original_client_name`. Essa consulta já falhava e não trocava tabela. Na primeira abertura, se a OS recebida já tem receita, custo, pedágio e status, a modal não baixa essa linha de novo. Um Controle Diário incompleto continua buscando a OS. Salvar, tempo real e o recarregar depois de gravar continuam lendo o banco. Na GTM-8765, fora do Cockpit, a abertura marcou reutilização, mostrou 2.398,00 e 700,00, e o aviso Sincronizando Dados ficou em cerca de 3,2 s. A linha dessa OS tem 722 bytes. Publicado nesta entrega.

---

## Informar Pedágio na Auditoria (22/10/2026)

Os campos Pedágio Cliente e Pedágio Fornecedor da Auditoria de Faturamento ficaram bloqueados para digitação. O botão Informar Pedágio, logo acima, recebe o valor real: ele entra no fornecedor e o cliente é calculado pela regra que já existia (faixas, DHL sem acréscimo). A criação da OS já gravava assim. Deslocamento não mudou. Na GTM-8765, R$ 100 virou fornecedor R$ 100,00 e cliente R$ 120,00; em seguida os campos voltaram a R$ 0,00, sem Salvar. Sem mudança de fórmula. Publicado nesta entrega.

---

## Cockpit local quebrava o JSON (22/10/2026)

O navegador não consulta as tabelas financeiras direto. Ele manda `POST /api/dados-protegidos` e espera JSON. Na Vercel essa função existe. No Express local a rota não estava ligada, então a resposta era a página HTML (`<!DOCTYPE`) e o Cockpit mostrava `Unexpected token '<'`. A rota local agora chama o mesmo handler. Sem sessão o teste devolveu JSON `sessao_invalida`, não HTML. Sem mudança de fórmula, de permissão ou de banco. Publicado nesta entrega.

---

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
