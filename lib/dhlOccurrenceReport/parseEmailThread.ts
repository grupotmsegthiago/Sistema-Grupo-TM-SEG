export type EmailThreadMessage = {
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  body: string;
};

const MIME_NOISE =
  /^(ARC-|Received:|Authentication-Results:|Return-Path:|Delivered-To:|X-MS-|Content-Type:|Content-Transfer-Encoding:|MIME-Version:|Message-ID:|DKIM-Signature:|List-|boundary=)/i;

const DATE_LINE_RE =
  /^(seg|ter|qua|qui|sex|s[aá]b|dom)\.?,?\s+\d{1,2}\s+de\s+[a-zçãõáéíóú]+\.?\s+de\s+\d{4}(?:,\s*\d{1,2}:\d{2})?/i;

const SUBJECT_RE = /^(RES|RE|Fwd):\s*.+/i;

const PAGE_MARKER_RE = /^\d+\s*\/\s*\d+\s*$|^--\s*\d+\s+of\s+\d+\s*--\s*$/i;

const SIGNATURE_NOISE_RE =
  /^(Estrada dos Alpes|CEP:|Phone:|E-mail:|www\.|GOGREEN|DHL Supply Chain - Excellence|Gerenciamento de Risco|Transportation Security|Monitoring Operator|Atenciosamente,?)$/i;

function cleanBody(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !MIME_NOISE.test(line.trim()))
    .join('\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickField(block: string, label: string): string {
  const re = new RegExp(`^${label}\\s*:\\s*(.*)$`, 'im');
  const match = block.match(re);
  return match ? match[1].trim() : '';
}

function stripOutlookHeaders(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(De|Para|Cc|Data):$/i.test(trimmed)) continue;
    if (PAGE_MARKER_RE.test(trimmed)) continue;
    result.push(trimmed);
  }
  return result.filter(Boolean);
}

function isInlineOutlookFormat(block: string): boolean {
  return /^De:\s+\S/im.test(block) && !/^De:\s*$/im.test(block);
}

function isStandaloneEmailLine(line: string): boolean {
  const t = line.trim();
  if (!t.includes('@')) return false;
  if (t.includes('(') && t.includes(')')) return false;
  if (/,/.test(t) && t.split('@').length > 2) return false;
  return /^[\w.\-| ]+@[\w.-]+\.[a-z]{2,}$/i.test(t) || /^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i.test(t);
}

function splitMetadataLines(metaLines: string[]): { from: string; to: string; cc: string } {
  if (!metaLines.length) return { from: '—', to: '—', cc: '—' };

  let idx = 0;
  let from = metaLines[idx++] || '—';
  if (idx < metaLines.length && isStandaloneEmailLine(metaLines[idx])) {
    from = `${from}\n${metaLines[idx++]}`;
  }

  const to = metaLines[idx++] || '—';
  const cc = idx < metaLines.length ? metaLines.slice(idx).join(' ') : '—';
  return { from, to, cc };
}

/** Formato exportado do Outlook: cabeçalhos De/Para/Cc/Data em linhas separadas. */
function parseOutlookMultilineBlock(block: string): EmailThreadMessage | null {
  const rawLines = block.replace(/\r\n/g, '\n').split('\n');
  let lines = stripOutlookHeaders(rawLines.map((l) => l.trim()));
  if (!lines.length) return null;

  let subject = '';
  if (SUBJECT_RE.test(lines[0])) {
    subject = lines.shift()!;
  }

  const dateIdx = lines.findIndex((l) => DATE_LINE_RE.test(l));
  if (dateIdx < 0) return null;

  const date = lines[dateIdx];
  const metaLines = lines
    .slice(0, dateIdx)
    .filter((l) => !SIGNATURE_NOISE_RE.test(l) && !PAGE_MARKER_RE.test(l));

  const bodyLines = lines
    .slice(dateIdx + 1)
    .filter((l) => !SIGNATURE_NOISE_RE.test(l) && !PAGE_MARKER_RE.test(l));

  const { from, to, cc } = splitMetadataLines(metaLines);
  const body = cleanBody(bodyLines.join('\n')) || '—';

  if (!from && !to && body === '—') return null;

  return { from, to, cc, date, subject, body };
}

/** Divide texto no padrão exportado do Outlook (De:/Para:/Data:). */
export function parseOutlookStyleThread(text: string): EmailThreadMessage[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks = normalized.split(/(?=^De:\s*$|^De:\s)/im).filter((c) => c.trim());
  const messages: EmailThreadMessage[] = [];

  for (const chunk of chunks) {
    const block = chunk.trim();
    if (!/^De:/im.test(block)) continue;

    if (/^De:\s*$/im.test(block) || /^De:\s*\n\s*Para:\s*$/im.test(block)) {
      const parsed = parseOutlookMultilineBlock(block);
      if (parsed) {
        messages.push(parsed);
        continue;
      }
    }

    if (isInlineOutlookFormat(block)) {
      const from = pickField(block, 'De');
      const to = pickField(block, 'Para');
      const cc = pickField(block, 'Cc');
      const date = pickField(block, 'Data');

      let subject = '';
      const subjectMatch = block.match(/^RES:\s*.+|^RE:\s*.+|^Fwd:\s*.+/im);
      if (subjectMatch && !subjectMatch[0].startsWith('De:')) {
        subject = subjectMatch[0].trim();
      }

      let body = block
        .replace(/^De:\s*.+\n/im, '')
        .replace(/^Para:\s*.+\n/im, '')
        .replace(/^Cc:\s*.+\n/im, '')
        .replace(/^Data:\s*.+\n/im, '')
        .replace(/^\d+\s*\/\s*\d+\s*$/gm, '')
        .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gim, '')
        .trim();

      const cleaned = cleanBody(body);
      if (!from && !to && !cleaned) continue;

      messages.push({
        from: from || '—',
        to: to || '—',
        cc: cc || '—',
        date: date || '—',
        subject,
        body: cleaned || '—',
      });
      continue;
    }

    const parsed = parseOutlookMultilineBlock(block);
    if (parsed) messages.push(parsed);
  }

  return messages;
}

/** Parser simples de .eml — extrai cabeçalhos e corpo legível. */
export function parseEmlContent(text: string): EmailThreadMessage[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  if (/^De:\s*$/im.test(normalized) || normalized.split(/^De:\s*$/im).length > 2) {
    return parseOutlookStyleThread(normalized);
  }

  const headerEnd = normalized.search(/\n\n/);
  const headers = headerEnd >= 0 ? normalized.slice(0, headerEnd) : normalized;
  const bodyRaw = headerEnd >= 0 ? normalized.slice(headerEnd + 2) : '';

  const from = pickField(headers, 'From') || pickField(headers, 'De');
  const to = pickField(headers, 'To') || pickField(headers, 'Para');
  const cc = pickField(headers, 'Cc');
  const date = pickField(headers, 'Date') || pickField(headers, 'Data');
  const subject = pickField(headers, 'Subject') || pickField(headers, 'Assunto');

  const body = cleanBody(
    bodyRaw
      .replace(/^[A-Za-z0-9+/=\s]{60,}$/gm, '')
      .replace(/^--[^\n]+$/gm, '')
      .trim(),
  );

  if (!from && !to && !body) {
    return parseOutlookStyleThread(normalized);
  }

  return [
    {
      from: from || '—',
      to: to || '—',
      cc: cc || '—',
      date: date || '—',
      subject: subject || '—',
      body: body || '—',
    },
  ];
}

/** Normaliza entrada de e-mail (Outlook, .eml ou texto colado) para mensagens estruturadas. */
export function parseEmailThreadInput(text: string): EmailThreadMessage[] {
  const raw = String(text || '').trim();
  if (!raw) return [];

  if (/^Received:|^ARC-|^From:/im.test(raw) && !/^De:/im.test(raw)) {
    const outlookLike = parseOutlookStyleThread(raw);
    if (outlookLike.length) return outlookLike;
    return parseEmlContent(raw);
  }

  const outlook = parseOutlookStyleThread(raw);
  if (outlook.length > 0) return outlook;

  return parseEmlContent(raw);
}
