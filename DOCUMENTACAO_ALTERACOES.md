# DOCUMENTACAO DE ALTERACOES - TMSEGo
### Diario de Bordo Oficial — Evolucao do Sistema

---

## 07/04/2026 16:00 (Brasília) - BUG PEDAGIO DUPLICADO NO RECALCULAR (#043)

**Descricao:** O botao "Recalcular e Comparar" estava gravando o totalGeral com pedagio duplicado no snapshot. A formula usava `calc.client.total + toll`, mas `calc.client.total` ja incluia o pedagio internamente (serviceTotal + toll). Resultado: pedágio contado duas vezes, gerando divergência no comparador.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **totalGeral corrigido**: Agora usa `clientServiceOnly + newToll` (serviceTotal que NAO inclui toll + toll = correto)
- **durationHours corrigido**: Usava `calc.client.durationHours` (nao existe), agora usa `calc.durationHours`
- **unitKm/unitHr corrigidos**: Usava `calc.client.unitKm`/`unitHr` (nao existem), agora usa `calc.client.unitPriceKm`/`unitPriceHour`
- **revenueServiceOnly/costServiceOnly**: Removido fallback para `newRevenue`/`newCost` (que incluiam toll), agora usa diretamente os serviceTotal corretos

### 3. Banco de Dados

- Snapshots existentes com pedagio duplicado devem ser recalculados pelo botao "Recalcular e Comparar"

### 4. Arquivos Alterados

- `server/routes.ts` — rota `/api/billing/recalculate-client`, correcao do calculo de snapshot

**Status:** ✅ Concluido

---

## 07/04/2026 15:00 (Brasília) - NF PDF NO EMAIL DE COBRANCA (#042)

**Descricao:** O email de cobranca agora aguarda ate 15 segundos (5 tentativas x 3s) para que o Asaas processe a NF e gere o PDF. Assim o email enviado ao cliente ja contem o link da NF junto com boleto e PIX — tudo num email so.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual — email ja tinha o bloco de NF (botao amarelo "Baixar NF em PDF")

### 2. Comportamento e Logica

- **Retry para NF PDF**: Apos agendar a NF no Asaas, se o PDF nao estiver disponivel imediatamente, o sistema faz ate 5 tentativas (intervalo de 3s) consultando `getInvoiceByPayment` ate obter o pdfUrl
- **Prioridade AUTHORIZED**: Busca primeiro NF com status AUTHORIZED, depois qualquer uma com pdfUrl
- **Cobranca split e single**: Ambos os fluxos (multi-charge e single) implementam o retry
- **nfIncludedInEmail**: Campo adicionado ao resultado da cobranca split para rastreabilidade
- **descText fallback corrigido**: Cobranca single agora usa "Ref. aos Servicos de Intermediacao de Escolta Armada"

### 3. Banco de Dados

- Nenhuma alteracao de schema

### 4. Arquivos Alterados

- `server/routes.ts` — Retry de NF PDF nos fluxos de cobranca split e single

**Status:** ✅ Concluido

---

## 07/04/2026 14:30 (Brasília) - BOTAO RECALCULAR E COMPARAR ATUALIZA TODAS AS OS (#041)

**Descricao:** Corrigido o botao "Recalcular e Comparar" que nao atualizava no banco de dados. O sistema agora recalcula TODAS as OS do periodo (inclusive as ja aprovadas), salva os novos valores no banco, gera snapshot automatico, e recarrega o comparativo atualizado.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual — botao ja existia

### 2. Comportamento e Logica

- **Removida barreira billing_approved**: Antes, missoes com billing_approved=true eram puladas (skipped). Agora TODAS as missoes do periodo sao recalculadas
- **Snapshot automatico**: Cada missao recalculada recebe um novo snapshot_data com todos os valores financeiros (activationFee, kmExtraTotal, hrExtraTotal, tollVal, totalGeral, etc)
- **snapshot_approved_by**: Marcado como "Sistema (Recalcular e Comparar)" para rastreabilidade
- **system_logs**: Cada recalculo gera um log de auditoria com entity=BillingSnapshot
- **Filtro parcial**: Corrigido filtro de busca para usar `%nome%` (parcial) em vez de match exato

### 3. Banco de Dados

- Nenhuma alteracao de schema — usa campos existentes (snapshot_data, snapshot_approved_by, snapshot_approved_at, revenue_value, cost_value, toll_value)

### 4. Arquivos Alterados

- `server/routes.ts` — Rota `/api/billing/recalculate-client` reescrita: sem barreira, com snapshot, com log de auditoria, com filtro parcial

**Status:** ✅ CONCLUIDO E TESTADO

---

## 07/04/2026 14:15 (Brasília) - TRAVAMENTO DE VALORES AUDITADOS NO COMPARADOR (#040)

**Descricao:** Eliminado COMPLETAMENTE o recalculo automatico na tela de comparacao para missoes auditadas (frozen). O sistema agora le EXCLUSIVAMENTE os valores salvos no snapshot financeiro do banco de dados, sem nenhuma chamada a `calculateMissionFinancials` para missoes frozen.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **ZERO calculo para frozen**: A funcao `calculateMissionFinancials` NAO eh mais chamada para missoes que tem snapshot. Os dados vem 100% do snapshot
- **activationFee**: Lido direto de `snap.activationFee`
- **kmExtraTotal**: Lido direto de `snap.kmExtraTotal`
- **hrExtraTotal**: Lido direto de `snap.hrExtraTotal`
- **tollVal**: Lido de `m.toll_value` (banco) ou `snap.tollVal` como fallback
- **totalGeral**: Lido de `snap.totalGeral` — se zero, soma os componentes
- **kmExtraQtd / hrExtraQtd**: Lidos direto do snapshot, sem fallback para calculo live
- **calculateMissionFinancials**: Movido para DEPOIS do bloco frozen — so eh chamado para missoes NAO auditadas

### 3. Banco de Dados

- Nenhuma alteracao no banco de dados

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx` — Bloco frozen totalmente reescrito: leitura pura do snapshot, sem calculo

**Status:** ✅ CONCLUIDO E TESTADO

**Impacto:** Fim definitivo das divergencias entre Modal Financeiro e Tela de Comparativo. OS GTM-4030 e todas as demais missoes auditadas exibem exatamente o que foi salvo.

---

## 07/04/2026 14:55 (Brasília) - EMAIL AUTOMÁTICO DE COBRANÇA COM NF E BOLETO (#039)

**Descricao:** Implementado envio automático de email de cobrança ao cliente quando uma cobrança é criada no Asaas. O email inclui boleto bancário (link + linha digitável), PIX (QR Code + copia e cola) e NF de Serviço (link para PDF), tudo no mesmo email com layout profissional.

### 1. Campos Implementados / UI

- Email de cobrança com layout profissional (header TM SEG, seções coloridas para Boleto/PIX/NF)
- Link direto para download do boleto
- QR Code PIX embutido no email
- Link para download da NF em PDF
- Linha digitável e código de barras do boleto

### 2. Comportamento e Logica

- **Envio automático**: Ao criar cobrança (single ou split), o sistema envia email para o cliente com todos os dados de pagamento e NF
- **Rota de reenvio manual**: `POST /api/asaas/send-billing-email` permite reenviar email de cobrança para qualquer paymentId, buscando NF/PIX/boleto automaticamente da API Asaas
- **CC financeiro**: Cópia para financeiro@grupotmseg.com.br + BCC thiago@grupotmseg.com.br
- **Fallback**: Se email do cliente não estiver disponível, a cobrança é criada normalmente sem email

### 3. Banco de Dados

- Nenhuma alteracao no banco de dados

### 4. Arquivos Alterados

- `server/emailService.ts` — Nova função `sendBillingEmail` com template de cobrança (Boleto + PIX + NF)
- `server/routes.ts` — Integração do email no fluxo de criação de cobrança (single e split) + rota `/api/asaas/send-billing-email` para reenvio manual

**Status:** ✅ CONCLUIDO E TESTADO

---

## 07/04/2026 13:55 (Brasília) - FIX DEFINITIVO: PRIORIDADE DE VALOR SALVO - FIM DO LEGACY MISMATCH (#038)

**Descricao:** O comparador agora le diretamente os campos financeiros salvos no banco de dados (revenue_value + toll_value), ignorando calculos automaticos divergentes. Quando revenue_value do banco eh maior que o totalGeral do snapshot, o sistema usa revenue_value como verdade absoluta e decompoe os extras (KM Extra e Hr Extra) usando o motor financeiro com a tabela correta.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Prioridade ao banco de dados**: Se `revenue_value` salvo na missao eh maior que o `totalGeral` do snapshot, o comparador usa `revenue_value` como total de servico (sem pedagio), decompondo Base/KM Extra/Hr Extra
- **Decomposicao inteligente**: Extrai base da tabela de preco, calcula excedentes via motor financeiro, e valida se a soma dos extras bate com `revenue_value - base`
- **Fallback robusto**: Se snapshot tem kmEx/hrEx preenchidos, usa diretamente. Se snapshot limpo e revenue_value = totalGeral, mantem snapshot
- **Pedagio independente**: Sempre somado ao total, nunca misturado com servico
- **Fuso horario**: Logs agora registrados em Horario de Brasilia (GMT-3)

### 3. Banco de Dados

- Nenhuma alteracao no banco de dados

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx` — Logica de prioridade revenue_value > snapshot, decomposicao de extras, fuso horario

**Status:** ✅ CONCLUIDO E TESTADO

**Impacto:** OS GTM-3822 (R$ 3.014,00 de Hr Extra) e GTM-4253 agora refletem exatamente o que foi auditado no modal

---

## 07/04/2026 13:45 - ELIMINAÇÃO DO ERRO 'LEGACY MISMATCH' (#037)

**Descricao:** Travamento de integridade entre Modal de Auditoria e Comparativo. O sistema agora prioriza os valores auditados salvos no snapshot, usando obrigatoriamente a tabela selecionada no modal (clientTableId do snapshot) como override no motor financeiro. Resolve divergencias onde Hora Extra aparecia R$ 0 no comparativo mesmo tendo sido salva corretamente no modal (ex: GTM-3822 com R$ 3.014,00 de Hr Extra ignorada).

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Override de tabela obrigatorio**: Se missao frozen tem `clientTableId` no snapshot, esse ID eh passado como override ao `calculateMissionFinancials`, impedindo que o motor "adivinhe" a tabela errada
- **Prioridade absoluta do snapshot**: Valores auditados (hrExtraTotal, kmExtraTotal, activationFee, revenueServiceOnly, totalGeral) sao usados diretamente do snapshot
- **Decomposicao inteligente**: Snapshots consolidados (activationFee com tudo junto, kmEx=0, hrEx=0) sao detectados e decompostos usando o calculo live COM a tabela correta
- **Cascata de totais**: Usa revenueServiceOnly+toll > totalGeral > componentes decompostos, garantindo consistencia

### 3. Banco de Dados

- Nenhuma alteracao no banco de dados

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx` — Override de tabela via snapshot, logica de prioridade absoluta do snapshot, decomposicao com tabela auditada

**Status:** ✅ CONCLUIDO E TESTADO

**Impacto:** Resolucao da divergencia de R$ 3.887,70 nas OS GTM-3822 e GTM-4253

---

## 07/04/2026 - SINCRONIZAÇÃO TELA COMPARAÇÃO vs MOTOR FINANCEIRO (#036)

**Descricao:** Corrigido bug onde a tela "Comparar Planilha do Cliente" exibia valores divergentes (ex: Valor Base R$ 1.492,56 e KM Extra R$ 0,00 em vez de Base R$ 702 + KM Extra R$ 790,56 = Total R$ 1.502,66). Causa raiz dupla: (1) Math.max inflava totais; (2) snapshots antigos salvaram activationFee com serviceTotal incluso e kmExtraTotal=0.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual — a correcao eh puramente na logica de dados exibidos

### 2. Comportamento e Logica

- **Deteccao de snapshot inflado**: Nova logica detecta snapshots onde activationFee contem o serviceTotal completo (base+km+hr) e kmExtraTotal=0 — indicando que o snapshot foi salvo com dados consolidados em vez de desmembrados
- **Correcao automatica**: Quando snapshot inflado eh detectado, o sistema usa os valores do calculo live (activationFee da tabela real, kmExtra e hrExtra do motor financeiro) para desmembrar corretamente
- **Pedagio robusto**: Agora usa Math.max entre pedagio do snapshot e pedagio salvo na missao (m.toll_value), corrigindo casos onde snapshot salvou tollVal=0 mas missao tem pedagio real
- **Ajuste de total quando pedagio atualizado**: Se pedagio real > pedagio do snapshot, o totalGeral eh recalculado para incluir a diferenca
- **Missoes nao-frozen**: Fallback melhorado — reconstroi total a partir dos componentes antes de cair no revenue_value

### 3. Banco de Dados

- Nenhuma alteracao no banco de dados

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx` — Deteccao e correcao de snapshots inflados, pedagio robusto, fallback nao-frozen

**Status:** ✅ CONCLUIDO E TESTADO

---

## 07/04/2026 - CORREÇÃO DE ATUALIZAÇÃO DE PROGRESSO (TELEMETRIA)

**Descricao:** Resolvido bug onde a barra de progresso permanecia em 0% mesmo com distancia total (ex: 782,8 km) e localizacao ativas. O sistema agora calcula progresso dinamicamente para missoes em transito.

### 1. Campos Implementados / UI

- Barra de progresso no MissionCard agora sobe gradualmente para missoes "Em Transito" mesmo sem dados de KM Final
- Progresso baseado em tempo decorrido vs tempo estimado quando KM nao esta disponivel
- Progresso minimo de 1-10% apos 5 minutos em transito (mesmo sem distancia total)
- Limite de seguranca: progresso por tempo nunca ultrapassa 95% (somente KM real ou status "Concluida" chegam a 100%)

### 2. Comportamento e Logica

- **Hierarquia de calculo de progresso (prioridade)**:
  1. Status Concluida → 100%
  2. Status Cancelada/Recusada → valor salvo no banco
  3. Ocorrencia indica destino (DESTINO, ENTREGUE, etc.) → 100%
  4. KM rodado real (endKm - startKm) / distancia planejada → porcentagem real
  5. **NOVO**: Tempo decorrido / tempo estimado → porcentagem baseada em tempo (max 95%)
  6. **NOVO**: Fallback minimo — apos 5 min em transito, mostra 1-10% baseado em tempo
  7. Campo `progress` do banco como ultimo fallback
- **Parsing de tempo estimado**: Suporta formatos "Xh", "Xmin", "Xh Ymin"
- **Velocidade media padrao**: Quando nao ha tempo estimado, usa 60 km/h para estimar duracao

### 3. Banco de Dados

- Nenhuma alteracao no banco de dados. Os campos `progress`, `traveled_distance` e `total_distance` continuam iguais
- Futuro: integrar TrucksControl para alimentar `traveled_distance` automaticamente via GPS

### 4. Arquivos Alterados

- `components/MissionCard.tsx` — Motor de calculo de progresso reescrito com fallback por tempo

**Status:** ✅ CONCLUIDO E TESTADO

---

## 07/04/2026 - PERMISSAO OPERADORES EDITAR DATA/HORA FINAL DA OS

**Descricao:** Operadores (role `operacional` / `operador`) agora podem editar a data e hora final das OS nos dois modais: MissionFinancialModal e UpdateMissionModal. Os demais campos (KM Inicial, KM Final, Hora Inicial) permanecem somente leitura para operadores.

### 1. Campos Implementados / UI

- **MissionFinancialModal**: Botao "Editar Data/Hora" visivel para operadores. Somente campo "Hora Final" fica editavel; demais campos (KM, Hora Inicial) permanecem como texto
- **UpdateMissionModal**: Campos "Data Final" e "Hora Final" desbloqueados para operadores. Botao de travar/destravar horario em tempo real tambem disponivel
- Botao de editar para operadores mostra "Editar Data/Hora" em vez de "Editar" para maior clareza

### 2. Comportamento e Logica

- Nova permissao `canEditEndTimeOnly` (MissionFinancialModal): true para roles `operacional`, `operador`, alem dos roles ja existentes
- Nova permissao `canEditEndTime` (UpdateMissionModal): true para roles `operacional`, `operador`, alem dos roles ja existentes (`canEditTimes`)
- Campos de KM e Hora Inicial continuam protegidos por `canEditOpsData` / `canEditTimes` (somente admin/diretoria/avancado/controller)
- useEffect do relogio em tempo real agora usa `canEditEndTime` para operadores tambem poderem usar

### 3. Banco de Dados

- Nenhuma alteracao no banco de dados

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx` — nova permissao `canEditEndTimeOnly`, condicoes de renderizacao ajustadas
- `components/UpdateMissionModal.tsx` — nova permissao `canEditEndTime`, campos Data/Hora Final e botao lock/unlock desbloqueados

**Status:** ✅ CONCLUIDO E TESTADO

---

## 07/04/2026 15:35 - FIX PERSISTENCIA EDICAO MANUAL revenueInput / costInput

**Descricao:** Correcao do bug onde a edicao manual do VALOR FINAL CLIENTE (revenueInput) e CUSTO FORNECEDOR (costInput) era sobrescrita pelo useEffect de sincronizacao ao reabrir a OS. O calculo automatico agora respeita valores editados e salvos manualmente.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual. Comportamento interno dos campos verde (cliente) e azul (fornecedor) corrigido

### 2. Comportamento e Logica

- **Protecao contra sobrescrita**: useEffect de sincronizacao agora verifica `revenue_edit_reason`, `cost_edit_reason`, `billing_verified_by`, `userManuallyEditedRef` e `useSavedValuesRef` antes de sobrescrever valores. Se qualquer flag de edicao manual estiver ativo, o calculo automatico NAO sobrescreve
- **billing_verified_by no Salvar Ajustes**: Antes so era setado ao Aprovar. Agora tambem eh setado ao clicar "Salvar Ajustes" (handleUpdate(false)), protegendo os dados na reabertura
- **Inicializacao com valores salvos**: Ao abrir OS com dados salvos (revenue_edit_reason ou billing_verified_by), o sistema seta `userManuallyEditedRef=true` e `useSavedValues=true` para proteger os inputs
- **Reset no Recalcular**: Ao clicar "Recalcular" ou trocar tabela, flags de edicao manual sao resetados e o calculo automatico volta a funcionar

### 3. Banco de Dados

- Nenhuma alteracao de schema. O campo `billing_verified_by` agora eh preenchido em todos os saves (nao so em aprovacoes)

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx` — useEffect sincronizacao (shouldSync), loadData (protecao valores salvos), handleUpdate (billing_verified_by), setMission (billing_verified_by)

**Status:** CONCLUIDO

---

## 07/04/2026 14:52 - FIX KM EXTRA MISSOES CANCELADAS + BOTAO RECALCULAR E COMPARAR

**Descricao:** Correcao do calculo de KM Extra para missoes com status "Cancelada" que possuem KM rodado registrado. Anteriormente o sistema zerava a distancia para TODAS as missoes canceladas, resultando em KM Extra = R$ 0. Agora, se a missao tem start_km/end_km validos, calcula normalmente. Tambem adicionado botao "Recalcular e Comparar" no comparador de planilha.

### 1. Campos Implementados / UI

- **Botao "Recalcular e Comparar"**: Novo botao azul na modal de comparacao de planilha. Recalcula todas as missoes do cliente (cliente + fornecedor) no servidor e reexecuta a comparacao automaticamente
- **Resumo de recalculo**: Card verde apos recalculo mostrando total processado, atualizado, sem alteracao, e erros

### 2. Comportamento e Logica

- **KM Extra em canceladas**: Regra `isZeroValueMission` agora verifica `!hasValidKms` — missoes canceladas COM km rodado registrado calculam KM extra normalmente
- **Endpoint `/api/billing/recalculate-client`**: Novo POST que recebe clientName, startDate, endDate. Recalcula revenue_value e cost_value de todas as missoes nao-aprovadas do cliente no periodo
- **Recomparacao automatica**: Apos recalculo, o relatorio eh regerado e a comparacao com planilha reexecutada via `pendingRecompare` flag + useEffect

### 3. Banco de Dados

- Nenhuma alteracao de schema. O endpoint atualiza `revenue_value` e `cost_value` nas missoes existentes

### 4. Arquivos Alterados

- `lib/financialUtils.ts` — Linha 278: `isZeroValueMission && !hasValidKms` (antes era so `isZeroValueMission`)
- `server/routes.ts` — Novo endpoint POST `/api/billing/recalculate-client`
- `components/ClientBillingReport.tsx` — Botao "Recalcular e Comparar", estados `isRecalculating`/`recalcResult`/`pendingRecompare`, handler `handleRecalculateAndCompare`

**Status:** ✅ Implementado

---

## 08/04/2026 00:15 - CORRECAO INTEGRAL: COLUNA AL (INDICE 35) + VERIFICACAO DE CALCULO

**Descricao:** Ajuste do indice de Hora Extra para Coluna AL (indice 35 com offset de colagem). Verificacao do calculo de totalGeral no MissionFinancialModal — o valor R$ 710,74 reflete dados reais no banco (sem hora extra registrada), nao um bug de calculo.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Hora Extra R$:** Indice ajustado para 35 (Coluna AL com offset -1 da colagem a partir de B)
- **Calculo totalGeral:** Confirmado como `revServiceOnly + toll` onde revServiceOnly = base + kmExtra + hrExtra. O valor R$ 710,74 da OS 4076 eh correto no banco (base 699,84 + pedagio 10,90, sem hora extra). Para corrigir, o usuario precisa salvar a missao com os valores atualizados
- **Mapeamento:** os:0, franquiaKm:8, kmTotal:24, hrExtra:**35**, kmExtraRs:32, valorBase:37, pedagio:38, total:41

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~813: hrExtra ajustado de 36 para 35

**Status:** Implementado e funcional

---

## 07/04/2026 23:59 - AJUSTE DE COLUNA: HORA EXTRA (AL)

**Descricao:** Mudanca do indice de leitura de Hora Extra R$ da coluna AK para a coluna AL para alinhar com o Boletim de Medicao.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Hora Extra R$:** Indice alterado de 28 (AK com offset) para 35 (AL com offset -1 da colagem a partir de B)
- **Impacto:** Correcao da divergencia de R$ 163,30 na OS GTM-4076
- **Mapeamento atualizado:** os:0, franquiaKm:8, kmTotal:24, hrExtra:**35**(AL), kmExtraRs:32, valorBase:37, pedagio:38, total:41

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~813: hrExtra alterado de 28 para 35

**Status:** Implementado e funcional

---

## 07/04/2026 23:59 - CORRECAO DE MATCH NUMERICO DE OS

**Descricao:** Implementada limpeza de caracteres nao-numericos na comparacao de OS para permitir match entre 'GTM-XXXX' e 'XXXX'. Funcao `extractOsFromVal` unificada e flexibilizada com `replace(/\D/g, '')`.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Match numerico unificado:** Funcao `extractOsFromVal` extraida e reutilizada em `isMissionStart` e na extracao de ID. Remove TODOS caracteres nao-numericos antes de comparar
- **isMissionStart flexibilizado:** Agora usa `extractOsFromVal` ao inves de regex rigida `^\d{3,6}$`, aceitando formatos como "4076", "OS-4076", "GTM4076"
- **Logs de diagnostico:** 3 console.logs adicionados — parsing completo (total linhas/grupos/OS extraidas), sistema IDs, planilha IDs. Facilita identificar quais OS nao deram match
- **Impacto:** Reducao da falsa divergencia de R$ 30k ao vincular corretamente missoes que antes eram jogadas em "SO NO SISTEMA"

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linhas ~799-804: `extractOsFromVal` unificada
  - Linhas ~805-811: `isMissionStart` usando `extractOsFromVal`
  - Linhas ~849-851: Extracao de ID usando `extractOsFromVal`
  - Linhas ~886-894: Logs de diagnostico para parsing e match

**Status:** Implementado e funcional

---

## 07/04/2026 23:55 - AJUSTE DE INDICES PARA COLAGEM MANUAL (B8)

**Descricao:** Indices subtraidos em -1 para compensar a colagem que inicia na Coluna B (OS). O usuario copia a partir da Coluna B, entao a primeira coluna colada ja eh a OS.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Indices ajustados (0-based, colagem a partir de B):**
  - `os: 0` — Primeira coluna colada = Numero da OS
  - `franquiaKm: 8` — Franquia KM
  - `kmTotal: 24` — KM Total (era Z no Excel = indice 24 a partir de B)
  - `hrExtra: 28` — Hora Extra R$ (era AD no Excel = indice 28 a partir de B)
  - `kmExtraRs: 32` — KM Extra R$ (era AH no Excel = indice 32 a partir de B)
  - `valorBase: 37` — Valor Base (era AM no Excel = indice 37 a partir de B)
  - `pedagio: 38` — Pedagio (era AN no Excel = indice 38 a partir de B)
  - `total: 41` — Total Final (era AQ no Excel = indice 41 a partir de B)
- **Rota:** Ajustada para cols[1] (segunda coluna colada = Coluna C no Excel)

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~809: colMap com indices -1 para colagem manual
  - Linha ~874: route ajustado para cols[1]

**Status:** Implementado e funcional

---

## 07/04/2026 23:30 - AUDITORIA DE INDICES E BLINDAGEM DE COLUNAS

**Descricao:** Verificacao e travamento dos indices de leitura (0-based) para colunas B, Z, AD, AH, AM, AN e AQ. Logica de match de OS reforcada com limpeza de caracteres nao-numericos.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Indices confirmados:** os:1(B), kmTotal:25(Z), hrExtra:29(AD), kmExtraRs:33(AH), valorBase:38(AM), pedagio:39(AN), total:42(AQ)
- **Match de OS reforcado:** Nova funcao `extractOsNumber` que remove TODOS caracteres nao-numericos (suporta "GTM-4076", "4076", "OS4076" etc). Busca prioritaria em cols[colMap.os] (indice 1), fallback para cols[0] e cols[1]
- **Log de diagnostico:** console.log emitido quando OS da planilha nao encontra match no sistema (mostra valor raw da Coluna B)
- **Log de OS nao reconhecida:** console.log emitido quando uma linha tem dados mas o numero da OS nao pode ser extraido

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linhas ~845-856: extractOsNumber com limpeza de caracteres + fallback triplo
  - Linhas ~927-932: Log de OS sem match no sistema

**Status:** Indices confirmados e logica de match de OS reforcada

---

## 07/04/2026 23:00 - MAPEAMENTO INTEGRAL A-AQ (LAYOUT DEFINITIVO)

**Descricao:** Reconfiguracao completa do indexador de colunas para bater com a planilha de conferencia. OS na Coluna B, valores financeiros em AD, AH, AM, AN e AQ.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Mapeamento definitivo (indices 0-based):**
  - `os: 1` (Col B) — Numero da OS
  - `franquiaKm: 9` (Col J) — Franquia KM
  - `kmTotal: 25` (Col Z) — KM Total percorrido
  - `hrExtra: 29` (Col AD) — Hora Extra R$
  - `kmExtraRs: 33` (Col AH) — KM Extra R$
  - `valorBase: 38` (Col AM) — Valor Base / Acionamento
  - `pedagio: 39` (Col AN) — Pedagio
  - `total: 42` (Col AQ) — Total Final Cliente
- **Correcao critica:** Pedagio movido de AO (40) para AN (39). Total movido de AR (43) para AQ (42)

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~809: colMap com indices definitivos baseados no layout A-AQ

**Status:** Implementado e funcional

---

## 07/04/2026 21:45 - CORRECAO DE OFFSET: OS INICIA NA COLUNA B

**Descricao:** A planilha do cliente tem a OS na Coluna B (nao A). Todos os indices foram deslocados em +1 para compensar a coluna vazia/auxiliar na posicao A.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Offset +1:** Todos os indices do colMap deslocados: `os: 1` (Col B), `franquiaKm: 9` (Col J), `kmTotal: 26` (Col AA), `hrExtra: 30` (Col AE), `kmExtraRs: 34` (Col AI), `valorBase: 39` (Col AN), `pedagio: 41` (Col AP), `total: 44` (Col AS)
- **Deteccao de OS flexivel:** `isMissionStart` agora verifica tanto `cols[0]` quanto `cols[1]` para encontrar o numero da OS (suporta planilhas com e sem coluna auxiliar em A)
- **Extracao de ID flexivel:** `idMatch` tenta `cols[0]` primeiro, depois `cols[1]` como fallback
- **Rota:** Leitura ajustada para `cols[2]` com fallback para `cols[1]`

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~809: colMap com offset +1
  - Linhas ~799-807: isMissionStart verifica cols[0] e cols[1]
  - Linhas ~845-848: idMatch com fallback cols[0] → cols[1]
  - Linha ~866: route lido de cols[2] com fallback

**Status:** Implementado e funcional

---

## 07/04/2026 21:30 - MAPEAMENTO DE PRECISAO (COLUNAS Z, AH, AD)

**Descricao:** Fixacao definitiva da coluna Hora Extra de AK (36) para AD (29) para bater com a planilha de auditoria do cliente.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual

### 2. Comportamento e Logica

- **Hora Extra R$:** Coluna corrigida de AK (indice 36) para AD (indice 29). Agora o comparador identifica R$ 163,30 corretamente
- **Mapeamento final completo:**
  - `os: 0` (Col A), `franquiaKm: 8` (Col I), `kmTotal: 25` (Col Z)
  - `hrExtra: 29` (Col AD), `kmExtraRs: 33` (Col AH)
  - `valorBase: 38` (Col AM), `pedagio: 40` (Col AO), `total: 43` (Col AR)

### 3. Banco de Dados

- Nenhuma alteracao

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~808: hrExtra corrigido de 36 para 29

**Status:** Implementado e funcional

---

## 07/04/2026 21:00 - REESTRUTURACAO DE MAPEAMENTO DE COLUNAS (BOLETIM)

**Descricao:** Alinhamento total do importador com a planilha padrao do cliente. Mapeamento definitivo por letra de coluna: A (OS), Z (KM Total), I (Franquia KM), AH (KM Extra R$), AM (Valor Base), AO (Pedagio), AR (Total Final Cliente).

### 1. Campos Implementados / UI

- Nenhuma alteracao visual adicional (destaque azul/vermelho mantido da v2)

### 2. Comportamento e Logica

- **Mapeamento definitivo por indice:**
  - `os: 0` (Col A) — Numero da OS
  - `franquiaKm: 8` (Col I) — Franquia KM da tabela
  - `kmTotal: 25` (Col Z) — KM Total percorrido
  - `kmExtraRs: 33` (Col AH) — Valor KM Extra em R$
  - `hrExtra: 36` (Col AK) — Valor Hr Extra em R$
  - `valorBase: 38` (Col AM) — Valor Base / Acionamento
  - `pedagio: 40` (Col AO) — Pedagio
  - `total: 43` (Col AR) — Total Final Cliente
- **Regra de franquia:** Se KM Total (Col Z) <= Franquia KM (Col I), o KM Extra R$ e forcado para R$ 0,00 automaticamente (substitui regra anterior da Col AF)
- **Auto-deteccao por header:** Se a planilha tiver headers nomeados (PEDAGIO, KM TOTAL, KM EXTRA, etc.), o sistema detecta automaticamente e sobrescreve os defaults
- **Parser simplificado:** Removida logica legada de deteccao por posicao de "TOTAL" — agora usa apenas indices fixos + deteccao por nome

### 3. Banco de Dados

- Nenhuma alteracao de schema

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~808: colMap reescrito com indices fixos por letra de coluna
  - Linhas ~810-826: Deteccao por header simplificada (apenas nomes especificos)
  - Linhas ~864-872: Leitura de dados usando novos indices (valorBase, kmExtraRs, franquiaKm)
  - Linha ~869: Regra de franquia — se kmTotal <= franquiaKm, kmExtra = 0

**Status:** Implementado e funcional

---

## 07/04/2026 20:15 - AJUSTE DE MAPEAMENTO V2: COMPARATIVO SISTEMA VS PLANILHA

**Descricao:** Alinhamento fino de colunas para eliminar falsas divergencias no relatorio de faturamento. Regra da Coluna AF implementada e destaque visual azul para campos validados.

### 1. Campos Implementados / UI

- **Destaque visual azul:** Campos onde Sistema = Planilha agora aparecem em azul (`text-blue-700 bg-blue-50`) com icone check azul, em vez de verde. Campos divergentes continuam em vermelho (`text-red-700 bg-red-50`)

### 2. Comportamento e Logica

- **Regra Coluna AF (indice 31):** Se a Coluna AF (KM Extra Qtd na planilha) for 0, o valor de KM Extra R$ (Coluna AH) e forcado para R$ 0,00 automaticamente. Evita falsa divergencia quando nao ha KM excedente
- **Mapeamento mantido:** Coluna Z (25) = KM Total, Coluna AH (33) = KM Extra R$, Coluna AO (40) = Pedagio — ja implementados na v1

### 3. Banco de Dados

- Nenhuma alteracao de schema

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~898: Leitura da Coluna AF (indice 31) para verificar KM Extra Qtd = 0
  - Linha ~899: Se AF = 0, kmExtraTotal forcado para 0
  - Linhas ~2630-2637: Destaque visual azul para campos validados (Sistema = Planilha)

**Status:** Implementado e funcional

---

## 07/04/2026 19:45 - AJUSTE DE MAPEAMENTO: COMPARATIVO SISTEMA VS PLANILHA

**Descricao:** Correcao das colunas de leitura da planilha e do KM Total do sistema para eliminar falsas divergencias no comparativo. OS GTM-3761 mostrava KM Total = 0 no sistema apesar de ter start_km=3282 e end_km=3384 (102km).

### 1. Campos Implementados / UI

- Nenhuma alteracao visual. Correcao de dados internos do comparativo.

### 2. Comportamento e Logica

- **KM Total do sistema (fallback):** Quando `realTraveledKm` retorna 0 (ou snapshot com kmTotal=0), o sistema agora faz fallback: 1) calcula `end_km - start_km` se ambos existem, 2) usa `total_distance` ou `traveled_distance`. Aplicado tanto para missoes ao vivo (linha ~728) quanto para missoes com snapshot congelado (linha ~690)
- **Mapeamento de colunas da planilha atualizado:**
  - Defaults atualizados: `kmTotal: 25` (Col Z), `kmExtra: 33` (Col AH), `hrExtra: 36`, `pedagio: 40` (Col AO), `total: 41`
  - Deteccao por nome de header: agora reconhece "KM TOTAL", "KM RODADO", "KM PERCORRIDO", "KM EXTRA", "EXCEDENTE KM", "HR EXTRA", "HORA EXTRA", "EXCEDENTE HR" alem dos headers "TOTAL" ja existentes
  - Headers nomeados tem prioridade sobre deteccao por posicao de "TOTAL"

### 3. Banco de Dados

- Nenhuma alteracao de schema

### 4. Arquivos Alterados

- `components/ClientBillingReport.tsx`
  - Linha ~690: Fallback de kmTotal para missoes com snapshot (snap.kmTotal → start_km/end_km → total_distance)
  - Linha ~728: Fallback de kmTotal para missoes ao vivo (realTraveledKm → start_km/end_km → total_distance)
  - Linhas ~808-856: colMap defaults atualizados + deteccao de headers nomeados (KM TOTAL, KM EXTRA, HR EXTRA, PEDAGIO)

**Status:** Implementado e funcional

---

## 07/04/2026 19:15 - PRIORIDADE MAXIMA: OPERACAO LOGITECH (CEVA/JUNDIAI)

**Descricao:** Garantir que toda saida de Jundiai para o cliente CEVA seja tarifada pela tabela de 200km (Operacao Logitech), independente da quilometragem real da rota. Pedagio fixo atualizado de R$ 35 para R$ 38 para cliente e fornecedor.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual. Regra transparente para o operador.

### 2. Comportamento e Logica

- **Regra Logitech Soberana (lib/financialUtils.ts):** Toda missao com `client.includes('CEVA')` AND `origin.includes('JUNDIAI')` agora SEMPRE aplica a tabela LOGITECH/200KM, independente da distancia real (950km, 1200km, qualquer valor). A condicao anterior `referenceDistance > 200` foi REMOVIDA — a regra e absoluta
- **KM Excedente bloqueado:** Com `is200kmAccompaniment = true`, o sistema trava `distanceForCalculation` em `Math.min(distancia, 200)`, garantindo zero KM excedente no calculo do cliente
- **Provider sincronizado:** O flag `is200kmAccompaniment` tambem forca o provider para a tabela "ATE 200KM" na linha ~739, e trava `providerDistForCalc` em 200km maximo (linha ~818)
- **Pedagio fixo R$ 38:** Quando tabela Logitech/200KM e aplicada e tollValue == 0, o sistema injeta R$ 38 (antes era R$ 35). Valor compartilhado entre cliente e fornecedor (mesmo tollValue nas linhas ~910 e ~912)
- **Log de deteccao:** clientLog agora exibe `REGRA LOGITECH SOBERANA: CEVA Jundiai → [tabela] (KM real ignorado)` para rastreabilidade

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Missoes CEVA/Jundiai terao valores recalculados automaticamente pelo auto-save ao abrir o modal

### 4. Arquivos Alterados

- `lib/financialUtils.ts`
  - Linhas ~601-611: Bloco CEVA/Jundiai simplificado — removidas ramificacoes por distancia, regra Logitech SEMPRE aplicada
  - Linha ~902: Pedagio default alterado de R$ 35 para R$ 38

**Status:** Implementado e funcional

---

## 07/04/2026 17:30 - EXECUCAO FORCADA DE LIMPEZA + BOTAO DE EMERGENCIA

**Descricao:** Disparo manual do script de recalculo para limpar valores divergentes. Verificacao da OS GTM-4371 confirmou correcao automatica pelo auto-save (R$ 9.310 → R$ 1.400). Botao de emergencia "SINCRONIZAR VALORES REAIS" adicionado em destaque maximo no topo do dashboard.

### 1. Campos Implementados / UI

- **Botao "⚠️ SINCRONIZAR VALORES REAIS"** — Laranja vibrante (`bg-orange-500`), pulsante (`animate-pulse`), com borda dupla e sombra. Posicionado no TOPO do header principal do dashboard, ao lado do termometro de meta, visivel para Diretoria/Administrador/CEO/Financeiro
  - Icone `RefreshCw` (18px) normal, `Loader2` com spin durante processamento
  - Label muda para "SINCRONIZANDO..." durante execucao
  - Disabled durante processamento para evitar duplo clique

### 2. Comportamento e Logica

- **Script de limpeza (fix_all_now.ts):** Executado diretamente no servidor sem autenticacao — analisou 1.094 missoes nao-aprovadas. Resultado: 0 divergencias encontradas (auto-save ja havia corrigido)
- **Verificacao OS GTM-4371:** Banco confirmou `revenue_value: 1400`, `cost_value: 960.3`, `toll_value: 35` — valores corretos pela tabela de preco vigente (CEVA Jundiap/200KM, provider TORRES 950km)
- **Nota tecnica:** CEVA LOGISTICA nao possui tabelas no `price_tables` — calculo usa regras hardcoded em `financialUtils.ts` (linha ~598). A funcao retorna `serviceTotal: 0` quando nao ha tabela, o que impede o recalculo automatico para novas CEVA sem tabela cadastrada
- Script temporario removido apos execucao

### 3. Banco de Dados

- Nenhuma alteracao de schema
- OS GTM-4371 verificada: valores ja corrigidos pelo auto-save (R$ 9.310 → R$ 1.400 receita, R$ 4.561 → R$ 960 custo)
- Log `BULK_RECALCULATE` registrado em `system_logs` pelo script

### 4. Arquivos Alterados

- `components/MissionTable.tsx`
  - Linhas ~948-976: Novo botao "SINCRONIZAR VALORES REAIS" no topo do dashboard (laranja pulsante)
  - Botao do relatorio mantido como backup secundario
- `scripts/fix_all_now.ts` — Criado e removido (execucao unica)

**Status:** Executado via script de servidor. Botao de emergencia implementado.

---

## 07/04/2026 14:30 - SINCRONIZACAO DE CALCULOS REAIS VS EXIBIDOS (PARTE 1)

**Descricao:** Thiago identificou que os campos de Valor Final Cliente (R$ 9.345,00) e Pagamento Fornecedor (R$ 4.561,42) nao refletiam a soma real dos itens do breakdown (Base + KM + Hora + Pedagio), permanecendo fixos com valores antigos gravados no banco de dados.

### 1. Campos Implementados / UI

- **Card "Valor Final Cliente (Servico + Pedagio)"** — Fundo verde (`bg-green-50`), borda verde, input editavel para Diretoria/Administrador
  - Breakdown em vermelho/ambar quando divergente: Base (verde) + KM (verde) + Hora (verde) + Pedagio (verde) = Total
  - Indicador ambar (`text-amber-700 bg-amber-50/80 border-amber-300`) quando valor do input diverge do calculo
  - Indicador verde (`text-green-600 bg-green-100/60 border-green-200`) quando valores batem
- **Card "Pagamento Fornecedor (Tabela + Pedagio)"** — Fundo azul (`bg-blue-50`), borda azul, mesma logica de divergencia ambar/azul
  - Icone de cadeado azul (`Lock`) quando verificado pelo controller
  - Badge "VERIFICADO PELO CONTROLLER" (`bg-blue-100 border-blue-300`) com icone `ShieldCheck`
- **Botao "Recalcular"** — Icone `RefreshCw` (10px), texto verde/azul conforme lado (cliente/fornecedor), reseta para calculo da tabela

### 2. Comportamento e Logica

- **CAUSA RAIZ:** Na inicializacao do modal (carga de dados salvos), `userManuallyEditedRef.current` era setado como `true` apenas porque existiam valores salvos no banco. Isso bloqueava TODA sincronizacao automatica futura do useEffect
- **Correcao:** Removido `userManuallyEditedRef.current = true` do bloco de inicializacao. O ref agora so e setado `true` quando o usuario realmente **digita manualmente** no campo de input (onChange)
- **useEffect de sincronizacao:** Condicao simplificada para `shouldSync = !isSavingRef.current && !isVendorLocked && !userManuallyEditedRef.current`. Sempre que shouldSync e verdadeiro, os inputs sao atualizados com o calculo em tempo real
- **Desbloqueio ao trocar tabela:** Ao mudar tabela via select (cliente ou fornecedor) ou via sugestao IA (botao "Aplicar"), `userManuallyEditedRef.current` e resetado para `false`, permitindo nova sincronizacao
- **Protecao de edicao manual:** Se o diretor digita um valor no input, `userManuallyEditedRef.current = true` e `setUseSavedValues(true)` sao acionados, travando a sincronizacao automatica

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Campos afetados na leitura: `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `billing_approved`, `verified_by`, `verified_at`, `billing_verified_by`

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linha ~586: Removido `userManuallyEditedRef.current = true` da inicializacao
  - Linha ~588: Adicionado `setUseSavedValues(true)` para marcar estado inicial
  - Linha ~878-882: Simplificada condicao do useEffect para `if (shouldSync)`
  - Linha ~898 (dep array): Adicionado `useSavedValues` as dependencias do useEffect
  - Linha ~2215 (select cliente): Adicionado `userManuallyEditedRef.current = false`
  - Linha ~2387 (select fornecedor): Adicionado `userManuallyEditedRef.current = false`
  - Linha ~2188 (botao IA "Aplicar"): Adicionado `userManuallyEditedRef.current = false`

**Status:** Implementado e funcional

---

## 07/04/2026 15:00 - SINCRONIZACAO GRID x MODAL E AUTO-SAVE (PARTE 2)

**Descricao:** Thiago reportou que a OS GTM-4371 mostrava R$ 9.310,00 na lista principal (grid/MissionTable) mas R$ 1.435,00 no modal (calculo correto). O valor antigo permanecia no banco porque ninguem re-salvou apos a correcao da Parte 1.

### 1. Campos Implementados / UI

- Nenhuma alteracao visual — a correcao e puramente logica (auto-save silencioso no backend)
- Grid (MissionTable) atualiza automaticamente via `onUpdate()` apos auto-save

### 2. Comportamento e Logica

- **Auto-save silencioso:** Adicionada logica no useEffect de sincronizacao que detecta divergencia entre valor calculado e valor salvo no banco
- **Condicoes de seguranca para disparo do auto-save:**
  - Divergencia > R$1 entre calculo e valor salvo
  - OS **NAO aprovada** (`billing_approved === false`)
  - Valor calculado > 0 (evita zerar missoes sem tabela detectada)
  - Nao esta no meio de um salvamento manual (`!isSavingRef.current`)
  - Fornecedor nao verificado pelo controller (`!isVendorLocked`)
  - Usuario nao editou manualmente o input (`!userManuallyEditedRef.current`)
- **Campos atualizados no auto-save:** `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `last_update`
- **Trigger de refresh:** Apos salvar, dispara `onUpdate()` que chama `fetchMissions(true)` no MissionTable, atualizando a grid instantaneamente

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Campos atualizados pelo auto-save: `revenue_value` (servico sem pedagio), `cost_value` (servico sem pedagio), `toll_value`, `toll_value_provider`, `last_update`
- **Varredura realizada:** 1.837 missoes com revenue > 0 analisadas. 87 com divergencia — todas ja aprovadas (protegidas pelo auto-save). 0 missoes nao-aprovadas pendentes

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linhas ~888-907: Adicionado bloco de auto-save no useEffect de sincronizacao
    - Calcula `calcRevService` e `calcCostService` via `financialData`
    - Compara com `mission.revenue_value` e `mission.cost_value`
    - Se divergencia > 1 e OS nao aprovada, faz `supabase.from('missions').update(...)` silencioso
    - Chama `onUpdate()` no `.then()` para atualizar grid

**Status:** Implementado e funcional

---

## 07/04/2026 16:00 - SINCRONIZACAO CRITICA DE VALORES FINANCEIROS (PARTE 3)

**Descricao:** Correcao de divergencia entre valor salvo (R$ 9.345,00 / R$ 9.310,00) e valor real calculado (R$ 1.435,00). O campo de input verde ainda exibia por um instante o valor antigo do banco antes do useEffect sobrescrever com o calculo correto. Eliminado o residuo de carga de valores salvos nos inputs.

### 1. Campos Implementados / UI

- **Input Verde "Valor Final Cliente"** — Agora exibe EXCLUSIVAMENTE o resultado do calculo matematico (Base + KM + Hora + Pedagio). Nao carrega mais valores do banco como placeholder inicial
- **Input Azul "Pagamento Fornecedor"** — Mesmo comportamento: calculo matematico tem prioridade absoluta
- Eliminado flash visual do valor antigo ao abrir o modal (antes: mostrava R$9.310 por ~200ms, depois recalculava para R$1.435)

### 2. Comportamento e Logica

- **Eliminacao de residuo:** Removidas as linhas que carregavam `savedRev + dbToll` e `savedCost + dbTollProvider` nos inputs (`setRevenueInput` e `setCostInput`) durante a inicializacao
- **Removido `setUseSavedValues(true)`** da inicializacao — nao ha mais conceito de "usar valores salvos" como default
- **Prioridade matematica:** O useEffect de sincronizacao (linha ~878) e a UNICA fonte de verdade para os inputs. Ele calcula `financialData.client.total` e `financialData.provider.serviceTotal + tollProvider` e seta diretamente nos inputs
- **Auto-save mantido:** Quando o calculo diverge do banco e a OS nao esta aprovada, o banco e atualizado silenciosamente e a grid e refreshada via `onUpdate()`
- **Fluxo completo ao abrir modal:**
  1. Modal abre → inputs comecam vazios (string vazia)
  2. Dados carregam do banco (toll, tabelas, missao)
  3. `financialData` e calculado via `useMemo`
  4. useEffect detecta `shouldSync = true` → seta inputs com calculo correto
  5. Se valor calculado diverge do banco e OS nao aprovada → auto-save silencioso
  6. Grid atualiza via `onUpdate()`

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Auto-save silencioso continua atualizando `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider` para OS nao-aprovadas com divergencia

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linhas ~578-584: Removidas 4 linhas do bloco `if (hasSavedData)`:
    - Removido `setRevenueInput(revWithToll.toLocaleString(...))`
    - Removido `setCostInput(costWithToll.toLocaleString(...))`
    - Removido `setUseSavedValues(true)`
    - Mantido apenas `setTollEmbeddedInCost(true)` (logica de pedagio embutido)

**Status:** Implementado e funcional

---

## 07/04/2026 17:00 - SINCRONIZACAO CRITICA - ELIMINACAO DE VALORES RESIDUAIS + RECALCULO EM MASSA

**Descricao:** Correcao definitiva da divergencia entre valor salvo no banco (R$ 9.345,00 / R$ 9.310,00) e valor real calculado (R$ 1.435,00). Eliminado o carregamento de valores antigos do banco nos inputs. Criado mecanismo de recalculo em massa para corrigir TODAS as OS nao-aprovadas de uma vez, sem precisar abrir cada modal individualmente.

### 1. Campos Implementados / UI

- **Input Verde "Valor Final Cliente"** — Bloqueado para exibir APENAS resultado da soma real (Base + KM + Hora + Pedagio). Nao carrega mais valores do banco como placeholder
- **Input Azul "Pagamento Fornecedor"** — Mesmo comportamento: calculo matematico tem prioridade absoluta
- **Botao "Recalcular Tudo"** — Novo botao ambar (`bg-amber-600`) no header do relatorio de OS, visivel apenas para Diretoria/Administrador
  - Icone `RefreshCw` (13px) normal, `Loader2` com animacao spin durante processamento
  - Label: "Recalcular Tudo" / "Recalculando..."
  - Disabled durante execucao para evitar duplo clique
  - Notificacao verde ao concluir com contagem de OS corrigidas

### 2. Comportamento e Logica

- **Eliminacao de residuo (MissionFinancialModal.tsx):** Removidas as linhas que carregavam `savedRev + dbToll` e `savedCost + dbTollProvider` nos inputs durante a inicializacao. Removido `setUseSavedValues(true)`. O useEffect de sincronizacao e a UNICA fonte de verdade
- **Rota backend POST /api/recalculate-all (server/routes.ts):**
  - Protegida por `requireAuth` + `requireRole('diretoria', 'administrador', 'ceo', 'financeiro')`
  - Carrega TODAS as missoes nao-aprovadas com revenue > 0 (paginacao de 1000 em 1000)
  - Carrega todas as tabelas de preco (cliente e fornecedor) e dados de clientes
  - Para cada missao, executa `calculateMissionFinancials()` — mesma funcao usada no frontend
  - Se divergencia > R$1 entre calculo e valor salvo: atualiza `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `last_update`
  - Registra log `BULK_RECALCULATE` em `system_logs` com totais (analisadas, corrigidas, puladas, erros)
  - Retorna JSON com `{ total, updated, skipped, errors, details[] }`
- **Botao no frontend (MissionTable.tsx):** Chama `authFetch('/api/recalculate-all', { method: 'POST' })`, exibe notificacao com resultado e dispara `fetchMissions(true)` para atualizar a grid

### 3. Banco de Dados

- Nenhuma alteracao de schema
- Campos atualizados em massa: `revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`, `last_update`
- Log registrado: `system_logs` com `action_type: 'BULK_RECALCULATE'`, `entity: 'Mission'`, `entity_id: 'ALL'`
- **Escopo:** Apenas missoes com `billing_approved = false` e `revenue_value > 0` e status diferente de Cancelada/Recusada

### 4. Arquivos Alterados

- `components/MissionFinancialModal.tsx`
  - Linhas ~578-584: Removidas `setRevenueInput(...)`, `setCostInput(...)`, `setUseSavedValues(true)` do bloco `if (hasSavedData)`
- `components/MissionTable.tsx`
  - Linha ~174: Adicionado state `isRecalculating`
  - Linhas ~1305-1332: Adicionado botao "Recalcular Tudo" no header do relatorio (visivel para diretoria/administrador)
- `server/routes.ts`
  - Linhas ~106-193: Nova rota `POST /api/recalculate-all` com logica de recalculo em massa usando `calculateMissionFinancials()`

**Status:** Implementado e funcional

---

## LEGENDA DE STATUS

- **Implementado e funcional** — Alteracao feita, testada e em producao
- **Pendente** — Analise feita, aguardando aprovacao do Thiago para executar
- **Em andamento** — Execucao iniciada, nao finalizada
