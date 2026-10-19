# 11 — Protocolo de migrations

Não há aplicação automática no `publicar.ps1` nem no boot da Vercel. Três caminhos já existem e não ganham um quarto:

- arquivos em `migrations/*.sql` (71) e `migrations/rollback/` (6);
- `exec_sql` chamado por RH, ponto, investimento, billing interno, OS analysis e DHL;
- `scripts/apply-billing-usage-migration.mjs`, `apply-account-balance-snapshots-migration.mjs`, `apply-gestao-investimento-migration.mjs`.

## Proibido

- Rodar qualquer um desses caminhos nesta ou em sessão futura sem autorização específica do arquivo SQL.
- Criar ou chamar `exec_sql` para objeto novo.
- `apply_migration` ou SQL de escrita “só para ver”.
- Usar o conector do projeto errado. Se o catálogo tiver `service_orders` e não tiver `missions`, não é a TM SEG.
- Amarrar migration nova a uma entrada extra em `vercel.json` `functions` se isso passar de 50 chaves.
- Migration que só existe para alargar permissão e destravar tela.

## Quando uma fase futura for autorizada a alterar schema

1. Baseline: SHA, projeto Supabase (ref), ambiente. Provar o ref com leitura, sem escrita. O app é `ajhmmjuewdsukecaimik`.
2. Um arquivo novo em `migrations/`, nome datado no padrão já usado `2026_MM_DD_descricao.sql`.
3. Rollback no mesmo change set, em `migrations/rollback/`, ou justificativa de por que o rollback é irreversível.
4. Não editar migration já aplicada.
5. Aplicar uma vez, no projeto confirmado, pelo meio que o proprietário indicar. Guardar a saída.
6. Não aplicar o mesmo arquivo na TORRES salvo pedido explícito com o ref `erjhxwbutjyylxdthuuz`.
7. Teste do domínio antes e depois. Sem DML de negócio misturado, salvo a fase dizer o contrário.

O núcleo `missions` / `system_users` não nasceu nos 71 arquivos. Ausência de `CREATE TABLE` no git não autoriza recriar a tabela.
