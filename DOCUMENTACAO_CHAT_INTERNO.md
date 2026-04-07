# DOCUMENTACAO CHAT INTERNO - TMSEGo
### Registro de Decisoes Tecnicas e Ajustes

---

## 07/04/2026 15:50 - AUTO-SAVE SILENCIOSO ELIMINADO + INDICADOR VISUAL DE VALOR MANUAL

**Contexto:** Apos corrigir a persistencia da edicao manual, foi identificado que o useEffect de sincronizacao ainda continha um bloco de auto-save silencioso que gravava valores calculados diretamente no banco sem acao do usuario. Alem disso, nao havia indicacao visual de que um valor havia sido editado manualmente.

**Decisao:** 3 travas de seguranca implementadas:

### Trava 1 — Morte ao Auto-Save Silencioso
- O bloco `supabase.from('missions').update(...)` dentro do useEffect de sincronizacao foi REMOVIDO completamente
- O banco de dados SOMENTE eh alterado quando o usuario clica fisicamente em "Salvar Ajustes" ou "Aprovar"
- O useEffect agora apenas atualiza os campos visuais (setRevenueInput/setCostInput) — nunca o banco

### Trava 2 — Indicador de Valor Manual
- Quando o valor no input verde (revenueInput) diverge do calculo automatico em mais de R$ 1:
  - Borda muda de VERDE para AMARELO (amber-400)
  - Icone de lapis (✍️) aparece antes do "R$"
  - Texto abaixo muda para "✍️ VALOR MANUAL — Calculo automatico: R$ X.XXX,XX"
  - Background do input fica levemente amarelado (amber-50)
- Quando o valor coincide com o calculo, visual permanece verde normal

### Trava 3 — Prioridade do Banco na Abertura
- Ao abrir o modal, se `mission.revenue_value > 0`, o valor do banco eh carregado no input ANTES de qualquer calculo
- O useEffect de sincronizacao so sobrescreve se NAO houver flags de protecao (userManuallyEditedRef, useSavedValuesRef, revenue_edit_reason, billing_verified_by)

**Regra final:** O banco de dados so muda por acao EXPLICITA do usuario (botao Salvar/Aprovar). Nenhum useEffect grava dados silenciosamente.

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
