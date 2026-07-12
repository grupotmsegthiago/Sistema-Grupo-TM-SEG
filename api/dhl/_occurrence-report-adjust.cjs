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
  buildDhlReportGenerationPrompt: () => buildDhlReportGenerationPrompt,
  buildGeminiAdjustmentPrompt: () => buildGeminiAdjustmentPrompt,
  extractEditableBlocks: () => extractEditableBlocks,
  generateDhlReportHtmlWithAi: () => generateDhlReportHtmlWithAi,
  parseGeminiAdjustmentJson: () => parseGeminiAdjustmentJson,
  parseGeminiAdjustmentResponse: () => parseGeminiAdjustmentResponse
});
module.exports = __toCommonJS(adjustReportHtml_exports);
var EDITABLE_OPEN_RE = /<([a-z][a-z0-9]*)[^>]*\sdata-dhl-editable="([^"]+)"[^>]*>/gi;
var DELETE_MARKERS = /* @__PURE__ */ new Set(["", "__DELETE__", "__REMOVE__", "__EXCLUIR__"]);
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isDeletePatch(html) {
  return DELETE_MARKERS.has(String(html || "").trim());
}
function findMatchingCloseTagIndex(html, tagName, contentStart) {
  const tagRe = new RegExp(`<(/?)${tagName}(\\s[^>]*?)?(/?)>`, "gi");
  tagRe.lastIndex = contentStart;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const isClosing = m[1] === "/";
    const isSelfClosing = m[3] === "/";
    if (isClosing) {
      depth -= 1;
      if (depth === 0) return m.index;
    } else if (!isSelfClosing) {
      depth += 1;
    }
  }
  return -1;
}
function extractEditableBlocks(html, options) {
  const includeAdjustOnly = !!options?.includeAdjustOnly;
  const blocks = [];
  const seen = /* @__PURE__ */ new Set();
  const re = new RegExp(EDITABLE_OPEN_RE.source, EDITABLE_OPEN_RE.flags);
  let match;
  while ((match = re.exec(html)) !== null) {
    const id = match[2];
    if (seen.has(id)) continue;
    const openTag = match[0];
    const isAdjustOnly = /\sdata-dhl-adjust-only(?:\s|=)/i.test(openTag);
    if (isAdjustOnly && !includeAdjustOnly) continue;
    seen.add(id);
    const tagName = match[1];
    const contentStart = match.index + match[0].length;
    const closeStart = findMatchingCloseTagIndex(html, tagName, contentStart);
    if (closeStart === -1) continue;
    blocks.push({ id, html: html.slice(contentStart, closeStart).trim() });
  }
  return blocks;
}
function applyEditablePatches(html, patches) {
  let result = html;
  for (const [id, newInner] of Object.entries(patches)) {
    if (!id || newInner == null) continue;
    const openRe = new RegExp(
      `<([a-z][a-z0-9]*)[^>]*\\sdata-dhl-editable="${escapeRegex(id)}"[^>]*>`,
      "i"
    );
    const open = openRe.exec(result);
    if (!open) continue;
    const tagName = open[1];
    const openStart = open.index;
    const contentStart = open.index + open[0].length;
    const closeStart = findMatchingCloseTagIndex(result, tagName, contentStart);
    if (closeStart === -1) continue;
    const closeTagRe = new RegExp(`^</${tagName}\\s*>`, "i");
    const closeMatch = result.slice(closeStart).match(closeTagRe);
    const closeEnd = closeStart + (closeMatch ? closeMatch[0].length : 0);
    if (isDeletePatch(newInner)) {
      result = result.slice(0, openStart) + result.slice(closeEnd);
      continue;
    }
    result = result.slice(0, contentStart) + newInner + result.slice(closeStart);
  }
  return result;
}
var MAX_CHAT_HISTORY = 12;
function formatConversationHistory(history) {
  const turns = (history || []).filter((m) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim()).slice(-MAX_CHAT_HISTORY);
  if (!turns.length) return "(primeiro pedido desta conversa \u2014 sem hist\xF3rico pr\xE9vio)";
  return turns.map((m) => `${m.role === "user" ? "DIRETOR" : "AGENTE"}: ${String(m.content).trim()}`).join("\n");
}
function buildGeminiAdjustmentPrompt(blocks, adjustmentNotes, conversationHistory) {
  const payload = {
    pedido_atual: adjustmentNotes.trim(),
    blocos: blocks.map((b) => ({ id: b.id, html: b.html }))
  };
  return `Voc\xEA \xE9 um AGENTE editor de relat\xF3rios operacionais da TM SEG para a DHL Supply Chain (estilo assistente conversacional).

Voc\xEA mant\xE9m uma conversa com o diretor: cada pedido \xE9 um turno. O HTML dos blocos abaixo j\xE1 reflete os ajustes anteriores desta sess\xE3o. Use o HIST\xD3RICO para entender refer\xEAncias ("fa\xE7a o mesmo", "agora a AC-03", "tamb\xE9m tire isso", "desfa\xE7a o tom").

HIST\xD3RICO DA CONVERSA:
${formatConversationHistory(conversationHistory)}

PEDIDO ATUAL DO DIRETOR (prioridade m\xE1xima \u2014 aplique isto sobre os BLOCOS ATUAIS):
${adjustmentNotes.trim()}

MODO COLAR + INSTRU\xC7\xC3O (estilo Gemini \u2014 obrigat\xF3rio respeitar):
O diretor frequentemente cola um trecho do relat\xF3rio e acrescenta uma ordem curta, por exemplo:
"AC-02	Registro formal no scorecard de fornecedores e refor\xE7o de SLA	Gest\xE3o de Fornecedores TM SEG	14/07/2026	Registro no sistema (excluir isso)"
Interprete assim:
- O texto colado identifica O QUE alterar: encontre o bloco cujo html cont\xE9m esse trecho (ou o ID da a\xE7\xE3o, ex. AC-02 \u2192 id row-ac-02).
- A parte entre par\xEAnteses \u2014 ou a frase de comando ap\xF3s o trecho \u2014 \xE9 a A\xC7\xC3O (excluir/remover/apagar/reescrever/suavizar/alterar prazo/etc.).
- Fa\xE7a SOMENTE o que o PEDIDO ATUAL pede. N\xE3o desfa\xE7a ajustes anteriores nem reescreva blocos n\xE3o mencionados.
- Para EXCLUIR uma linha/a\xE7\xE3o/campo: devolva {"id":"row-ac-02","html":""} (html vazio remove o elemento). Tamb\xE9m aceito "__DELETE__".
- Se o bloco "cronograma" citar o ID exclu\xEDdo (ex. AC-02), atualize o cronograma removendo s\xF3 essa refer\xEAncia, sem inventar novos marcos.
- Se pedir para reescrever/alterar um trecho colado, devolva o html novo s\xF3 do(s) bloco(s) afetado(s).

REGRAS OBRIGAT\xD3RIAS:
1. Responda APENAS com JSON v\xE1lido, sem markdown: {"patches":[{"id":"...","html":"..."}],"reply":"frase curta em portugu\xEAs confirmando o que fez"}
2. Inclua apenas os blocos que o PEDIDO ATUAL exige alterar. Se pedir menos repeti\xE7\xE3o, tom mais profissional ou texto mais curto, REESCREVA por completo os blocos afetados (em especial sec-4-1-sintese) \u2014 nunca devolva o mesmo texto ou uma c\xF3pia quase id\xEAntica.
3. Preserve n\xFAmeros de S.E., OS, datas, hor\xE1rios, placas e nomes de clientes (DHL, Foxconn, Apple) exatamente como est\xE3o \u2014 salvo se o diretor pedir altera\xE7\xE3o expl\xEDcita.
4. Em textos narrativos gerais, prefira "parceiro" ou "fornecedor" em vez de citar repetidamente o nome comercial do parceiro \u2014 salvo na tabela de identifica\xE7\xE3o (bloco fornecedor-identificacao) onde o nome completo pode permanecer.
5. Tom construtivo e profissional para apresenta\xE7\xE3o ao cliente; evite linguagem punitiva, acusat\xF3ria ou que manche a imagem do parceiro \u2014 salvo se o ajuste for s\xF3 exclus\xE3o pontual (a\xED n\xE3o mude o tom do restante).
6. Mantenha HTML simples no campo html: <strong>, <em>, <br/> e, em linhas de tabela (ids row-*), as c\xE9lulas <td>...</td> quando for reescrever (n\xE3o excluir).
7. N\xE3o invente fatos novos; reescreva com base no conte\xFAdo existente e nas instru\xE7\xF5es.
8. N\xE3o altere blocos de e-mails (ids que come\xE7am com email-).
9. Elimine repeti\xE7\xF5es e trechos duplicados dentro de cada bloco reescrito; um \xFAnico par\xE1grafo coeso por bloco narrativo.
10. Ids de linha do plano de a\xE7\xE3o usam o padr\xE3o row-ac-01, row-ap-03, row-c4 etc. Use-os para exclus\xE3o/edi\xE7\xE3o de linhas inteiras.
11. O campo "reply" deve ter 1\u20132 frases curtas em portugu\xEAs (ex.: "Removi a linha AC-02 e atualizei o cronograma."). Sem markdown.

BLOCOS ATUAIS (JSON):
${JSON.stringify(payload, null, 2)}`;
}
function parseGeminiAdjustmentResponse(raw) {
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
  const patches = {};
  for (const patch of parsed.patches || []) {
    const id = String(patch.id || "").trim();
    if (!id || patch.html == null) continue;
    patches[id] = String(patch.html).trim();
  }
  if (!Object.keys(patches).length) {
    throw new Error("A IA n\xE3o sugeriu altera\xE7\xF5es. Tente reformular a observa\xE7\xE3o.");
  }
  const reply = String(parsed.reply || "").trim() || "Pronto \u2014 apliquei o ajuste solicitado no relat\xF3rio.";
  return { patches, reply };
}
function parseGeminiAdjustmentJson(raw) {
  return parseGeminiAdjustmentResponse(raw).patches;
}
function buildDhlReportGenerationPrompt(blocks, context) {
  return `Voc\xEA \xE9 analista s\xEAnior de opera\xE7\xF5es e gerenciamento de risco da TM SEG e vai redigir o conte\xFAdo de um Plano de A\xE7\xE3o e Justificativa de Ocorr\xEAncia para a DHL Supply Chain (opera\xE7\xE3o Foxconn/Apple).

Sua tarefa: com base em (1) DADOS DO SISTEMA (fatos reais e imut\xE1veis da miss\xE3o), (2) CONTEXTO DO E-MAIL do cliente (o problema apontado) e (3) OBSERVA\xC7\xD5ES DA DIRETORIA, escrever o conte\xFAdo de cada bloco edit\xE1vel do relat\xF3rio \u2014 explicando o que aconteceu, a causa e o plano de a\xE7\xE3o \u2014 de forma completa, coesa e profissional.

REGRAS OBRIGAT\xD3RIAS:
1. Responda APENAS com JSON v\xE1lido, sem markdown: {"patches":[{"id":"...","html":"..."}]}
2. Retorne um patch para CADA bloco fornecido (todos os ids recebidos), com o texto final adequado ao papel do bloco.
3. N\xC3O copie e cole o e-mail. Use-o apenas como fonte para entender o ocorrido e sintetizar. N\xC3O inclua cabe\xE7alhos de e-mail (De/Para/Cc/Data), assinaturas nem trechos literais.
4. N\xC3O invente fatos: use somente o que est\xE1 nos DADOS DO SISTEMA e no CONTEXTO DO E-MAIL. Preserve exatamente n\xFAmeros de S.E., OS, datas, hor\xE1rios, placas e nomes de clientes (DHL, Foxconn, Apple).
5. Em textos narrativos, prefira "parceiro" ou "fornecedor" em vez de citar o nome comercial do parceiro. Tom construtivo e profissional, sem linguagem punitiva ou acusat\xF3ria que manche a imagem do parceiro.
6. Mantenha HTML simples no campo html: <strong>, <em>, <br/> quando necess\xE1rio. Respeite o formato de cada bloco: respostas de c\xE9lula de tabela devem ser curtas e diretas; blocos de s\xEDntese/causa podem ser um par\xE1grafo.
7. Escreva em portugu\xEAs do Brasil. Se faltar informa\xE7\xE3o para algum bloco, produza um texto coerente e neutro com base no que existe, sem inventar dados factuais.

DADOS DO SISTEMA (fatos reais):
${context.factsBlock}

CONTEXTO DO E-MAIL DO CLIENTE (n\xE3o copiar; apenas sintetizar):
${context.emailText.trim() || "(sem anexo de e-mail)"}
${context.emailLink.trim() ? `Refer\xEAncia de e-mail: ${context.emailLink.trim()}` : ""}

OBSERVA\xC7\xD5ES DA DIRETORIA:
${context.userSummary.trim() || "(sem observa\xE7\xF5es adicionais)"}

BLOCOS A PREENCHER (JSON com id e conte\xFAdo atual como refer\xEAncia de formato):
${JSON.stringify(blocks.map((b) => ({ id: b.id, html_atual: b.html })), null, 2)}`;
}
async function generateDhlReportHtmlWithAi(html, context, generateText) {
  const blocks = extractEditableBlocks(html);
  if (!blocks.length) return html;
  const prompt = buildDhlReportGenerationPrompt(blocks, context);
  const response = await generateText(prompt);
  const patches = parseGeminiAdjustmentJson(response);
  return applyEditablePatches(html, patches);
}
async function adjustDhlReportHtmlWithAi(html, adjustmentNotes, generateText, options) {
  const notes = adjustmentNotes.trim();
  if (!notes) {
    throw new Error("Descreva o que deseja ajustar no relat\xF3rio.");
  }
  const blocks = extractEditableBlocks(html, { includeAdjustOnly: true });
  if (!blocks.length) {
    throw new Error("Nenhum trecho edit\xE1vel encontrado no relat\xF3rio.");
  }
  const prompt = buildGeminiAdjustmentPrompt(blocks, notes, options?.conversationHistory);
  const response = await generateText(prompt);
  const { patches, reply } = parseGeminiAdjustmentResponse(response);
  return {
    html: applyEditablePatches(html, patches),
    reply
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  adjustDhlReportHtmlWithAi,
  applyEditablePatches,
  buildDhlReportGenerationPrompt,
  buildGeminiAdjustmentPrompt,
  extractEditableBlocks,
  generateDhlReportHtmlWithAi,
  parseGeminiAdjustmentJson,
  parseGeminiAdjustmentResponse
});
