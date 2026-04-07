# REPOSITORIO DE ALTERACOES - TMSEGo

---

## Timeline de Alteracoes - 07/04/2026

**Solicitacao do Thiago:** Sincronizacao de calculos reais vs exibidos. Os campos de Valor Final Cliente (R$ 9.345,00) e Pagamento Fornecedor (R$ 4.561,42) nao refletiam a soma real dos itens do breakdown (Base + KM + Hora + Pedagio), permanecendo fixos com valores antigos do banco de dados.

**Mudanca no Codigo (MissionFinancialModal.tsx):**

1. **Linha ~882-883 (useEffect de sincronizacao):** Condicao original `!hasSavedValues` trocada por `(!hasSavedValues || !useSavedValuesRef.current)`. Isso permite que, quando o operador muda a tabela ou clica recalcular, os valores finais sejam atualizados em tempo real mesmo que existam valores salvos no banco. Adicionado `useSavedValues` ao array de dependencias do useEffect.

2. **Linha ~588 (inicializacao):** Adicionado `setUseSavedValues(true)` no bloco que carrega dados salvos do banco, marcando explicitamente o estado inicial como "usando valores salvos".

3. **Linha ~2215 (select tabela cliente):** Adicionado `userManuallyEditedRef.current = false` no onChange, desbloqueando a sincronizacao reativa ao trocar tabela.

4. **Linha ~2387 (select tabela fornecedor):** Idem — adicionado `userManuallyEditedRef.current = false` no onChange.

5. **Linha ~2188 (botao "Aplicar" sugestao IA):** Adicionado `userManuallyEditedRef.current = false` para sincronizar apos aceitar sugestao da Gemini.

**Impacto:** Os campos de Valor Final agora sao reativos ao calculo detalhado. Ao abrir a OS, valores salvos sao exibidos normalmente. Ao trocar tabela (manual ou IA) ou clicar "Recalcular", o valor final se atualiza automaticamente para refletir Base + KM Extra + Hora Extra + Pedagio. Edicoes manuais do diretor continuam sendo preservadas (trava de sincronizacao via `userManuallyEditedRef`).
