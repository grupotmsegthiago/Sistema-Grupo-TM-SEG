---
name: Boletim DHL — coluna AO (tabela aplicada, sem chute)
description: A coluna AO da planilha de medição só pode mostrar tabela realmente aplicada; senão linha vermelha
---

# Coluna AO (TABELA APLICADA) — tabela REAL do cadastro, nunca genérica global

Na planilha de medição DHL (fluxo "PREENCHER PLANILHA" / `handleFillDhlSheet`), a
coluna **AO = TABELA APLICADA** segue esta ORDEM de resolução (`usedTable`):

1. **Troca manual** no seletor do modal (ajuste mais novo que o snapshot,
   `adjNewer`) — prioridade ABSOLUTA, vence tudo (inclusive raio).
2. **RAIO declarado** (coluna E / `effectiveRaioKm > 0`): operação de DESTINO
   VARIÁVEL → `selectDhlClientTable` com `destination:''` (IGNORA rota nomeada),
   casa por **UF de origem + faixa** (Passo 2): `RAIO {UF} {band}` →
   `DISTRIBUIÇÃO {UF} {band}`, proximidade regional só como último recurso.
3. **NÃO-RAIO (ponta a ponta)**, `!isCancelledRow`: `selectDhlClientTable` com
   destino real. **Passo 1 = ROTA NOMEADA EXATA** (cidade origem+destino,
   independente da faixa — franquia = a da própria linha da rota). **Passo 2 =
   faixa por UF** (`ufSpecific`). Só aplica se `matchLevel==='exact_route'` OU
   `ufSpecific` (alta confiança); proximidade genérica NÃO entra aqui.
4. **Snapshot congelado / ajuste** da aprovação (`frozenTable`/`resolveLiveTable`).

Quando NENHUMA resolve, a linha INTEIRA fica **VERMELHA** (`noAppliedTable
= !usedTable`) para correção manual.

**Why:** REVERTE a decisão antiga de "AO sem motor de rota". A diretoria queria
o oposto do que se temia: a AO DEVE casar a tabela REAL do cadastro por rota
nomeada (ex.: GUARULHOS-SERRA 758KM) e por UF (RAIO SP 200KM, DISTRIBUIÇÃO MG
100KM). O que era proibido era inventar **tabela GENÉRICA GLOBAL** ("SUDESTE -
900KM", "SUL - 100KM") que NÃO existe no cadastro — esses eram do motor/snapshot
antigo. Tabela regional que EXISTE no cadastro (ex.: "NORTE - NORTE - 100KM")
como último recurso da proximidade é aceitável.

**How to apply:** o motor `selectDhlClientTable` (lib/dhlAutoTableSelector.ts)
faz Passo 1 (exact_route, ANTES da memória do auditor) e Passo 2 (UF-específico,
flag `ufSpecific`). RAIO ignora rota (destino vazio). Validado em 120 missões
DHL reais: cidade extraída 120/120, exact 35, UF 78, proximidade 4, none 0.
Continua válido: AO = `usedTable?.operation_type || ''` (nunca
`mission.operation_type`); `frozenTable.operation_type = info.name || ''`; a
proximidade genérica NÃO sobrescreve snapshot em OS não-raio (só exact/ufSpecific).

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
