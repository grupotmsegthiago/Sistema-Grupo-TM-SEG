# Estado atual — ler no início de cada sessão

Atualizado em 2026-10-19, na etapa 1 do Gestor Fiscal. Este arquivo é a memória curta. O relatório longo é `RELATORIO_ULTIMA_EXECUCAO.md`.

| Campo | Valor |
| --- | --- |
| Última fase concluída | Escolha da tabela pelo histórico aprovado, na `main` `bffd7f5c` |
| Próxima etapa | Gestor Fiscal, etapa 1. Correção da Fase 2 não autorizada |
| Produção agora | `bffd7f5cc4d828e432c8e73bd9d2bc094a5ee558` na `main`. Projeto `sistema-grupo-tm-seg`. Conferir `/api/version` após o deploy |
| `origin/dev` | `bffd7f5cc4d828e432c8e73bd9d2bc094a5ee558`, igual à `main` |
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
- WhatsApp Desktop: o computador preparado fica gravado no conector e no navegador. A reabertura do TM SEG identifica o dispositivo. Instalação, QR Code e teste não se repetem, salvo reautenticação do WhatsApp. Publicado na main `a24b1254`. Migrations da solicitação e do desktop seguem sem aplicação.
- Solicitação de escolta: texto ou print; agendada libera 2 fornecedores e os 2 próximos a cada 5 minutos. Confirmado abre a OS como Solicitada, com pendência. Sem o conector preparado, a tela pede o download do instalador e não mostra o formulário. Publicado na main `a24b1254` (PRs 350 e 351). A migration da solicitação segue sem aplicação.
- Auditoria de faturamento: o perfil Financeiro, ao clicar em Edição Total, edita os campos da OS aprovada. Prejuízo analisado e fatura paga continuam travados. Não publicado. Ficou fora da publicação do 351.
- Escolha de tabela: a auditoria lê o histórico aprovado do mesmo cliente, origem e destino. A tabela com mais aprovações nessa rota entra na frente; OS já faturada pesa mais, e a quilometragem parecida filtra antes. Se não houver histórico, o motor da OS segue. OS já aprovada, conferida ou com ajuste manual não é trocada. Publicada na `main` `bffd7f5c`.
- Instalador: Avançar instala Node.js, Python e WhatsApp quando faltam, e configura o conector. O download é `/instalador-grupo-tmseg.zip`, dentro da Solicitação. Publicado.
- Fast-forward da `dev` até a `main`: feito na publicação `bffd7f5c`. A `dev` não tinha commit exclusivo.
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
