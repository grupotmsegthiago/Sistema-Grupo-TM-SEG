---
name: Finalize odometer exemption (ATIVA / TM SEG)
description: Quais fornecedores dispensam o print do hodômetro ao concluir a OS e por quê
---

# Dispensa do print do hodômetro na conclusão

Política: ao CONCLUIR uma OS, os fornecedores **ATIVA** e **TM SEG** não
precisam do print do hodômetro nem da auditoria por IA. Todos os demais
fornecedores continuam OBRIGADOS a anexar o print + passar pela auditoria IA
(controle anti-fraude do KM). A dispensa afeta SOMENTE a etapa do hodômetro —
KM final, data/hora exata e ciência da tabela seguem exigidos para todos.

Match do fornecedor: por palavra inteira para ATIVA (evitar falso positivo
tipo COOPERATIVA); TM SEG/TM SECURITY por string normalizada sem espaços
(TMSEG/TMSECURITY).

**Why:** ATIVA e TM SEG só enviam o KM final depois da missão, então exigir o
print no momento da conclusão travaria o fechamento. Os demais mandam na hora,
então o print continua sendo a prova do KM.

**How to apply:** para adicionar/remover fornecedor da exceção, ajustar a regra
de match. NUNCA afrouxar para fornecedores fora da lista — é uma exceção
operacional pontual, não a regra geral.
