---
name: Supplier intake generalization (DHL → all clients)
description: The public supplier-intake link (/fornecedor/dhl) serves ALL clients; DHL-only bits must stay behind isDhl.
---

O "DHL Supplier Intake" (link público de cadastro de fornecedor, rota
`/fornecedor/dhl?token=`) NÃO é mais exclusivo da DHL — atende qualquer cliente.
Tabelas, rotas e funções continuam com prefixo `dhl*` por compatibilidade; não
renomear.

**Regra:** tudo que é identidade/exigência DHL fica atrás de
`isDhl = isDhlMission(mission.client)`:
- Identidade amarela (#FFCC00, barras topo, highlight amarelo) → só DHL; demais
  usam tema neutro TM SEG (vermelho/preto).
- Nº S.E. (exigido na geração + exibido) → só DHL.
- Instruções técnicas de espelhamento por tecnologia (`findDhlMirrorRule`,
  `dhlTechBlocksHtml`) → só DHL; demais recebem instrução genérica.
- Comprovante de espelhamento (print) → OBRIGATÓRIO para TODOS.

**Where:** backend `server/dhlSupplierIntake.ts` computa isDhl em geração,
email de intake, reminder worker (email+WhatsApp), GET público (devolve `isDhl`
no JSON) e submit. `server/emailService.ts` — `dhlTemplate(content, isDhl)` e as
funções `sendDhlSupplierIntakeEmail` / `sendDhlIntakeSubmittedEmail` /
`sendDhlIntakeReminderProviderEmail` aceitam `isDhl` (default `true` para
preservar chamadas legadas). Frontend `components/DhlSupplierIntake.tsx` lê
`j.isDhl` e passa `isDhl` para `VeiculoForm`.

**Why:** evitar que fornecedor de cliente não-DHL receba identidade visual DHL,
peça Nº S.E. inexistente ou veja instruções técnicas DHL.

**How to apply:** ao adicionar qualquer elemento visual/texto novo nesse fluxo,
pergunte "isso é DHL?" — se sim, gate com isDhl. Cuidado com cores hardcoded
(#FFCC00, #fff3cd) em e-mails: use o accent derivado de isDhl, não literal.
