# Pacote restante do PR 348

Nada disto foi executado. Não fazer merge nem deploy.

A sessão SQL disponível neste ambiente continua sem `system_users`. O catálogo abaixo é o que foi lido no projeto `ajhmmjuewdsukecaimik`, não uma suposição de RLS desligado.

## Diagnóstico

O RLS já está ativo em `clients`, `financial_accounts`, `financial_invoices`, `financial_transactions`, `missions` e `system_users`. O anon tem privilégio `SELECT` e policies que autorizam a leitura.

Policies confirmadas:

- `public_access_users`
- `public_access_missions`
- `public_access_fin_trans`
- `public_access_fin_acc`
- `financial_invoices_anon_select`
- policies temporárias `tmp_auth_*`

O problema é permissão aberta com RLS ligado. Ligar RLS de novo não fecha o furo.

## 1. O que a correção mexe, e o que preserva

Arquivo fechado: `sql/2026_10_19_pacote_correcao.NAO_EXECUTAR.sql`.
Reversão desse recorte: `sql/2026_10_19_pacote_correcao.REVERSAO.NAO_EXECUTAR.sql`.

Não usar `sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql` nem a reversão que recria `Allow all`. A primeira depende de JWT `app_metadata`, que o login próprio não emite. A segunda não restaura os nomes confirmados.

| Policy | Tabela | Nesta correção |
| --- | --- | --- |
| `public_access_fin_trans` | `financial_transactions` | Sai, e o anon perde `SELECT` |
| `public_access_fin_acc` | `financial_accounts` | Sai, e o anon perde `SELECT` |
| `financial_invoices_anon_select` | `financial_invoices` | Sai, e o anon perde `SELECT` |
| `public_access_users` | `system_users` | Sai. O anon continua lendo só as colunas de tela, sem `password` |
| `public_access_missions` | `missions` | Fica. O `postgres_changes` da OS ainda depende dela |
| `tmp_auth_*` | não nomeada | Fica até o export trazer tabela, papel, comando e expressão |
| clients | policy não nomeada | Fica até o export nomear a policy |

O login e a sessão no servidor usam `service_role`, que ignora RLS. O script aborta se esse papel deixar de ignorar RLS. O canal broadcast de OS não usa essas policies. O tempo real por `postgres_changes` em `missions` usa.

Asaas e o cálculo da OS não entram neste pacote.

## 2. Quando aplicar

Só depois de backup recuperável confirmado no projeto `ajhmmjuewdsukecaimik` e de homologação das telas com a sessão nova. O commit publicado `7676ea63` ainda lê financeiro pela chave anônima. Aplicar este SQL antes de trocar esse código tira fatura e lançamento do ar.

O arquivo aborta sem as marcas `tmseg.p0_backup = conferido`, `tmseg.p0_telas = validadas` e `tmseg.p0_correcao = autorizada`. Também aborta se alguma policy nomeada não for `SELECT` do anon, ou se o RLS dessas seis tabelas não estiver ativo.

## 3. Senha

As telas não pedem a coluna `password` de volta. A policy `public_access_users`, enquanto existir, ainda entrega a senha pela chave anônima. A correção troca essa policy por leitura das colunas de tela.

## 4. Backup

Não confirmado. Sem a tela de backup desse projeto, a marca `tmseg.p0_backup` não deve ser ligada.

## 5. Regressão

Os testes já feitos de sessão, ponte, simulação do Gestor Fiscal, faturamento, pedágio, RH, ponto e comissão não foram repetidos. O teste deste pacote é `scripts/pacote-correcao-p0.test.ts`.

Depois da aplicação, e antes de publicar: login, OS ao vivo, fatura, pedágio e a lista de usuários sem senha.

## 6. Rollback

Código publicado: `7676ea63`. Esta branch ainda não foi para produção. A reversão do SQL só recria as quatro policies que este pacote remove e devolve o `SELECT` do anon nelas. `public_access_missions` não entra nessa reversão porque não é removida.

## 7. Publicar só quando

- O backup de `ajhmmjuewdsukecaimik` estiver confirmado.
- A homologação da sessão nova tiver aberto OS, fatura e usuário.
- Este SQL tiver rodado nesse projeto, não em outro.
- A chave anônima não ler lançamento, conta, fatura nem senha.
- A OS continuar atualizando ao vivo.
- Diretoria autorizar. Merge e deploy ficam para depois disso.
