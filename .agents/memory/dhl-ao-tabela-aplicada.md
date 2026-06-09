---
name: Boletim DHL — coluna AO (tabela aplicada, sem chute)
description: A coluna AO da planilha de medição só pode mostrar tabela realmente aplicada; senão linha vermelha
---

# Coluna AO (TABELA APLICADA) — nunca chutar

Na planilha de medição DHL (fluxo "PREENCHER PLANILHA" / `handleFillSheet`), a
coluna **AO = TABELA APLICADA** só pode refletir uma tabela **realmente aplicada
na OS**:

1. Troca manual no seletor do modal (ajuste, `adjInfo`).
2. RAIO declarado (coluna E) — `selectDhlClientTable` pelo raio.
3. Snapshot congelado da aprovação (`frozenTable`/`resolveLiveTable` do snapInfo).

Quando NENHUMA dessas resolve, a linha INTEIRA fica **VERMELHA** (`noAppliedTable
= !usedTable`) para correção manual.

**Why:** a diretoria viu a AO preenchida "atoa" com tabelas chutadas (ex.:
SUL - 100KM, SUDESTE - 900KM) para OS sem tabela aplicada. Isso vinha de DOIS
fallbacks de adivinhação que foram REMOVIDOS: o motor de seleção por rota/KM
(`selectDhlClientTable` pelo km rodado) e o fallback financeiro
(`calculateMissionFinancials`). Prefere-se linha vermelha a um valor errado.

**How to apply:** NÃO reintroduzir seleção por rota/KM nem fallback financeiro
para a AO. AO = `usedTable?.operation_type || ''` (nunca `mission.operation_type`).
O rótulo do snapshot sintético também não pode cair em `mission.operation_type`
(`frozenTable.operation_type = info.name || ''`). RAIO continua válido porque é
declarado, não chutado. `descricao` pode manter fallback de operation_type (a
linha fica vermelha de qualquer forma).

## Linha MESTRE (__AUTO_MASTER__) nunca vai pra AO

O cliente DHL SUPPLY CHAIN (BRAZIL) LTDA tem linhas
`__AUTO_MASTER__ {REGIÃO}` em **client_price_tables** (cliente=DHL). Elas são
só o GATILHO do motor de preço automático do cliente — NÃO são tabela de
faturamento. Como têm `client=DHL`, passam pelo filtro e um ajuste/snapshot
antigo pode apontar pra elas, vazando "__AUTO_MASTER__ SUDESTE" na coluna AO.

**Why:** a diretoria viu a AO com tabela mestre/genérica e achou que era
tabela da TORRES (fornecedor). TORRES fica em `provider_cost_tables`
(nomes "100KM"/"200KM") e NUNCA é lida no caminho da AO — o que vazava era a
MESTRE do próprio cliente DHL.

**How to apply:** guard `isMasterOp(op) = /^__AUTO_MASTER__/i` em
`handleFillSheet`: `resolveLiveTable` ignora mestre (por id e por nome);
`frozenTable` retorna null se o snapshot congelou a mestre; rede de segurança
final zera `usedTable` se ainda for mestre. Resultado: cai no motor de raio
(tabela nomeada) ou em linha vermelha. NÃO casar nomes legítimos
("SUDESTE - ... 100KM", "NÍVEL BRASIL - ...") — o regex só pega o prefixo.
