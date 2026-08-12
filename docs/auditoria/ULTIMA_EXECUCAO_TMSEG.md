# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Arquivo oficial de handoff entre Cursor e ChatGPT.  
> Representa **somente** a última execução realizada.  
> **Não contém segredos, senhas, tokens ou API keys.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-12 (UTC) |
| **Fase** | **Fase 2 — Raio-X funcional (marco 75%)** |
| **Objetivo** | Classificar limit/range, aprofundar MissionTable, realtime, fallbacks, SSOT, paridade e permissões |
| **Baseline** | `baseline-fase1-merged-20260812` → `d78e3ed3` |
| **Produção** | `3.7.60` / health OK (smoke read-only) |
| **Código funcional alterado** | **NÃO** |
| **Branch** | `cursor/fase2-raio-x-eaa8` → PR #256 |

---

## PROGRESSO

| Métrica | Valor |
|---------|-------|
| **PROGRESSO DA FASE 1** | **100%** 🟢 |
| **PROGRESSO DA FASE 2** | **75%** 🔵 |
| **PROGRESSO GERAL DO PROGRAMA** | **16%** |

### Marcos Fase 2

| Marco | Status |
|-------|--------|
| 25% — Inventário telas + domínios + endpoints | ✅ |
| 50% — Árvore OS + inacabados + diretoria/jurídico | ✅ |
| **75% — limit/range classificado + MissionTable 300 + realtime + fallbacks + SSOT + paridade expandida** | **✅** |
| 100% — smoke browser amplo + classificação manual dos INDETERMINADOS + relatórios validados | ⏳ |

---

## RESULTADO PARCIAL

### 🔵 FASE 2 EM ANDAMENTO — DIAGNÓSTICO SEM CORREÇÕES

---

## PRESERVADO DO MARCO 55% (não refeito)

- 57 telas mapeadas (`App.tsx` + `Sidebar.tsx`)
- 20 domínios de negócio
- ~313 endpoints inventariados
- Árvore OS + regra OS mãe/filha base
- 5 testes conhecidos fora do escopo
- Funcionalidades inacabadas preliminares (AI Chat, BillingControlCenter, etc.)

---

## 1. LIMIT / RANGE — CLASSIFICAÇÃO DAS 187 OCORRÊNCIAS

**Escopo:** `components/`, `lib/`, `server/` (excl. `attached_assets`).

### Resumo por classificação

| Classificação | Qtd | % |
|---------------|-----|---|
| 🟢 SEGURO | 69 | 37% |
| 🔵 PAGINADO CORRETAMENTE | 31 | 17% |
| 🟣 AGREGAÇÃO/CONSULTA ESPECIALIZADA | 2 | 1% |
| 🔴 PERIGOSO | 9 | 5% |
| ⚪ INDETERMINADO | 76 | 41% |

### Resumo por arquivo (top 15)

| Arquivo | Ocorr. | Predominância |
|---------|--------|---------------|
| `server/routes.ts` | 36 | ⚪/🟢 — maioria admin, exists, paginação interna |
| `MissionFinancialModal.tsx` | 9 | ⚪ — logs/histórico |
| `dhlSupplierIntake.ts` | 6 | 🟣/⚪ — workers DHL |
| `ClientBillingReport.tsx` | 5 | 🟣 — proporcional a `missionIds` |
| `UpdateMissionModal.tsx` | 5 | 🔴/🟢 — sugestões OS limit 10 |
| `MissionTable.tsx` | 4 | 🔵 lista principal + 🔴 busca 300 |
| `useDashboardDiretoriaData.ts` | 4 | 🔵 missions/trans + 🔴 quotes 500 |

### 🔴 PERIGOSO — lista completa (prioridade máxima)

| Arquivo | Linha | Entidade | Limite | Ordenação | Risco |
|---------|-------|----------|--------|-----------|-------|
| `MissionTable.tsx` | 1135 | `missions` | **300** | `created_at DESC` | Busca textual: OS além das 300 mais recentes **invisíveis** na busca |
| `MissionForm.tsx` | 634 | `missions` | **50** | `created_at DESC` | Sugestões OS mãe: mães antigas fora do top 50 |
| `UpdateMissionModal.tsx` | 1842 | `missions` | **10** | `created_at DESC` | Vínculo OS: poucas sugestões |
| `UpdateMissionModal.tsx` | 1858 | `missions` | **10** | ilike id | Busca vínculo limitada |
| `PendingTollConfirmationBanner.tsx` | 38 | `missions` | **200** | — | Banner pedágio pode omitir OS |
| `ClientMissionRequest.tsx` | 29 | `missions` | implícito | `created_at DESC` | Geração ID sequencial — escopo pequeno |
| `TollConfirmationDialog.tsx` | 69 | `missions` | **10** | — | Diálogo confirmação pedágio |
| `useDashboardDiretoriaData.ts` | 200 | **`quotes`** | **500** | `created_at DESC` | Funil cotações truncado |
| `MaintenanceDashboard.tsx` | 135 | `backup_history` | alto | `created_at DESC` | Histórico backup truncado (não missions) |

### 🔵 PAGINADO CORRETAMENTE — padrão canônico

| Local | Padrão | Entidades |
|-------|--------|-----------|
| `MissionTable.fetchMissions` | `fetchAllPagesOf` — `pageSize=1000`, loop `.range` | `missions` (período + abertas) |
| `useDashboardDiretoriaData` | `fetchAllPages` idem | `missions`, `financial_transactions` |
| `MissionTable` agentes | `.range` paginado | `agents` |

### Padrão Torres (consulta parcial → não encontrado → fallback)

| Cenário | Onde | Mecanismo | Classificação risco |
|---------|------|-----------|---------------------|
| Busca OS termo ≥2 chars | `MissionTable` L1135 | max 300 por `created_at DESC`; OS antiga match **não aparece** | 🔴 |
| Lista principal por período | `fetchMissions` | paginação 1000 — **não** é o problema Torres na lista | 🟢/🔵 |
| Motor financeiro sem tabela | `financialUtils` | fallback DHL/região recalcula | 🟡 FAIL-OPEN |
| `computeCanonicalRevenueCost` sem valores salvos | `missionFinancialsCanonical` | chama `calculateMissionFinancials` | 🟡 FAIL-OPEN se verificação ausente |

---

## 2. MISSIONTABLE `.limit(300)` — INVESTIGAÇÃO PROFUNDA

### O que NÃO usa limit 300

A **lista principal** (`fetchMissions` → `fetchScoped` → `fetchAllPagesOf`) usa **paginação 1000** até esgotar o conjunto do período + OS abertas (`OPEN_OR`). Períodos: TODAY, WEEK, MONTH, YEAR, CUSTOM, ALL (abertas), HISTORY (tudo).

### O que USA limit 300

**Somente** o `useEffect` de **busca server-side** (termo ≥2 em `osFilterTerm`/`searchTerm`):

```
order('created_at', { ascending: false }) → .limit(300)
```

### Quais OS ficam de fora

- Qualquer OS que **match** o termo mas esteja **fora das 300 mais recentes** por `created_at` (global no escopo de cliente).
- São tipicamente **OS antigas** (histórico), não necessariamente "novas".

### Ordenação

`created_at DESC` — prioriza recência, não relevância do match.

### Dependências do conjunto

| Consumidor | Usa `searchMatches`? | Usa `allMissions`? |
|------------|----------------------|---------------------|
| Tabela renderizada (merge) | Sim — unificado L1245 | Sim |
| Filtros locais período | Parcial | Sim |
| Modal financeiro | Abre por ID direto | Não depende da lista |
| Relatórios (`MissionReportPage`) | **Não** — query própria | Não |
| Faturamento | **Não** — query própria | Não |
| Aprovação/edição | Por ID / modal | Se OS não na lista, **busca pode falhar** |

### Fallback quando OS não encontrada

- Busca: retorna vazio — **sem fallback** para segunda página.
- Usuário pode achar que OS "não existe" (padrão Torres).
- Abrir OS por link direto/deep link: funciona se souber o ID.

### Impacto classificado

| Área | Impacto |
|------|---------|
| Operação diária (período HOJE/SEMANA) | 🟢 Baixo — lista principal paginada |
| Busca OS antiga / fora do top 300 | 🔴 **Alto** — falso negativo |
| Relatórios / faturamento | 🟢 Baixo — fontes independentes |
| Edição por busca | 🟠 Médio |

---

## 3. REALTIME `missions` — MAPEAMENTO

### Fluxo

```
Alteração missions (Supabase)
  → RealtimeProvider.handleChange('missions')
  → debounce 2s
  → window event supabase:missions + supabase:missions:realtime
  → se INSERT/DELETE: refreshMissions
  → MissionTable: patch in-place (UPDATE) ou refetch (INSERT/DELETE/comercial/restrito)
```

### `TABLE_TO_QUERY_KEYS.missions = []`

React Query **não** invalida queries de missions automaticamente. Atualização depende de **eventos window** e refetch manual.

### Telas por comportamento

| Tela | Mecanismo | Atualização |
|------|-----------|-------------|
| `MissionTable` | `supabase:missions:realtime` + `refreshMissions` | 🟢 auto (patch/refetch) |
| `ClientBillingReport` | `refreshMissions` + realtime | 🟢 |
| `MissionFinancialModal` | emite/escuta `refreshMissions` | 🟢 |
| `VendorVerificationControl` | `refreshMissions` | 🟢 |
| `MissionAlertMonitor` | ambos eventos | 🟢 |
| `PendingTollConfirmationBanner` | `refreshMissions` | 🟢 |
| **`Dashboard`** | nenhum listener | 🔴 **dado antigo até F5** |
| **`DashboardDiretoria`** | hook manual, sem realtime | 🟡 botão refresh / remount |
| **`FinancialDashboard`** | sem `refreshMissions` | 🔴 |
| **`MissionReportPage`** | query própria, sem realtime | 🟡 |
| **`FinancialDRE`** | fetch mount | 🔴 |

### Correlação `presence-refresh.test.ts`

**Escopo diferente:** testa **ponto RH** (`registerTimeClockPunch` → `requestPresenceRefresh` → `UserPresenceTracker`), **não** missions.

Indica padrão de refresh por `EventTarget` customizado — missions usa `refreshMissions` / `supabase:missions` em paralelo. Falha do teste `presence-refresh` sugere gap de **presença de usuário**, não diretamente lista de OS — mas reforça que **nem todo domínio tem invalidação uniforme**.

---

## 4. FALLBACKS FINANCEIROS

| # | Fonte oficial | Condição ausência | Fallback | Resultado | Risco |
|---|---------------|-------------------|------------|-----------|-------|
| 1 | `revenue_value`/`cost_value` persistidos | não verificado | `calculateMissionFinancials` | valor recalculado | 🔴 FAIL-OPEN |
| 2 | `toll_value_provider` | null | `toll_value` | pedágio fornecedor = cliente | 🟡 |
| 3 | Tabela cliente | sem match | fallback DHL por UF | receita estimada | 🔴 FAIL-OPEN |
| 4 | Tabela fornecedor | sem match | tabela 200KM / genérica | custo estimado | 🔴 FAIL-OPEN |
| 5 | `parent_mission_id` sem `is_same_os` | vínculo só ID | custo **não** zerado | duplicidade custo | 🔴 FAIL-OPEN |
| 6 | `ClientBillingReport` charts L645 | filha | `tollProv` sem zerar `is_same_os` | custo inflado gráfico | 🔴 FAIL-OPEN |
| 7 | `FinancialDRE` L108 | filha | soma `toll_value_provider` todas OS | pedágio duplicado DRE | 🔴 FAIL-OPEN |
| 8 | Deslocamento | km/unidade ausente | derive via motor | disp recalculado | 🟡 |
| 9 | Comissão auto | regra ausente | skip / 0 | sem comissão | 🟢 |
| 10 | `displacement_value` | 0 | fallback DHL UF em canônico | disp cliente | 🟡 |

**Candidatos futuros FAIL-CLOSED:** itens 1, 3, 4, 5, 6, 7.

---

## 5. OS MÃE/FILHA — CENÁRIOS LÓGICOS

### Cenário A — OS normal

| Papel | Comportamento esperado | Código |
|-------|------------------------|--------|
| Cliente | 1 cobrança (`revenue_value` + pedágio cliente) | 🟢 |
| Fornecedor | 1 custo (`cost_value` + pedágio fornecedor) | 🟢 |

### Cenário B — OS filha (Mesma OS)

| Papel | Esperado | Central OS | Faturamento | C.Pagar | C.Receber | DRE | Diretoria | Gráficos |
|-------|----------|------------|-------------|---------|-----------|-----|-----------|----------|
| Cliente nova cobrança | Sim | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 receita | 🟢 canônico | 🟡 |
| Fornecedor sem duplicar | custo 0 | 🟢 | 🟢 badge | 🟢 | N/A | 🟠 toll forn | 🟢 | 🔴 L645 |
| Pedágio fornecedor 0 | Sim | 🟢 | 🟢 | 🟢 | N/A | 🔴 L108 | 🟢 | 🔴 |

**Riscos duplicação:** receita somada sem agrupar (🟠); custo zero isolado parece lucrativo (🟠); pedágio fornecedor em DRE/charts (🔴).

---

## 6. SSOT FINANCEIRO — MOTORES

| Conceito | Implementação A (oficial) | Implementação B | Consumidores B | Diferença |
|----------|---------------------------|-----------------|----------------|-----------|
| Cálculo missão | `lib/financialUtils.ts` (1695 lin) | `export_relatorio/financialUtils.ts` (1029 lin) | pasta `export_relatorio/` (5 arquivos) | **Fork parcial desatualizado** |
| Receita/custo canônico | `lib/missionFinancialsCanonical.ts` | — | Diretoria, LowMargin, faturamento | SSOT intermediário |
| Persistência | colunas `missions.*` | snapshots `system_logs` BillingSnapshot | ClientBillingReport | dupla fonte histórica |
| Recálculo servidor | `server/routes.ts` bulk/single | — | API | autoritativo pós-approve |
| Export relatório | usa `../lib/financialUtils` no billing | arquivo local `financialUtils.ts` existe | `export_relatorio/ClientBillingReport.tsx` importa **lib/** | confuso mas billing export usa A |

**`export_relatorio/`:** bundle legado/espelho — **POTENCIAL VIOLAÇÃO SSOT** se alguém importar B em vez de A.

---

## 7. MATRIZ DE PARIDADE EXPANDIDA

Legenda fonte: **DB** = coluna `missions`; **CALC** = `calculateMissionFinancials`; **CAN** = `computeCanonicalRevenueCost`; **MIX** = misto verificado/não verificado.

| Campo | Central OS | Modal Fin. | Fornecedor | Faturamento | C.Receber | C.Pagar | Relatórios | Diretoria |
|-------|------------|------------|------------|-------------|-----------|---------|------------|-----------|
| status | DB | DB | DB | DB | DB | DB | DB | DB |
| cliente | DB | DB | DB | DB | DB | — | DB | DB |
| fornecedor | DB | DB | DB | DB | — | DB | DB | DB |
| receita | DB/CALC | CALC/DB | — | CAN/MIX | DB | — | DB/CAN | CAN |
| custo | DB/CALC | CALC/DB | DB | CAN | — | DB | DB | CAN |
| pedágio cli | DB | DB | — | DB/CAN | — | — | DB | CAN |
| pedágio forn | DB | DB | DB | MIX🔴 | — | DB | MIX | CAN |
| horas/km | DB/CALC | CALC | — | CALC | — | — | CALC | CALC |
| margem | CALC | CALC | — | CAN | — | — | grupo CAN | CAN |
| total faturado | — | — | — | CAN | transações | transações | export | CAN |

**Divergências marcadas:** pedágio fornecedor em faturamento charts e DRE vs canônico.

---

## 8. ENDPOINTS — CLASSIFICAÇÃO (~313 paths)

| Categoria | Qtd aprox. | Exemplos |
|-----------|------------|----------|
| **UI** | ~227 | `/api/missions/*`, `/api/os-analysis` |
| **Webhook** | ~12 | Asaas, PlugNotas, Z-API, WhatsApp inbound |
| **Cron** | ~10 | `/api/cron/*`, gestao-investimento refresh |
| **Integração externa** | ~25 | Gemini, DataJud, DHL público, geocode |
| **Admin** | ~20 | `/api/admin/cleanup-*`, recalculate-batch |
| **Migration/setup** | ~5 | `/api/migration/*` — **sem UI, com auth variável** |
| **Legado não registrado** | 6 | `replit_integrations/chat`, `image` |
| **Indeterminado** | ~18 | aliases, paths dinâmicos |

**Não classificar migration como morto:** `POST /api/migration/add-mission-columns` pode ser one-shot ops; exige auditoria de auth (alguns **sem requireAuth** — 🟠).

---

## 9. FUNCIONALIDADES INACABADAS (detalhado)

| Item | Existe | Falta | Dependências | Risco | Recomendação |
|------|--------|-------|--------------|-------|--------------|
| **AI Chat** | `AIChatbot`, `/api/chat`, case `ai-support` | Render no App (null) | permissão legada | 🔵 | FINALIZAR ou remover case |
| **Gestão Investimento F2** | UI + API + SQL fundação | recomendação automática | cron refresh-cache | 🟡 | FINALIZAR escopo F2 |
| **BillingControlCenter** | componente completo | rota App + menu | substituído por ClientBillingReport? | 🔵 | INVESTIGAR remoção |
| **replit_integrations** | chat + image routes | registro em `createApp` | Replit legado | 🔵 | POSSÍVEL REMOÇÃO |
| **mission-report** | tela + menu | alinhar App↔Sidebar Giovanna | permissões | 🟠 | FINALIZAR auth |

---

## 10. PERMISSÕES — DIVERGÊNCIAS menu → App → API

| Tela | Sidebar | App.tsx | Backend | Divergência |
|------|---------|---------|---------|-------------|
| `mission-report` | Giovanna ✅ | Giovanna ❌ | rotas próprias | 🔴 **confirmada** |
| `shift-handover` | todos ✅ | comercial precisa perm | — | 🟡 |
| `diretoria-cockpit` | só Thiagos | só Thiagos | — | 🟢 consistente |
| `fin-report` | role diretoria ✅ | sem gate extra | — | 🟢 |
| `ranking-dhl` | roles fixos | roles fixos | — | 🟢 |

**Regra:** esconder menu ≠ autorização. APIs críticas usam `requireAuth` + `requireRole` — validar caso a caso na Fase 3.

---

## 11. SMOKE TEST (read-only)

| Endpoint | HTTP | Resultado |
|----------|------|-----------|
| `/api/health` | 200 | 🟢 |
| `/api/version` | 200 | 🟢 |
| `/api/gemini/health` | 200 | 🟢 |
| Login/UI/CRUD OS | — | ⚪ **NÃO VALIDADO — EXIGE ESCRITA ou sessão** |

---

## 12. RISCOS PRIORIZADOS (atualizado)

| # | Risco | Nível |
|---|-------|-------|
| 1 | MissionTable busca `.limit(300)` — falso negativo OS antiga | 🔴 |
| 2 | `computeCanonicalRevenueCost` recalcula sem verificação | 🔴 |
| 3 | DRE soma `toll_value_provider` em filhas | 🔴 |
| 4 | Charts faturamento pedágio fornecedor filha | 🔴 |
| 5 | Dashboard/FinancialDRE sem realtime missions | 🟠 |
| 6 | Divergência Giovanna mission-report | 🟠 |
| 7 | `export_relatorio/financialUtils` fork | 🟠 |
| 8 | Migration endpoints sem auth | 🟠 |
| 9 | Quotes limit 500 diretoria | 🟠 |
| 10 | 76 limit/range INDETERMINADO | 🟡 |

---

## 13. PENDÊNCIAS PARA 100% FASE 2

1. Revisão manual dos 76 ⚪ INDETERMINADO (especialmente `server/routes.ts` 36)
2. Smoke browser com credencial teste (sem escrita prod)
3. Mapa relatório → fonte → validação matemática amostral
4. Matriz paridade com validação runtime (opcional)

---

## 14. ALTERAÇÕES NESTA EXECUÇÃO

| Escopo | Alteração |
|--------|-----------|
| Código / banco / Vercel / produção | **Nenhuma** |
| Documentação | Este handoff (marco 75%) |

---

## 15. NÃO INICIADO

- Fase 3 (RLS/schema)
- Correções funcionais
- Gestor Comercial / novo Jurídico

---

> **Arquivo para análise no ChatGPT:**  
> `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`

---

*Gerado em: 2026-08-12 UTC | Execução: Fase 2 Raio-X — marco 75%*
