/** Blocos narrativos editáveis via IA no Plano de Ação DHL. */
export type DhlEditableBlock = {
  id: string;
  html: string;
};

export type ExtractEditableBlocksOptions = {
  /**
   * Inclui blocos com data-dhl-adjust-only (linhas de tabela do plano de ação).
   * Usado no "Ajustar com IA"; a geração inicial os ignora para não reescrever a grade.
   */
  includeAdjustOnly?: boolean;
};

const EDITABLE_OPEN_RE =
  /<([a-z][a-z0-9]*)[^>]*\sdata-dhl-editable="([^"]+)"[^>]*>/gi;

const DELETE_MARKERS = new Set(['', '__DELETE__', '__REMOVE__', '__EXCLUIR__']);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDeletePatch(html: string): boolean {
  return DELETE_MARKERS.has(String(html || '').trim());
}

/** Índice da tag de fechamento do elemento (depth 0), respeitando aninhamento do mesmo tagName. */
function findMatchingCloseTagIndex(html: string, tagName: string, contentStart: number): number {
  const tagRe = new RegExp(`<(/?)${tagName}(\\s[^>]*?)?(/?)>`, 'gi');
  tagRe.lastIndex = contentStart;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const isClosing = m[1] === '/';
    const isSelfClosing = m[3] === '/';
    if (isClosing) {
      depth -= 1;
      if (depth === 0) return m.index;
    } else if (!isSelfClosing) {
      depth += 1;
    }
  }
  return -1;
}

/** Extrai trechos marcados com data-dhl-editable no HTML do relatório. */
export function extractEditableBlocks(
  html: string,
  options?: ExtractEditableBlocksOptions,
): DhlEditableBlock[] {
  const includeAdjustOnly = !!options?.includeAdjustOnly;
  const blocks: DhlEditableBlock[] = [];
  const seen = new Set<string>();
  const re = new RegExp(EDITABLE_OPEN_RE.source, EDITABLE_OPEN_RE.flags);
  let match: RegExpExecArray | null;
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

/**
 * Aplica patches de HTML nos blocos editáveis (preserva a tag externa e troca
 * só o conteúdo interno).
 *
 * IMPORTANTE: substitui o conteúdo até a tag de fechamento CORRETA do bloco,
 * mesmo quando o bloco contém HTML aninhado (ex.: <strong>, <em>). Uma regex
 * simples `</[a-z]+>` fecharia no primeiro `</strong>` interno, deixando o
 * texto original e gerando duplicidade — por isso contamos o aninhamento do
 * mesmo elemento (tagName) para achar o fechamento certo.
 *
 * Exclusão: html vazio ou marcadores __DELETE__/__REMOVE__/__EXCLUIR__ removem
 * o elemento inteiro (ex.: linha <tr> do plano de ação).
 */
export function applyEditablePatches(html: string, patches: Record<string, string>): string {
  let result = html;
  for (const [id, newInner] of Object.entries(patches)) {
    if (!id || newInner == null) continue;

    const openRe = new RegExp(
      `<([a-z][a-z0-9]*)[^>]*\\sdata-dhl-editable="${escapeRegex(id)}"[^>]*>`,
      'i',
    );
    const open = openRe.exec(result);
    if (!open) continue;

    const tagName = open[1];
    const openStart = open.index;
    const contentStart = open.index + open[0].length;
    const closeStart = findMatchingCloseTagIndex(result, tagName, contentStart);
    if (closeStart === -1) continue;

    const closeTagRe = new RegExp(`^</${tagName}\\s*>`, 'i');
    const closeMatch = result.slice(closeStart).match(closeTagRe);
    const closeEnd = closeStart + (closeMatch ? closeMatch[0].length : 0);

    if (isDeletePatch(newInner)) {
      // Remove o elemento inteiro (abertura + conteúdo + fechamento).
      result = result.slice(0, openStart) + result.slice(closeEnd);
      continue;
    }

    result = result.slice(0, contentStart) + newInner + result.slice(closeStart);
  }
  return result;
}

export function buildGeminiAdjustmentPrompt(
  blocks: DhlEditableBlock[],
  adjustmentNotes: string,
): string {
  const payload = {
    instrucoes_da_diretoria: adjustmentNotes.trim(),
    blocos: blocks.map((b) => ({ id: b.id, html: b.html })),
  };

  return `Você é editor sênior de relatórios operacionais da TM SEG para a DHL Supply Chain.

O diretor leu o Plano de Ação gerado e pediu AJUSTES PONTUAIS — não é um parecer novo, é correção editorial do que já está escrito.

INSTRUÇÕES DO DIRETOR (prioridade máxima):
${adjustmentNotes.trim()}

MODO COLAR + INSTRUÇÃO (estilo Gemini — obrigatório respeitar):
O diretor frequentemente cola um trecho do relatório e acrescenta uma ordem curta, por exemplo:
"AC-02	Registro formal no scorecard de fornecedores e reforço de SLA	Gestão de Fornecedores TM SEG	14/07/2026	Registro no sistema (excluir isso)"
Interprete assim:
- O texto colado identifica O QUE alterar: encontre o bloco cujo html contém esse trecho (ou o ID da ação, ex. AC-02 → id row-ac-02).
- A parte entre parênteses — ou a frase de comando após o trecho — é a AÇÃO (excluir/remover/apagar/reescrever/suavizar/alterar prazo/etc.).
- Faça SOMENTE o que foi pedido. Não reescreva tom, narrativa ou outros blocos não mencionados.
- Para EXCLUIR uma linha/ação/campo: devolva {"id":"row-ac-02","html":""} (html vazio remove o elemento). Também aceito "__DELETE__".
- Se o bloco "cronograma" citar o ID excluído (ex. AC-02), atualize o cronograma removendo só essa referência, sem inventar novos marcos.
- Se pedir para reescrever/alterar um trecho colado, devolva o html novo só do(s) bloco(s) afetado(s).

REGRAS OBRIGATÓRIAS:
1. Responda APENAS com JSON válido, sem markdown: {"patches":[{"id":"...","html":"..."}]}
2. Inclua apenas os blocos que as instruções do diretor exigem alterar. Se pedir menos repetição, tom mais profissional ou texto mais curto, REESCREVA por completo os blocos afetados (em especial sec-4-1-sintese) — nunca devolva o mesmo texto ou uma cópia quase idêntica.
3. Preserve números de S.E., OS, datas, horários, placas e nomes de clientes (DHL, Foxconn, Apple) exatamente como estão — salvo se o diretor pedir alteração explícita.
4. Em textos narrativos gerais, prefira "parceiro" ou "fornecedor" em vez de citar repetidamente o nome comercial do parceiro — salvo na tabela de identificação (bloco fornecedor-identificacao) onde o nome completo pode permanecer.
5. Tom construtivo e profissional para apresentação ao cliente; evite linguagem punitiva, acusatória ou que manche a imagem do parceiro — salvo se o ajuste for só exclusão pontual (aí não mude o tom do restante).
6. Mantenha HTML simples no campo html: <strong>, <em>, <br/> e, em linhas de tabela (ids row-*), as células <td>...</td> quando for reescrever (não excluir).
7. Não invente fatos novos; reescreva com base no conteúdo existente e nas instruções.
8. Não altere blocos de e-mails (ids que começam com email-).
9. Elimine repetições e trechos duplicados dentro de cada bloco reescrito; um único parágrafo coeso por bloco narrativo.
10. Ids de linha do plano de ação usam o padrão row-ac-01, row-ap-03, row-c4 etc. Use-os para exclusão/edição de linhas inteiras.

BLOCOS ATUAIS (JSON):
${JSON.stringify(payload, null, 2)}`;
}

export function parseGeminiAdjustmentJson(raw: string): Record<string, string> {
  const trimmed = String(raw || '').trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('A IA não retornou JSON válido para o ajuste.');
  }

  let parsed: { patches?: Array<{ id?: string; html?: string }> };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { patches?: Array<{ id?: string; html?: string }> };
  } catch {
    throw new Error('Resposta da IA em formato inválido.');
  }

  const out: Record<string, string> = {};
  for (const patch of parsed.patches || []) {
    const id = String(patch.id || '').trim();
    if (!id || patch.html == null) continue;
    // html vazio é válido = exclusão do bloco/linha
    out[id] = String(patch.html).trim();
  }

  if (!Object.keys(out).length) {
    throw new Error('A IA não sugeriu alterações. Tente reformular a observação.');
  }

  return out;
}

/** Contexto factual + e-mail do cliente usado pela IA para gerar o relatório. */
export type DhlReportAiContext = {
  /** Bloco de texto com os dados reais/imutáveis da missão (do sistema). */
  factsBlock: string;
  /** Texto extraído do anexo de e-mail do cliente (contexto do problema). */
  emailText: string;
  /** Link de referência do e-mail, se houver. */
  emailLink: string;
  /** Observações adicionais digitadas pela diretoria, se houver. */
  userSummary: string;
};

export function buildDhlReportGenerationPrompt(
  blocks: DhlEditableBlock[],
  context: DhlReportAiContext,
): string {
  return `Você é analista sênior de operações e gerenciamento de risco da TM SEG e vai redigir o conteúdo de um Plano de Ação e Justificativa de Ocorrência para a DHL Supply Chain (operação Foxconn/Apple).

Sua tarefa: com base em (1) DADOS DO SISTEMA (fatos reais e imutáveis da missão), (2) CONTEXTO DO E-MAIL do cliente (o problema apontado) e (3) OBSERVAÇÕES DA DIRETORIA, escrever o conteúdo de cada bloco editável do relatório — explicando o que aconteceu, a causa e o plano de ação — de forma completa, coesa e profissional.

REGRAS OBRIGATÓRIAS:
1. Responda APENAS com JSON válido, sem markdown: {"patches":[{"id":"...","html":"..."}]}
2. Retorne um patch para CADA bloco fornecido (todos os ids recebidos), com o texto final adequado ao papel do bloco.
3. NÃO copie e cole o e-mail. Use-o apenas como fonte para entender o ocorrido e sintetizar. NÃO inclua cabeçalhos de e-mail (De/Para/Cc/Data), assinaturas nem trechos literais.
4. NÃO invente fatos: use somente o que está nos DADOS DO SISTEMA e no CONTEXTO DO E-MAIL. Preserve exatamente números de S.E., OS, datas, horários, placas e nomes de clientes (DHL, Foxconn, Apple).
5. Em textos narrativos, prefira "parceiro" ou "fornecedor" em vez de citar o nome comercial do parceiro. Tom construtivo e profissional, sem linguagem punitiva ou acusatória que manche a imagem do parceiro.
6. Mantenha HTML simples no campo html: <strong>, <em>, <br/> quando necessário. Respeite o formato de cada bloco: respostas de célula de tabela devem ser curtas e diretas; blocos de síntese/causa podem ser um parágrafo.
7. Escreva em português do Brasil. Se faltar informação para algum bloco, produza um texto coerente e neutro com base no que existe, sem inventar dados factuais.

DADOS DO SISTEMA (fatos reais):
${context.factsBlock}

CONTEXTO DO E-MAIL DO CLIENTE (não copiar; apenas sintetizar):
${context.emailText.trim() || '(sem anexo de e-mail)'}
${context.emailLink.trim() ? `Referência de e-mail: ${context.emailLink.trim()}` : ''}

OBSERVAÇÕES DA DIRETORIA:
${context.userSummary.trim() || '(sem observações adicionais)'}

BLOCOS A PREENCHER (JSON com id e conteúdo atual como referência de formato):
${JSON.stringify(blocks.map((b) => ({ id: b.id, html_atual: b.html })), null, 2)}`;
}

/**
 * Gera o conteúdo narrativo do relatório via IA a partir do contexto (dados do
 * sistema + e-mail do cliente) e aplica nos blocos data-dhl-editable, mantendo
 * o layout/estrutura do template. Os dados factuais duros (tabelas, fotos,
 * marcos) não são tocados — só os blocos editáveis.
 */
export async function generateDhlReportHtmlWithAi(
  html: string,
  context: DhlReportAiContext,
  generateText: (prompt: string) => Promise<string>,
): Promise<string> {
  const blocks = extractEditableBlocks(html);
  if (!blocks.length) return html;
  const prompt = buildDhlReportGenerationPrompt(blocks, context);
  const response = await generateText(prompt);
  const patches = parseGeminiAdjustmentJson(response);
  return applyEditablePatches(html, patches);
}

export async function adjustDhlReportHtmlWithAi(
  html: string,
  adjustmentNotes: string,
  generateText: (prompt: string) => Promise<string>,
): Promise<string> {
  const notes = adjustmentNotes.trim();
  if (!notes) {
    throw new Error('Descreva o que deseja ajustar no relatório.');
  }

  const blocks = extractEditableBlocks(html, { includeAdjustOnly: true });
  if (!blocks.length) {
    throw new Error('Nenhum trecho editável encontrado no relatório.');
  }

  const prompt = buildGeminiAdjustmentPrompt(blocks, notes);
  const response = await generateText(prompt);
  const patches = parseGeminiAdjustmentJson(response);
  return applyEditablePatches(html, patches);
}
