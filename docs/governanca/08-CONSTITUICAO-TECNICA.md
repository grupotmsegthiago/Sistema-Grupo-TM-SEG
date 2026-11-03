# 08 — Constituição técnica

Vigente a partir da Fase 1 (2026-10-19). Complementa `.cursorrules`, `AGENTS.md` e as regras já existentes em `.cursor/rules/`. Não as substitui. Onde houver tensão, vale o registro em `16-REGRAS-CURSOR.md`.

## Artigo 1 — Preservação

É proibido apagar ou substituir funcionalidade sem autorização explícita do proprietário. Comentário explicativo do código original permanece. Diff mínimo. Dúvida interrompe a alteração.

## Artigo 2 — Cálculo

É proibido modificar cálculo financeiro, de OS, de pedágio, de comissão ou de NF sem aprovação específica dessa fórmula. É proibido criar um segundo motor para regra que já tem implementação canônica. O motor de OS é `calculateMissionFinancials` (`lib/financialUtils.ts`). O custo automático de fornecedor é `lib/providerAutoPricing.ts`. A leitura que prefere valor já gravado é `computeCanonicalRevenueCost` (`lib/missionFinancialsCanonical.ts`). A pasta `motor-calculo-padrao/` não é um segundo motor de produção.

Valor aprovado ou faturado não é recalculado em silêncio. Override manual autorizado (`isIntentionalBillingOverride` e motivo de edição) não é pisado por recálculo. Snapshot, histórico e aprovação permanecem.

Franquia, KM, hora, pedágio, excedente e regra contratual saem da tabela vinculada ao cliente ou ao fornecedor (decisão em produção no PR #344). Não hardcodar tarifa nova ao lado dessa tabela.

**Padrão Temporal Oficial:** Todas as datas e horários exibidos no portal, relatórios, PDFs e persistidos no banco devem operar sob o fuso horário oficial `America/Sao_Paulo` (Horário de Brasília). É obrigatório o formato de 24 horas (`HH:mm`, ex.: 14:30), sendo expressamente vedado o uso do formato AM/PM. Datas devem sempre seguir o formato brasileiro `DD/MM/AAAA`.

## Artigo 3 — Uma fonte

Antes de tabela, RPC, rota ou integração nova, a sessão procura a fonte única e registra por que a existente não serve. Writers paralelos já conhecidos (browser e service role em `missions`) não são “corrigidos” por um terceiro escritor. A Fase 3 é que escolhe o escritor único, se for autorizada.

## Artigo 4 — Banco

É proibido alterar o banco por conveniência. É proibido executar migration automaticamente, no deploy ou no boot. É proibido `exec_sql` para criar objeto improvisado. É proibido alargar policy, grant ou papel para fazer um erro desaparecer. O projeto do app é `ajhmmjuewdsukecaimik`. Comando SQL da TM SEG não sai do conector de outro projeto. Comando no modelo `service_orders` / `escort_billings` é TORRES e não segue no mesmo script da TM SEG.

Não há evidência de banco de homologação separado. Tratar leitura e escrita como produção até o proprietário apontar outro projeto.

## Artigo 5 — Produção

A sequência é desenvolvimento, teste, homologação local, autorização, merge, publicação, verificação. Merge e deploy sem autorização são proibidos.

Autorização de publicação já instalada: o proprietário pedir publicar, publicar o site, publicar o sistema, subir para produção, atualizar o site, atualizar o sistema, deploy ou colocar no ar. Nesse caso valem `.cursorrules` e `.cursor/rules/publicar.mdc`, inclusive executar `publicar.ps1` sem uma segunda pergunta. Fora dessas palavras, não publicar.

Publicação só no Vercel `sistema-grupo-tm-seg`. A `dev` remota está atrás da `main`; não usá-la como base sem avanço direto até a `main`, e esse avanço só com pedido.

## Artigo 6 — Projetos

Uma alteração não mistura TM SEG e TORRES, nem o projeto Vercel `workspace`. Não alterar o sistema TORRES como efeito colateral de mudança na TM SEG.

## Artigo 7 — Evidência

Teste que não foi executado não é teste que passou. Build verde não encerra a tarefa. Entrega diz o que rodou, o que passou e o que faltou.

## Artigo 8 — Ordem antes de criar

1. Objetivo de negócio.
2. Implementação existente.
3. Fonte única da verdade.
4. Writers e readers.
5. Testes e dependências.
6. Impacto nos outros módulos.
7. Reutilizar ou estender.
8. Justificar componente novo.
9. Parar e pedir autorização se mudar comportamento, banco ou produção.

Atalho paralelo é proibido.

## Artigo 9 — Protocolo de cada mudança

Baseline git e ambiente; objetivo e escopo; arquivos; regras preservadas; impacto no banco; riscos; backup e rollback; testes antes e depois; gate; autorização; relatório no modelo `15-MODELO-RELATORIO-EXECUCAO.md`. Bug inclui reprodução e regressão quando for viável. Ao fim, atualizar `ESTADO-ATUAL.md` e `RELATORIO_ULTIMA_EXECUCAO.md`.

## Artigo 10 — Domínios protegidos

Operação e OS: franquias e contrato por cliente e fornecedor; KM, horas, pedágio e excedente; override; sincronismo OS, boletim, faturamento e relatório; histórico, aprovação e snapshot.

Financeiro: título em `financial_transactions`; fatura em `financial_invoices`; vínculo em `financial_invoice_missions`. Auditoria e rastreabilidade acompanham qualquer mudança de valor.

Asaas: fluxo já homologado de cobrança, boleto, PIX, transferência e webhook. Não ampliar. Não tratar boleto como nota fiscal.

Nota fiscal: fluxo atual em PlugNotas e no provedor já gravado na fatura. Não criar integração nova sem avaliar a atual. Não reabrir eNotas/Focus como se fossem o emissor vivo.

TORRES: outro banco. Comissão e conta a pagar somente no caminho já autorizado (`lib/comissao/contaPagarTorres.ts` e ingest). Selecionar mês não lança título. Status liberado depois do lançamento, e pago só no botão de pagar, é decisão de negócio vigente.

WhatsApp: a integração presente é Z-API. Ela não está descontinuada no repositório. Proibido removê-la e proibido criar outro provedor sem ordem. Superfície compartilhada que uma limpeza futura teria de inventariar antes: cron `/api/cron/zapi`, webhooks, `whatsapp_instances`, envio na atualização da OS, reconexão e a Edge `zapi-webhook`.

## Artigo 11 — Continuidade

Toda sessão começa por `docs/governanca/ESTADO-ATUAL.md`. A Fase 2 não começa por inércia.
