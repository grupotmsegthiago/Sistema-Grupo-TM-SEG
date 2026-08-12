# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Arquivo oficial de handoff entre Cursor e ChatGPT.  
> Representa **somente** a última execução realizada.  
> **Não contém segredos, senhas, tokens ou API keys.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-12 (UTC) |
| **Fase** | **Fase 2 — Raio-X funcional (100% — ENCERRADA)** |
| **Objetivo** | Diagnóstico funcional completo sem correções: limit/range, fallbacks, OS mãe/filha, SSOT, sincronismo, realtime, relatórios, permissões, backlog P0–P3 |
| **Baseline** | `baseline-fase1-merged-20260812` → `d78e3ed3` |
| **Produção** | `3.7.60` / health OK (smoke read-only 2026-08-12) |
| **Código funcional alterado** | **NÃO** |
| **Branch** | `cursor/fase2-raio-x-eaa8` → PR #256 |
| **Commit** | (ver seção Git ao final desta execução) |

---

## PROGRESSO

| Métrica | Valor |
|---------|-------|
| **PROGRESSO DA FASE 1** | **100%** 🟢 |
| **PROGRESSO DA FASE 2** | **100%** 🟢 |
| **PROGRESSO GERAL DO PROGRAMA** | **18%** |

### Marcos Fase 2

| Marco | Status |
|-------|--------|
| 25% — Inventário telas + domínios + endpoints | ✅ |
| 50% — Árvore OS + inacabados + diretoria/jurídico | ✅ |
| 75% — limit/range classificado + MissionTable 300 + realtime + fallbacks + SSOT + paridade expandida | ✅ |
| **100% — classificação final INDETERMINADOS + matrizes consolidadas + backlog P0–P3 + smoke documentado** | **✅** |

---

## RESULTADO

### 🟢 FASE 2 ENCERRADA — DIAGNÓSTICO SEM CORREÇÕES

Nenhuma alteração funcional, deploy ou escrita em produção. Aguardar autorização do proprietário para Fase 3 / correções.

---

## PRESERVADO DOS MARCOS 55% E 75% (não refeito)

- 57 telas mapeadas (`App.tsx` + `Sidebar.tsx` + `constants.ts`)
- 20 domínios de negócio
- ~313 endpoints inventariados (`server/routes.ts` + `api/`)
- Árvore OS base + regra OS mãe/filha preliminar
- 5 testes conhecidos fora do escopo (673 pass / 5 fail / 678)
- Smoke read-only prod: `/api/health`, `/api/version`, `/api/gemini/health` → 200

---

## 1. LIMIT / RANGE — CLASSIFICAÇÃO FINAL (200 ocorrências)

**Escopo:** `components/`, `lib/`, `server/`, `api/` (excl. `attached_assets`, `export_relatorio`).

### Resumo por classificação (fechamento 100%)

| Classificação | Qtd | % | Critério |
|---------------|-----|---|----------|
| 🟢 SEGURO | 118 | 59% | `limit(1)`, exists, auxiliar não financeiro, autocomplete motorista, logs |
| 🔵 PAGINADO CORRETAMENTE | 42 | 21% | `fetchAllPages` / loop `range` 1000 / workers BATCH |
| 🟣 AGREGAÇÃO / SUBSET | 8 | 4% | Proporcional a `missionIds`, workers DHL, charts filtrados |
| 🟡 ATENÇÃO (admin/auditoria) | 15 | 8% | Tetos altos em admin/logs; truncamento improvável mas possível |
| 🔴 PERIGOSO | 9 | 5% | Trunca conjunto operacional/financeiro visível ao usuário |
| ⚪ INDETERMINADO | 8 | 4% | Baixo impacto documentado — ver tabela §1.4 |

> **Nota metodológica:** marco 75% tinha 76 ⚪ (41%). Revisão prioritária dos 36 em `server/routes.ts` + 68 restantes reduziu para **8** com justificativa explícita de baixo impacto ou escopo de fase futura.

### 1.1 `server/routes.ts` — 36 ocorrências (fechamento)

| Classificação | Qtd | Detalhe |
|---------------|-----|---------|
| 🔵 | 14 | `.range(from, from+999)` em export/admin paginado |
| 🟢 | 12 | `.limit(1)` schema/col check, `maybeSingle`, lookup CNPJ |
| 🔵 | 4 | Workers `BATCH_SIZE` (recalculate, cleanup) |
| 🟡 | 6 | `system_logs` limit 500/10000, relatório diário limit 200, listagens admin 50 |

**Conclusão routes.ts:** Nenhum 🔴 em `missions` — listagens de missão no servidor usam paginação 999/1000. Riscos financeiros de truncamento estão no **frontend** (busca MissionTable, diretoria quotes).

**Rotas com manipulação de conjuntos financeiros/operacionais completos:**

| Linha | Padrão | Entidade | Risco |
|-------|--------|----------|-------|
| 577, 4330, 4399, 4518 | `.range` loop | tabelas export admin | 🔵 paginado |
| 8101, 8208, 8302 | `.range` | `financial_transactions` / faturas | 🔵 paginado |
| 9688 | `.range(0, 4999)` | listagem admin missões/transações | 🟡 teto 5000 |
| 3907 | `.limit(500)` | `system_logs` FINANCIAL_RECALC por OS | 🟡 histórico truncado |
| 8509 | `.limit(10000)` | `system_logs` override alert | 🟡 improvável truncar |
| 546 | `recalculate-open` | missions em lote | 🔵 paginado interno |

### 1.2 🔴 PERIGOSO — tabela consolidada (9 itens)

| # | Arquivo | Função / contexto | Entidade | Limite | Ordenação | Consequência | Telas afetadas | Correção futura recomendada |
|---|---------|-------------------|----------|--------|-----------|--------------|----------------|----------------------------|
| 1 | `MissionTable.tsx:1135` | `useEffect` busca textual (`osFilterTerm` ≥2 chars) | `missions` | **300** | `created_at DESC` | OS antiga que match o termo **não aparece** na busca (falso negativo — padrão Torres). **Lista principal NÃO é limitada a 300** (`fetchMissions` usa `fetchAllPagesOf` pageSize=1000). | Central OS — **somente busca** | Paginar busca ou remover limit; busca por ID direto; não corrigir `fetchMissions` |
| 2 | `MissionForm.tsx:634` | `fetchParentMissions` sugestões OS mãe | `missions` | **50** | `created_at DESC` | Mães antigas fora do top 50 invisíveis ao vincular filha | Form nova OS | Aumentar limit + filtro por ID/cliente; busca server-side por termo |
| 3 | `UpdateMissionModal.tsx:1842` | `fetchParentSuggestions` (Mesma OS) | `missions` | **50** | `created_at DESC` | Idem #2 na edição | Modal edição OS | Idem #2 |
| 4 | `UpdateMissionModal.tsx:1858` | busca `ilike` ID mãe | `missions` | **10** | ilike id | Poucas sugestões de vínculo | Modal edição OS | Paginar ou buscar por ID exato sem limit baixo |
| 5 | `PendingTollConfirmationBanner.tsx:38` | banner pedágio pendente | `missions` | **200** | — | OS com pedágio pendente além de 200 não aparecem no banner | Banner global | Paginar ou query sem limit com índice |
| 6 | `TollConfirmationDialog.tsx:69` | diálogo confirmação | `missions` | **10** | — | Poucas OS no diálogo | Modal pedágio | Aumentar limit / paginar |
| 7 | `ClientMissionRequest.tsx:29` | geração ID sequencial | `missions` | implícito | `created_at DESC` | Colisão teórica de ID (escopo pequeno) | Portal cliente | Sequence dedicada ou UUID |
| 8 | `useDashboardDiretoriaData.ts:200` | fetch quotes funil | **`quotes`** | **500** | `created_at DESC` | Funil comercial truncado | Cockpit Diretoria | `fetchAllPages` como missions |
| 9 | `MaintenanceDashboard.tsx:135` | `fetchBackupHistory` | `backup_history` | **10** | `created_at DESC` | Histórico backup UI truncado (**não missions**) | Manutenção sistema | Paginar UI — prioridade baixa |

### 1.3 Padrão Torres (consulta parcial → não encontrado)

| Cenário | Onde | Mecanismo | Classificação |
|---------|------|-----------|---------------|
| Busca OS termo ≥2 chars | `MissionTable` L1135 | max 300 `created_at DESC` | 🔴 |
| Lista principal por período | `fetchMissions` | paginação 1000 — **não** é o defeito | 🟢/🔵 |
| Sugestão OS mãe | `MissionForm` / `UpdateMissionModal` | top 50/10 | 🔴 |
| Funil cotações diretoria | `useDashboardDiretoriaData` | top 500 quotes | 🔴 |

### 1.4 ⚪ INDETERMINADO residual (8) — justificativa documentada

| Arquivo | Linha | Justificativa baixo impacto / fase futura |
|---------|-------|-------------------------------------------|
| `lib/investimentos/gestaoInvestimentoApi.ts` | 563, 765 | Módulo investimentos — escopo Diretoria; Fase dedicada investimentos |
| `lib/osAnalysis/osAnalysisService.ts` | 206, 270 | Análise OS — não afeta faturamento; validar na Fase comercial/ops |
| `api/recalculate-open.ts` | 89 | Endpoint admin com auth; paginação interna — validar em hardening |
| `api/whatsapp/send-group.ts` | 166, 170 | WhatsApp — fora escopo financeiro OS |
| `server/whatsappTelemetry.ts` | 449–467 | Telemetria — não financeiro |
| `components/RankingDHL.tsx` | 132 | Ranking operacional DHL — exibição; não persiste valores |
| `lib/dhl-intake/dhlIntakePublicApi.ts` | 78 | API pública intake — worker batch |

---

## 2. MISSIONTABLE `.limit(300)` — REGISTRO EXPLÍCITO

### O que NÃO usa limit 300

A **lista principal** (`fetchMissions` → `fetchScoped` → `fetchAllPagesOf`) usa **paginação 1000** até esgotar período + OS abertas (`OPEN_OR`).

### O que USA limit 300

**Somente** busca server-side (termo ≥2 em `osFilterTerm`/`searchTerm`):

```
order('created_at', { ascending: false }) → .limit(300)
```

### Impacto

| Área | Impacto |
|------|---------|
| Operação diária (HOJE/SEMANA) | 🟢 Baixo |
| Busca OS antiga fora top 300 | 🔴 Alto — falso negativo |
| Relatórios / faturamento | 🟢 Fontes independentes |
| Edição por busca | 🟠 Médio |

**Correção futura:** alterar **apenas** o `useEffect` de busca L1128–1136 — **não** `fetchMissions`.

---

## 3. SEIS FALLBACKS FINANCEIROS 🔴 — TABELA INDIVIDUAL

| # | Local | Dado esperado | Dado ausente | Fallback atual | Valor que pode produzir | Consequência financeira | Tipos de risco | Solução futura |
|---|-------|---------------|--------------|----------------|-------------------------|-------------------------|----------------|----------------|
| **FB-01** | `lib/missionFinancialsCanonical.ts` → `computeCanonicalRevenueCost` | `revenue_value` + `cost_value` salvos e/ou `billing_approved` | Valores null/parciais sem verificação | Chama `calculateMissionFinancials` (motor tabelas) | Receita/custo **estimados** tratados como reais em telas canônicas | Totais Diretoria/faturamento divergentes do persistido | Margem/lucro incorretos; apenas exibição se não faturado; **cobrança errada** se aprovar sem conferir | FAIL-CLOSED: flag `source:'estimated'` bloqueia aprovação; exigir verificação |
| **FB-02** | `lib/financialUtils.ts` → `calculateMissionFinancials` | Tabela cliente/fornecedor match | Sem match na tabela | Fallback DHL por UF / regra 200KM genérica | Receita/custo por heurística regional | Estimativa incorreta vira base de negociação | Cobrança errada cliente; pagamento errado fornecedor; margem incorreta | Alertar "sem tabela"; não estimar em OS verificadas |
| **FB-03** | `lib/missionLinkage.ts` + persistência | `is_same_os=true` + `parent_mission_id` | Só `parent_mission_id` sem `is_same_os` | `isLinkedChildMission` retorna false se `is_same_os===false`; mas custo **não** zerado automaticamente | `cost_value` > 0 em filha mal marcada | Custo fornecedor duplicado | Custo duplicado; pagamento errado fornecedor; margem incorreta | Validação ao salvar: filha exige `is_same_os` + zerar custo/pedágio forn |
| **FB-04** | `ClientBillingReport.tsx` ~L645 (charts `clientTotals`) | Pedágio fornecedor 0 em filha | `is_same_os` ignorado no chart | `tollProv = toll_value_provider ?? toll_value` sem `resolveStoredProviderToll(..., is_same_os)` | Custo inflado no gráfico por cliente | Gráfico mostra custo maior | Custo duplicado (visual); margem incorreta (visual) | Usar `resolveStoredProviderToll` + `cost=0` se filha |
| **FB-05** | `FinancialDRE.tsx` L108 | Pedágio fornecedor 0 em filha | `is_same_os` ignorado na soma | `toll_value_provider \|\| toll_value` em **todas** OS | Pedágio fornecedor somado em filhas | DRE custos variáveis inflados | Custo duplicado; margem/lucro incorretos | Filtrar `is_same_os` ou usar `resolveStoredProviderToll` |
| **FB-06** | `lib/financialUtils.ts` → seleção tabela fornecedor | Tabela específica do fornecedor/região | Sem match | Fallback tabela 200KM / genérica do fornecedor | `cost_value` estimado errado | Pagamento fornecedor baseado em estimativa | Pagamento errado fornecedor; margem incorreta | FAIL-CLOSED + alerta MissingTableDialog |

### Matriz de risco por fallback

| Fallback | Cobrança cliente | Pagamento fornecedor | Pedágio dup. | Custo dup. | Receita dup. | Margem/lucro | Só exibição |
|----------|------------------|---------------------|--------------|------------|--------------|--------------|-------------|
| FB-01 | 🟠 possível | 🟠 possível | — | — | — | 🔴 | 🟠 |
| FB-02 | 🔴 | 🔴 | — | — | — | 🔴 | 🟠 |
| FB-03 | — | 🔴 | 🟠 | 🔴 | — | 🔴 | — |
| FB-04 | — | — | 🔴 | 🔴 | — | 🔴 | 🔴 |
| FB-05 | — | — | 🔴 | 🔴 | — | 🔴 | 🔴 |
| FB-06 | — | 🔴 | — | 🟠 | — | 🔴 | 🟠 |

---

## 4. OS MÃE / FILHA — REGRA REAL HOJE + ÁRVORES

### Campos e helpers (`lib/missionLinkage.ts`, `lib/toll/clientTollBilling.ts`, `lib/financialUtils.ts`)

- **Filha oficial:** `parent_mission_id` preenchido + `is_same_os !== false`
- **Ao criar filha (Mesma OS):** `MissionForm` / `UpdateMissionModal` setam `is_same_os: true`, `parent_mission_id`
- **Motor financeiro:** `is_same_os` zera base custo, KM/hora excedente fornecedor, pedágio fornecedor (`billableProviderToll`, `financialUtils`)
- **Canônico:** `computeCanonicalRevenueCost` usa `resolveStoredProviderToll(..., is_same_os)` — pedágio forn 0 em filha
- **Não copia automaticamente** cliente/fornecedor da mãe — operador preenche; sugestões limitadas (🔴 #2–4)
- **Receita filha:** nova `revenue_value` independente (nova cobrança cliente)

### Árvore OS MÃE (comportamento implementado)

```
OS MÃE
├── cobrança cliente → revenue_value + toll_value (cliente) + displacement_value
├── custo fornecedor → cost_value + toll_value_provider + displacement_value_provider
├── pedágio cliente → toll_value (regra markup >R$10)
├── pedágio fornecedor → toll_value_provider (valor real)
├── contas a receber → financial_transactions geradas no faturamento/aprovação
├── contas a pagar → transações fornecedor + pedágio
├── DRE → soma revenue_value; custo se is_same_os≠true; pedágio forn em TODAS (🔴 FB-05)
├── relatórios → MissionReportPage usa canônico; ReportsDashboard usa motor
└── Diretoria → computeCanonicalRevenueCost (🟢); agrega filhas separadamente
```

### Árvore OS FILHA (`is_same_os=true`)

```
OS FILHA
├── nova cobrança cliente → revenue_value própria (🟢)
├── reaproveitamento fornecedor → operacional (mesmo prestador esperado, não automático)
├── custo fornecedor esperado → cost_value=0, pedágio forn=0 no motor (🟢 ao salvar)
├── pedágio cliente → toll_value próprio (🟢)
├── pedágio fornecedor → 0 no motor/canônico (🟢)
├── contas a receber → linha própria se faturada (🟢)
├── contas a pagar → sem custo base se zerado (🟢)
├── DRE → receita somada; custo base excluído (L107); pedágio forn SOMADO (🔴 violação)
├── relatórios → MissionReportPage mostra custo 0 (🟢); charts faturamento (🔴 FB-04)
└── Diretoria → canônico correto (🟢); margem filha isolada pode parecer 100% (🟠 interpretação)
```

### Violações da própria regra (implementação vs regra de negócio)

| # | Regra esperada | Onde viola | Severidade |
|---|----------------|------------|------------|
| V-01 | Pedágio fornecedor 0 em filha | `FinancialDRE.tsx` L108 | 🔴 |
| V-02 | Custo total filha sem pedágio forn | `ClientBillingReport.tsx` charts L645 | 🔴 |
| V-03 | Filha sempre com `is_same_os` | Dados históricos só `parent_mission_id` | 🟠 FB-03 |
| V-04 | Busca/vínculo mãe confiável | limits 50/10/300 | 🟠 operacional |
| V-05 | Margem familiar consolidada | Cada OS calculada isolada em LowMargin/Losses | 🟡 exibição |

---

## 5. SSOT — MAPA DOS MOTORES DE CÁLCULO

**Objetivo futuro:** uma fonte oficial por conceito. **Nesta fase:** apenas mapa — sem consolidar.

| CÁLCULO | MOTOR / FUNÇÃO | ARQUIVO | CONSUMIDORES PRINCIPAIS | PERSISTE OU RECALCULA | DIVERGÊNCIA |
|---------|----------------|---------|-------------------------|----------------------|-------------|
| Valor base cliente | `calculateMissionFinancials` → `client.base` | `lib/financialUtils.ts` | MissionFinancialModal, MissionCard, MissionTable (projeção), ClientBillingReport (charts) | Recalcula; persiste em `revenue_value` na aprovação | Charts vs canônico |
| Valor base fornecedor | idem → `provider.base` | `lib/financialUtils.ts` | idem | Recalcula; persiste em `cost_value` | FB-06 fallback tabela |
| Franquia KM cliente | tabela `franchise_km` + regras DHL/200KM | `lib/financialUtils.ts` | Modal, motor, seed scripts | Recalcula | Fork `export_relatorio/financialUtils.ts` desatualizado |
| KM excedente cliente | `excessKm * unitPriceKm` | `lib/financialUtils.ts` | Modal, relatórios, DHL tests | Recalcula | — |
| Franquia horas cliente | `franchise_hr` tabela | `lib/financialUtils.ts` | Modal | Recalcula | — |
| Hora excedente cliente | `excessHr * unitPriceHr` | `lib/financialUtils.ts` | Modal | Recalcula | — |
| Franquia/excedente fornecedor | idem provider side; `is_same_os` zera | `lib/financialUtils.ts` | Modal, VendorVerification | Recalcula | Filha mal marcada |
| Pedágio cliente | `billableClientToll` / `resolveStoredClientToll` | `lib/toll/clientTollBilling.ts` | Canônico, DRE, faturamento | Persiste `toll_value` | Legado mesmo valor |
| Pedágio fornecedor | `billableProviderToll` / `resolveStoredProviderToll` | `lib/toll/clientTollBilling.ts` | Canônico (🟢), DRE (🔴), charts (🔴) | Persiste `toll_value_provider` | FB-04, FB-05 |
| Deslocamento (DESL) | `resolveDisplacementFromAuthorizedKm` | `lib/financialUtils.ts` | Canônico, ClientBillingReport | Colunas `displacement_*` | Derivação KM autorizado |
| Receita total | `computeCanonicalRevenueCost` → `rev` | `lib/missionFinancialsCanonical.ts` | Diretoria, LowMargin, Losses, MissionReportPage | MIX saved/estimated | FB-01 |
| Custo total | idem → `cost` | `lib/missionFinancialsCanonical.ts` | idem | MIX | FB-01, FB-03 |
| Margem / lucro | `profit = rev - cost` | `missionFinancialsCanonical.ts` | Diretoria, dialogs, ranking | Recalcula | Telas sem canônico |
| Comissão RH | `calculateCommissionForEmployee` | `lib/rh/commissionAuto.ts` | `server/rhRoutes.ts`, folha | Persiste `rh_commissions` | Sem vínculo comercial CRM |
| Auto-pricing fornecedor | `providerAutoPricing` / `extractAutoMasterConfigFromProvider` | `lib/providerAutoPricing.ts` | ProviderForm, motor via synthetic rows | Colunas `providers.auto_*` | Paralelo a tabelas manuais |
| Recálculo servidor | bulk/single recalculate | `server/routes.ts`, `api/recalculate-open.ts` | Admin, cron | **Persiste** colunas missions | Autoritativo pós-trigger |
| Export legado | fork parcial | `export_relatorio/financialUtils.ts` | 5 arquivos pasta export | Desatualizado | **Violação SSOT potencial** |
| DRE agregado | soma direta colunas | `FinancialDRE.tsx` | Tela DRE | Lê DB, não canônico | FB-05 |
| Charts faturamento | soma direta + motor chart | `ClientBillingReport.tsx` | Faturamento | Lê DB + recalcula chart | FB-04 |

---

## 6. MATRIZ FINAL DE SINCRONISMO

Legenda: 🟢 sincronizada | 🟡 parcial | 🔴 divergente | ⚪ não validada

| Ligação | Status | Realtime | Cache | Refetch | Fallback | Origem do dado |
|---------|--------|----------|-------|---------|----------|----------------|
| OS → Central OS (lista período) | 🟢 | Sim (`supabase:missions:realtime`) | estado local | `refreshMissions` | — | DB `missions` paginado |
| OS → Central OS (busca texto) | 🔴 | N/A | `searchMatches` | debounce 400ms | sem 2ª página | DB limit 300 |
| OS → Modal financeiro | 🟢 | `refreshMissions` | — | por ID | motor se sem salvo | DB + `calculateMissionFinancials` |
| OS → Aprovação faturamento | 🟡 | parcial | — | manual | FB-01 | DB + billing flags |
| OS → Fornecedor (verificação) | 🟢 | `refreshMissions` | — | modal | — | DB |
| OS → Faturamento (`ClientBillingReport`) | 🟡 | Sim | agrupamentos | período | FB-04 charts | CAN + DB |
| Faturamento → Contas a receber | 🟡 | transações realtime | — | mount | Asaas sync | `financial_transactions` |
| Faturamento → Contas a pagar | 🟡 | idem | — | mount | — | `financial_transactions` |
| OS → Relatórios (`MissionReportPage`) | 🟢 | ⚪ sem listener | query própria | filtro período | canônico | DB + CAN |
| OS → Relatórios (`ReportsDashboard`) | 🟡 | ⚪ | — | período | motor direto | DB + CALC |
| OS → DRE | 🔴 | **Sem listener** | mount único | botão gerar | soma direta L108 | DB colunas |
| OS → Diretoria | 🟢 | ⚪ hook manual | React Query | botão refresh | CAN | DB + CAN |
| Aprovação → DRE | 🔴 | — | — | — | FB-05 | DRE não reage |
| Aprovação → Diretoria | 🟡 | — | RQ invalidação parcial | refresh manual | — | CAN |
| Dashboard operacional → OS | 🔴 | **Sem listener** | mount | F5 | — | DB stale |
| Quotes → Diretoria funil | 🔴 | RQ | cache | — | limit 500 | DB truncado |

### Risco documentado: OS atualizada no banco, usuário vendo valor antigo

| Tela | Risco |
|------|-------|
| `Dashboard` | 🔴 até F5 |
| `FinancialDRE` | 🔴 até regerar |
| `FinancialDashboard` | 🔴 |
| `DashboardDiretoria` | 🟡 até refresh |
| `MissionReportPage` | 🟡 até refiltrar |
| `MissionTable` | 🟢 patch/refetch |

---

## 7. REALTIME / CACHE — CONSOLIDAÇÃO

### Fluxo missions

```
Supabase Realtime (missions)
  → RealtimeProvider.handleChange('missions')
  → debounce 2s
  → window: supabase:missions + supabase:missions:realtime
  → INSERT/DELETE → refreshMissions
  → MissionTable: patch in-place (UPDATE) ou refetch
```

### `TABLE_TO_QUERY_KEYS.missions = []`

React Query **não** invalida queries de missions. Atualização depende de eventos `window` e refetch manual.

### Telas com listener `refreshMissions` / realtime missions

`MissionTable`, `ClientBillingReport`, `MissionFinancialModal`, `VendorVerificationControl`, `MissionAlertMonitor`, `PendingTollConfirmationBanner`, `OsAnalysisDiretoriaModal`

### Telas SEM listener (confirmado)

| Tela | Status |
|------|--------|
| `Dashboard` | 🔴 sem listener |
| `FinancialDRE` | 🔴 sem listener — fetch mount |
| `FinancialDashboard` | 🔴 sem listener |
| `DashboardDiretoria` | 🟡 `useDashboardDiretoriaData` — refresh manual / invalidação RQ parcial |

### `presence-refresh.test.ts`

Escopo **RH/ponto** (`lib/presenceChannel.ts`), **não** missions. Padrão paralelo de EventTarget — não cobre lista OS.

---

## 8. RELATÓRIOS — VALIDAÇÃO AMOSTRAL READ-ONLY

### Tentativa de validação

| Método | Resultado |
|--------|-----------|
| Smoke prod `/api/health`, `/api/version` | 🟢 200 |
| Query Supabase missions (amostra OS mãe/filha/excedente) | ⚪ **NÃO VALIDADO** — sem sessão/credencial de leitura no ambiente cloud |
| Comparação OS → faturamento → DRE → Diretoria runtime | ⚪ **NÃO VALIDADO** — exige login UI ou service role (não disponível no agente) |
| Testes unitários existentes | `scripts/toll-client-billing.test.ts`, `mission-billing-audit.test.ts`, `dashboard-diretoria.test.ts` — cobrem regras parciais, não amostra prod |

### Amostras planejadas (não executadas — motivo documentado)

| Tipo OS | O que comparar | Status |
|---------|----------------|--------|
| OS normal | `revenue_value` vs CAN vs relatório | ⚪ NÃO VALIDADO — sem dados prod |
| OS mãe | custo + pedágio vs filhas | ⚪ idem |
| OS filha | custo 0, pedágio forn 0 vs DRE | ⚪ idem — **código indica divergência DRE** |
| OS excedente | KM/hora vs modal vs relatório | ⚪ idem |
| OS pedágio | toll cliente vs fornecedor | ⚪ idem — testes unitários 🟢 |
| OS concluída / cancelada | regra REFUSED/zero | ⚪ idem — testes parciais 🟢 |
| OS cancelada com valores | `cancelledWithValues` motor | ⚪ idem |

> **Regra:** não inferir correção por ausência de teste. Divergências **em código** (FB-04, FB-05) contam como achados mesmo sem amostra runtime.

---

## 9. SMOKE TEST

| Endpoint / ação | HTTP | Resultado |
|-----------------|------|-----------|
| `GET /api/health` | 200 | 🟢 `{"status":"ok"}` |
| `GET /api/version` | 200 | 🟢 `3.7.60` build `d78e3ed3` |
| `GET /api/gemini/health` | 200 | 🟢 `{"ok":true}` |
| Login UI | — | ⚪ **NÃO VALIDADO — EXIGE AMBIENTE/CONTA DE TESTE** |
| CRUD OS / escrita | — | ⚪ **NÃO VALIDADO — EXIGE ESCRITA** |
| Browser amplo | — | ⚪ **NÃO VALIDADO** — sem sessão |

**Mecanismos verificados antes de pedir credencial:** `.env.example` existe; sem conta teste commitada; smoke read-only prod OK.

---

## 10. FUNCIONALIDADES INACABADAS — INVENTÁRIO FECHADO

| Funcionalidade | Estado atual | % aprox. | Dependências | Recomendação |
|----------------|--------------|----------|--------------|--------------|
| **AI Chat** (`AIChatbot`, `case 'ai-support'`) | Componente existe; `App.tsx` retorna `null` | 40% | Gemini, permissão legada | **FINALIZAR** ou remover case |
| **BillingControlCenter** | Componente completo; **sem rota** no `App.tsx` atual | 90% órfão | Substituído por `ClientBillingReport`? | **INVESTIGAR** remoção |
| **replit_integrations** (chat/image/batch) | Arquivos em `server/replit_integrations/`; **não registrados** em `createApp` | 10% | Legado Replit | **REMOVER FUTURAMENTE** |
| **mission-report** | Tela + menu; divergência Giovanna App↔Sidebar | 85% | Alinhar permissões | **FINALIZAR** auth |
| **Gestão Investimento** (`GestaoInvestimento`) | UI + API + SQL + testes Fase 2 | 70% | `canAccessDiretoriaMenu`, cron refresh-cache | **FINALIZAR** escopo F2 trading |
| **Gestor Comercial / CRM leads** | **Não existe** | 0% | — | Planejado — fora escopo |
| **Motor comissões comercial** | Só RH (`rh_commission_rules`) | 30% | OS → agentes → RH | Planejado — fora escopo |
| **Dossiê jurídico vigilante** | **Não existe** | 0% | — | Planejado — fora escopo |
| **CostOptimizationDashboard** | Parcial — métricas AIChatbot logs | 50% | system_logs | **INVESTIGAR** |
| **ExecutiveDashboard** | Existe; uso limitado | 60% | — | **INVESTIGAR** adoção |

---

## 11. COMERCIAL / COMISSÕES / JURÍDICO — O QUE EXISTE HOJE

### Comercial (existente — não confundir com planejado)

| Item | Onde | Função real hoje |
|------|------|------------------|
| `QuoteList` + `QuoteForm` | `App.tsx` cases `quotes`, `quote-form` | CRUD cotações por cliente |
| `CommercialProposalModal` | ClientForm / propostas | Insert `commercial_proposals` |
| `ContractManager` | `App.tsx` `contract-manager` | Gestão propostas comerciais / status |
| Tabela `quotes` | Supabase | Funil diretoria (limit 500 🔴) |
| Tabela `commercial_proposals` | Supabase | Propostas — realtime registrado |
| **Não existe:** CRM leads, gestor comercial permanente, vínculo cliente↔responsável | — | Planejado futuro |

### Comissões (existente)

| Item | Onde | Função real hoje |
|------|------|------------------|
| `lib/rh/commissionAuto.ts` | Motor | Calcula comissão por `rh_commission_rules` (% ou fixo) |
| Tabelas `rh_commissions`, `rh_commission_rules` | Supabase | Persistência mensal por funcionário |
| `server/rhRoutes.ts` | API | `auto_calculate` por missão |
| Folha | `lib/rh/payrollClient.ts` | Soma comissões no holerite |
| **Não existe:** comissão comercial de vendas, vínculo permanente cliente↔vendedor | — | Planejado futuro |

### Jurídico (existente)

| Item | Onde | Função real hoje |
|------|------|------------------|
| `LegalDashboard` | `App.tsx` `legal-dashboard` | Busca processos DataJud, histórico, monitorados |
| `/api/monitored-processes` | server | CRUD processos monitorados |
| `/api/datajud/*` | api | Consulta tribunais |
| Tabela `monitored_processes` | Supabase | Persistência monitoramento |
| **Não existe:** dossiê jurídico vigilante terceirizado | — | Planejado futuro |

### Perfis especiais existentes

- `canAccessDiretoriaMenu` — só Thiago Moreira / Thiago Santos
- `isFinanceSupervisorName` — Giovanna (supervisão financeira, não mission-report no App)
- `canRequestOsAnalysis` / `OS_ANALYSIS_DEFAULT_RECIPIENT_HINTS` — Barbara, Giovanna

---

## 12. SEGURANÇA FUNCIONAL — MENU → ROTA → COMPONENTE → API

### Divergências confirmadas

| Tela | Sidebar | App.tsx | API / Backend | Tipo |
|------|---------|---------|---------------|------|
| `mission-report` | Giovanna ✅ (`allowedNames`) | Giovanna ❌ (L487 sem `giovanna`) | Supabase direto (RLS) | 🔴 **controle visual ≠ rota** |
| `shift-handover` | todos ✅ | comercial bloqueado sem perm | — | 🟡 |
| `diretoria-cockpit` | `canAccessDiretoriaMenu` | idem | `gestaoInvestimentoRoutes` idem | 🟢 |
| `fin-billing` | role-based | sem gate extra App | `requireAuth` rotas financeiras | 🟡 menu ≠ API role |
| `ranking-dhl` | roles fixos | roles fixos | — | 🟢 |

### Caso mission-report (detalhe)

- **Sidebar** L168–173: `giovanna` em `allowedNames`
- **App.tsx** L487: `['daniel', 'barbara', 'bárbara', 'thiago moreira']` — **sem giovanna**
- **Efeito:** Giovanna vê menu, clica, cai no `Dashboard` — mesma classe de bug que mission-report no histórico
- **API:** `MissionReportPage` lê Supabase client-side — segurança real depende de **RLS Supabase**, não do App

### Endpoints sensíveis sem `requireAuth` (amostra)

| Rota | Risco |
|------|-------|
| `POST /api/migration/add-mission-columns` | 🟠 expõe SQL sugerido — sem auth |
| `POST /api/migrations/provider-ops-columns` | 🟠 idem |

### replit_integrations

Rotas **não registradas** — risco baixo hoje (código morto), mas arquivos expõem padrão legado se reativados.

**Regra futura:** nenhuma segurança deve depender só de esconder menu.

---

## 13. ENDPOINTS — RESUMO (~313 paths)

| Categoria | Qtd aprox. | Notas |
|-----------|------------|-------|
| UI / missões / financeiro | ~227 | Maioria `requireAuth` |
| Webhook | ~12 | Asaas, PlugNotas, Z-API |
| Cron | ~10 | billing-sync, investimento |
| Integração externa | ~25 | Gemini, DataJud, DHL |
| Admin | ~20 | recalculate, cleanup |
| Migration/setup | ~5 | **alguns sem auth** 🟠 |
| Legado não registrado | 6 | `replit_integrations` |
| Indeterminado | ~18 | aliases dinâmicos |

---

## 14. BACKLOG PRIORIZADO P0–P3 (FILA OFICIAL — NÃO IMPLEMENTAR)

### P0 — Integridade / Segurança

| ID | Causa | Impacto | Componentes | Dependências | Fase correção |
|----|-------|---------|-------------|--------------|---------------|
| P0-01 | `FinancialDRE` soma pedágio forn em filhas | Custo/lucro DRE errado | `FinancialDRE.tsx` | `resolveStoredProviderToll` | Fase 3 |
| P0-02 | Charts faturamento ignoram `is_same_os` pedágio | Gráfico custo inflado | `ClientBillingReport.tsx` L645 | toll lib | Fase 3 |
| P0-03 | `computeCanonicalRevenueCost` FAIL-OPEN | Aprovação com estimativa | `missionFinancialsCanonical.ts` | fluxo aprovação | Fase 3 |
| P0-04 | Migration endpoints sem auth | Superfície ataque / SQL leak | `server/routes.ts` L2664+ | — | Fase 3 imediata |
| P0-05 | Divergência Giovanna mission-report | UX + possível bypass RLS se mal configurado | `App.tsx`, `Sidebar.tsx` | RLS audit | Fase 3 |

### P1 — Sincronismo / SSOT

| ID | Causa | Impacto | Componentes | Dependências | Fase |
|----|-------|---------|-------------|--------------|------|
| P1-01 | MissionTable busca limit 300 | OS antiga invisível na busca | `MissionTable.tsx` L1135 | — | Fase 3 |
| P1-02 | Dashboard/FinancialDRE sem realtime | Valores stale | `Dashboard`, `FinancialDRE` | RealtimeProvider | Fase 3 |
| P1-03 | Fork `export_relatorio/financialUtils.ts` | Divergência export | pasta export | consolidar SSOT | Fase 4 |
| P1-04 | DRE usa soma direta vs canônico | Totais ≠ Diretoria | `FinancialDRE.tsx` | CAN | Fase 3 |
| P1-05 | Quotes limit 500 diretoria | Funil truncado | `useDashboardDiretoriaData.ts` | fetchAllPages | Fase 3 |
| P1-06 | `parent_mission_id` sem `is_same_os` | Custo duplicado | persistência OS | validação save | Fase 3 |
| P1-07 | Fallback tabela fornecedor genérico | Custo estimado errado | `financialUtils.ts` | MissingTable | Fase 3 |

### P2 — Funcionalidade

| ID | Causa | Impacto | Componentes | Fase |
|----|-------|---------|-------------|------|
| P2-01 | AI Chat retorna null | Feature morta | `App.tsx`, `AIChatbot` | Fase 4 |
| P2-02 | BillingControlCenter órfão | Código morto confuso | componente | Fase 4 |
| P2-03 | Gestão Investimento 70% | Feature incompleta | UI+API | Fase 4 |
| P2-04 | Sugestões OS mãe limit 50/10 | Vínculo filha difícil | MissionForm, UpdateMissionModal | Fase 3 |
| P2-05 | Banner pedágio limit 200 | OS não alertadas | PendingTollConfirmationBanner | Fase 3 |

### P3 — Dívida técnica / Limpeza

| ID | Causa | Impacto | Componentes | Fase |
|----|-------|---------|-------------|------|
| P3-01 | replit_integrations não registrado | Código legado | `server/replit_integrations/` | Fase 4 |
| P3-02 | 8 limit ⚪ residual investimentos/whatsapp | Baixo | vários | Fase 5+ |
| P3-03 | `presence-refresh` só RH | Padrão inconsistente | lib/presence | Fase 4 |
| P3-04 | Testes 5 fail fora escopo | CI ruidoso | scripts | Fase 4 |

---

## 15. MAPA FUNCIONAL (RESUMO 57 TELAS / 20 DOMÍNIOS)

Preservado do marco 55% — sem alteração. Domínios: OS/Operações, Financeiro, Faturamento, Fornecedores, Clientes, Diretoria, RH, Jurídico, WhatsApp, DHL, Investimentos, Configurações, Relatórios, Comercial (cotações), Patrimônio, NF, Asaas, Gemini/IA, Telemetria, Admin.

---

## 16. ALTERAÇÕES NESTA EXECUÇÃO

| Escopo | Alteração |
|--------|-----------|
| Código / banco / Vercel / produção | **Nenhuma** |
| Documentação | Este handoff — Fase 2 **100%** |
| Testes executados | Smoke read-only prod; classificação script limit/range |

---

## 17. NÃO INICIADO (aguardando autorização)

- **Fase 3** — correções P0/P1, RLS/schema
- Implementação Gestor Comercial / Jurídico vigilante / motor comissões comercial
- Deploy funcional
- Qualquer correção dos achados deste documento

---

## 18. GIT

| Item | Valor |
|------|-------|
| Branch | `cursor/fase2-raio-x-eaa8` |
| PR | #256 (draft, docs only) |
| Base | `main` |

---

> **Arquivo para análise no ChatGPT:**  
> `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`  
> Conteúdo integral neste arquivo — suficiente para planejar Fase 3 sem repetir Raio-X.

---

*Gerado em: 2026-08-12 UTC | Execução: Fase 2 Raio-X — **100% ENCERRADA***
