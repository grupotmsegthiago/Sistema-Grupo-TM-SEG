# RELATÓRIO DA ÚLTIMA EXECUÇÃO

Etapa: Gestor Fiscal, primeira entrega
Data: 2026-10-19
Branch: `cursor/gestor-fiscal-9d36`
Base: `main` `7676ea63edcff02292c2374472f51fff4d138758`
Produção: o mesmo SHA, versão 3.7.65, `/api/health` 200. Nada desta etapa foi publicado.

Sem migration, sem RLS, sem mudança de login, sem escrita no banco, sem TORRES, sem merge, sem push.

## 1. O que foi construído

Tela Diretoria → Gestor Fiscal, com visão geral, Simples × Lucro Real, reajuste de fornecedor, reajuste de cliente, notas, histórico mensal e termômetro.

O simulador fica em `lib/gestorFiscal/`. Ele não recalcula OS. Receita e custo passam por `computeCanonicalRevenueCost`. A leitura em `lib/gestorFiscal/carregarFontes.ts` não insere, não atualiza e não chama `recalculate-open`.

Alíquotas são premissas editáveis. A do Simples começa vazia. Não há 27% fixo. Crédito tributário só entra se for marcado e houver NF válida de quem emite nota.

No cadastro do fornecedor, o campo “Emite nota fiscal?” aparece desabilitado e não entra no payload. A coluna prevista está em `docs/governanca/20-GESTOR-FISCAL-ETAPA-1.md`.

Acesso: perfil Diretoria que já vê Faturamento, ou que tenha a permissão nova. Administrador, Financeiro, Avançado e cliente do portal ficam de fora.

## 2. O que foi testado

`npx tsx --test scripts/gestor-fiscal.test.ts`: 14 testes, 0 falhas.

A conferência das regras, ainda com números fictícios, confirma: no teto do fornecedor a margem fica em pelo menos 30% e o lucro do Lucro Real não fica abaixo do Simples; o centavo seguinte fura uma das duas. O reajuste de 40% é outra conta. O aumento de preço para preservar o lucro só aparece quando o Lucro Real fica abaixo do Simples. Receita de outro CNPJ e despesa ou tributo sem emissora ficam fora da soma, com o valor mostrado.

Cobriu fornecedor com e sem NF, reajuste que melhora, mantém e reduz o lucro, margem abaixo de 30%, cliente que precisa de reajuste para 40%, ausência de despesa e de documento, OS estimada fora da base, duplicata de despesa e de fatura, e CNPJs que não se misturam.

Também passaram os testes de acesso da Diretoria e do perfil Avançado. O teste antigo `fallback escolhe primeira tela liberada` em `scripts/screen-access.test.ts` falha com `controle-diario` no lugar de `quotes`. Isso já acontece com a regra atual do Controle Diário, que abre para usuário interno antes das telas do perfil. Não foi alterado aqui.

O Vite concluiu o bundle do frontend (3035 módulos), incluindo a tela nova. O passo seguinte do `npm run build`, `npx esbuild` dos bundles DHL, quebrou neste ambiente com `Class extends value undefined is not a constructor or null`. O esbuild local gerou o bundle DHL de HTML em 6 ms. O script de build não foi modificado.

Prévia visual do laboratório, com faixa de valores fictícios: `/opt/cursor/artifacts/gestor-fiscal-laboratorio.png`. A rota logada não foi aberta. Não há sessão e o login não foi alterado para furar a porta.

## 3. O que permanece pendente

- Coluna `providers.emite_nota_fiscal`. Não criada.
- Alíquotas, ISS, créditos e compensação confirmados pela contabilidade.
- Despesa e tributo lançados sem empresa emissora. Ficam de fora da soma de propósito.
- NF de fornecedor no título não tem o CNPJ da TM SEG. Aparece na empresa que usa o fornecedor e não entra no custo.
- Leitura ao vivo com um usuário Diretoria.
- P0 da Fase 2: senha em texto, leitura anônima, ingest de comissão e token de logout. Continuam abertos.
- Fast-forward da `dev`.

Conclusão desta etapa: a parte que não depende da contabilidade foi conferida no código. As alíquotas oficiais e a homologação com operação real continuam pendentes. A coluna de NF está só preparada, sem execução. Cerca de 75% segue sendo a estimativa da etapa inteira, não uma garantia de tributo oficial.

## 4. Riscos

- Publicar ou dar push nesta branch abre deploy de preview na Vercel. Por isso o commit fica local até ordem de envio.
- A tela lê as mesmas fontes que o financeiro já lê. Não cria permissão nova no Supabase e também não fecha as que estão abertas.
- Tratar o lucro do Lucro Real como tributo devido da empresa. A faixa da tela diz que é simulação.
- Rateio de despesa fixa por cliente não foi inventado. O card consolidado inclui a despesa; a lista por cliente, não.
- `vercel.json` segue no limite de 50 funções. Esta etapa não criou função.

## 5. O que depende de autorização

- Enviar a branch ao GitHub.
- Merge ou publicação.
- Migration da coluna de NF do fornecedor.
- Alíquotas e regra de crédito da contabilidade.
- Qualquer correção de RLS, grant, login ou senha.
- Sincronizar a `dev`.

## Rollback

Reverter o commit desta branch. Produção permanece em `7676ea63`. Não há objeto de banco para desfazer.

## Veredito

GESTOR FISCAL ETAPA 1 NA BRANCH LOCAL
NADA PUBLICADO
FASE 2 NÃO CORRIGIDA
