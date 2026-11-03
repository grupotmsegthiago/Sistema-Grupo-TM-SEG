# 17 — Validação documental da Fase 1

Sem alteração de lógica de negócio. Sete pedidos simulados, julgados só pelas regras instaladas. Em seguida, um verificador conferiu 49 âncoras nos arquivos. Resultado: 49 ok, 0 falhas. Log: execução local em 2026-10-19, saída `total 49 falhas 0`.

## Pedidos simulados

### Criar novo cálculo de OS

A constituição e `constituicao-tmseg.mdc` mandam usar `calculateMissionFinancials` e proíbem segundo motor. O protocolo exige achar writers (`MissionFinancialModal`, `server/routes.ts`, `api/recalculate-open.ts`) e parar: fórmula nova é mudança de comportamento e pede autorização específica. `motor-calculo-padrao/` não pode ser a implementação nova. Override e tabela vinculada (PR #344) permanecem.

### Alterar tabela de fornecedor

A fonte é `provider_cost_tables` com `lib/providerAutoPricing.ts`. Alterar faixa ou “regra de ouro” de horas é cálculo. A sessão tem de mapear quem lê (motor de OS, importadores, cotação) e pedir autorização da fórmula. Não se cria tabela paralela.

### Adicionar integração financeira

Asaas e PlugNotas já existem. A constituição proíbe integração duplicada e proíbe confundir boleto com NF. O caminho é estender o fluxo vigente ou parar e justificar por que ele não serve. `exec_sql` e o conector do projeto errado ficam fora. Passar de 50 funções na Vercel é bloqueio.

### Corrigir login

R01 está aberto de propósito. A regra manda não iniciar a Fase 2 sem ordem. Um “conserto” que mude `Login.tsx` ou a policy de `system_users` é comportamento e banco: para, descreve reprodução (anon lê `password`, comparação em texto) e espera autorização. Não se alarga grant para o login “voltar”.

### Criar novo módulo

Os nove passos do protocolo são obrigatórios. Sem fonte única, sem readers e sem impacto em OS/financeiro/TORRES/WhatsApp, o módulo não começa. Componente novo só com justificativa. Produção não entra no mesmo passo.

### Alterar comissão TORRES

Fonte dividida: `comissoes` na TM SEG e título no outro Supabase, escritor `contaPagarTorres.ts` só no clique. Selecionar mês não lança. É proibido alterar `service_orders` ou `escort_billings` como efeito de uma mudança da TM SEG. SQL só depois de confirmar o ref `erjhxwbutjyylxdthuuz`, em pedido separado.

### Publicar em produção

Sem a palavra publicar (ou deploy, colocar no ar, subir reunião), `publicar.mdc` não dispara. Com essa palavra, o fluxo antigo segue, sem segunda pergunta, no Vercel `sistema-grupo-tm-seg`, com `publicar.ps1`. Antes de sugerir a publicação, a regra de localhost continua. A `dev` 31 commits atrás tem de ser dita no relatório. `/api/version` e `/api/health` são a verificação. Esta simulação não publicou.

## O que o verificador provou

Arquivos novos contêm motor canônico, separação de bancos, proibição de `exec_sql`, gatilho de publicação preservado em `.cursorrules` e `publicar.mdc`, trava da reunião preservada, e frontmatter `alwaysApply` nas regras novas e na de localhost. Nenhum arquivo de `components/`, `lib/`, `server/`, `api/` ou `migrations/` entrou no diff.
