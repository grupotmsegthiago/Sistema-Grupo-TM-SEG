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

**Armadilha do gatilho no frontend (MissionForm):** o backend já é genérico
(S.E. só se isDhl), mas a GERAÇÃO do link no `components/MissionForm.tsx` ficava
presa atrás de `isDhlClient` — fetch dos intakes, auto-geração ao salvar e o
painel "Links desta OS" com os botões. Resultado: nenhum link para não-DHL.
Regra: o gatilho/painel de geração vale para TODOS (auto-gera ao salvar quando
há `formData.provider`; painel aparece com `hasSavedOs`); só identidade DHL
(barras amarelas, título, Nº S.E./SM, deslocamento+print) fica em `isDhlClient`.

**Why:** evitar que fornecedor de cliente não-DHL receba identidade visual DHL,
peça Nº S.E. inexistente ou veja instruções técnicas DHL — e garantir que o link
seja gerado para qualquer cliente, não só DHL.

**How to apply:** ao adicionar qualquer elemento visual/texto novo nesse fluxo,
pergunte "isso é DHL?" — se sim, gate com isDhl. Cuidado com cores hardcoded
(#FFCC00, #fff3cd) em e-mails: use o accent derivado de isDhl, não literal.

**Armadilha do CSS (vazamento invisível):** o bloco `<style>` de `dhlTemplate`
emitia SEMPRE `.dhl-bar { background:#FFCC00 }` mesmo com isDhl=false — a cor da
DHL ficava no HTML de outros clientes (invisível, mas presente). Regras de CSS
com cor da DHL também precisam ser condicionadas a isDhl, não só os elementos que
as usam. Teste de regressão em `scripts/dhl-intake-isolation.test.ts` (roda com
`npx tsx --test`) asserta que o HTML não-DHL não contém #FFCC00, "Nº S.E.",
"S.E. DHL" nem IP/CNPJ/conta de espelhamento DHL; intercepta
`transporter.sendMail` (exportado de emailService) p/ não disparar SMTP.
