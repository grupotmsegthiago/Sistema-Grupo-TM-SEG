# Modelo de dados — Gestor de Desenvolvimento (Fase 2)

**Status:** SQL preparado em `2026_08_04_gestao_ti_fundacao.sql` — **não aplicado**.

## Diagrama (consolidado)

```text
system_catalog_snapshots
        │ (versão do mapa JSON)
        ▼
system_health_checks ──1:N──► system_health_results
        │
        ▼
system_incidents ──1:N──► system_incident_timeline
        │                      (event|evidence|hypothesis|action|prompt|…)
        ▼
system_deployments (build_id / version)

system_ti_audit_log (append-only do módulo)
```

## Por que 7 tabelas e não ~19?

| Proposta original | Destino consolidado | Motivo |
|-------------------|---------------------|--------|
| system_modules / components / connections / data_sources / business_rules | `system_catalog_snapshots.payload` JSONB versionado | Catálogo muda com o código; snapshot versionado evita drift e joins frágeis na Fase 2–3 |
| system_health_checks + results | mantidos | Série temporal e defs separadas (performance de consulta) |
| system_incidents | mantido | Dedup por `fingerprint` |
| system_incident_events / evidence / hypotheses / actions / generated_prompts | `system_incident_timeline.kind` | Mesma cardinalidade 1:N; menos joins; auditoria da timeline intacta |
| system_sync_checks / data_divergences / alert_* / auto_remediation_* | **adiados** | Fases 4 e 7; não criar tabelas ociosas agora |
| system_audit_log genérico | `system_ti_audit_log` | Evita colidir com `system_logs` / `audit_logs` existentes |

## Garantias preservadas

- Auditoria: timeline + `system_ti_audit_log`
- Integridade: FKs, CHECKs, UNIQUE(code/fingerprint/build)
- Performance: índices por tempo/status
- Histórico: results e timeline append-friendly
- Clareza: menos superfícies RLS

## Retenção (futuro)

- `system_health_results`: sugerido 30–90 dias
- Timeline: retenção alinhada a incidentes abertos + arquivo

## Segurança

- Sem tokens/senhas em `payload`/`summary` (sanitizar na app)
- RLS enabled; policies restritivas só na fase de aplicação autorizada
