# Estado atual — ler no início de cada sessão

Atualizado em 2026-10-19, na etapa 1 do Gestor Fiscal. Este arquivo é a memória curta. O relatório longo é `RELATORIO_ULTIMA_EXECUCAO.md`.

| Campo | Valor |
| --- | --- |
| Última fase concluída | Fase 1 — na `main` `7676ea63` e no ar (`/api/version` 3.7.65) |
| Próxima etapa | Gestor Fiscal, etapa 1, nesta branch. Correção da Fase 2 não autorizada |
| Produção agora | `7676ea63edcff02292c2374472f51fff4d138758`, health 200. Esta etapa não publicou |
| `origin/dev` | `766c9895079fd93342ad50ad28d52d13c0cfdddf`, 35 commits atrás da `main`, zero commits exclusivos |
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

## Versionamento

A PR #346 já está na `main` como `7676ea63`. O Gestor Fiscal está na branch local `cursor/gestor-fiscal-9d36`, sem push, sem merge e sem deploy. A `dev` não foi sincronizada.

## Pendências

- Gestor Fiscal: coluna de emissão de NF no fornecedor, alíquotas da contabilidade e atribuição de despesa/tributo por CNPJ. Sem migration.
- WhatsApp Desktop: o computador preparado fica gravado no conector e no navegador. A reabertura do TM SEG identifica o dispositivo. Instalação, QR Code e teste não se repetem, salvo reautenticação do WhatsApp. Ainda não publicado. Migrations da solicitação e do desktop seguem sem aplicação.
- Fast-forward da `dev` até a `main`: não foi pedido.
- Dono humano por domínio, além do proprietário do sistema: não designado. Não inventar nome.
- Policies do Postgres da TM SEG: não carregadas.
- P0 de segurança (senha em texto, anon no financeiro, ingest, token de logout): abertos. Não foram resolvidos nesta etapa.

## Bloqueios

- Não operar o banco da TM SEG pelo conector que apontou para o modelo TORRES.
- Não usar `exec_sql` para criar objeto.
- Não acrescentar a 51ª chave em `vercel.json` `functions` sem fundir rota.
- Não limpar Z-API, Edge `zapi-webhook` nem envio de WhatsApp da OS até decisão explícita.
- Não presumir banco de homologação separado. Não há evidência de um terceiro Supabase.

## Regras que não se revogam sem ordem

Preservação de OS, financeiro, Asaas e NF (`.cursorrules`). Testar com evidência. Projeto Vercel oficial. Separação TM SEG / TORRES. Import React nos TSX com hooks. Integridade de conjunto (`.limit` não é o universo).
