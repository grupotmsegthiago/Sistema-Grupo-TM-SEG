---
name: Fonte de pedágio QualP
description: QualP é a fonte preferida de pedágio (rota+pedágio por endereço); contrato de sucesso distingue rota sem pedágio de falha.
---

# Fonte de pedágio QualP (preferida)

A consulta de pedágio do MissionForm tenta as fontes nesta ordem: **QualP -> RapidAPI (territorial-pedagio) -> Gemini IA**. A QualP recebe origem/destino por TEXTO (não precisa geocodificar pelo Google) e devolve rota + pedágios numa única chamada. Token sempre via backend (proxy autenticado), nunca no frontend.

**Why:** a QualP é específica do mercado BR de logística e calcula rota+pedágio por endereço, dispensando o geocoding do Google + a chamada separada de pedágio. Manter RapidAPI/Gemini como reserva evita ficar sem pedágio quando a QualP falha ou os créditos acabam.

**How to apply:**
- A resposta da QualP traz `pedagios[].tarifa` indexada pelo **nº de eixos** (ex.: `{"2": 4.51}` para carro 2 eixos). Somar a tarifa do eixo pedido em todas as praças. Escolta = carro 2 eixos (como era no fluxo antigo).
- **Rota sem pedágio (R$ 0) NÃO é falha.** O sucesso é "rota foi calculada" (a QualP retornou `distancia`), com `tollValue` podendo ser 0. Se tratar `tollValue===0` como erro, o fluxo cai no fallback e pode lançar valor INDEVIDO numa rota que de fato não tem pedágio. O chamador (`handleRouteSelect`) já trata valor 0 mostrando "Rota sem pedágio".
- Endpoint: `POST https://api.qualp.com.br/rotas/v4`, header `Access-Token`, body `{ locations:[origem,destino], config:{ route:{type_route:'efficient',calculate_return:false}, vehicle:{type:'car',axis:N} }, show:{tolls:true} }`.
