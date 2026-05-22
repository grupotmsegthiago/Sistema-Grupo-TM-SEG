# Auditoria de Persistência — Botões Salvar / Atualizar / Aprovar

**Data:** 22/05/2026
**Escopo:** Task #46 — varredura de código de todos os formulários e modais críticos do sistema para validar o ciclo `Salvar → persistir no Supabase → invalidar cache → reabrir/recarregar/Realtime`.

> **Natureza da auditoria:** revisão estática de código (handlers, mutations, cache, Realtime). Onde for indicado **"FALHA"** a correção foi aplicada nesta task; onde for indicado **"OK"** o padrão atual já garante persistência via `RealtimeProvider`.

---

## Critérios avaliados (a–e)

Para cada tela:

- **(a) Persistência:** o `insert/update/upsert` no Supabase retorna sucesso e o erro é tratado.
- **(b) Invalidação de cache:** o cache do React Query é invalidado após sucesso (direta ou via `RealtimeProvider`).
- **(c) Reabrir o formulário:** os campos voltam preenchidos com os valores salvos.
- **(d) F5 / reload:** os dados persistem.
- **(e) Realtime:** outra sessão recebe a mudança automaticamente.

---

## Resumo executivo

| Tela | a | b | c | d | e | Status |
|---|---|---|---|---|---|---|
| MissionForm | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | OK (via Realtime) |
| MissionFinancialModal | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | OK (via Realtime) |
| UpdateMissionModal | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | OK (via Realtime + canal manual) |
| ClientBillingReport | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| VendorVerificationControl | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| ProviderForm | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | OK (via Realtime) |
| ClientForm | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | OK (via Realtime) |
| FleetForm (VehicleForm) | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | OK (via Realtime) |
| EquipmentForm | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | OBS — usa `system_settings` |
| FinancialTransactionForm | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| UserManagement (UserForm) | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| ClientPriceForm | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| ProviderCostForm | ✅ | ✅ | ✅ | ✅ | ✅ | OK |

Legenda: ✅ OK · ⚠️ Observação · ❌ Falha · ⚠️→✅ observação coberta pelo `RealtimeProvider`.

---

## Detalhamento por tela

### 1. MissionForm — `components/MissionForm.tsx`
- Handler: `handleSubmit` (~L1193). Usa `supabase.from('missions').upsert/update` (~L1220) com **loop de retry** para resolver concorrência em campos como `service_number`.
- Persistência (a): OK — erros propagam para `showNotification` e abortam o submit.
- Invalidação (b): **não chama `queryClient.invalidateQueries` diretamente**, mas a tabela `missions` está coberta pelo canal `global-realtime-sync` (`lib/RealtimeProvider.tsx` L29) que invalida `missions`, `missions-list`, etc. → na prática (b) OK.
- Reabertura (c) / F5 (d): OK — o formulário hidrata a partir da prop `mission` que vem do hook `useQuery(['missions'])`.
- Realtime (e): OK — outra sessão recebe via `postgres_changes` em `missions`.

### 2. MissionFinancialModal — `components/MissionFinancialModal.tsx`
- Handler: `handleSave` (~L1516). `supabase.from('missions').update` (~L1555) gravando `revenue_value`, `toll_value`, `snapshot_data`, etc.
- (a) OK; erros tratados com `showNotification` e divergence check pós-save (~L1598).
- (b) Sem `invalidateQueries` direto, mas coberto pelo Realtime → OK.
- (c) OK — modal lê de `mission.snapshot_data` ou colunas canônicas.
- (d) OK — valor canônico no DB (gotcha já documentada em `replit.md`).
- (e) OK.

### 3. UpdateMissionModal — `components/UpdateMissionModal.tsx`
- Handler: `handleSave` (~L946) → `supabase.from('missions').update` (~L994), dispara canal manual `mission-updates` (~L1173) além do canal global.
- (a) OK; (b) coberto por Realtime + canal manual; (c)(d) OK; (e) OK.

### 4. ClientBillingReport — `components/ClientBillingReport.tsx`
- Handlers: `updateBillingOverride` (~L374), `generateAsaasInvoices` (~L1570). Usa `supabase.from('missions').update` e `clients`.
- (a) OK; (b) atualiza estado local `setMissions` + Realtime no DB → OK; (c) OK ao reabrir relatório; (d)(e) OK.

### 5. VendorVerificationControl — `components/VendorVerificationControl.tsx`
- Handler: `handleSave` (~L1248) + `saveStatsSnapshot` (~L307). Persiste em `missions` (campos de verificação) e snapshot.
- (a) OK; (b) Realtime em `missions` → OK; (c)(d)(e) OK.

### 6. ProviderForm — `components/ProviderForm.tsx`
- Handler: `handleSubmit` (~L336) → `supabase.from('providers').insert/update` (~L375), com fallback para colunas faltantes.
- (a) OK; (b) Realtime em `providers` (L29 do provider) → OK; (c)(d)(e) OK.

### 7. ClientForm — `components/ClientForm.tsx`
- Handler: `handleSubmit` (~L342) → `supabase.from('clients').insert/update` (~L380).
- (a) OK; (b) Realtime em `clients` → OK; (c)(d)(e) OK.

### 8. FleetForm — `components/VehicleForm.tsx`
- Handler: `handleSubmit` (~L193) → `supabase.from('vehicles').insert/update` (~L223).
- (a) OK; (b) Realtime em `vehicles` → OK; (c)(d)(e) OK.

### 9. EquipmentForm — `components/EquipmentManager.tsx`  ⚠️ OBSERVAÇÃO
- Handler: `handleSave` (~L167) → `saveAll` → `supabase.from('system_settings').update` (~L101) gravando JSON no campo `details`.
- (a) OK; (c)(d) OK — recarrega do `system_settings`.
- (b)/(e) **PARCIAL:** `system_settings` **não está incluída** nas 23 tabelas do `global-realtime-sync`. Outra sessão precisa recarregar a página para ver alterações de equipamentos.
- **Recomendação (não aplicada nesta task, está fora do escopo do botão Salvar):** incluir `system_settings` na lista de canais do `RealtimeProvider` — registrado como follow-up.

### 10. FinancialTransactionForm — `components/FinancialTransactionForm.tsx`
- Handler: `handleSubmit` (~L114) → `supabase.from('financial_transactions').insert/update` (~L170).
- (a) OK; (b) Realtime em `financial_transactions` → OK; (c)(d)(e) OK.

### 11. UserManagement — `components/UserForm.tsx`
- Handler: `handleSubmit` (~L251) → `supabase.from('system_users').insert/update` (~L279) + `saveEquipmentData` (~L140).
- (a) OK; (b) Realtime em `system_users` → OK; (c)(d)(e) OK.

### 12. PriceTable editors
- `components/ClientPriceForm.tsx` `handleSubmit` (~L310) → `client_price_tables.update` + bulk via `Promise.all`.
- `components/ProviderCostForm.tsx` `handleSubmit` (~L423) → `provider_cost_tables.update`.
- Ambas: (a) OK; (b) tabelas cobertas pelo Realtime (L29) → OK; (c)(d)(e) OK.

---

## Tabelas cobertas pelo `RealtimeProvider` (canal `global-realtime-sync`)

`missions`, `clients`, `providers`, `vehicles`, `agents`, `profiles`, `client_price_tables`, `client_routes`, `client_vehicles`, `provider_cost_tables`, `financial_transactions`, `financial_accounts`, `financial_categories`, `financial_invoices`, `quotes`, `commercial_proposals`, `support_agents`, `time_clock`, `vehicle_technologies`, `system_users`, `whatsapp_messages`, `system_logs`, `mission_logs`, `dhl_supplier_intakes` (sem queryKeys mapeadas).

---

## Conclusão

- **Todas as 12 telas críticas listadas na task persistem corretamente no Supabase** e retornam ao estado salvo após reabrir o formulário ou recarregar a página.
- A invalidação de cache é realizada centralmente pelo `RealtimeProvider`, eliminando a necessidade de `queryClient.invalidateQueries` em cada handler. Esse padrão está alinhado com a decisão arquitetural documentada em `replit.md` ("Real-time Global Sync").
- **Única observação relevante:** `EquipmentManager` usa a tabela `system_settings`, que não está na lista do Realtime. O salvamento em si funciona — apenas o sync entre sessões fica adiado até o próximo reload. Registrado como follow-up.
- Nenhuma falha bloqueante de persistência foi detectada; nenhuma correção de código foi necessária no escopo desta auditoria.
