# 20 — Gestor Fiscal, etapa 1

Branch `cursor/gestor-fiscal-9d36`, em cima da `main` `7676ea63`. Sem migration, sem RLS, sem login novo, sem TORRES, sem publicação.

## O que a tela faz

Diretoria → Gestor Fiscal (`gestor-fiscal`). Quem já tem perfil Diretoria e a tela de Faturamento enxerga o item. Administrador, Financeiro, Avançado e portal do cliente não entram.

Sete blocos: visão geral, Simples × Lucro Real, reajuste de fornecedor, reajuste de cliente, notas, histórico mensal e termômetro. Filtro por mês, período, cliente, fornecedor, região e uma empresa por vez. CNPJs não são somados.

O modo laboratório usa empresa fictícia e deixa isso escrito na faixa. O modo leitura só mostra número depois que uma empresa é escolhida.

## Fontes reutilizadas

| Pergunta | Fonte | O que não entra |
| --- | --- | --- |
| Receita e custo da OS | `missions` via `computeCanonicalRevenueCost` | Segundo motor; `recalculate-open` (ele grava) |
| Empresa | `clients.issuer_company`, a mesma lista do cadastro de cliente | CNPJ vazio jogado na TM GESTÃO |
| Despesa | `financial_transactions` que não é fornecedor e não é imposto | Conta a pagar do fornecedor, para não somar o custo da OS duas vezes |
| Tributo pago ou pendente | categoria com tag `IMPOSTO` ou nome de imposto/tributo | Abatimento automático do tributo calculado |
| NF de cliente | `financial_invoices` | Nova tabela de nota |
| NF de fornecedor | `doc_nf_status` do título | Crédito tributário automático |

OS estimada ou sem validação fica de fora da base até alguém marcar a opção, e o período continua incompleto. Duplicata de despesa ou de fatura sai da soma e aparece na lista. Histórico anterior a 2026-01-01 é cortado.

## Campo do fornecedor — previsto, não gravado

No cadastro, “Emite nota fiscal?” aparece desabilitado, em Não informado. O `payload` de gravação não leva o campo.

Quando houver autorização de banco, a coluna prevista é `providers.emite_nota_fiscal`, texto `sim`, `nao` ou `nao_informado`, default `nao_informado`. Não há arquivo em `migrations/` de propósito.

Até lá, a escolha vive só na simulação da tela.

## Fórmulas

Margem operacional = (receita − custo do fornecedor − despesa operacional) / receita. Mínimo 30%. Meta 40%.

Simples = receita × alíquota digitada. Sem alíquota, o tributo não é calculado. Não existe 27% fixo.

Lucro Real, por mês: PIS e COFINS sobre a receita; ISS e outras alíquotas começam em zero; IRPJ 15%, adicional 10% acima de R$ 20.000 no mês, CSLL 9%. Tudo editável. Prejuízo no mês não gera imposto negativo.

Crédito de PIS/COFINS só se a simulação marcar o fornecedor, ele estiver como “emite NF” e o documento do recorte for válido. Despesa e NF sozinhas não viram crédito.

Teto do fornecedor = maior aumento de custo que, no Lucro Real, ainda segura a margem mínima e o lucro líquido de referência do Simples. O aumento reparte entre os meses na proporção do custo.

Reajuste do cliente para 40% = (custo + despesa do recorte) / 0,60 − receita. Na lista por cliente, a despesa fixa não é rateada. Isso está escrito na tela.

Tributo compensado é número digitado. O banco não tem essa coluna.

## Rollback

Apagar o commit desta branch. Produção continua em `7676ea63`. Não há objeto de banco para reverter.

## Conclusão desta etapa

Cerca de 75% da etapa 1. Falta a coluna no cadastro, a atribuição contábil de despesa e tributo por CNPJ, e as alíquotas reais. A leitura ao vivo não foi exercida com sessão de Diretoria; os cenários controlados rodaram no laboratório e nos testes.
