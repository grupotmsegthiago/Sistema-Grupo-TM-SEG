# Estado atual — ler no início de cada sessão

Atualizado na Fase 1, em 2026-10-19. Este arquivo é a memória curta. O relatório longo é `RELATORIO_ULTIMA_EXECUCAO.md`.

| Campo | Valor |
| --- | --- |
| Última fase concluída | Fase 1 — governança, nesta branch, ainda sem push (a Fase 1 proibiu push) |
| Próxima fase autorizada | nenhuma. A Fase 2 não começa sozinha |
| Último commit de produção homologado | `c714a624f432e5a471b6347c4afc570382f6aedd` (PR #344, `main` = build publicado 3.7.65) |
| `origin/dev` | `766c9895079fd93342ad50ad28d52d13c0cfdddf`, 31 commits atrás da `main`, zero commits exclusivos |
| Working tree na abertura da Fase 1 | limpa, em cima do baseline `7a009601` |
| Supabase do app | `ajhmmjuewdsukecaimik`. OS = `missions` |
| Outro Postgres | modelo TORRES (`service_orders`, `escort_billings`). Ref no código: `erjhxwbutjyylxdthuuz`. O conector da Fase 0 caiu nesse modelo |
| Vercel | somente `sistema-grupo-tm-seg` |

## Decisões vigentes

- Motor de OS: `calculateMissionFinancials` em `lib/financialUtils.ts`. Não criar outro.
- Valor oficial da OS: colunas de `missions`. Override com motivo não é recalculado por cima.
- Tarifa vinculada (PR #344) está em produção. O rollback do PR #339 (PR #343) também está. Não reaplicar o #339 sem pedido novo.
- Asaas permanece no fluxo já existente. Boleto não é nota fiscal. NF viva: PlugNotas e, quando a fatura já marca, o provedor Asaas. eNotas não tem cliente ativo; não inventar um e não apagar o legado sem ordem.
- Troca de mês na comissão não lança conta a pagar. Lançamento da TORRES só no clique, no banco dela.
- Z-API é a integração de WhatsApp que está no ar (cron de 1 minuto, webhooks, envio na atualização da OS). Não está descontinuada no código. Não remover e não criar um segundo provedor até o proprietário dizer o contrário.
- A palavra publicar / deploy / colocar no ar continua sendo a autorização já escrita em `.cursorrules` e `.cursor/rules/publicar.mdc`. Deploy espontâneo segue proibido.

## Pendências

- Push desta governança: só com autorização explícita.
- Fast-forward da `dev` até a `main`: não foi pedido.
- Dono humano por domínio, além do proprietário do sistema: não designado. Não inventar nome.
- Policies do Postgres da TM SEG: não carregadas na Fase 0.
- P0 de segurança (senha em texto, anon no financeiro, ingest, token de logout): abertos. São a Fase 2, se for autorizada.

## Bloqueios

- Não operar o banco da TM SEG pelo conector que apontou para o modelo TORRES.
- Não usar `exec_sql` para criar objeto.
- Não acrescentar a 51ª chave em `vercel.json` `functions` sem fundir rota.
- Não limpar Z-API, Edge `zapi-webhook` nem envio de WhatsApp da OS até decisão explícita.
- Não presumir banco de homologação separado. Não há evidência de um terceiro Supabase.

## Regras que não se revogam sem ordem

Preservação de OS, financeiro, Asaas e NF (`.cursorrules`). Testar com evidência. Projeto Vercel oficial. Separação TM SEG / TORRES. Import React nos TSX com hooks. Integridade de conjunto (`.limit` não é o universo).
