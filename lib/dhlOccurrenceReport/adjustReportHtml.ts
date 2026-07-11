/** Blocos narrativos editáveis via IA no Plano de Ação DHL. */
export type DhlEditableBlock = {
  id: string;
  html: string;
};

const EDITABLE_BLOCK_RE =
  /<([a-z][a-z0-9]*)[^>]*\sdata-dhl-editable="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;

/** Extrai trechos marcados com data-dhl-editable no HTML do relatório. */
export function extractEditableBlocks(html: string): DhlEditableBlock[] {
  const blocks: DhlEditableBlock[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(EDITABLE_BLOCK_RE.source, EDITABLE_BLOCK_RE.flags);
  while ((match = re.exec(html)) !== null) {
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    blocks.push({ id, html: match[3].trim() });
  }
  return blocks;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const contentStart = open.index + open[0].length;

    // Varre a partir do fim da tag de abertura contando aberturas/fechamentos
    // do MESMO tagName até zerar a profundidade (fechamento do bloco).
    const tagRe = new RegExp(`<(/?)${tagName}(\\s[^>]*?)?(/?)>`, 'gi');
    tagRe.lastIndex = contentStart;
    let depth = 1;
    let closeStart = -1;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(result)) !== null) {
      const isClosing = m[1] === '/';
      const isSelfClosing = m[3] === '/';
      if (isClosing) {
        depth -= 1;
        if (depth === 0) {
          closeStart = m.index;
          break;
        }
      } else if (!isSelfClosing) {
        depth += 1;
      }
    }
    if (closeStart === -1) continue;

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

O diretor leu o Plano de Ação gerado e pediu AJUSTES DE CONTEXTO/TOM — não é um parecer novo, é correção editorial do que já está escrito.

INSTRUÇÕES DO DIRETOR (prioridade máxima):
${adjustmentNotes.trim()}

REGRAS OBRIGATÓRIAS:
1. Responda APENAS com JSON válido, sem markdown: {"patches":[{"id":"...","html":"..."}]}
2. Inclua somente blocos que precisam mudar; omita blocos iguais ao original.
3. Preserve números de S.E., OS, datas, horários, placas e nomes de clientes (DHL, Foxconn, Apple) exatamente como estão.
4. Em textos narrativos gerais, prefira "parceiro" ou "fornecedor" em vez de citar repetidamente o nome comercial do parceiro — salvo na tabela de identificação (bloco fornecedor-identificacao) onde o nome completo pode permanecer.
5. Tom construtivo e profissional para apresentação ao cliente; evite linguagem punitiva, acusatória ou que manche a imagem do parceiro.
6. Mantenha HTML simples no campo html: <strong>, <em>, <br/> quando necessário.
7. Não invente fatos novos; reescreva com base no conteúdo existente e nas instruções.
8. Não altere blocos de e-mails (ids que começam com email-).

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
    const html = String(patch.html ?? '').trim();
    if (id && html) out[id] = html;
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

  const blocks = extractEditableBlocks(html);
  if (!blocks.length) {
    throw new Error('Nenhum trecho editável encontrado no relatório.');
  }

  const prompt = buildGeminiAdjustmentPrompt(blocks, notes);
  const response = await generateText(prompt);
  const patches = parseGeminiAdjustmentJson(response);
  return applyEditablePatches(html, patches);
}
