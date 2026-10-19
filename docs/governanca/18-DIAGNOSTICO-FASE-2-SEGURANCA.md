# 18 — Diagnóstico da Fase 2 (somente leitura)

Data: 2026-10-19. Código em produção: `7676ea63` (docs da Fase 1 em cima do código `c714a624`). Nenhuma policy, função, senha ou linha foi alterada. O conector SQL da TORRES não foi usado.

## O que está confirmado agora

A chave anon publicada no HTML de produção lê, no projeto `ajhmmjuewdsukecaimik`:

| Alvo | HTTP | Linhas visíveis |
| --- | --- | --- |
| `system_users` com coluna `password` | 206 | 28 |
| `missions` | 206 | 6306 |
| `financial_transactions` | 206 | 3385 |
| `financial_invoices` | 206 | 199 |
| `comissoes` | 206 | 139 |
| `client_price_tables` | 206 | 1353 |
| `rh_employees` | 206 | 19 |
| `rh_salary_configs` | 206 | 16 |
| `time_clock` | 206 | 1061 |
| `profiles` | 206 | 8 |
| `mission_live_tracks` | 401 | recusado |

A senha devolvida não é bcrypt. O valor não foi registrado. O login em `components/Login.tsx` compara essa coluna no browser.

`GET /api/gemini/health` em produção respondeu 200 e `ok: true`, sem sessão.

## O que o git já declara e o catálogo ao vivo não confirmou

Policies `USING (true)` para `anon` estão escritas em `migrations/` para ponto, comissões, vínculo de fatura, tabelas regionais, ocorrências, pagamentos e `financial_invoices`. A função `registrar_baixa_manual_fatura` é `SECURITY DEFINER` e o arquivo dá `EXECUTE` a `anon`. O caminho do app chama essa função com service role (`lib/invoiceManualPayment.ts`).

O catálogo `pg_policies` da TM SEG continua **não carregado**. Não dá para afirmar que cada policy do arquivo é a que está no ar. A leitura anon acima prova o efeito, não a lista completa de policies.

Insert e update pela anon não foram testados. Não houve chamada de RPC.

## Endpoints com autenticação fraca ou ausente

Confirmado no código vigente e, onde indicado, no ar:

| Rota | Situação |
| --- | --- |
| `/api/health`, `/api/version` | públicas de propósito |
| `/api/gemini/health` | pública; confirmada no ar |
| `/api/gemini/generate` | sem sessão no handler |
| geocode, reverse-geocode, distance-matrix, route-progress | GET sem sessão |
| `/api/comissoes-ingest` | aceita a anon key da TM SEG como token |
| webhook WhatsApp inbound | secret opcional se a env estiver vazia |
| e-mail de missão, pedido de reset, pedágio | Bearer presente, sem usuário resolvido |
| `api/admin/force-logout-all` | token fixo no fonte |

## O que quebra se a correção for apressada

Fechar o `SELECT` anon de `system_users` antes de existir login no servidor derruba o botão Acessar sistema. A tela atual depende dessa leitura.

Fechar `missions`, financeiro, tabelas de preço, RH e ponto no mesmo passo, sem trocar os readers do browser por rotas já autenticadas, esvazia painel, boletim, comissão e ponto.

Revogar `EXECUTE` anon de `registrar_baixa_manual_fatura` não é o primeiro risco: o caller do repositório usa service role. Ainda assim a função não pode ser testada com escrita nesta fase.

Não mexer na TORRES. Não usar o conector que enxerga `service_orders`.

## Ordem proposta, ainda sem autorização

1. Ler `pg_policies` e grants só no projeto `ajhmmjuewdsukecaimik`, com papel de leitura. Sem DDL.
2. Criar login no servidor que não devolve a senha ao browser. No mesmo change set, o `Login.tsx` deixa de selecionar `password`.
3. Só então negar a coluna `password` e o restante de `system_users` à anon. Prova: a mesma sonda de hoje passa a falhar e um usuário de teste ainda entra.
4. Fechar leitura anon de financeiro, preço, RH e ponto, uma família por vez, com a tela correspondente já lendo pela API autenticada.
5. Tirar a anon key da lista de `api/comissoes-ingest.ts`. Exigir sessão em Gemini generate e geocode. Webhook WhatsApp sem secret passa a recusar.
6. Revogar `EXECUTE` anon da baixa manual depois de provar que o caminho service role continua.
7. Token de logout global sai do fonte para env, com rotação.

## Testes, rollback e aceite

Antes: repetir a sonda anon e um login de teste em localhost. Depois: sonda anon sem senha e sem título; login ok; uma OS abre; boletim lista; baixa manual de teste não é gravada em produção.

Rollback: repor a policy anterior no mesmo projeto, arquivo em `migrations/rollback/`, sem `reset` de git da `main`. Não aplicar o rollback na TORRES.

Aceite: anon não lê `password`, `financial_transactions`, `rh_salary_configs` nem `time_clock`; login e abertura de OS funcionam; `/api/version` do deploy é o SHA dessa correção; nenhum objeto da TORRES mudou.

## Sincronização da dev, só quando pedirem

`origin/dev` (`766c9895`) está 35 commits atrás de `origin/main` (`7676ea63`) e não tem commit próprio. O avanço seguro é `git merge --ff-only origin/main` na `dev` e push sem `--force`. Não foi feito.
