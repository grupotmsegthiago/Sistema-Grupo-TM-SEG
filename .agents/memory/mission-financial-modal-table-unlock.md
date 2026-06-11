---
name: MissionFinancialModal table selector unlock
description: Why unlocking a price/cost table selector needs 3 coordinated changes, not just the disabled prop
---

# Destravar seletor de tabela (cliente/fornecedor) no MissionFinancialModal

Para liberar um dos dois seletores de tabela (TABELA DE PREÇO do cliente / TABELA
DE CUSTO do fornecedor) para um grupo, mexer só no `disabled` do FilterableSelect
NÃO basta — o campo fica "visualmente aberto" mas inoperante. São 3 pontos por
seletor que precisam concordar:

1. O `disabled` do FilterableSelect (e, no fornecedor, o `providerSelectorDisabled`).
2. O guard no início do respectivo `handleChange` (faz `return` cedo se travado).
3. As **opções** (`options`) — se forem montadas vazias sob alguma trava
   (ex.: `mission.is_same_os` no fornecedor), destravar não adianta.

**Why:** Houve uma rodada de review reprovada porque o `disabled` foi liberado mas
os guards de `handleChange` continuavam bloqueando a troca.

## "Só abrir o campo, sem regravar"
Quando o requisito é apenas abrir o campo numa OS travada (salva/aprovada) sem
recalcular/regravar, lembrar que ambos `handleChange` têm side-effects de escrita
imediata no banco ao trocar a tabela: limpam `billing_verified_by`/`*_edit_reason`
em `missions`, e o do cliente ainda insere `DHL_TABLE_CORRECTION` em `system_logs`.
Todos esses precisam ser suprimidos no caso travado+grupo, deixando a troca só em
estado local até o Salvar/Aprovar explícito. Snapshots de OS aprovadas são
imutáveis e protegidos no fluxo de salvar/aprovar (ver replit.md).

## Grupo de auditoria
A "mesma equipe" recorrente (Thiago Moreira, Simone, Barbara + diretoria/admin) já
existe como `canOverrideAutoProvider`. Usar nome completo "thiago moreira" (não só
"thiago") para não pegar o comercial Thiago Arruda.

## Escopo: is_same_os é separado
A trava `mission.is_same_os` (missões "mesma OS" têm custo 0 por design) é regra
estrutural, NÃO é o lock "depois de salva". Não confundir os dois; só a EDIÇÃO
TOTAL contorna is_same_os.

## Número grande precisa acompanhar a troca de tabela
Destravar o seletor (`canEditTablesEvenIfLocked`) e bloquear o autofill por
`isEffectivelyLocked` são critérios DESALINHADOS: o campo abre mas o número
grande (VALOR FINAL) e o breakdown ficam presos -> "trocou a tabela e nada
mudou". A regra: onde o autofill/recálculo gateia por `!isEffectivelyLocked`,
trocar por um derivado `lockAllowsRecalc = !isEffectivelyLocked ||
canEditTablesEvenIfLocked || fullEditMode`. Pontos que precisam concordar: o
efeito de autofill do número grande (cliente E fornecedor), o caso especial
CEVA/Logitech, e o efeito que reseta `dbValuesLoadedRef`/`userManuallyEditedRef`
ao mudar tabela (early-return passa a usar `!lockAllowsRecalc`).
**Why:** o recálculo é SÓ na tela (estado React) — trocar tabela em OS travada
NUNCA grava no banco; persistência segue exclusiva do Salvar/Aprovar. O guard
`userManuallyEditedRef` (setado no load quando há `*_edit_reason`/
`billing_verified_by`) é o que preserva o override da diretoria ao só visualizar;
ao trocar a tabela de propósito o `handleChange` reseta esse ref.
