# 06 — Riscos e dívidas

Baseline `c714a624`. Classe separada de severidade. Opinião de arquitetura não virou bug.

| ID | Sev. | Classe | Domínio | Problema | Evidência | Impacto | Causa provável | Ação futura |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | P0 | RISCO | Acesso | Senha em texto no browser e legível pela anon key | `Login.tsx` compara `password`; sonda HTTP 200 na coluna; valor não é bcrypt | Conta interna recuperável por quem lê o JS ou a API | Login nasceu no cliente, antes de Supabase Auth | Fase 2: parar de selecionar a coluna no cliente; hash no servidor. Sem big-bang de Auth nesta fase |
| R02 | P0 | RISCO | Financeiro / OS / RH | Anon lê o conjunto de OS, títulos, preços, salários e ponto | Contagens 2026-10-19 na Data API | Vazamento do operacional inteiro | Policies amplas ou grants antigos; catálogo de policy da TM SEG não foi lido | Fase 2: inventariar policy no projeto certo e fechar anon. Não copiar o catálogo da TORRES |
| R03 | P0 | RISCO | Comissão | Ingest autoriza a anon key | `api/comissoes-ingest.ts` | Terceiro cria ou sincroniza comissão se a rota estiver pública | Atalho de token | Fase 2: só `COMISSAO_INGEST_TOKEN` / cron |
| R04 | P0 | RISCO | Sessão | Token de logout global no fonte | `lib/forceLogout.ts`, `api/admin/force-logout-all.ts` | Quem lê o repo derruba sessões | Emergência hardcoded | Fase 2: mover para env e rotacionar |
| R05 | P1 | RISCO | Schema | `exec_sql` dinâmico SECURITY DEFINER | `ensureRhTables.ts`, DHL, investimento, billing, OS analysis | DDL remoto se a função estiver GRANT para a API | Migração sem CLI | Fase 3: congelar novos callers; Fase 2 confirma GRANT no projeto TM SEG |
| R06 | P1 | RISCO | IA | Gemini generate sem login | `api/gemini/generate.ts` | Custo e uso da chave | Handler de teste que ficou | Fase 2: exigir principal |
| R07 | P1 | RISCO | Mapas | Geocode público e chave no fonte | `api/geocode-address.ts`, `lib/maps.ts` | Cota Google | Mesmo padrão do Gemini | Fase 2: restringir chave e rota |
| R08 | P1 | DÍVIDA | OS | Dois writers do valor oficial | modal financeiro e `server/routes.ts` / `recalculate-open` | Número da OS muda conforme quem salvou por último | Recálculo admin paralelo à auditoria | Fase 3: um escritor, com o override manual já existente |
| R09 | P1 | INCONSISTÊNCIA | Faturamento | Telas somam o motor; outras usam o canônico | `missionFinancialsCanonical.ts` cita divergência | Dashboard ≠ boletim | Falta de uma função de leitura | Fase 3: readers passam pelo canônico; não mudar a fórmula sem ordem |
| R10 | P1 | RISCO | Financeiro | Delete físico de fatura e título | `FinancialTransactionList.tsx`, importador, diálogo manual | Perda de trilha | UX de excluir | Fase 4 só com regra de negócio: cancelar em vez de apagar |
| R11 | P1 | RISCO | Asaas | Webhook 200 com erro | `api/asaas-webhook.ts` | Baixa perdida sem retry do Asaas | Evitar bloqueio do painel | Fase 4: persistir evento e responder conforme o contrato do Asaas, sem mudar a regra de baixa |
| R12 | P1 | RISCO | Deploy | 50 funções no `vercel.json` | contagem do JSON | Próxima função quebra o deploy | Limite da plataforma | Fase 1: não acrescentar chave em `functions` sem fundir rotas |
| R13 | P1 | RISCO | Git | `origin/dev` 31 commits atrás de `main`; branch local `dev` ausente | `git rev-list` | Trabalho em `dev` remota parte de outubro desatualizado. `publicar.ps1` não avança a `dev` | Merge só no sentido dev→main | Fase 1: fast-forward da `dev` até `main` quando o dono autorizar. Não é merge de feature |
| R14 | P1 | DÍVIDA | Banco | Três caminhos de schema | `migrations/`, `exec_sql`, scripts `apply-*` | Objeto live sem arquivo e arquivo sem live | Histórico Replit/Studio | Fase 3: inventário no projeto `ajhmmjuewdsukecaimik` com papel de leitura, sem aplicar |
| R15 | P1 | RISCO | WhatsApp | Webhook sem secret se env vazia | `api/whatsapp/webhook/inbound.ts` | Mensagem forjada | Secret opcional | Fase 2: fail-closed |
| R16 | P1 | DÍVIDA | Auth de API | Bearer “presente” vale como sessão | e-mail de missão, pedágio, reset request | Chamada sem usuário real | Helper `hasAuth` | Fase 2: `resolvePrincipal` |
| R17 | P2 | LEGADO | E-mail | Chave Resend na Edge de boas-vindas | `supabase/functions/send-welcome-email/index.ts` | Chave antiga no git | Função antiga | Fase 2: revogar no painel; não é o SMTP atual |
| R18 | P2 | DÍVIDA | DHL / preço | Código duplicado do mesmo motor | intake servidor vs lib; `motor-calculo-padrao` vs `lib/providerAutoPricing.ts` | Correção num lado só | Extração incompleta | Fase 5 ou 3: um módulo, sem mudar número |
| R19 | P2 | LEGADO | Stack | Drizzle, Netlify vazio, README AI Studio | `drizzle.config.ts`, `netlify.toml`, `README.md` | Alguém configura o banco errado | Template inicial | Fase 8: arquivar, não apagar nesta fase |
| R20 | P2 | RISCO | Diretoria | Autorização por nome de pessoa | `lib/diretoriaAccess.ts` | Troca de nome muda acesso | Decisão operacional | DECISÃO DE NEGÓCIO se o dono quiser manter; senão Fase 2 |
| R21 | P2 | INCONSISTÊNCIA | Fontes | Conector SQL desta sessão não é o banco do app | catálogo sem `missions`; app com `missions` | Próxima IA “corrige” a TORRES achando que é a TM SEG | MCP ligado ao outro projeto | Fase 1: rotular o conector no ambiente |
| R22 | P2 | DÍVIDA | Testes | 256 testes locais e zero GitHub Actions | pasta `.github` ausente | Regressão entra na `main` | CI nunca foi ligada | Fase 6: um workflow de `scripts/run-tests.sh` no escopo, não a suíte inteira de uma vez se ela exigir rede |
| R23 | P2 | DÍVIDA | Runtime | `engines` pede Node 24; esta sessão usou 22 | `package.json` vs `node -v` | Diferença de build | Imagem do agente | Fase 6: alinhar a imagem. Produção Vercel segue o projeto |
| R24 | P3 | LEGADO | SQL raiz | `database_setup.sql` e `fix_*.sql` vazios | tamanho 0 ou 3 bytes | Ruído | Tentativa abandonada | Fase 8 |
| R25 | P1 | RISCO | TORRES (conector) | `sync_os_pedagio_to_billing` EXECUTE para anon; policy aberta em `dhl_viatura_disponivel` | `has_function_privilege` e `pg_policies` | Escrita ou leitura ampla naquele projeto | Função exposta no schema public | Fase 2 no projeto certo, separado da TM SEG |
| R26 | P2 | DÍVIDA | TORRES | 70 tabelas com RLS e nenhuma policy; view sem `security_invoker`; `exec_sql` sem search_path | catálogo | API fechada de forma opaca; definer perigoso se o GRANT mudar | Crescimento sem policy | Fase 2 daquele projeto |
| R27 | — | DECISÃO DE NEGÓCIO | Comissão | Status permanece liberado depois do lançamento; pago é outro botão | relatório anterior e código de comissão | Operação em dois cliques | Regra pedida | Não “corrigir” na Fase 4 |
| R28 | — | DECISÃO DE NEGÓCIO | OS | Edição manual de valor vence o motor quando há motivo | `isIntentionalBillingOverride` | Recálculo não pode pisar | Auditoria | Preservar na Fase 3 |

Não há bug funcional novo provado nesta fase (nenhum cálculo foi reexecutado contra uma OS real). Os P0 são de exposição e de credencial, não de fórmula errada.

## Governança que já existe e deve ser preservada

- Não refatorar cálculo de OS, Asaas, eNotas/PlugNotas sem ordem explícita (`.cursorrules`).
- Integridade de conjunto: página com `.limit()` não é o universo (`AGENTS.md`).
- Publicar só no projeto Vercel `sistema-grupo-tm-seg`.
- Não remover `import React` de TSX que usa hooks.
- Testar antes de dizer que está pronto.

## Maturidade estimada

Régua desta fase, não nota de produto comercial:

| Eixo | Peso | Nota | Por quê |
| --- | --- | --- | --- |
| Operação no ar | 25% | 80 | Domínio oficial no ar, buildId = HEAD, health ok |
| Regras de negócio no código | 20% | 65 | Motor único de OS existe, mas há writers e leitores paralelos |
| Segurança de dados | 25% | 25 | Senha em texto e anon no financeiro |
| Governança de mudança | 15% | 35 | Sem CI, `dev` atrás, schema por três caminhos, 50/50 funções |
| Testes automatizados | 15% | 60 | Centenas de testes de domínio, sem pipeline e sem E2E de browser |

Índice ponderado: **52%**. Abaixo de um baseline seguro para corrigir produção em lote. Suficiente para planejar a Fase 1 e a Fase 2 com alvo fechado.
