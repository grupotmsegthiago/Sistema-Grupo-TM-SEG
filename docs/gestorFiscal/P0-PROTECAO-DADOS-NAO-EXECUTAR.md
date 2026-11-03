# NÃO EXECUTAR — proteção dos dados financeiros

Projeto alvo, quando houver autorização: `ajhmmjuewdsukecaimik`.
Branch desta proposta: `cursor/gestor-fiscal-9d36`.
Nada disto foi aplicado em produção. Não houve push, merge nem publicação.

## 1. Causa confirmada

A chave pública anônima lê e, pelas policies já escritas no repositório, também pode gravar tabelas financeiras sem sessão. O login do sistema não cria sessão do Supabase Auth. Ele compara a senha na tabela `system_users` com a chave pública e guarda `tmseg-token-<id>-<hora>` no navegador. O PostgREST continua no papel `anon`. A tela da Diretoria não chega ao banco.

O catálogo vivo de policies não foi relido nesta etapa. O conector administrativo disponível aponta para o outro banco e não foi aberto. A limitação permanece. A causa do P0 já estava medida na chave pública: as dez tabelas respondem sem sessão.

## 2. Tabelas e operações

Contagem de chamadas no código atual, fora de cópias antigas em `attached_assets`. Um arquivo pode ler e gravar.

| Tabela | Arquivos | Leitura | Inclusão | Atualização | Exclusão |
|---|---:|---:|---:|---:|---:|
| `missions` | 61 | 55 | 11 | 21 | 0 no código vivo |
| `clients` | 49 | 49 | 1 | 4 | 0 |
| `client_price_tables` | 26 | 26 | 5 | 5 | 2 |
| `provider_cost_tables` | 19 | 19 | 3 | 3 | 2 |
| `financial_transactions` | 33 | 28 | 11 | 18 | 6 |
| `financial_categories` | 16 | 15 | 3 | 1 | 1 |
| `financial_invoices` | 22 | 22 | 5 | 15 | 2 |
| `financial_invoice_missions` | 4 | 3 | 0 | 0 | 0 |
| `providers` | 28 | 27 | 2 | 7 | 0 |
| `financial_accounts` | 11 | 11 | 2 | 2 | 2 |

Não são tabelas exclusivas do Gestor Fiscal. OS, cadastro, faturamento, contas, Asaas, nota, WhatsApp, DHL e o mapa público passam por elas.

## 3. Quem precisa de cada acesso

Identidade de hoje: o navegador escolhe o próprio perfil dentro de `localStorage`. Isso não serve para RLS.

Identidade da proposta: JWT do Supabase Auth. O servidor copia perfil, permissões, status, cliente e empresas para `app_metadata`. O navegador não escreve esse campo. `user_metadata` é ignorado.

| Quem | Lê | Grava |
|---|---|---|
| Sem sessão | nada destas dez tabelas | nada |
| Operador com permissão `missions` | OS, clientes, preços, custos e fornecedores | OS |
| Portal do cliente | a própria OS e o próprio cadastro | só OS do próprio cliente |
| Financeiro ou tela `fin-dashboard` / `finance-group` | financeiro e OS | financeiro e OS ligadas ao faturamento |
| Diretoria com `diretoria-faturamento` | financeiro, OS e as empresas do grupo | faturas e lançamentos |
| Diretoria só com `gestor-fiscal` | financeiro e OS, para consulta | nada no financeiro |
| Perfil Avançado, mesmo com `*` | OS, se tiver permissão operacional | não lê financeiro |
| Servidor com `service_role` | o que o processo já faz | o que o processo já faz, só no servidor |

Empresa: lista vazia em `app_metadata.empresas` vê o grupo, para quem já tem permissão. Lista preenchida vê só a emissora citada em fatura e cliente. Lançamento, conta bancária e vínculo fatura–OS não têm CNPJ confiável. Com lista preenchida, essas três ficam ocultas. A conta que pagou não escolhe a empresa.

O portal não escolhe o CNPJ. Ele só vê o `client_id` gravado pelo servidor.

## 4. Arquitetura

Não trocar a chave pública por `service_role` no navegador.

1. O servidor autentica e emite o JWT com `app_metadata`.
2. O navegador manda esse JWT. A chave pública fica só como identificação do projeto.
3. A RLS desta proposta passa a valer.
4. Rotas que hoje usam a chave pública no servidor, como o mapa de viaturas, passam a usar `service_role` no servidor e continuam devolvendo só o recorte público.
5. Asaas, boleto, nota e o motor canônico não mudam de fórmula. Eles seguem no servidor, com a chave de servidor, e não dependem da policy do navegador.
6. Um endpoint só do Gestor Fiscal pode vir depois. Ele não fecha o P0 sozinho: a chave pública continuaria lendo a tabela direto.

Aplicar a SQL antes do JWT tira do ar OS, faturamento, cadastro e financeiro no navegador. Por isso o arquivo aborta sem a marca de teste.

## 5. Arquivos da proposta

- `docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql`
- `docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.REVERSAO-EMERGENCIA.NAO_EXECUTAR.sql`
- `scripts/p0-financeiro-rls-isolado.test.ts`

A reversão reabre o anônimo de propósito, só para emergência, e o próprio arquivo diz que isso não é o estado definitivo.

## 6. Testes

Postgres 16 local, porta 55432, dados fictícios `CLIENTE A`, `FX-GESTAO` e `FX-SEG`. Sem produção e sem o outro banco.

Passou:

- A SQL sem a marca de teste aborta e não cria policy.
- Anônimo não lê nem grava.
- Operador lê e cria OS e não vê lançamento.
- Diretoria só com `gestor-fiscal` lê as faturas e não atualiza.
- Diretoria com faturamento atualiza fatura.
- Financeiro limitado a `FX-GESTAO` vê uma fatura e nenhum lançamento.
- Avançado com `*` lê OS e não lê fatura.
- Portal vê uma OS e um cliente, não vê fatura, cria OS do próprio cliente e não cria a do outro.
- `user_metadata` dizendo Diretoria não libera lançamento.
- A reversão de emergência, com a marca dela, devolve a leitura anônima. Sem a marca, aborta.

Pendente, de propósito:

- Catálogo real de policies, views e grants do projeto `ajhmmjuewdsukecaimik`.
- Sessão real de Diretoria e de usuário comum.
- Ensaio das telas vivas depois do JWT. Não houve sessão de teste autorizada e nenhuma foi criada.

## 7. Risco de indisponibilidade

Se a SQL for aplicada hoje, o navegador perde OS, cliente, fornecedor, preço, fatura e lançamento. O servidor que já usa `service_role` segue. Onde o servidor cai para a chave pública, também para.

O login continuaria, porque `system_users` não está nestas dez tabelas. A senha ainda iria ao navegador. Isso é outro P0 e não foi mexido aqui.

## 8. Implantação futura, ainda não autorizada

1. Exportar `pg_policies` e os grants destas dez tabelas no projeto certo.
2. Emitir o JWT no servidor, com `app_metadata`, sem copiar a senha para o navegador.
3. Trocar as rotas públicas de servidor que usam a chave anônima.
4. Janela curta: aplicar a SQL, que também cria três índices.
5. Checklist: login, abrir OS, salvar OS, faturar, lançamento, cliente, fornecedor, mapa, DHL, Asaas e a tela do Gestor Fiscal só em consulta.
6. Parar se qualquer item operacional falhar. Não seguir para a publicação do Gestor Fiscal neste corte.

## 9. Rollback

Backup das policies antes. Se a operação cair, a reversão de emergência restaura o acesso anônimo só até o sistema voltar. Em seguida o corte é remarcado. Não deixar essa reabertura como solução permanente.

## 10. Veredito

Não está pronto para correção controlada em produção.

A proposta está testada no Postgres isolado e não altera o banco real. Falta o catálogo do projeto certo, o JWT emitido pelo servidor e o ensaio das telas vivas. Aplicar agora interrompe a operação. O Gestor Fiscal continua sem publicação.
