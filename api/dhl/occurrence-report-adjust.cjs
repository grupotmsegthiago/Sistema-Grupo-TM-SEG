"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/dhlOccurrenceReport/adjustReportHtml.ts
var adjustReportHtml_exports = {};
__export(adjustReportHtml_exports, {
  adjustDhlReportHtmlWithAi: () => adjustDhlReportHtmlWithAi,
  applyEditablePatches: () => applyEditablePatches,
  buildGeminiAdjustmentPrompt: () => buildGeminiAdjustmentPrompt,
  extractEditableBlocks: () => extractEditableBlocks,
  parseGeminiAdjustmentJson: () => parseGeminiAdjustmentJson
});
module.exports = __toCommonJS(adjustReportHtml_exports);
var EDITABLE_BLOCK_RE = /<([a-z][a-z0-9]*)[^>]*\sdata-dhl-editable="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
function extractEditableBlocks(html) {
  const blocks = [];
  const seen = /* @__PURE__ */ new Set();
  let match;
  const re = new RegExp(EDITABLE_BLOCK_RE.source, EDITABLE_BLOCK_RE.flags);
  while ((match = re.exec(html)) !== null) {
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    blocks.push({ id, html: match[3].trim() });
  }
  return blocks;
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function applyEditablePatches(html, patches) {
  let result = html;
  for (const [id, newInner] of Object.entries(patches)) {
    if (!id || newInner == null) continue;
    const re = new RegExp(
      `(<[a-z][a-z0-9]*[^>]*\\sdata-dhl-editable="${escapeRegex(id)}"[^>]*>)([\\s\\S]*?)(</[a-z][a-z0-9]*>)`,
      "i"
    );
    result = result.replace(re, `$1${newInner}$3`);
  }
  return result;
}
function buildGeminiAdjustmentPrompt(blocks, adjustmentNotes) {
  const payload = {
    instrucoes_da_diretoria: adjustmentNotes.trim(),
    blocos: blocks.map((b) => ({ id: b.id, html: b.html }))
  };
  return `Voc\xEA \xE9 editor s\xEAnior de relat\xF3rios operacionais da TM SEG para a DHL Supply Chain.

O diretor leu o Plano de A\xE7\xE3o gerado e pediu AJUSTES DE CONTEXTO/TOM \u2014 n\xE3o \xE9 um parecer novo, \xE9 corre\xE7\xE3o editorial do que j\xE1 est\xE1 escrito.

INSTRU\xC7\xD5ES DO DIRETOR (prioridade m\xE1xima):
${adjustmentNotes.trim()}

REGRAS OBRIGAT\xD3RIAS:
1. Responda APENAS com JSON v\xE1lido, sem markdown: {"patches":[{"id":"...","html":"..."}]}
2. Inclua somente blocos que precisam mudar; omita blocos iguais ao original.
3. Preserve n\xFAmeros de S.E., OS, datas, hor\xE1rios, placas e nomes de clientes (DHL, Foxconn, Apple) exatamente como est\xE3o.
4. Em textos narrativos gerais, prefira "parceiro" ou "fornecedor" em vez de citar repetidamente o nome comercial do parceiro \u2014 salvo na tabela de identifica\xE7\xE3o (bloco fornecedor-identificacao) onde o nome completo pode permanecer.
5. Tom construtivo e profissional para apresenta\xE7\xE3o ao cliente; evite linguagem punitiva, acusat\xF3ria ou que manche a imagem do parceiro.
6. Mantenha HTML simples no campo html: <strong>, <em>, <br/> quando necess\xE1rio.
7. N\xE3o invente fatos novos; reescreva com base no conte\xFAdo existente e nas instru\xE7\xF5es.
8. N\xE3o altere blocos de e-mails (ids que come\xE7am com email-).

BLOCOS ATUAIS (JSON):
${JSON.stringify(payload, null, 2)}`;
}
function parseGeminiAdjustmentJson(raw) {
  const trimmed = String(raw || "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("A IA n\xE3o retornou JSON v\xE1lido para o ajuste.");
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Resposta da IA em formato inv\xE1lido.");
  }
  const out = {};
  for (const patch of parsed.patches || []) {
    const id = String(patch.id || "").trim();
    const html = String(patch.html ?? "").trim();
    if (id && html) out[id] = html;
  }
  if (!Object.keys(out).length) {
    throw new Error("A IA n\xE3o sugeriu altera\xE7\xF5es. Tente reformular a observa\xE7\xE3o.");
  }
  return out;
}
async function adjustDhlReportHtmlWithAi(html, adjustmentNotes, generateText) {
  const notes = adjustmentNotes.trim();
  if (!notes) {
    throw new Error("Descreva o que deseja ajustar no relat\xF3rio.");
  }
  const blocks = extractEditableBlocks(html);
  if (!blocks.length) {
    throw new Error("Nenhum trecho edit\xE1vel encontrado no relat\xF3rio.");
  }
  const prompt = buildGeminiAdjustmentPrompt(blocks, notes);
  const response = await generateText(prompt);
  const patches = parseGeminiAdjustmentJson(response);
  return applyEditablePatches(html, patches);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  adjustDhlReportHtmlWithAi,
  applyEditablePatches,
  buildGeminiAdjustmentPrompt,
  extractEditableBlocks,
  parseGeminiAdjustmentJson
});
