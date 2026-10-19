# NÃO ATIVAR — ponte de autenticação, fase 1

A ponte não está ligada ao login, às telas nem ao banco. A SQL de RLS continua sem execução.

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

## Veredito

A ponte não está ativada. Nada foi publicado e o banco não foi alterado.
