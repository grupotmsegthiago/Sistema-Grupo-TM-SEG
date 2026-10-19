# Plano de implantação do P0

O que ainda falta executar está em `docs/gestorFiscal/PACOTE-CORRECAO-P0.md`. Não aplicar `sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql`: ela depende de um JWT `app_metadata` que o sistema não emite.

Este plano junta as fases 1 a 4. Não é uma fase nova e não foi executado em produção.

Veredito: **BLOQUEADO**.

O bloqueio é a identidade do banco. O projeto da TM SEG é `ajhmmjuewdsukecaimik`. O conector administrativo desta sessão não é esse projeto: não tem `system_users` nem `missions` e tem `service_orders`. As policies e os grants vivos não foram lidos. Sem esse catálogo, a SQL de RLS não tem como saber o que vai apagar.

O ensaio com dados fictícios passou em Postgres local: `scripts/p0-implantacao-integrada.test.ts`. Isso não libera produção.

## O que já está pronto

- Ponte desligada: `INTEGRACAO_HTTP_LIBERADA = false` e `MIGRACAO_SENHA_LIBERADA = false`.
- Rotas HTTP em `api/ponte-auth/`, recusando enquanto a constante não mudar.
- SQL não executada: sessões, `password_hash` e RLS, cada uma com trava de teste.
- Hash `scrypt$v1$16384$8$1$32$<sal>$<hash>`, compatível na leitura com o `scrypt$` do portal.
- Medição já feita do acesso anônimo. Não repetir essa auditoria.

## Componentes que precisam mudar antes de ativar

Autenticação de entrada, ainda em texto puro:

- `components/Login.tsx` lê `password` e compara no navegador.
- `components/UserForm.tsx` grava e mostra senha provisória.
- `components/UserList.tsx` pode revelar `password`.
- `components/ChangePasswordModal.tsx` e `components/ProfileSettingsModal.tsx` gravam ou buscam senha em texto.
- `lib/passwordReset.ts` e `server/routes.ts` gravam a senha redefinida em texto.
- `lib/cevaPortal/equipeInterna.ts`, `lib/cevaPortal/httpHandler.ts` e a senha provisória de `lib/cevaPortal/cadastroSistema.ts`.

Confirmação de operação, distinta do login:

- `lib/toll/pedagioDaOs.ts` procura o usuário pela senha para autorizar pedágio. Não é sessão. Continua exigindo a senha na hora, mas a comparação passa para o hash. Estar logado não substitui essa confirmação.

Portal do cliente:

- Já usa `senha_hash` em `lib/cevaPortal/acesso.ts`. Não reescrever para `v1`. O verificador novo lê o formato antigo; o verificador do portal não lê o `v1`.

Dados ainda lidos pelo navegador com a chave anônima:

- As dez tabelas do corte: `missions`, `clients`, `client_price_tables`, `provider_cost_tables`, `financial_transactions`, `financial_categories`, `financial_invoices`, `financial_invoice_missions`, `providers`, `financial_accounts`.
- Dezenas de telas em `components/` ainda consultam OS, clientes, faturamento e financeiro direto. A SQL de RLS corta as dez de uma vez. Ela só entra quando essas telas tiverem caminho no servidor.

Gestor Fiscal:

- A rota `api/ponte-auth/gestor-fiscal.ts` existe e está fechada. A tela atual não a chama. A homologação real permanece desligada.

## Ordem

Cada etapa para se o critério falhar. Não se adianta etapa para “aproveitar a janela”.

| Etapa | Alteração necessária | Dependência | Risco | Teste de aceitação | Critério para avançar | Forma de reversão |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Banco certo | Confirmar o ref `ajhmmjuewdsukecaimik`. Exportar `pg_policies` e grants das dez tabelas. | Acesso administrativo desse projeto, não do outro | Cortar policy desconhecida e parar faturamento | O export contém `system_users` e `missions` e não contém `service_orders` | Os três sinais batem e o export está guardado | Não houve mudança. Parar |
| 1. Backup | Cópia consistente antes de cada SQL. Restaurar essa cópia num banco vazio de ensaio | Etapa 0 | Backup incompleto ou com senha em texto exposta | A restauração devolve linha de usuário, fatura e zero policy nova | A restauração conferida termina e o arquivo fica restrito | Descartar o ensaio. Não restaurar por cima da produção sem essa conferência |
| 2. Coluna de hash | `password_hash` nula. Nenhuma linha é copiada nem apagada | Backup da etapa 1 | Baixo, se ninguém preencher a coluna | Coluna existe, `password` igual, login atual entra | Contagem de nulos em `password_hash` igual à de usuários | Remover a coluna só se continuar nula |
| 3. Sessões | Criar `tmseg_private.ponte_sessoes`, sem tráfego | Etapa 1 | Baixo | Tabela existe, sem linha de produção, anon sem acesso | `SELECT` de anon na tabela falha e a aplicação segue igual | `DROP TABLE` dessa tabela. Ela ainda não tem sessão de funcionário |
| 4. Leitura dupla | Login, recuperação, perfil, equipe interna e pedágio passam a aceitar texto ou hash no servidor | Código das fases 1 a 4 | Trocar a comparação e recusar senha válida | Funcionário com texto entra. Funcionário de teste com hash entra. Desativado não entra | Os dois formatos passam no ensaio e o texto ainda está na coluna | Voltar o código. A coluna nem foi limpa |
| 5. Escrita dupla | Cadastro, troca e recuperação gravam hash e mantêm o texto | Etapa 4 | Senha nova só no hash enquanto a tela antiga ainda lê texto | Troca de senha de teste: os dois campos conferem a mesma senha | Login antigo e confirmação de pedágio aceitam a senha nova | A escrita volta a gravar só o texto. Hashes já gravados continuam válidos para a leitura dupla |
| 6. Login no servidor | A tela chama a rota segura. O cookie é HttpOnly. O token antigo continua valendo nas telas ainda não migradas | Etapas 3 e 5. Constante `INTEGRACAO_HTTP_LIBERADA` só muda neste commit | Derrubar quem está no meio de uma OS | Login novo entra. Sessão já aberta no navegador continua até o fim da transição. A resposta não traz senha nem hash | Monitorar erro de login por um ciclo operacional inteiro, sem fila de “não consigo entrar” | Desligar a constante. A tela volta a ler o texto. Sessões novas deixam de nascer; as antigas do navegador seguem |
| 7. Pedágio | A confirmação usa o verificador de senha, não a sessão e não o `.eq('password')` | Etapa 4 | Confundir com login e autorizar pedágio sem a senha da hora | Logado, senha errada não altera pedágio. Senha certa altera só o caso de teste | O caso de teste passa e nenhum pedágio real foi o ensaio | Voltar a consulta antiga enquanto o texto ainda existir |
| 8. Portais | Equipe interna usa o verificador duplo. Cliente permanece no hash de três partes | Etapa 4 | Reescrever o hash do cliente para `v1` e travar o portal | Cliente de teste entra como antes. Equipe interna entra. Um não vê o outro | Os dois logins de teste passam no mesmo dia | Reverter só o código da equipe. Não tocar `senha_hash` do cliente |
| 9. Sair do anon | Cada tela das dez tabelas passa a ler por API autenticada. Gestor Fiscal primeiro. OS, faturamento e financeiro na sequência | Etapa 6. A flag sozinha não arma a rota | Tela muda e a API ainda recusa, ou a API aceita perfil vindo do navegador | A tela migrada funciona com sessão válida, nega token antigo, nega perfil forjado e nega outra empresa | A tela antiga equivalente foi desligada e o ciclo do dia fechou sem diferença de valor | Religar a leitura antiga daquela tela. Não ligar a RLS ainda |
| 10. RLS | Rodar a SQL das dez tabelas, numa vez, só depois da etapa 9 | Etapas 0, 1 e 9. Export das policies guardado | Corte amplo demais tira OS e fatura do ar | Anon não lê nem grava as dez. Operador lê OS e não lê fatura. Diretoria lê o próprio escopo. Portal vê só o próprio cliente | Os quatro testes passam em produção com usuário de ensaio, e as telas do dia abrem | SQL de emergência, que devolve o anon de propósito. É temporária. Em seguida, corrigir e cortar de novo. Não ficar nesse estado |
| 11. Apagar o texto | Limpar `password` só de quem já tem hash conferido | Etapas 4, 5, 7 e 8 concluídas | Apagar cedo trava login, pedágio ou equipe | Nenhum código de produção compara mais a coluna `password`. Amostra de usuários entra só com hash | Busca no código não acha comparação de `password` nos pontos listados acima | Não dá para “descryptografar”. Recuperar acesso por redefinição. Restaurar backup dessa coluna reintroduz texto puro e só vale em emergência, com arquivo restrito |
| 12. Aposentar o token antigo | Rotas protegidas deixam de aceitar `tmseg-token-<id>-<hora>` | Etapa 6 estável e as telas da etapa 9 já usam a sessão nova | Derrubar quem ainda não entrou de novo | Token forjado recebe recusa. Funcionário que entrou pela rota nova trabalha | Não há fila de acesso dependente do token antigo | Religar a aceitação do token antigo só nas telas que ainda não migraram. Não religar nas rotas de financeiro |

## Backup e emergência

- O backup da etapa 1 é a rede de segurança de schema e de dados. A conferência é restaurar num banco vazio e contar usuário, fatura e OS. Sem essa conferência, a etapa 2 não começa.
- O export da etapa 0 é o registro das policies anteriores. A reversão de uma policy específica usa esse export, não a memória.
- Reversão de código: o commit da etapa. A constante volta a falsa. Não precisa de SQL.
- Reversão de schema: remover coluna nula ou tabela de sessão vazia. Depois que houver sessão ou hash de gente real, não se remove; desliga-se o código.
- Dados de OS, fatura, nota e Asaas não entram em nenhum script deste plano.
- Acesso de funcionário, se o login novo falhar: a tela antiga continua até a etapa 6 ser revertida. Depois da etapa 11, a recuperação é a redefinição de senha, não a coluna antiga.
- Emergência da RLS: `docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.REVERSAO-EMERGENCIA.NAO_EXECUTAR.sql`. Ela reabre o anon. Não é o estado final. O plano de saída é repetir a etapa 10 assim que a tela culpada tiver caminho no servidor.

## Publicação, quando deixar de estar bloqueada

Não executar agora.

1. Commit de código da etapa, na `dev`, sem `.env` e sem `package-lock.json` gerado fora do CI.
2. SQL da etapa, só no projeto confirmado, depois do backup. A ordem é coluna, tabela de sessão, e a RLS por último.
3. Flags: `GESTOR_FISCAL_PONTE_AUTH_ENABLED` e `GESTOR_FISCAL_PONTE_HTTP_ARMADA` não armam sozinhas. A constante no código muda no mesmo commit da etapa 6. `MIGRACAO_SENHA_LIBERADA` muda só na etapa 5, com a escrita dupla. `GESTOR_FISCAL_HOMOLOGACAO_REAL_ENABLED` permanece desligada.
4. Não acrescentar entrada em `functions` no `vercel.json`. O mapa já está no limite de 50.
5. Aceitação é a coluna da tabela acima, no mesmo dia, com usuário de ensaio.
6. Monitorar login recusado, pedágio recusado, portal do cliente e abertura de OS e fatura. Diferença de valor entre telas interrompe a etapa.
7. Rollback da etapa é a última coluna da tabela. Se a emergência reabrir o anon, o fato fica registrado e a etapa 10 volta assim que for seguro.
8. Quem valida é a Diretoria. Ninguém avança etapa sozinho.
9. Janela: um ciclo em que OS e faturamento possam ser repetidos na hora se a tela falhar. Não no meio do fechamento.

## Estado

BLOQUEADO na etapa 0. O plano das etapas 1 a 12 está fechado. O ensaio local cobriu transição de senha, sessão persistente, revogação, permissão, empresa, portal, Gestor Fiscal, RLS e restauração do backup fictício. Falta o catálogo administrativo de `ajhmmjuewdsukecaimik`.
