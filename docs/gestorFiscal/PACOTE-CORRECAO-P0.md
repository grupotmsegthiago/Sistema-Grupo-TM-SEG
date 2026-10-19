# Pacote restante do PR 348

Nada deste pacote foi executado no banco. Não fazer merge nem deploy.

Arquivo SQL, ainda fechado: `sql/2026_10_19_pacote_correcao.NAO_EXECUTAR.sql`.
Inventário vivo, ainda não lido: `sql/2026_10_19_export_policies_rls.SOMENTE_LEITURA.sql`.
Reabertura de emergência, também fechada: `sql/2026_10_19_p0_financeiro_rls.REVERSAO-EMERGENCIA.NAO_EXECUTAR.sql`.

Não usar `sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql`. Ela exige JWT `app_metadata`. O sistema entra com sessão própria e a API usa `service_role`.

## 1. Permissões necessárias

O catálogo real de `pg_policies` continua bloqueado: a sessão SQL disponível não tem `system_users` nem `missions`. O alvo abaixo é o que as rotas atuais precisam, não uma cópia do banco.

| Quem | OS, clientes, tabelas de preço e fornecedores | Financeiro |
| --- | --- | --- |
| Chave anônima | Nenhum | Nenhum |
| Papel `authenticated` do Supabase | Nenhum. O sistema não entra por esse JWT | Nenhum |
| `service_role` | Ignora RLS e só age depois da checagem no servidor | Igual |
| Usuário interno ativo | Lê e grava pela API | Lê. Grava só Diretoria, Financeiro, Administrador, CEO ou permissão `*`, `fin-dashboard`, `finance-group`, `diretoria-faturamento` |
| Avançado | Lê e grava operação | Nenhum |
| Portal | Lê missão e cliente | Nenhum |
| Inativo ou sem sessão | Nenhum | Nenhum |

`system_users` fica de fora das dez tabelas. O anon ainda precisa ler as colunas de tela (`id`, `name`, `email`, `status`, `profile_id`, `client_id`, `provider_id`, `permissions`, `force_password_change`, `user_type`, `created_at` e as de treinamento). Não precisa ler `password`, `password_hash` nem `password_reset_token`.

## 2. Ordem para implantar

Depende do inventário e do backup. Sem os dois, o SQL aborta.

1. Rodar só a consulta de leitura no SQL Editor de `ajhmmjuewdsukecaimik` e guardar o resultado.
2. Confirmar backup recuperável nesse mesmo projeto.
3. Entrar de novo no sistema publicado e abrir OS, faturamento e o tempo real da missão.
4. Só então, na mesma sessão SQL, marcar `tmseg.p0_backup = conferido`, `tmseg.p0_telas = validadas` e `tmseg.p0_correcao = autorizada`, e rodar o arquivo do pacote.
5. Repetir a leitura anônima. Financeiro, missão e senha têm de falhar. A OS aberta com sessão válida tem de continuar na tela.

O tempo real da missão ainda usa a chave anônima. Se o passo 3 mostrar atualização ao vivo, o passo 4 não entra até essa atualização ter outro caminho. O pacote não cria policy substituta para o anon.

## 3. Senha nas respostas

O login, a lista e a edição não selecionam `password`. A resposta da sessão não inclui senha. O portal devolve a sessão sem a coluna. O cadastro de usuário passou a pedir só `id` na volta do insert, para a linha nova não devolver a senha ao navegador.

A leitura direta `system_users` com a chave anônima continua devolvendo a senha até o REVOKE do pacote. O e-mail de boas-vindas ainda envia a senha que o administrador acabou de digitar. Isso não é consulta da senha gravada.

## 4. Backup

Não confirmado. SQL não enxerga o backup do painel Supabase. A verificação é no projeto `ajhmmjuewdsukecaimik`: backup concluído, com hora, e restauração possível. Sem essa tela, a marca `tmseg.p0_backup` não deve ser ligada.

## 5. Regressão já separada do que falta

Já passaram, e não precisam ser repetidos agora: sessão, ponte, Gestor Fiscal em simulação, faturamento, pedágio, RH, ponto e comissão. Build do `9df33950` concluiu.

Falta, depois do SQL e antes de publicar: login real, OS na tela, faturamento, pedágio, ponto, Gestor Fiscal com Diretoria e o botão de lançamento da comissão. Asaas e o cálculo da OS não entram neste pacote.

O teste novo cobre só o contrato deste pacote e a resposta sem senha: `scripts/pacote-correcao-p0.test.ts`.

## 6. Rollback e homologação

Código publicado hoje: `7676ea63`. Esta branch: `9df33950`, sem deploy. Voltar o código é permanecer em `7676ea63`.

Se o SQL chegar a rodar e a OS sumir, usar a reversão de emergência. Ela reabre o anon de propósito e não é o estado final. Não restaurar backup por cima da produção sem a conferência do item 4.

Homologação do Gestor Fiscal com dado real continua desligada. A simulação local não autoriza publicação.

## 7. Publicar só quando tudo abaixo for verdadeiro

- O export de policies saiu de `ajhmmjuewdsukecaimik` e está guardado.
- O backup desse projeto foi aberto e a restauração é possível.
- O SQL do pacote rodou nesse projeto, não em outro.
- Chave anônima não lê as dez tabelas nem `password`.
- Usuário sem sessão recebe recusa em `/api/dados-protegidos`.
- OS, fatura e pedágio abrem com sessão válida e o valor não muda.
- Asaas emite boleto de ensaio.
- A comissão TORRES só sai pelo botão de lançamento.
- Nenhuma tela fica em carregamento infinito.
- O pacote do navegador não contém a chave de serviço.
- Diretoria aprova. Aí, e só aí, merge e deploy do escopo homologado.
