# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Arquivo oficial de handoff entre Cursor e ChatGPT.  
> Representa **somente** a última execução realizada.  
> **Não contém segredos, senhas, tokens ou API keys.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-12 (UTC) |
| **Fase** | **Fase 2 — Raio-X funcional, dependências e integridade (início)** |
| **Objetivo** | Diagnóstico completo antes de correções sistêmicas — investigar, não corrigir |
| **Baseline** | `baseline-fase1-merged-20260812` → `d78e3ed3` |
| **Produção** | `3.7.60` / `buildId d78e3ed3…` / health OK |
| **Código funcional alterado** | **NÃO** |
| **Branch** | `cursor/fase2-raio-x-eaa8` |

---

## PROGRESSO

| Métrica | Valor |
|---------|-------|
| **PROGRESSO DA FASE 1** | **100%** 🟢 |
| **PROGRESSO DA FASE 2** | **55%** 🔵 |
| **PROGRESSO GERAL DO PROGRAMA** | **13%** |

### Marcos Fase 2

| Marco | Status |
|-------|--------|
| 25% — Inventário telas + domínios + endpoints | ✅ |
| 50% — Árvore OS + SSOT amostra + inacabados + diretoria/jurídico | ✅ |
| 75% — Classificação completa limit/fallback/cache + matriz paridade | ⏳ pendente |
| 100% — Smoke funcional amplo + relatórios + riscos fechados | ⏳ pendente |

---

## RESULTADO PARCIAL

### 🔵 FASE 2 EM ANDAMENTO — DIAGNÓSTICO SEM CORREÇÕES

---

## 1. MAPA FUNCIONAL — TELAS (57 views + rotas públicas)

**Fonte:** `App.tsx`, `constants.ts` (`NAV_ITEMS`), `Sidebar.tsx`, `RhModule.tsx`.

### Resumo quantitativo

| Categoria | Qtd |
|-----------|-----|
| Cases em `App.tsx` | 57 (+ default) |
| Itens menu `NAV_ITEMS` | 38 telas + 7 grupos |
| Sub-rotas (forms) | ~15 |
| Rotas públicas | 3 (`/cadastro-operacional`, `/fornecedor/dhl`, `/reset-password`) |
| Retorna `null` | 1 (`ai-support`) |
| Órfã vs menu | ~5 divergências documentadas |

### Telas principais por domínio (classificação preliminar)

| Domínio | viewKey | Componente | Menu | Classificação | Perfis / notas |
|---------|---------|------------|------|---------------|----------------|
| **Dashboard** | `dashboard` | `Dashboard` | Sim | 🟢 | Todos |
| **OS** | `missions` | `MissionTable` | Sim | 🟢 | Central operacional |
| **OS** | `new-mission` | `MissionForm` | Sub-rota | 🟢 | Perm `new-mission` |
| **OS** | `mission-report` | `MissionReportPage` | Sim | 🟡 | Divergência menu↔App (Giovanna) |
| **OS** | `shift-handover` | `ShiftHandover` | Sim | 🟢 | Bloqueado cliente restrito |
| **Diretoria** | `diretoria-cockpit` | `DashboardDiretoria` | Sim* | 🟢 | *Só Thiagos no menu; role diretoria não abre |
| **Diretoria** | `gestao-investimento` | `GestaoInvestimento` | Sim* | 🟡 | Fase 2 investimentos parcial |
| **Diretoria** | `os-analysis-pending` | `OsAnalysisPendingPage` | Sim | 🟢 | Análise OS pendente |
| **Financeiro** | `fin-*` (10 telas) | vários | Sim | 🟢 | Bloqueado avançado/cliente |
| **Faturamento** | `fin-billing` | `ClientBillingReport` | Sim | 🟢 | Motor faturamento |
| **Clientes** | `clients`, forms | `ClientList`, `ClientForm`… | Sim | 🟢 | Tabelas preço/rota/veículo |
| **Fornecedores** | `providers`, forms | `ProviderList`… | Sim | 🟢 | Agentes, veículos, tecnologias |
| **RH** | `rh-*` | `RhModule` | Sim | 🟢 | diretoria / rh |
| **Jurídico** | `legal-dashboard` | `LegalDashboard` | Sim | 🟢 | DataJud + processos |
| **DHL** | `ranking-dhl` | `RankingDHL` | Sim | 🟢 | avançado/diretoria |
| **WhatsApp** | — | `WhatsAppConnectionPanel` em Settings | Sim | 🟢 | Configurações |
| **Relatórios** | `reports` | `ReportsDashboard` | Sim | 🟢 | Analíticos + exports |
| **Config** | `system-settings`, etc. | vários | Sim | 🟢 | diretoria/admin |
| **IA** | `ai-support` | `null` | Removido | ⚫ | `AIChatbot` importado morto |
| **Legado** | `fin-billing-control` | `BillingControlCenter` | Não | ⚫ | Sem case em App atual |
| **Legado** | — | `FinancialAuditor`, `CloudCostManager`… | Não | ⚫ | Componentes sem import |

### Divergências críticas menu ↔ App

| viewKey | Problema | Risco |
|---------|----------|-------|
| `mission-report` | Menu inclui Giovanna; App não | 🟠 Médio — menu visível, tela bloqueada |
| `diretoria-cockpit` | Role `diretoria` sem menu Thiago | 🟡 Médio — UX |
| `manual-override-settings` | Sem `NAV_ITEMS` | 🔵 Baixo — deep link only |
| `ai-support` | Case retorna `null` | 🔵 Baixo — legado |

### Modais globais (fora do switch)

`MissionFinancialModal`, `ProfileSettingsModal`, `WhatsAppOfflineModal`, `OsAnalysisDiretoriaModal`, `MissionAlertMonitor`, `TimeClockGate`, `ChangePasswordModal`, `MotivationGate`.

---

## 2. MAPA DE DOMÍNIOS

| Domínio | Telas principais | APIs / services | Tabelas centrais | Status |
|---------|------------------|-----------------|------------------|--------|
| **CLIENTE** | `ClientList`, `ClientForm`, rotas, veículos, usuários | Supabase direto + `/api/clients/*` | `clients`, `client_price_tables`, `client_routes`, `client_vehicles` | 🟢 |
| **FORNECEDOR** | `ProviderList`, `ProviderForm`, agentes | Supabase + escoltistas | `providers`, `provider_cost_tables`, `provider_escoltistas` | 🟢 |
| **VIGILANTE TERCEIRIZADO** | `ProviderAgentList`, cadastro público | `PublicAgentRegistration` | `agents`, `provider_escoltistas` | 🟢 |
| **OS** | `MissionTable`, `MissionForm`, modais | `/api/missions/*`, Supabase | `missions`, `mission_history`, `mission_logs` | 🟢 |
| **OS MÃE/FILHA** | `MissionForm` (Mesma OS) | `lib/missionLinkage.ts` | `missions.is_same_os`, `parent_mission_id` | 🟡 ver §5 |
| **TABELA CLIENTE** | `ClientForm` abas preço | Supabase | `client_price_tables` | 🟢 |
| **TABELA FORNECEDOR** | `ProviderForm` custos | Supabase | `provider_cost_tables` | 🟢 |
| **PEDÁGIO** | `MissionForm`, modal financeiro | `lib/toll/*`, `/api/toll/*` | `missions.toll_value`, `toll_value_provider` | 🟢 |
| **FATURAMENTO** | `ClientBillingReport` | `/api/billing/*`, recálculos | `missions` + snapshots logs | 🟢 |
| **CONTAS A RECEBER** | `FinancialTransactionList`, faturamento | Asaas + `financial_transactions` | `financial_transactions`, `financial_invoices` | 🟢 |
| **CONTAS A PAGAR** | idem | idem | idem | 🟢 |
| **FINANCEIRO** | `FinancialDashboard`, DRE, contas | `/api/asaas/*`, `/api/nf/*` | transações, categorias, contas | 🟢 |
| **COMISSÃO** | RH workspace, Cockpit RH tab | `lib/rh/commissionAuto.ts`, `/api/rh/*` | `rh_commissions`, `rh_commission_rules` | 🟡 |
| **RELATÓRIOS** | `ReportsDashboard`, `MissionReportPage` | vários `/api/admin/*` | misto | 🟢 |
| **DIRETORIA** | `DashboardDiretoria` | `lib/dashboardDiretoria/*` | agregações sobre missions + financeiro | 🟢 |
| **RH** | `RhModule` | `/api/rh/*` + Supabase | `rh_*` | 🟢 |
| **JURÍDICO** | `LegalDashboard` | `/api/datajud/*`, `/api/monitored-processes` | `monitored_processes` | 🟢 |
| **INVESTIMENTOS** | `GestaoInvestimento` | `/api/gestao-investimento/*` | tabelas gestão investimento | 🟡 Fase 2 parcial |
| **WHATSAPP** | Settings, modais | `/api/whatsapp/*`, `/api/zapi/*` | `whatsapp_instances`, mensagens | 🟢 |
| **DHL** | intake público, timeline, ranking | `/api/dhl/*` | `dhl_supplier_intakes`, resends | 🟢 |
| **PATRIMÔNIO** | `EquipmentManager` | `/api/patrimonio/*`, `/api/equipment/*` | `patrimonio_equipments` | 🟢 |
| **COMERCIAL** | `QuoteList`, `ContractManager`, propostas | Supabase | `quotes`, `commercial_proposals` | 🟡 sem CRM |

---

## 3. ÁRVORE DA OS (fluxo real)

| Etapa | Implementação | Status |
|-------|---------------|--------|
| CRIAÇÃO | `MissionForm` → insert `missions` | 🟢 |
| CLIENTE | select cliente + tabela preço | 🟢 |
| RESPONSÁVEL COMERCIAL | campo em cliente/OS (parcial) | 🟡 |
| TABELA CLIENTE | `client_price_tables` + motor `financialUtils` | 🟢 |
| FORNECEDOR | select + tabela custo | 🟢 |
| TABELA FORNECEDOR | `provider_cost_tables` | 🟢 |
| VIGILANTES | agentes no form / fornecedor | 🟢 |
| ORIGEM/DESTINO | form + geocode | 🟢 |
| KM/HORAS | franquias + excesso | 🟢 |
| PEDÁGIO | `lib/toll/clientTollBilling.ts` | 🟢 |
| APROVAÇÃO | `billing_approved`, status | 🟢 |
| FATURAMENTO | `ClientBillingReport` + override | 🟢 |
| CONTAS A RECEBER | `financial_transactions` + Asaas | 🟢 |
| CONTAS A PAGAR | idem | 🟢 |
| COMISSÃO | auto ao concluir OS (`commissionAuto`) | 🟡 |
| RELATÓRIOS | `MissionReportPage`, `ReportsDashboard` | 🟢 |
| DIRETORIA | `computeCanonicalRevenueCost` em agregações | 🟢 |

**Motor canônico:** `lib/financialUtils.ts` → `calculateMissionFinancials`; persistência via `lib/missionFinancialsCanonical.ts` → `computeCanonicalRevenueCost`.

---

## 4. OS MÃE / OS FILHA — REGRA EXISTENTE

| Pergunta | Resposta |
|----------|----------|
| Quando nasce filha? | Operador marca **Mesma OS** + escolhe `parent_mission_id` no `MissionForm` |
| O que reutiliza? | **Custo fornecedor zerado** (conceito operacional); **não** copia cliente/fornecedor/rota automaticamente |
| Cliente nova cobrança? | **Sim** — cada filha tem `revenue_value` próprio |
| Fornecedor nova cobrança? | **Não** — `cost_value=0`, pedágio fornecedor zerado na filha |
| Faturamento | Lista individual; badges MESMA OS; agregação em `LowMarginDialog`/`LossesDialog` |
| Financeiro/DRE | Exclui custo filha; risco se `toll_value_provider` não zerado |
| Risco duplicidade | 🟠 Somar receitas sem entender vínculo; margem da filha isolada parece alta |
| Arquivos-chave | `lib/missionLinkage.ts`, `lib/missionFinancialsCanonical.ts`, `MissionForm.tsx`, `server/routes.ts` recalc |

---

## 5. MATRIZ DE PARIDADE (amostra crítica)

| Dado | Fonte oficial aparente | Consumidores | Divergência |
|------|------------------------|--------------|-------------|
| `revenue_value` | Coluna `missions` após verificação OU `computeCanonicalRevenueCost` | MissionTable, MissionFinancialModal, ClientBillingReport, FinancialDRE, DashboardDiretoria | 🟡 POTENCIAL SSOT — alguns recalculam via `calculateMissionFinancials` |
| `cost_value` | idem | idem + DRE | 🟡 filha força 0; DRE pedágio fornecedor |
| `toll_value` / `toll_value_provider` | `lib/toll/clientTollBilling.ts` | Modal, faturamento, canônico | 🟠 charts ClientBillingReport podem não zerar filha |
| `billing_approved` | `missions` | Faturamento, diretoria abertas | 🟢 |
| Margem grupo OS mãe | `buildGroupSummary` | LowMarginDialog, LossesDialog | 🟢 agregado |
| Saldo caixa | `financial_transactions` + snapshots | FinancialDashboard, Diretoria | 🟡 snapshots vs transações |

**Violações SSOT candidatas (não consolidadas):**
- `export_relatorio/financialUtils.ts` — cópia paralela do motor (Fase 1 já citada)
- Recálculo frontend vs valor persistido em telas legadas
- RH payroll: Supabase client vs `/api/rh/payroll/*`

---

## 6. LIMIT / RANGE / PAGINAÇÃO

**Total ocorrências ativas:** 187 em `components/` + `lib/` + `server/` (excl. `attached_assets`).

### Top arquivos

| Arquivo | Ocorrências | Prioridade |
|---------|-------------|------------|
| `server/routes.ts` | 36 | 🔴 |
| `MissionFinancialModal.tsx` | 9 | 🔴 |
| `ClientBillingReport.tsx` | 5 | 🔴 |
| `MissionTable.tsx` | 4 | 🔴 |
| `useDashboardDiretoriaData.ts` | 4 | 🔴 |
| `dhlSupplierIntake.ts` | 6 | 🟡 |

### Amostra classificada

| Arquivo | Função/contexto | Limite | Classificação |
|---------|-----------------|--------|---------------|
| `MissionTable.tsx` | busca server-side termo | `.limit(300)` | 🔴 PERIGOSO se >300 OS match |
| `MissionTable.tsx` | período selecionado | fetch por intervalo | 🔵 PAGINADO (refatorado) |
| `useDashboardDiretoriaData.ts` | missões período | `fetchAllPages` + `.range` | 🔵 PAGINADO |
| `useDashboardDiretoriaData.ts` | quotes | `.limit(500)` | 🔴 PERIGOSO se >500 cotações |
| `ClientBillingReport.tsx` | logs ajuste | `missionIds.length * 5` | 🟣 AGREGADO condicional |
| `server/routes.ts` | vários endpoints | misto | ⚪ INDETERMINADO — auditar na 75% |

**Pendente Fase 2 (75%):** classificar todas as 187 ocorrências.

---

## 7. FALLBACKS (amostra)

| Padrão | Exemplo | Risco |
|--------|---------|-------|
| `computeCanonicalRevenueCost` | se não verificado → recalcula | 🟡 fail-open financeiro se tabela ausente |
| `missionLinkage` | `parent_mission_id` sem `is_same_os` | 🟠 custo não zerado |
| `localStorage userData` | nome usuário em modais | 🔵 baixo |
| `catch { /* silencioso */ }` | MissionTable busca | 🟡 mascara erro consulta |
| `?? 0` / `\|\| 0` | valores financeiros | ⚪ auditar caso a caso |

**Pendente:** inventário sistemático `??`, `||`, `fallback`, `default` em `lib/financialUtils.ts`, `missionFinancialsCanonical.ts`, `ClientBillingReport.tsx`.

---

## 8. CACHE E REALTIME

### Realtime (`lib/RealtimeProvider.tsx`)

- **55+ tabelas** com invalidação React Query parcial
- `missions` → invalidação **não mapeada** em `TABLE_TO_QUERY_KEYS` (array vazio) — 🟠 **presence-refresh** relacionado
- Demais tabelas: mapeamento para query keys específicas

### React Query

Usado em: `ProviderList`, `ProfileList`, partes financeiras. Cobertura **parcial**.

### localStorage

`userData`, `authToken`, preferências MissionTable, `openMissionOnLoad`, MotivationGate.

### Resposta sincronismo

| Evento | Telas que atualizam | Telas que podem precisar F5 |
|--------|---------------------|----------------------------|
| Editar OS | MissionTable (período), realtime parcial | Dashboard, Diretoria até refresh manual |
| Transação financeira | FinancialDashboard keys | ClientBillingReport |
| WhatsApp status | modais + realtime instances | — |

**Teste `presence-refresh`:** prioridade Fase 2 — indica gap realtime/presença.

---

## 9. ENDPOINTS (~313 paths)

| Categoria | Qtd aprox. | Notas |
|-----------|------------|-------|
| Utilizados UI | ~227 | grep components/lib |
| Cron/webhook | ~25 | sem UI esperado |
| Admin/migração órfã | ~15 | `/api/migration/*`, cleanup |
| Duplicado Express+serverless | ~48 | arquitetura Vercel intencional |
| Legado Replit não registrado | 6 | `server/replit_integrations/` |

**Top consumidores:** `/api/missions/:id/billing-override`, `force-recalculate`, `/api/os-analysis`, domínios Asaas/NF/WhatsApp.

---

## 10. FUNCIONALIDADES INACABADAS

| Item | Classificação | Notas |
|------|---------------|-------|
| `ai-support` / `AIChatbot` | **FINALIZAR** | API `/api/chat` viva, UI morta |
| Gestão Investimento Fase 2 | **FINALIZAR** | watchlist sem recomendação auto |
| Comissão API duplicada | **FINALIZAR** | client vs `/api/rh/commissions/calculate-mission` |
| `manual-override-settings` menu | **FINALIZAR** | fora NAV_ITEMS |
| Permissões fantasma (`client-reports`…) | **INVESTIGAR** | sem rota App |
| `BillingControlCenter` | **POSSÍVEL REMOÇÃO** | órfão |
| `replit_integrations/` | **POSSÍVEL REMOÇÃO** | não registrado |
| CRM/leads | **INVESTIGAR** | não existe — roadmap? |
| Provider Meta WhatsApp | **FINALIZAR** | stub não implementado |

---

## 11. RELATÓRIOS

| Relatório | Fonte | Paginação | Export | Paridade tela |
|-----------|-------|-----------|--------|---------------|
| `ReportsDashboard` | missions + logs + motor auto | misto | CSV múltiplos | 🟡 |
| `MissionReportPage` | missions + linkage | período | print | 🟢 |
| `ClientBillingReport` | missions + canônico | por seleção | PDF/email | 🟡 charts |
| `FinancialReport` | transações | ⚪ | ⚪ | ⚪ |
| `RHPointReport` | ⚫ órfão | — | — | — |
| DHL occurrence | `/api/dhl/occurrence-report` | API | PDF/HTML | 🟢 |
| DataJud diário | LegalDashboard + cron | API | email | 🟢 |

---

## 12. DIRETORIA (`DashboardDiretoria`)

**Abas:** Geral, Financeiro, Operação, Clientes & Fornecedores, RH & Comissões, Sistema.

**KPIs/gráficos:** faturamento, custos, margem vs meta, caixa, AR/AP, fluxo diário, funil cotações, OS mãe ativas, alertas críticos, comissões RH, billing Cursor.

**Fonte dados:** `useDashboardDiretoriaData` — `fetchAllPages` para missions/transações; `computeCanonicalRevenueCost` nas agregações.

**Calcula autonomamente:** sim — agregações em `lib/dashboardDiretoria/aggregations.ts`.

**Evolução futura preparada:** volume cliente/fornecedor, tendências — estrutura existe; não implementar agora.

---

## 13. JURÍDICO (`LegalDashboard`)

- Processos monitorados: CRUD via `/api/monitored-processes`
- DataJud: `/api/datajud/consulta`, relatório diário POST
- Tabela: `monitored_processes` (realtime ativo)
- **Comparar futuro:** dossiê vigilante terceirizado — não existe ainda

---

## 14. COMERCIAL / COMISSÃO

| Área | Existe? |
|------|---------|
| CRM/leads | **Não** |
| Cotações | `QuoteList`, `QuoteForm` 🟢 |
| Contratos | `ContractManager` 🟢 |
| Propostas | `CommercialProposalModal` 🟢 |
| Role comercial | permissões granulares 🟢 |
| Comissão | `rh_commission_rules`, auto OS, folha 🟡 |

---

## 15. TESTES CONHECIDOS (5 — não corrigidos)

| # | Suite | Fase destino | Prioridade Fase 2 |
|---|-------|--------------|-------------------|
| 1 | investment-accounts | investimentos | 🔵 |
| 2 | invoice-display | faturamento/NF | 🟡 |
| 3 | **presence-refresh** | realtime/sync | 🔴 **prioridade** |
| 4 | receivable-desc-nf | financeiro | 🟡 |
| 5 | zapi-sdk-cockpit | WhatsApp | 🟡 |

---

## 16. SMOKE TEST

| Área | Método | Resultado |
|------|--------|-----------|
| Produção health | `GET /api/health` | 🟢 ok |
| Produção version | `GET /api/version` | 🟢 `3.7.60` / `d78e3ed3` |
| Login/UI/browser | — | ⚪ NÃO VALIDADO (sem sessão operador) |
| CRUD OS | — | ⚪ NÃO VALIDADO — exigiria escrita |
| Demais áreas | — | ⚪ pendente smoke guiado |

---

## 17. RISCOS PRIORIZADOS

| Risco | Nível | Domínio |
|-------|-------|---------|
| `missions` sem invalidação React Query no realtime | 🔴 | Sincronismo |
| `MissionTable` busca `.limit(300)` | 🔴 | Integridade OS |
| Divergência menu/App `mission-report` | 🟠 | Permissões |
| OS filha margem isolada / charts pedágio | 🟠 | SSOT financeiro |
| `export_relatorio/financialUtils` duplicado | 🟠 | SSOT |
| Quotes `.limit(500)` diretoria | 🟠 | Integridade |
| Endpoints migração admin expostos | 🟡 | Segurança |
| Componentes órfãos (`attached_assets`, BillingControlCenter) | 🔵 | Dívida técnica |
| `TMSEG_RESEND` Vercel redundante | 🔵 | Config |

---

## 18. ALTERAÇÕES NESTA EXECUÇÃO

| Escopo | Alteração |
|--------|-----------|
| Código funcional | **Nenhuma** |
| Banco / Vercel / produção | **Nenhuma** |
| Documentação | Este handoff Fase 2 |

---

## 19. PENDÊNCIAS FASE 2 (para 75% e 100%)

1. Classificar **todas** as 187 ocorrências `.limit`/`.range`
2. Inventário completo de fallbacks financeiros fail-open
3. Matriz de paridade expandida (10+ campos críticos)
4. Smoke test browser com credencial teste (se disponível)
5. Mapa endpoint → consumidor para órfãos
6. Inventário cache por tela (completar)
7. Relatórios — validação fonte vs tela operacional

---

## 20. NÃO INICIADO

- **Fase 3** (RLS/schema profundo)
- Gestor Comercial
- Novo módulo Jurídico
- Refatoração motores financeiros
- Correções dos 5 testes (exceto investigação presence-refresh)

---

> **Arquivo para análise no ChatGPT:**  
> `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`

---

*Gerado em: 2026-08-12 UTC | Execução: Fase 2 Raio-X — marco 55%*
