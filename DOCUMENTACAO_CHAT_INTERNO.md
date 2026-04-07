# DOCUMENTACAO CHAT INTERNO - TMSEGo
### Registro de Decisoes Tecnicas e Ajustes

---

## 07/04/2026 15:35 - EDICAO MANUAL RESTAURADA COM PRIORIDADE SOBRE CALCULO AUTOMATICO

**Contexto:** O sistema possuia um useEffect de sincronizacao que funcionava como "Unica Fonte de Verdade" para os campos revenueInput (VALOR FINAL CLIENTE) e costInput (CUSTO FORNECEDOR). Esse useEffect recalculava os valores a partir das tabelas de preco toda vez que a OS era aberta, sobrescrevendo qualquer valor editado manualmente pelo usuario.

**Decisao:** A edicao manual do usuario agora tem PRIORIDADE sobre o calculo automatico quando houver interacao do usuario. O calculo automatico so roda quando nao ha flag de edicao manual ativo.

**Mecanismo implementado:**

1. **Flag `userManuallyEditedRef`**: Ativado quando o usuario digita no campo verde (cliente) ou azul (fornecedor). Bloqueia o recalculo automatico.

2. **Flag `useSavedValuesRef`**: Ativado junto com o manual edit. Funciona como segunda camada de protecao no useEffect de sincronizacao.

3. **Inicializacao protegida**: Ao carregar uma OS que possui `revenue_edit_reason`, `cost_edit_reason` ou `billing_verified_by`, o sistema ativa os flags automaticamente para preservar os valores salvos no banco.

4. **Reset no Recalcular/Troca de tabela**: Ao clicar "Recalcular" ou trocar de tabela de preco, os flags sao resetados e o calculo automatico volta a funcionar normalmente.

5. **billing_verified_by sempre preenchido**: O campo agora eh setado em TODOS os saves (nao so em aprovacoes), garantindo que ao reabrir a OS, o sistema reconhece que ha dados salvos manualmente.

**Regra:** SE `userManuallyEditedRef=true` OU `useSavedValuesRef=true` → useEffect de sincronizacao NAO executa setRevenueInput/setCostInput automatico e NAO faz auto-save no banco.
