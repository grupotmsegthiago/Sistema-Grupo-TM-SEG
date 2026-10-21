# RELATÓRIO DA ÚLTIMA EXECUÇÃO

Fase: portal do cliente no modelo da IBL, com solicitação de escolta sem preço
Data: 2026-10-21
SHA da sessão: `dev` em `9282635c` antes desta alteração, working tree suja, sem commit
SHA de produção (/api/version): não consultado. Não houve publicação.

1. Objetivo e escopo
Ligar portal para qualquer cliente a partir do cadastro, copiando a IBL. A CEVA permanece na página própria. O cliente pede escolta armada ou pronta resposta, informa caracterizada ou velada, origem, destino e os dados da viagem. A OS nasce Solicitada, sem preço. Sai e-mail e alerta interno para buscar fornecedor.

2. Baseline
Branch `dev`, alinhada com `origin/dev` em `9282635c` antes dos arquivos novos. Supabase do app `ajhmmjuewdsukecaimik`. Nenhum SQL foi executado.

3. Arquivos alterados
- `lib/portalCliente/slug.ts`, `pedido.ts`, `marcaSite.ts`, `marcaSiteHttp.ts`, `registrarOs.ts`
- `lib/cevaPortal/portalServidor.ts`, `httpHandler.ts`, `cadastroSistema.ts`, `exportarControle.ts`
- `lib/portalEscolta/marca.ts`
- `components/CevaPortal.tsx`, `ceva/SolicitarEscolta.tsx`, `ceva/portalMarca.tsx`, `ceva/LogoCeva.tsx`, `ceva/PessoasCeva.tsx`
- `components/PortalClientePagina.tsx`, `AlertaSolicitacaoPortal.tsx`, `VisualizacaoPortalProcesso.tsx`, `ceva/ListaCatalogo.tsx`, `ClientForm.tsx`, `UserForm.tsx`
- `App.tsx`, `api/ibl-portal.ts`, `server/iblPortal.ts`, `server/routes.ts`, `server/portalClienteAcesso.ts`
- `vercel.json` (só rewrites; `functions` continua com 50 chaves)
- `migrations/2026_10_21_portal_cliente.sql`
- `scripts/portal-cliente.test.ts`
- `docs/governanca/ESTADO-ATUAL.md`, `RELATORIO_ULTIMA_EXECUCAO.md`

4. Regras preservadas
Motor de OS, Asaas, NF, TORRES, comissão e WhatsApp de fornecedor não foram alterados. A solicitação não calcula preço e não dispara a fila de WhatsApp. O valor no portal continua “Aguardando validação” até `billing_approved`.

5. Banco
Nenhum comando executado. A migration está só no arquivo. TORRES não foi tocado.

6. Riscos e rollback
Sem a migration, página nova não abre e o cadastro avisa. CEVA e IBL seguem nas tabelas atuais. Rollback: descartar a working tree. OS já criada por um teste manual, se houver, fica em `missions` com status Solicitada.

7. Testes executados
`npx tsx --test scripts/portal-cliente.test.ts scripts/ibl-portal.test.ts scripts/ceva-portal-ajustes.test.ts scripts/ceva-portal-acesso.test.ts` — 21 passaram.
`npm run build` — terminou sem erro. O bundle `api/_ceva-portal-core.cjs` exporta `handleClientePortalHttp`.
`GET http://localhost:5000/api/health` — `{"status":"ok"}`.
`GET http://localhost:5000/ceva` — HTTP 200.
`GET /api/cliente-portal/marca` com slug `ceslog` — HTTP 503 `O cadastro do portal ainda não está no banco.` A service role local não está no ambiente; a coluna `portal_slug` também não existe até o SQL.

8. Homologação
Servidor em `http://localhost:5000/`. Não entrei no portal com usuário de cliente, então o formulário Solicitar não foi exercido na tela logada. Não publiquei.
Visualização do fluxo em `http://localhost:5005/`: HTTP 200, formulário IBL na raiz e campos exclusivos da CEVA ao trocar o modelo. O envio nessa página não grava OS.
Data e hora: o calendário nativo (mês em inglês e AM/PM) saiu. Em `http://localhost:5005/` o calendário abre em português, o dia 22/10/2026 foi escolhido e a hora 08 (00 a 23) com minuto 30 ficou no cartão. Nada gravado.

9. Autorização recebida
Pedido do Thiago em 21/10/2026, com as decisões: empresa liga a página e o usuário ganha o acesso; slug pelo nome fantasia; OS Solicitada com alerta e sem WhatsApp automático de fornecedor; e-mail para operacional@grupotmseg.com.br e e-mails operacionais do cliente; texto “Aguardando validação”; origem e destino no Google; site tenta ler logo e cor; formulário na CEVA, na IBL e nos clientes novos.

10. Pendências
Aplicar `migrations/2026_10_21_portal_cliente.sql` no Supabase da TM SEG, com autorização. Sem isso o slug novo não grava.

11. Próxima fase autorizada
Nenhuma além desta. Gestor Fiscal segue pendente e não foi mexido.

12. BLOCO PARA CONTINUAÇÃO
Portal genérico reusa `api/ibl-portal` com header `x-portal-slug`. Não criar function nova no `vercel.json`. Preço não entra no POST. A OS usa `current_location` começando com `Solicitação do portal` para o alerta interno.
O cliente da OS é o nome oficial de `clients.name` carregado na hora do pedido. CEVA: `CEVA LOGISTICS LTDA`. IBL: `INTERMODAL BRASIL LOGISTICA S.A.`. Portal por slug: o nome daquele cliente. Não criar outro campo de cliente.

VEREDITO: código e testes locais passaram. A tela logada do portal e o banco novo não foram exercidos. Não está publicado.

13. Continuação de 21/10/2026 — barra e etapas
O formulário parava no veículo sem explicar o motivo: a operação vazia (e, antes, o controle interno) segurava a etapa seguinte. O controle interno voltou a ser opcional. A operação continua obrigatória. Com o veículo escolhido e a operação vazia, a tela diz “Para seguir, falta a operação. O veículo já entrou.” A coluna esquerda marca Concluída, Agora e Pendente. A barra do topo enche em azul conforme o percentual. Teste de render `scripts/portal-solicitar-etapas.test.tsx` e `scripts/portal-cliente.test.ts` (controle interno vazio aceito). Não publicado.
O aviso da etapa diz qual dado falta e que a próxima etapa fica fechada. No localhost, falha ao gravar a lista não trava: o nome entra na solicitação. Em produção a lista continua obrigatória para gravar o catálogo.
