# REPOSITORIO DE ALTERACOES - TMSEGo

---

## Timeline de Alteracoes - 07/04/2026 (Parte 1)

**Solicitacao do Thiago:** Sincronizacao de calculos reais vs exibidos. Os campos de Valor Final Cliente (R$ 9.345,00) e Pagamento Fornecedor (R$ 4.561,42) nao refletiam a soma real dos itens do breakdown (Base + KM + Hora + Pedagio), permanecendo fixos com valores antigos do banco de dados.

**Mudanca no Codigo (MissionFinancialModal.tsx):**

1. **Linha ~586 (inicializacao - CAUSA RAIZ):** Removido `userManuallyEditedRef.current = true` do bloco de carga de dados salvos. Este ref estava sendo setado como `true` na abertura da OS apenas porque havia valores salvos no banco, bloqueando TODA sincronizacao automatica futura. Agora, o ref so e setado `true` quando o usuario realmente digita manualmente no campo de input (onChange nas linhas ~2633 e ~2756).

2. **Linha ~881-885 (useEffect de sincronizacao):** Simplificada a condicao para `if (shouldSync)` — removidas checagens redundantes de `hasSavedValues` e `useSavedValuesRef`. Agora, sempre que `userManuallyEditedRef.current === false` e nao esta salvando e fornecedor nao esta travado, os campos de Valor Final sao atualizados automaticamente com o calculo em tempo real (Base + KM Extra + Hora Extra + Pedagio).

3. **Linha ~2215 (select tabela cliente):** Adicionado `userManuallyEditedRef.current = false` no onChange, desbloqueando sincronizacao ao trocar tabela.

4. **Linha ~2387 (select tabela fornecedor):** Idem — adicionado `userManuallyEditedRef.current = false` no onChange.

5. **Linha ~2188 (botao "Aplicar" sugestao IA):** Adicionado `userManuallyEditedRef.current = false` para sincronizar apos aceitar sugestao da Gemini.

**Impacto:** Os campos de Valor Final agora sao reativos ao calculo detalhado. Edicoes manuais do diretor continuam preservadas.

---

## Timeline de Alteracoes - 07/04/2026 (Parte 2)

**Solicitacao do Thiago:** Correcao da regra de custo CEVA/Logitech e sincronizacao de valores entre modal e grid. A OS GTM-4371 mostrava R$ 9.310,00 na lista principal (grid) mas R$ 1.435,00 no modal (calculo correto).

**Mudancas Tecnicas (MissionFinancialModal.tsx):**

1. **Linhas ~888-907 (auto-save silencioso no useEffect):** Adicionada logica de auto-save no useEffect de sincronizacao. Quando o calculo em tempo real diverge do valor salvo no banco (diferenca > R$1) e a OS NAO esta aprovada (`billing_approved === false`), o sistema salva automaticamente os valores corretos no banco (`revenue_value`, `cost_value`, `toll_value`, `toll_value_provider`) e dispara `onUpdate()` para atualizar a grid imediatamente.

**Condicoes do auto-save (seguranca):**
- Divergencia > R$1 entre calculo e valor salvo
- OS NAO aprovada (`billing_approved === false`)
- Valor calculado > 0 (evita zerar missoes sem tabela)
- Nao esta no meio de um salvamento manual (`!isSavingRef.current`)
- Fornecedor nao verificado pelo controller (`!isVendorLocked`)
- Usuario nao editou manualmente o input (`!userManuallyEditedRef.current`)

**Impacto:** Fim das discrepancias de valores entre a tela de monitoramento (grid) e o faturamento da OS. Ao abrir o modal de qualquer OS nao-aprovada com valores divergentes, o sistema corrige automaticamente o banco e atualiza a grid. OS ja aprovadas NAO sao afetadas (protecao contra alteracao indevida).

**Comportamento anterior (bug):** Grid mostrava R$ 9.310,00 (valor antigo do banco) enquanto modal mostrava R$ 1.435,00 (calculo correto). O operador precisava clicar "Salvar Ajustes" manualmente para corrigir.

**Comportamento novo (corrigido):** Ao abrir o modal, se o valor calculado diverge do banco e a OS nao esta aprovada, o banco e atualizado automaticamente e a grid reflete o valor correto imediatamente.
