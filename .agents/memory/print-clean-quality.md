---
name: Limpeza de print sem perder qualidade
description: Pipeline v2 — detecção Gemini + inpainting local server-side
---

# Regra

A foto final da atualização de OS é processada no **servidor** (`server/printImagePipeline.ts`):

1. **Detecção** — Gemini 2.5 Flash (imagem reduzida só para IA, via `lib/imageForAI` pattern)
2. **Remoção** — inpainting local determinístico (`lib/printInpainting.ts`) na resolução original
3. **Logo TM SEG** — aplicado no frontend via `lib/brandPhotoStamp.ts` (carimbo completo)

**Nunca** usar `gemini-2.5-flash-image` na foto inteira. Fallback opcional (`PRINT_PIPELINE_GEMINI_PATCH=true`) só em recortes pequenos.

**Upload:** preferir `multipart/form-data` (campo `image`). JSON base64 mantido como fallback.

**Timings:** expostos em `timings` na resposta; debug no client com `localStorage.setItem('tmseg:print-pipeline-debug','1')`.
