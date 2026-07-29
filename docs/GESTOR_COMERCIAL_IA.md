# Gestor Comercial IA — Grupo TM SEG

## Princípio SSOT

Indicadores (receita, custo, margem, operações, funil de propostas) vêm **exclusivamente** de:

- `missions` + `missionFinancialsCanonical`
- `clients` / `client_price_tables` / `provider_cost_tables`
- `quotes` / `commercial_proposals`

As tabelas `gc_*` e `gestor_*` são **orquestração** (metas, planos, pipeline, agenda, reuniões, parâmetros) — não copiam faturamento.

## Framework de Gestores

- `lib/gestores/registry.ts` — registro extensível
- Próximos gestores: Operacional, Financeiro, Contábil, RH, Administrativo, Inteligência

## Migration

Arquivo: `migrations/2026_07_29_gestor_comercial.sql`  
Aplicada no boot via `server/gcMigrations.ts` (RPC `exec_sql`) ou manualmente no Supabase SQL Editor.

## RBAC

| Perfil | Acesso |
|--------|--------|
| Diretoria / Admin / Thiagos | Visão plena |
| Comercial | Carteira própria (`created_by` / `client_view:*`); sem ranking global, configs, lucro/margem estratégicos |

## Cobrança automática

Integrada em `/api/cron/email-queue` → `runGcFollowupCycle()` (sem nova function Vercel).

## Menu

Diretoria → Gestor Comercial IA, Inteligência, Metas, Comissões, Ranking, Saúde dos Clientes, Configurações, Permissões.
