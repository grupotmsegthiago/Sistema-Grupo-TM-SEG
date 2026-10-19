# RELATÓRIO DA ÚLTIMA EXECUÇÃO

Fase: encerramento da Fase 1 e diagnóstico da Fase 2
Data: 2026-10-19
SHA da `main`: `7676ea63edcff02292c2374472f51fff4d138758`
Produção: o mesmo SHA

Nenhuma migration, nenhuma mudança de RLS, nenhum login alterado, nenhum push para `main` nesta etapa, TORRES intocada, `dev` não sincronizada.

## 1. Produção

PR #346 está `MERGED`. O commit da `main` é o merge dessa PR.

Vercel, projeto `sistema-grupo-tm-seg`: status `success` no commit `7676ea63`, descrição “Deployment has completed”.

`https://sistema.grupotmseg.com.br/api/version` devolve `version` `3.7.65` e `buildId` `7676ea63`, `builtAt` `2026-10-19T01:22:54.261Z`.

`/api/health` devolve `status: ok`, HTTP 200.

O HTML traz o título “Grupo TMSEG - Sistema de Gestão” e o Supabase `ajhmmjuewdsukecaimik`. A tela de login renderizou: “Acesso ao Sistema”, e-mail, senha, botão “Acessar sistema”, rodapé `v3.7.65` e “Sistema operacional”. Sem overlay de erro JavaScript.

## 2. Fase 1

Concluída no GitHub e no ar. Motivo: o `buildId` de produção é o merge da governança.

## 3. Segurança — confirmado de novo, sem correção

Anon no projeto da TM SEG ainda lê `system_users.password` (não é bcrypt), `missions` (6306), `financial_transactions` (3385), `financial_invoices` (199), `comissoes` (139), `client_price_tables` (1353), `rh_salary_configs` (16) e `time_clock` (1061).

`/api/gemini/health` responde 200 sem sessão.

## 4. Ainda não validado

Lista viva de policies. Se a anon consegue gravar, não só ler. Se o `EXECUTE` anon de `registrar_baixa_manual_fatura` está de fato no banco. Chamada real de `/api/gemini/generate` (não foi feita, para não gastar a chave).

## 5. Plano da Fase 2

Está em `docs/governanca/18-DIAGNOSTICO-FASE-2-SEGURANCA.md`. Resumo: login no servidor no mesmo change set que fecha a senha; depois uma família de tabelas por vez; testes de sonda e de login; rollback por policy no projeto `ajhmmjuewdsukecaimik` apenas.

## 6. Dev

35 commits atrás da `main`, sem commit exclusivo. Plano, se for autorizado: `merge --ff-only` da `main` na `dev` e push sem `--force`. Não executado.

## 7. Programa

Fases 0 e 1 encerradas. Fase 2 só diagnosticada. Cerca de 25% das oito fases. Maturidade do sistema continua em 52%, porque os P0 de segurança seguem abertos.

## 8. Próxima ação que exige autorização

Autorizar o passo 1 da Fase 2: leitura do catálogo de policies no projeto `ajhmmjuewdsukecaimik`, sem DDL. Ou autorizar o fast-forward da `dev`. Nenhuma das duas foi feita.

## Veredito

FASE 1 CONCLUÍDA EM PRODUÇÃO
FASE 2 NÃO INICIADA
