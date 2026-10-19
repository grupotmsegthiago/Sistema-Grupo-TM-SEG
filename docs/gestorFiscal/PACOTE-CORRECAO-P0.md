# Plano consolidado do PR 348

Nada disto foi executado. Não fazer merge nem deploy.

Catálogo lido no projeto `ajhmmjuewdsukecaimik`. O RLS já está ativo. O furo são policies e grants abertos.

## Etapa 1 — financeiro e senha

Arquivo fechado: `sql/2026_10_19_pacote_correcao.NAO_EXECUTAR.sql`.
Reversão só deste recorte: `sql/2026_10_19_pacote_correcao.REVERSAO.NAO_EXECUTAR.sql`.

| Policy | O que é | Ação |
| --- | --- | --- |
| `public_access_fin_trans` | Leitura aberta de lançamentos | Sai, e o anon perde `SELECT` |
| `public_access_fin_acc` | Leitura aberta de contas | Sai, e o anon perde `SELECT` |
| `financial_invoices_anon_select` | `SELECT` do anon em faturas | Sai, e o anon perde `SELECT` |
| `public_access_users` | Leitura aberta de usuários, inclusive senha | Sai. O anon fica só com as colunas de tela |

O login próprio não usa essas policies. Ele lê `system_users` com `service_role`, que ignora RLS. O script aborta se esse papel deixar de ignorar RLS.

Não aplicar a etapa 1 em cima do commit publicado `7676ea63`. Esse código ainda lê financeiro pela chave anônima. Antes vêm o backup recuperável e a homologação das telas com a sessão nova.

O arquivo também aborta se o catálogo não bater: as policies da etapa 1 precisam ser `SELECT` ou `ALL` para `anon` ou `public`; `public_access_clients` precisa continuar `ALL` para `public` com `qual` e `with_check` true; e as quatro `tmp_auth_*` precisam existir para `authenticated` com `qual` true. Existir não é remover.

## Etapa 2 — o que este pacote não remove

### Missões

`public_access_missions` fica. O `postgres_changes` em `lib/RealtimeProvider.tsx` ainda acorda a OS por essa leitura anônima. O canal broadcast `mission-updates` já cobre observação, ocorrência e passagem de plantão, mas não substitui sozinho a atualização da lista.

A policy só sai depois de a lista de OS atualizar por esse broadcast, com a tela homologada sem a leitura anônima de `missions`.

### Clientes

`public_access_clients` é `ALL` para `public`, com `qual` e `with_check` true. O anon lê e grava clientes. Risco alto, e a OS publicada ainda depende disso. Sai na etapa 2, quando o cadastro de cliente passar só pela API. Não entra na remoção da etapa 1.

### Policies temporárias

Confirmadas, no papel `authenticated`, com condição true:

- `tmp_auth_select_all`
- `tmp_auth_insert_all`
- `tmp_auth_update_all`
- `tmp_auth_delete_all`

Estão em várias tabelas, entre elas financeiro, RH, patrimônio, missões auxiliares e configurações. A lista completa de tabelas ainda é a consulta `sql/2026_10_19_export_policies_rls.SOMENTE_LEITURA.sql`, que filtra `tmp_auth_%` e `public_access_%`.

Não são a causa da leitura que a chave anônima já fez. O papel é `authenticated`, e o login próprio não abre sessão do Supabase Auth. O risco é latente: um JWT `authenticated` ganha leitura e escrita nessas tabelas. Remover as quatro de uma vez pode quebrar uma tabela que ainda grave por esse papel. A etapa 2 classifica cada tabela do export e só então retira a policy daquela tabela.

| Domínio | Risco enquanto existirem | Dependência para retirar |
| --- | --- | --- |
| Financeiro | JWT `authenticated` altera lançamento, conta e fatura | Etapa 1 já sem anon, e nenhuma tela usando esse JWT |
| RH e patrimônio | O mesmo JWT altera cadastro pessoal e bens | Telas de RH conferidas com a API |
| Missões auxiliares | O mesmo JWT altera histórico e apoios da OS | Tempo real e OS homologados |
| Configurações | O mesmo JWT altera ajuste do sistema | Tela de configuração conferida |

## Fora deste plano

Não usar `sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql`. Ela depende de JWT `app_metadata`. Asaas e o cálculo da OS não mudam.

## Publicar só quando

- O backup de `ajhmmjuewdsukecaimik` estiver confirmado.
- A etapa 1 tiver sido homologada: anon sem lançamento, conta, fatura e senha; OS ainda atualizando ao vivo; login próprio funcionando.
- A etapa 2 tiver o export completo das `tmp_auth_*` e a OS atualizando sem `public_access_missions`.
- A Diretoria autorizar. Merge e deploy ficam para depois disso.
