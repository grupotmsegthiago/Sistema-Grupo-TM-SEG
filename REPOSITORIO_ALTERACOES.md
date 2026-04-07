# REPOSITORIO DE ALTERACOES - TMSEGo

---

## Timeline de Alteracoes - 07/04/2026

**Solicitacao do Thiago:** Sincronizacao de calculos reais vs exibidos. Os campos de Valor Final Cliente (R$ 9.345,00) e Pagamento Fornecedor (R$ 4.561,42) nao refletiam a soma real dos itens do breakdown (Base + KM + Hora + Pedagio), permanecendo fixos com valores antigos do banco de dados.

**Mudanca no Codigo (MissionFinancialModal.tsx):**

1. **Linha ~586 (inicializacao - CAUSA RAIZ):** Removido `userManuallyEditedRef.current = true` do bloco de carga de dados salvos. Este ref estava sendo setado como `true` na abertura da OS apenas porque havia valores salvos no banco, bloqueando TODA sincronizacao automatica futura. Agora, o ref so e setado `true` quando o usuario realmente digita manualmente no campo de input (onChange nas linhas ~2633 e ~2756).

2. **Linha ~881-885 (useEffect de sincronizacao):** Simplificada a condicao para `if (shouldSync)` — removidas checagens redundantes de `hasSavedValues` e `useSavedValuesRef`. Agora, sempre que `userManuallyEditedRef.current === false` e nao esta salvando e fornecedor nao esta travado, os campos de Valor Final sao atualizados automaticamente com o calculo em tempo real (Base + KM Extra + Hora Extra + Pedagio).

3. **Linha ~2215 (select tabela cliente):** Adicionado `userManuallyEditedRef.current = false` no onChange, desbloqueando sincronizacao ao trocar tabela.

4. **Linha ~2387 (select tabela fornecedor):** Idem — adicionado `userManuallyEditedRef.current = false` no onChange.

5. **Linha ~2188 (botao "Aplicar" sugestao IA):** Adicionado `userManuallyEditedRef.current = false` para sincronizar apos aceitar sugestao da Gemini.

**Impacto:** Os campos de Valor Final agora sao reativos ao calculo detalhado. Ao abrir a OS, o valor final ja reflete o calculo correto (Base + KM + Hora + Pedagio) automaticamente, sem precisar clicar "Recalcular". Edicoes manuais do diretor (digitar no input) continuam sendo preservadas — so nesse caso o ref trava a sincronizacao.

**Comportamento anterior (bug):** Valor final ficava congelado com o valor antigo do banco. So atualizava ao clicar "Recalcular" manualmente.

**Comportamento novo (corrigido):** Valor final e SEMPRE reativo ao calculo. Muda automaticamente quando tabela muda, quando IA sugere, ou quando a OS abre. So trava se o diretor digitar um valor manual.
