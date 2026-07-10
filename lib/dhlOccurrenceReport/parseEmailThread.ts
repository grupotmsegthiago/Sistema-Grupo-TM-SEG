export type EmailThreadMessage = {
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  body: string;
};

const MIME_NOISE =
  /^(ARC-|Received:|Authentication-Results:|Return-Path:|Delivered-To:|X-MS-|Content-Type:|Content-Transfer-Encoding:|MIME-Version:|Message-ID:|DKIM-Signature:|List-|boundary=|Content-Disposition:)/i;

const DATE_LINE_RE =
  /^(seg|ter|qua|qui|sex|s[aá]b|dom)\.?,?\s+\d{1,2}\s+de\s+[a-zçãõáéíóú]+\.?\s+de\s+\d{4}(?:,\s*\d{1,2}:\d{2})?/i;

const DATE_PT_RE =
  /^(enviada? em|enviado|data)\s*:\s*(.+)$/i;

const SUBJECT_RE = /^(RES|RE|Fwd|Assunto):\s*.+/i;

const PAGE_MARKER_RE = /^\d+\s*\/\s*\d+\s*$|^--\s*\d+\s+of\s+\d+\s*--\s*$/i;

const SIGNATURE_NOISE_RE =
  /^(Estrada dos Alpes|CEP:|Phone:|E-mail:|www\.|GOGREEN|DHL Supply Chain - Excellence|Gerenciamento de Risco|Transportation Security|Monitoring Operator|Atenciosamente,?)$/i;

const HTML_BLOCK_RE = /<html[\s\S]*$/i;
const MIME_BOUNDARY_RE = /^--[A-Za-z0-9_=.-]+$/m;

/** Decodifica quoted-printable (=E7=, quebras suaves =\n). */
export function decodeQuotedPrintable(input: string): string {
  const softBreaks = String(input || '').replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < softBreaks.length; i += 1) {
    if (softBreaks[i] === '=' && /^[0-9A-Fa-f]{2}/.test(softBreaks.slice(i + 1, i + 3))) {
      bytes.push(parseInt(softBreaks.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push(softBreaks.charCodeAt(i));
  }
  const buf = Buffer.from(bytes);
  const asUtf8 = buf.toString('utf8');
  if (!asUtf8.includes('\uFFFD')) return asUtf8;
  return buf.toString('latin1');
}

function maybeDecodeQuotedPrintable(input: string): string {
  const s = String(input || '');
  if (!/=(?:[0-9A-Fa-f]{2}|\r?\n)/.test(s)) return s;
  return decodeQuotedPrintable(s);
}

/** Decodifica cabeçalhos MIME (=?utf-8?Q?...?=). */
export function decodeMimeWords(input: string): string {
  return String(input || '').replace(
    /=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g,
    (match, _charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          return Buffer.from(text, 'base64').toString('utf8');
        }
        return decodeQuotedPrintable(text.replace(/_/g, ' '));
      } catch {
        return match;
      }
    },
  );
}

function stripHtml(raw: string): string {
  return String(raw || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

function extractPlainFromMime(body: string): string {
  const normalized = String(body || '').replace(/\r\n/g, '\n');

  const plainMatch = normalized.match(
    /Content-Type:\s*text\/plain[^\n]*\n(?:Content-Transfer-Encoding:[^\n]*\n)?(?:[^\n]*\n)*?\n([\s\S]*?)(?=\n--[^\n]+|\nContent-Type:|$)/i,
  );
  if (plainMatch) {
    const chunk = plainMatch[1];
    const isQp = /Content-Transfer-Encoding:\s*quoted-printable/i.test(plainMatch[0]);
    return isQp ? decodeQuotedPrintable(chunk) : chunk;
  }

  const htmlMatch = normalized.match(
    /Content-Type:\s*text\/html[^\n]*\n(?:Content-Transfer-Encoding:[^\n]*\n)?(?:[^\n]*\n)*?\n([\s\S]*?)(?=\n--[^\n]+|\nContent-Type:|$)/i,
  );
  if (htmlMatch) {
    const chunk = htmlMatch[1];
    const isQp = /Content-Transfer-Encoding:\s*quoted-printable/i.test(htmlMatch[0]);
    const decoded = isQp ? decodeQuotedPrintable(chunk) : chunk;
    return stripHtml(decoded);
  }

  return normalized;
}

function sanitizeEmailBody(raw: string): string {
  let body = maybeDecodeQuotedPrintable(String(raw || ''));
  body = decodeMimeWords(body);

  if (HTML_BLOCK_RE.test(body) || /<html/i.test(body)) {
    const plain = extractPlainFromMime(body);
    body = plain || stripHtml(body);
  }

  body = body
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (MIME_NOISE.test(t)) return false;
      if (MIME_BOUNDARY_RE.test(t)) return false;
      if (/^--_[0-9A-Za-z_]+/.test(t)) return false;
      if (/^\[cid:/i.test(t)) return false;
      if (/^<meta /i.test(t)) return false;
      if (/^@font-face/i.test(t)) return false;
      if (/^\/\* Font Definitions \*\//i.test(t)) return false;
      if (/^\.MsoNormal/i.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(HTML_BLOCK_RE, '')
    .replace(/\[cid:[^\]]+\]/gi, '')
    .replace(/_{5,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return body;
}

function cleanBody(raw: string): string {
  return sanitizeEmailBody(raw);
}

function pickField(block: string, label: string): string {
  const re = new RegExp(`^${label}\\s*:\\s*(.*)$`, 'im');
  const match = block.match(re);
  return match ? decodeMimeWords(match[1].trim()) : '';
}

function pickFoldedField(block: string, label: string): string {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  const labelRe = new RegExp(`^${label}\\s*:\\s*(.*)$`, 'i');
  const parts: string[] = [];
  let capturing = false;

  for (const line of lines) {
    if (labelRe.test(line)) {
      const m = line.match(labelRe);
      parts.push(m?.[1]?.trim() || '');
      capturing = true;
      continue;
    }
    if (capturing) {
      if (/^\s+/.test(line)) {
        parts.push(line.trim());
        continue;
      }
      break;
    }
  }

  return decodeMimeWords(parts.join(' ').trim());
}

function extractDateFromBody(body: string): string {
  for (const line of body.split('\n')) {
    const m = line.match(DATE_PT_RE);
    if (m) return m[2].trim();
    if (DATE_LINE_RE.test(line.trim())) return line.trim();
  }
  return '';
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

function parseOutlookMultilineBlock(block: string): EmailThreadMessage | null {
  const rawLines = block.replace(/\r\n/g, '\n').split('\n');
  let lines = stripOutlookHeaders(rawLines.map((l) => l.trim()));
  if (!lines.length) return null;

  let subject = '';
  if (SUBJECT_RE.test(lines[0])) {
    subject = decodeMimeWords(lines.shift()!.replace(/^Assunto:\s*/i, ''));
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
      let date = pickField(block, 'Data');
      let subject = pickField(block, 'Assunto');
      if (!subject) {
        const subjectMatch = block.match(/^(RES|RE|Fwd):\s*.+/im);
        if (subjectMatch) subject = decodeMimeWords(subjectMatch[0].trim());
      }

      let body = block
        .replace(/^Assunto:\s*.+\n/im, '')
        .replace(/^De:\s*.+\n/im, '')
        .replace(/^Para:\s*.+\n/im, '')
        .replace(/^Cc:\s*.+\n/im, '')
        .replace(/^Data:\s*.+\n/im, '')
        .replace(/^\d+\s*\/\s*\d+\s*$/gm, '')
        .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gim, '')
        .trim();

      if (!date || date === '—') {
        date = extractDateFromBody(body) || '—';
        body = body
          .split('\n')
          .filter((l) => !DATE_PT_RE.test(l.trim()))
          .join('\n');
      }

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

function splitEmlParts(text: string): string[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  const byFrom = normalized.split(/(?=^From:\s)/m).filter((p) => p.trim());
  if (byFrom.length > 1) return byFrom;

  const bySeparator = normalized.split(/\n_{3,}\n/).filter((p) => p.trim());
  if (bySeparator.length > 1) return bySeparator;

  return [normalized];
}

function parseSingleEmlPart(text: string): EmailThreadMessage | null {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;

  const headerEnd = normalized.search(/\n\n/);
  const headers = headerEnd >= 0 ? normalized.slice(0, headerEnd) : normalized;
  const bodyRaw = headerEnd >= 0 ? normalized.slice(headerEnd + 2) : '';

  const from = pickFoldedField(headers, 'From') || pickFoldedField(headers, 'De');
  const to = pickFoldedField(headers, 'To') || pickFoldedField(headers, 'Para');
  const cc = pickFoldedField(headers, 'Cc');
  let date =
    pickFoldedField(headers, 'Date')
    || pickFoldedField(headers, 'Data')
    || pickField(headers, 'Enviada em')
    || pickField(headers, 'Enviado');
  const subject = pickFoldedField(headers, 'Subject') || pickFoldedField(headers, 'Assunto');

  let body = extractPlainFromMime(bodyRaw);
  if (!body || body.length < 8) {
    body = bodyRaw;
  }
  body = cleanBody(body);

  if (!date || date === '—') {
    date = extractDateFromBody(body) || '—';
    if (date !== '—') {
      body = body
        .split('\n')
        .filter((l) => !DATE_PT_RE.test(l.trim()))
        .join('\n')
        .trim();
    }
  }

  if (!from && !to && !body) return null;

  return {
    from: from || '—',
    to: to || '—',
    cc: cc || '—',
    date: date || '—',
    subject: decodeMimeWords(subject || ''),
    body: body || '—',
  };
}

/** Parser de .eml — extrai cabeçalhos, decodifica MIME e separa thread. */
export function parseEmlContent(text: string): EmailThreadMessage[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  if (/^De:\s*$/im.test(normalized) || normalized.split(/^De:\s*$/im).length > 2) {
    return parseOutlookStyleThread(normalized);
  }

  const parts = splitEmlParts(normalized);
  const messages: EmailThreadMessage[] = [];
  for (const part of parts) {
    const msg = parseSingleEmlPart(part);
    if (msg) messages.push(msg);
  }

  if (messages.length) return messages;
  return parseOutlookStyleThread(normalized);
}

/** Normaliza entrada de e-mail (Outlook, .eml ou texto colado) para mensagens estruturadas. */
export function parseEmailThreadInput(text: string): EmailThreadMessage[] {
  const raw = String(text || '').trim();
  if (!raw) return [];

  if (/^Received:|^ARC-|^From:/im.test(raw) && !/^De:/im.test(raw)) {
    const eml = parseEmlContent(raw);
    if (eml.length) return eml;
    return parseOutlookStyleThread(raw);
  }

  const outlook = parseOutlookStyleThread(raw);
  if (outlook.length > 0) return outlook;

  return parseEmlContent(raw);
}
