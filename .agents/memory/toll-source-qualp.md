---
name: Fonte de pedágio QualP
description: QualP é a ÚNICA fonte automática de pedágio (rota+pedágio por endereço); manual e exceção CEVA fixa coexistem; contrato de sucesso distingue rota sem pedágio de falha.
---

# Fonte de pedágio QualP (única fonte automática)

O cálculo automático de pedágio do MissionForm usa **somente a QualP**. Foram removidos (a pedido da diretoria) os antigos fallbacks/fontes: RapidAPI (`/api/toll/calculate`), Gemini IA (`/api/toll/gemini-estimate`), pedágio fixo cadastrado na rota (`route.toll_cost`) e o lookup de histórico de missões concluídas. A QualP recebe origem/destino por TEXTO (não precisa geocodificar pelo Google) e devolve rota + pedágios numa única chamada. Token sempre via backend (proxy autenticado), nunca no frontend.

**Why:** a QualP é específica do mercado BR de logística e calcula rota+pedágio por endereço, dispensando o geocoding do Google + a chamada separada de pedágio. A diretoria pediu uma fonte única para evitar valores divergentes entre fontes concorrentes.

**How to apply:**
- `calculateTollFromAPI` chama só `calculateTollQualP`; em sucesso retorna `provider:'qualp'`; em falha retorna `{value:0, apiError}` SEM provider. Quem consome (handleRouteSelect e o botão "Recalcular via QualP") deve checar `provider==='qualp'` antes de aplicar o valor — NÃO aplicar `value` quando há `apiError`, senão zera pedágio indevidamente.
- **Exceção mantida:** regra fixa CEVA Jundiaí 200KM = R$ 35 fixo (`tollSource='fixed'`), porque o destino "200KM" é sintético/não-geocodável — a QualP não consegue rotear. É a única `tollSource` além de '' (vazio).
- **Edição manual** (`manualOverrides.toll`) sempre tem prioridade e desliga o cálculo automático; o botão "Recalcular via QualP" reativa o automático.
- A resposta da QualP traz `pedagios[].tarifa` indexada pelo **nº de eixos** (ex.: `{"2": 4.51}` para carro 2 eixos). Somar a tarifa do eixo pedido em todas as praças. Escolta = carro 2 eixos.
- **Rota sem pedágio (R$ 0) NÃO é falha.** Sucesso = "rota foi calculada" (a QualP retornou `distancia`), com `tollValue` podendo ser 0. Tratar `tollValue===0` como erro lançaria valor INDEVIDO numa rota sem pedágio. handleRouteSelect já trata 0 mostrando "Rota sem pedágio".
- Endpoint: `POST https://api.qualp.com.br/rotas/v4`, header `Access-Token`, body com `vehicle.axis=N` e `show.tolls=true`.

## Auto-cálculo por origem+destino digitados (sem rota cadastrada)

No MissionForm (componente SÓ de nova OS), digitar origem+destino manualmente já dispara tudo automático (distância Google + tabelas/preço + pedágio QualP), sem exigir rota cadastrada. Um effect com debounce dispara quando há cliente+origem+destino, pula destinos sintéticos (RAIO/ACOMPANHAMENTO/DESTINO A DEFINIR) e pula se já há rota cadastrada real selecionada. Dedupe por chave `origin|||destination`. Monta uma rota virtual `{id:'manual'}` e seta `selectedRouteId='manual'` para destravar os painéis/step (que exigem `selectedRouteId`).

**Why:** operador não devia precisar cadastrar rota só para precificar uma OS pontual; a regra de ouro é "direto ao ponto".

**How to apply:**
- Quem resolve a rota ativa dos handlers (troca de tabela, seleção de fornecedor, botão Recalcular) deve usar a rota cadastrada real OU uma virtual derivada de origem/destino — não só `clientRoutes.find(selectedRouteId)`, senão o fluxo manual não recalcula.
- NUNCA herdar `formData.totalDistance` da rota anterior como fallback de distância: se Google e QualP falharem em distância, usar 0 (evita precificar a rota nova com km da rota velha).
- Limpar a rota deve resetar o ref de dedupe e o estado de pedágio para permitir recalcular a mesma rota de novo.
