# IMPLANTAÇÃO — Assistente IA para Seleção de Tabela de Preços
**Data:** 06/04/2026  
**Sistema:** TMSEGo — Grupo TMSEG

---

## OBJETIVO

Adicionar um botão **"Sugerir Tabela com IA"** no MissionFinancialModal que utiliza o Gemini para analisar os dados da missão e recomendar a melhor tabela de preço (cliente) e custo (fornecedor), com justificativa.

---

## RESUMO OPERACIONAL

| Item | Detalhe |
|---|---|
| **Arquivos alterados** | 2 |
| **Linhas novas estimadas** | ~120–140 |
| **Complexidade** | MÉDIA |
| **Risco** | BAIXO (não altera lógica existente) |
| **Rotas backend** | Nenhuma nova (usa `/api/gemini/generate` existente) |
| **Banco de dados** | Nenhuma alteração |

---

## ARQUIVOS AFETADOS

### 1. `components/MissionFinancialModal.tsx`
**Tipo:** Alteração (~80–100 linhas novas)

**O que muda:**
- Novos states:
  - `aiSuggestionLoading` (boolean) — controla spinner enquanto Gemini processa
  - `aiSuggestionClient` (objeto) — sugestão para tabela do cliente { tableId, tableName, reason }
  - `aiSuggestionProvider` (objeto) — sugestão para tabela do fornecedor { tableId, tableName, reason }
  - `showAiSuggestion` (boolean) — controla exibição do popover/card de sugestão

- Nova função `handleAiSuggest()`:
  1. Coleta dados da missão já disponíveis no modal:
     - `mission.origin`, `mission.destination`, `mission.total_km`
     - `mission.mission_type` (VELADA / CARACTERIZADA)
     - `mission.client`, `mission.provider`
     - Quantidade de agentes (`mission.agents?.length`)
     - UF de origem, região detectada
  2. Monta lista compacta das tabelas disponíveis (id, operation_type, activation_fee, franchise_km, franchise_hours, price_per_extra_km, price_per_extra_hour)
  3. Chama `generateContent()` do `lib/gemini.ts` com prompt estruturado
  4. Parseia resposta JSON do Gemini
  5. Seta os states de sugestão

- Novo botão na UI:
  - Posição: ao lado do select de "Tabela de Preço Aplicada" (cliente) e "Tabela de Custo de Referência" (fornecedor)
  - Ícone: `Sparkles` ou `BrainCircuit` do lucide-react
  - Texto: "IA" (compacto)
  - Cor: gradiente roxo/azul (diferenciado dos botões existentes)

- Novo card/popover de sugestão:
  - Aparece abaixo dos selects quando Gemini retorna
  - Mostra: nome da tabela sugerida + justificativa em texto
  - Dois botões: **"Aplicar"** (seta manualClientTableId/manualProviderTableId) e **"Ignorar"** (fecha o card)
  - Estilo: fundo amarelo claro, borda dourada, ícone de estrela

### 2. `lib/gemini.ts`
**Tipo:** Alteração (~30–40 linhas novas)

**O que muda:**
- Nova função exportada `suggestPriceTable()`:

```typescript
export async function suggestPriceTable(options: {
  mission: {
    origin: string;
    destination: string;
    totalKm: number;
    missionType: string;
    client: string;
    provider: string;
    agentCount: number;
    originUF: string;
    region: string;
  };
  clientTables: Array<{
    id: string;
    operation_type: string;
    activation_fee: number;
    franchise_km: number;
    franchise_hours: number;
    price_per_extra_km: number;
    price_per_extra_hour: number;
  }>;
  providerTables: Array<{
    id: string;
    operation_type: string;
    activation_cost: number;
    franchise_km: number;
    franchise_hours: number;
    cost_per_extra_km: number;
    cost_per_extra_hour: number;
  }>;
  currentClientTableId?: string;
  currentProviderTableId?: string;
}): Promise<{
  clientSuggestion: { tableId: string; tableName: string; reason: string } | null;
  providerSuggestion: { tableId: string; tableName: string; reason: string } | null;
}>
```

---

## PROMPT DO GEMINI (Estrutura)

```
Você é um especialista em logística de escoltas de segurança no Brasil.
Analise os dados da missão e recomende a melhor tabela de preço (cliente) 
e a melhor tabela de custo (fornecedor).

DADOS DA MISSÃO:
- Origem: {origin} (UF: {uf}, Região: {region})
- Destino: {destination}
- Distância: {totalKm} km
- Tipo: {missionType}
- Cliente: {client}
- Fornecedor: {provider}
- Agentes: {agentCount}

TABELAS DE PREÇO DO CLIENTE ({N} disponíveis):
[lista compacta: id | operation_type | acionamento | franquia_km | franquia_h | km_extra | h_extra]

TABELAS DE CUSTO DO FORNECEDOR ({N} disponíveis):
[lista compacta: id | operation_type | acionamento | franquia_km | franquia_h | km_extra | h_extra]

TABELA ATUALMENTE SELECIONADA:
- Cliente: {current ou "Automático"}
- Fornecedor: {current ou "Automático"}

REGRAS DE NEGÓCIO:
1. VELADA = escolta discreta, usa tabelas ARMADO/PRONTA RESPOSTA (sem faixa KM)
2. CARACTERIZADA = escolta visível, usa tabelas com faixa KM
3. A franquia_km deve cobrir a distância da missão (escolher a menor que cubra)
4. Se missão é MG/ES, evitar tabelas com "EXCETO MG" ou "EXCETO MG/ES"
5. Se operation_type contém cidade da origem ou destino, é match forte
6. Se fornecedor é MACOR, preferir tabelas com "MACOR" no nome
7. 02 ARMADOS = missão com 2+ agentes

Responda APENAS em JSON:
{
  "clientSuggestion": { "tableId": "...", "tableName": "...", "reason": "..." },
  "providerSuggestion": { "tableId": "...", "tableName": "...", "reason": "..." }
}

Se não houver tabelas disponíveis, retorne null para a sugestão correspondente.
```

---

## FLUXO DO OPERADOR

```
1. Operador abre MissionFinancialModal
2. Sistema automático (selectStrictTable) já seleciona uma tabela
3. Operador clica no botão "IA" (Sparkles)
4. Spinner aparece (~2-3 segundos)
5. Card de sugestão aparece abaixo dos selects:

   ┌──────────────────────────────────────────────┐
   │ ✨ SUGESTÃO DA IA                            │
   │                                              │
   │ 📘 Cliente: "CARACTERIZADA SUDESTE ATE 200KM"│
   │    Motivo: A distância de 180km está dentro  │
   │    da franquia de 200km. Região SUDESTE      │
   │    compatível com UF SP da origem.           │
   │                                              │
   │ 📕 Fornecedor: "VELADA SP ATE 300KM"         │
   │    Motivo: Menor custo com franquia que      │
   │    cobre a distância sem excedente.           │
   │                                              │
   │  [ ✅ Aplicar ]  [ ✖ Ignorar ]               │
   └──────────────────────────────────────────────┘

6a. Se "Aplicar": seta manualClientTableId e manualProviderTableId
    → Financeiro recalcula automaticamente via useMemo
6b. Se "Ignorar": fecha o card, nada muda
```

---

## O QUE NÃO MUDA

| Item | Status |
|---|---|
| `selectStrictTable()` em financialUtils.ts | Intocado |
| Lógica de score por pontuação | Intocada |
| Regras hardcoded (CEVA, CESLOG, MACOR, VTC, IBL) | Intocadas |
| Rota `/api/gemini/generate` no backend | Intocada (reutilizada) |
| Banco de dados (Supabase) | Sem alterações |
| Snapshot / aprovação | Sem alterações |
| Outros componentes | Sem alterações |

---

## DIFERENÇA ENTRE IA ATUAL vs IA NOVA

| Aspecto | IA Atual (selectStrictTable) | IA Nova (Gemini) |
|---|---|---|
| **Tipo** | Algoritmo determinístico por score | LLM generativa |
| **Velocidade** | Instantâneo (<1ms) | 2-3 segundos |
| **Explicabilidade** | Log curto ("Faixa KM (Tipo: CARACTERIZADA)") | Justificativa em texto natural |
| **Custo** | Zero | Tokens Gemini (~200-500 tokens/chamada) |
| **Quando roda** | Sempre, automaticamente | Sob demanda (botão) |
| **Papel** | Seleção principal | Segunda opinião / validação |

A IA do Gemini **NÃO substitui** o selectStrictTable. Ela funciona como **segunda opinião** que o operador pode consultar quando tem dúvida.

---

## RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Gemini sugere tabela errada | Média | Operador sempre confirma manualmente |
| Timeout/erro da API Gemini | Baixa | Try/catch com mensagem "Não foi possível consultar" |
| Excesso de tokens (muitas tabelas) | Baixa | Limitar listagem a tabelas do cliente/fornecedor específico |
| Operador confiar cegamente na IA | Média | Card mostra "SUGESTÃO" com tom de recomendação, não decisão |

---

## PRÉ-REQUISITOS

- Integração `javascript_gemini_ai_integrations` ✅ (já instalada)
- Rota `/api/gemini/generate` ✅ (já existe)
- `lib/gemini.ts` com `generateContent()` ✅ (já existe)
- `authFetch` ✅ (já usado em toda a aplicação)

---

## ESTIMATIVA DE TEMPO

| Etapa | Tempo |
|---|---|
| Implementar `suggestPriceTable()` em gemini.ts | ~10 min |
| Adicionar botão + states no MissionFinancialModal | ~15 min |
| Card de sugestão com "Aplicar"/"Ignorar" | ~10 min |
| Testes manuais | ~5 min |
| **Total** | **~40 min** |
