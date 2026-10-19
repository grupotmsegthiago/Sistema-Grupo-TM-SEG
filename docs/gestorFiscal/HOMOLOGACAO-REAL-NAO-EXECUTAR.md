# NÃO EXECUTAR — proposta de esquema da homologação real

Este arquivo é só desenho. Não é migration. Não criar tabela, não alterar RLS, não rodar no Supabase e não publicar.

A fase 2 guarda decisão em memória. O lançamento financeiro original permanece intocado. Nenhuma decisão sobrescreve categoria, valor, pagamento, conta ou descrição.

## Tabelas futuras, ainda inexistentes

### gestor_fiscal_homologacao_decisao

Uma linha por versão. A versão anterior não é atualizada nem apagada.

| Campo | Papel |
|---|---|
| id | Identificador único da versão |
| lancamento_id | Id real do lançamento financeiro, só como referência |
| empresa_id | Empresa responsável, quando houver prova |
| cnpj | CNPJ dessa empresa, conferido no servidor |
| status | preparada, homologada, rejeitada, documentacao_solicitada, revogada |
| valor_centavos | Valor considerado, igual ao original no momento da decisão |
| classificacao | gerencial, contabil, tributaria, tributo, investimento, transferencia, custo_os, pendente |
| usuario_id | Identidade autenticada no servidor |
| decidido_em | Data e horário da decisão |
| justificativa | Texto obrigatório |
| referencia_documental | Prova usada. Vazio não homologa |
| versao | Número crescente por lançamento |
| decisao_anterior_id | Versão anterior, quando houver |
| origem_dados | De onde veio a leitura |
| chave_idempotencia | Única. A mesma chave devolve a mesma versão |
| evidencias | Lista do que sustentou a decisão |

### gestor_fiscal_homologacao_evento

Histórico imutável. Só entra linha nova. Não há update nem delete.

### gestor_fiscal_homologacao_tentativa

Tentativa recusada: usuário informado, origem, lançamento, código e horário. Não vira decisão.

## Regras previstas, sem aplicar

- Um lançamento só pode ter uma homologação vigente. Índice único parcial em `lancamento_id` onde o status vigente é homologada.
- A versão entra com compare-and-set. Se a versão esperada não for a atual, a escrita volta conflito e não grava.
- Revogação insere versão nova com status revogada. A versão antiga fica no histórico e sai do resultado.
- A chave de idempotência repetida não cria segunda linha. Conteúdo diferente na mesma chave é conflito.
- Antes de gravar, o serviço relê valor, status, categoria e conta do lançamento. Se o valor mudou, se está cancelado ou se o CNPJ continua ambíguo, a decisão para.
- A conta bancária não preenche o CNPJ.
- Fornecedor que já está no custo da OS não entra de novo.
- Despesa já reconhecida no painel, como os R$ 172,97, não entra de novo.
- O resultado gerencial futuro é receita canônica menos custo canônico da OS menos despesas gerenciais homologadas vigentes. Não é Lucro Real e não mexe no painel atual.
- A permissão futura `gestor-fiscal-homologar` será checada no servidor, para Diretoria, por empresa. Ela não existe hoje e este arquivo não a cria.
- RLS futura, quando um dia for escrita de verdade: Diretoria autorizada lê e insere; ninguém atualiza nem apaga evento. Isso não está aplicado.
- A flag `GESTOR_FISCAL_HOMOLOGACAO_REAL_ENABLED` precisa ser exatamente `true`. Sem ela, a escrita futura nem começa. A flag não substitui autenticação nem RLS.

## O que esta fase não faz

Não há `CREATE TABLE`. Não há policy. Não há endpoint. Não há botão ligado a esta proposta.
