# NÃO ATIVAR — ponte de autenticação

A ponte não está ligada ao login, às telas nem ao banco. A SQL de RLS continua sem execução. A fase 2 prepara a integração isolada e também permanece desligada.

## Diagnóstico do login atual

O funcionário entra por `components/Login.tsx`. A tela lê `system_users` com a chave pública, compara a senha no navegador e grava `tmseg-token-<id>-<hora>` em `localStorage`, junto com `userData`.

Esse token não tem assinatura. Quem souber o id monta outro igual. O servidor, em `lib/tmsegAuth.ts`, tira o id do texto. Se o banco não responde, parte das rotas aceita perfil e permissão vindos do cabeçalho. Isso não é prova.

A expiração é ociosa no navegador: 30 minutos de dia e 20 na vigia, com exceções. O token em si não vence no servidor. A cada dois minutos a tela relê `system_users`. Se essa leitura falha, o login continua.

O logout apaga o armazenamento local e chama `supabase.auth.signOut()`. Não existe sessão opaca no servidor para revogar. O desligamento geral depende de um sinal que o navegador consulta.

O portal é usuário com `client_id` e a permissão `portal-only`. O cliente da consulta precisa continuar vindo da ficha, não do pedido.

## Escolha

Foi escolhida a API autenticada no servidor.

A integração com Supabase Auth exigiria trocar o login e emitir JWT para todas as consultas antes de a RLS valer. O risco de parar OS, faturamento e nota é maior.

A ponte no servidor deixa o login como está. Numa fase futura, depois da senha já conferida, o servidor emite um segredo opaco, guarda só o hash e relê a ficha a cada consulta. O navegador não escolhe perfil, permissão nem empresa. `service_role` não sai do servidor.

## O que existe nesta fase

Código em `lib/gestorFiscal/ponteAuth/`. Entrada de produção: `atenderProducao`. Sem a flag `GESTOR_FISCAL_PONTE_AUTH_ENABLED=true`, responde `ponte_desligada`. Com a flag, responde `sem_adaptador` e não consulta. Não há rota HTTP.

O protótipo `criarPonteIsolada` usa identidades fictícias e um livro fictício. Não foi importado por `Login.tsx`, `App.tsx` nem pelo Centro de Homologação.

## Migração futura, sem trocar o login de uma vez

1. Manter a tela de senha.
2. Depois da conferência atual, o servidor emite a sessão opaca. O token antigo continua nas telas que já existem.
3. Só consultas novas, começando pelo Gestor Fiscal, passam pela ponte.
4. Quando a ponte cobrir as dez tabelas, a SQL de RLS pode ser reavaliada. Ela não faz parte desta fase.
5. Rollback: remover `lib/gestorFiscal/ponteAuth/` e `scripts/ponte-auth-isolada.test.ts`. O login atual não depende desses arquivos.

## Fase 2 — integração isolada, ainda desligada

O repositório de teste fica em memória, dentro de `lib/gestorFiscal/ponteAuth/`. Ele guarda o hash da senha fictícia e o hash da sessão. Não abre rede.

`entrarIsolado` confere a senha no servidor e emite `ponte.<id>.<segredo>`. As rotas preparadas estão em `rotasPreparadas.ts`: OS, painel operacional, clientes, fornecedores, faturamento, financeiro, portal e Gestor Fiscal. Nenhuma delas foi registrada no servidor HTTP.

`entrarProducao` e `consultarGestorProducao` recusam sem a flag e, com a flag, recusam por falta de adaptador. A homologação real continua desligada. A tela `components/Login.tsx` não foi alterada.

Nas rotas preparadas, o token `tmseg-token-<id>-<hora>` não é fallback. Perfil, permissão e CNPJ do pedido não autorizam. Se a releitura da ficha falha, o acesso é negado.

### Migração gradual, quando houver ativação

1. Manter a tela de login.
2. Passar a conferência da senha para `entrarIsolado`, sem apagar o token antigo das telas que ainda não migraram.
3. Ligar uma rota por vez, começando pelo Gestor Fiscal.
4. Só então reavaliar a SQL de RLS.
5. Rollback desta fase: remover os arquivos novos da ponte e o teste `scripts/ponte-auth-integracao.test.ts`. O login atual não depende deles.

## Fase 3 — rotas HTTP reais, ainda fechadas

As rotas existem em `api/ponte-auth/`: login, sessão, logout e consulta do Gestor Fiscal. Não foram acrescentadas ao mapa `functions` do `vercel.json`, que permanece com 50 entradas.

Com a flag ausente, respondem `ponte_desligada`. Com as duas flags de ambiente ligadas, respondem `integracao_incompleta`. A constante `INTEGRACAO_HTTP_LIBERADA` continua falsa, então a flag sozinha não abre login, sessão nem consulta.

O depósito definitivo proposto é `tmseg_private.ponte_sessoes`, no arquivo `docs/gestorFiscal/sql/2026_10_19_ponte_sessoes.NAO_EXECUTAR.sql`. Ele não foi executado. A tabela guarda hashes, usuário, expiração, revogação, criação e última atividade. O cookie previsto é `tmseg_ponte`, HttpOnly, Secure e SameSite=Strict, só no caminho `/api/ponte-auth`. O CSRF vai no cabeçalho `x-tmseg-csrf`. O token novo não vai para o `localStorage`.

A senha de funcionário continua em texto em `system_users`. O portal já usa `scrypt$` com sal hexadecimal. Outro prefixo, como bcrypt, não é aceito como texto. Esta fase não reescreve senha. A troca futura grava hash só depois de um login bem-sucedido, em coluna nova, sem apagar o texto antigo de uma vez.

A consulta do gestor chama `computeCanonicalRevenueCost`, separa pela empresa emissora e ignora conta pagadora e CNPJ do pedido. A homologação real segue desligada. A tela atual não chama essa API.

Rollback desta fase: apagar `api/ponte-auth/` e os arquivos novos da ponte. As rotas antigas não dependem deles.

## Fase 4 — migração de senha, ainda desligada

O algoritmo e o fluxo estão em `lib/gestorFiscal/ponteAuth/hashSenha.ts` e `migracaoSenha.ts`. `MIGRACAO_SENHA_LIBERADA` permanece falsa. O detalhe está em `docs/gestorFiscal/MIGRACAO-SENHA-NAO-ATIVAR.md`. A coluna `password_hash` está só no SQL não executado.

## Veredito

A ponte não está ativada. A migração de senha não está ativada. Nada foi publicado e o banco não foi alterado.
