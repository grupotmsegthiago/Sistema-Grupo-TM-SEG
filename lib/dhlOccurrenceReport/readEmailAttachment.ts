import { parseEmailThreadInput } from './parseEmailThread.js';
import { extractTextFromPdfFile } from './extractPdfText.js';

const MAX_EMAIL_CHARS = 12000;

function decodeBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const attempts: Array<{ label: string; decode: () => string }> = [
    {
      label: 'utf-8',
      decode: () => new TextDecoder('utf-8', { fatal: false }).decode(bytes),
    },
    {
      label: 'latin1',
      decode: () => new TextDecoder('latin1').decode(bytes),
    },
    {
      label: 'windows-1252',
      decode: () => new TextDecoder('windows-1252').decode(bytes),
    },
  ];

  let best = '';
  for (const attempt of attempts) {
    try {
      const decoded = attempt.decode().replace(/\u0000/g, '').trim();
      if (decoded.length > best.length) best = decoded;
    } catch {
      /* tenta próximo encoding */
    }
  }
  return best;
}

function formatParsedMessages(raw: string): string {
  const messages = parseEmailThreadInput(raw);
  if (!messages.length) return raw.slice(0, MAX_EMAIL_CHARS);

  return messages
    .map((msg) => {
      const subject = msg.subject ? `Assunto: ${msg.subject}\n` : '';
      return `${subject}De: ${msg.from}\nPara: ${msg.to}\nCc: ${msg.cc}\nData: ${msg.date}\n\n${msg.body}`;
    })
    .join('\n\n---\n\n')
    .slice(0, MAX_EMAIL_CHARS);
}

/**
 * Lê anexo de e-mail no navegador (.eml, .txt, .html, .pdf).
 * .msg exige exportação manual — mensagem orientativa.
 */
export async function readEmailAttachmentFile(file: File): Promise<string> {
  const name = String(file.name || 'anexo').trim();
  const ext = (name.split('.').pop() || '').toLowerCase();
  const mime = String(file.type || '').toLowerCase();

  if (ext === 'msg' || mime.includes('ms-outlook') || mime.includes('application/vnd.ms-outlook')) {
    throw new Error(
      'Arquivo .msg não é lido automaticamente. No Outlook: Arquivo → Salvar como → escolha .eml (Unicode), .txt ou .pdf e anexe novamente.',
    );
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Arquivo grande demais (máx. 8 MB). Exporte só o corpo do e-mail ou cole o texto manualmente.');
  }

  if (ext === 'pdf' || mime === 'application/pdf') {
    const raw = await extractTextFromPdfFile(file);
    return formatParsedMessages(raw);
  }

  let raw = '';
  try {
    raw = await file.text();
  } catch {
    raw = decodeBuffer(await file.arrayBuffer());
  }

  if (!raw.trim()) {
    raw = decodeBuffer(await file.arrayBuffer());
  }

  if (!raw.trim()) {
    throw new Error(
      `Não foi possível decodificar "${name}". Use .eml ou .txt exportado do Outlook, ou cole o conteúdo manualmente.`,
    );
  }

  return formatParsedMessages(raw);
}
