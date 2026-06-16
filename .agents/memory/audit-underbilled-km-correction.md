---
name: Correção em massa de KM excedente não cobrado
description: Como corrigir OS subfaturadas (cobradas só na franquia) sem injetar dados ruins nem quebrar snapshot
---

Auditoria periódica acha OS "cobradas só na franquia" (revenue_value ≈ base do motor) mas com excedente real. Padrão da correção segura:

- **Sinal confiável = KM excedente** (vem do hodômetro start_km/end_km). Excedente de HORA é frequentemente LIXO de dado: OS cancelada lançada dias/semanas após o início, ou end_time errado → motor calcula centenas de horas. NUNCA cobrar hora excedente em massa; mandar essas para conferência humana (e-mail thiago/barbara) e tratar como correção de horário, não de faturamento.
- **Guarda obrigatória ao corrigir KM:** se o motor retornar extraHrVal>0 na mesma OS, PULE (não sobrescreva) — senão você injeta as horas suspeitas junto. Corrija só OS de KM puro: `novo revenue_value = base + extraKmVal` (serviço, sem pedágio).
- **Snapshot em lockstep:** OS aprovadas têm `snapshot_data` congelado. Atualizar `revenue_value` sozinho deixa o snapshot velho. Ao corrigir, atualize também no snapshot: `revenueServiceOnly`, `totalGeral`(=rev+tollVal+displacementVal do próprio snap), `kmExtraQtd`, `kmExtraTotal`, `kmTotal`, e marque `snapshot_resynced_at/by`. Algumas OS são "manual" (só `revenue_edit_reason`, sem snapshot) → só revenue_value.
- **Travar e auditar:** set `revenue_edit_reason` (trava contra /api/recalculate-all) + insert em `system_logs` (action_type FINANCIAL_RECALC, before/after).
- **CESLOG (Cubatão/Santos):** confirmado pela diretoria que CESLOG COBRA KM excedente (não é tabela fixa). base franquia = 699,84.
- Canceladas precisam de `_cancelStatusAt` (de mission_history, field_name='status', new_value~cancel) passado ao motor para reproduzir o cálculo.

**Why:** sobrescrever snapshot só no revenue_value gera divergência boletim×snapshot; recalcular hora cega cobraria valores absurdos de erro de digitação.
