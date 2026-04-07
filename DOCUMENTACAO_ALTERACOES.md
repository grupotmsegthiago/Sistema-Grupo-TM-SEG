# DOCUMENTACAO DE ALTERACOES - TMSEGo
### Diario de Bordo Oficial — Evolucao do Sistema

---

## 07/04/2026 18:25 (Brasília) - CORRECAO GERAL DE TABELA DE CUSTO 100KM vs 200KM (#051)

**Descricao:** Script executado para reverter custos inflados de R$ 800 para R$ 400 em missoes de curto percurso. O recalculo em massa de 01-07/04 aplicou a tabela LOGITECH 200KM (base R$800) em missoes que deveriam usar GERAL SP/RJ ATE 100KM (base R$400).

### 1. Missoes Corrigidas

| OS | KM | Custo Antes | Custo Depois | Rota |
|----|-----|-------------|--------------|------|
| GTM-3775 | 51km | R$820 | R$400 | Jundiaí → Perus |
| GTM-3940 | 74km | R$820 | R$400 | Av. Francisco Roveri → Barueri |
| GTM-3773 | 50km | R$820 | R$400 | Av. Francisco Roveri → Perus |
| GTM-3774 | 51km | R$820 | R$400 | Jundiaí → Perus |
| GTM-3865 | 52km | R$820 | R$400 | Jundiaí → Perus |
| GTM-3866 | 54km | R$820 | R$400 | Jundiaí → Perus |

Total: 6 missoes corrigidas. Economia: R$2.520 (R$420 por missao).

### 2. Missoes Protegidas (NAO alteradas)

- GTM-4296 (billing_approved=true, cost=R$875.67)
- GTM-3790 (billing_approved=true, cost=R$813.23)

### 3. Regra de Negocio Aplicada

- Se `km_total <= 100km` E fornecedor COMANDO G8 E rota SP → tabela `GERAL SP/RJ ATE 100KM` (base R$400)
- Tabela `LOGITECH 200KM` (base R$800) so se aplica a missoes com `km_total > 100km`

### 4. Blindagem

- Todos os cost_edit_reason gravados com justificativa completa
- Logs registrados em system_logs com entity='Mission', action='UPDATE'
- Regra de Ouro (#049): Frontend NUNCA calcula totais — apenas exibe valores do banco

**Status:** ✅ Concluido

---

## 07/04/2026 20:30 (Brasília) - TOTAL SISTEMA LIDO DIRETO DO BANCO (#049)

**Descricao:** O comparador de planilha e o resumo financeiro agora leem `revenue_value + toll_value` diretamente do array `missions` (dados do Supabase), em vez de depender do calculo intermediario `rowsData.totalGeral` que podia estar desatualizado por cache do navegador.

### Regra de Ouro

- O frontend NUNCA calcula totais financeiros por conta propria
- Comparador e Relatorios exibem APENAS a soma de `revenue_value + toll_value` do banco
- Valores editados pelo usuario no Modal Financeiro sao lei absoluta

**Status:** ✅ Concluido
