/**
 * Sanitização de logs/textos para exibição no Gestor de Desenvolvimento.
 * Nunca renderizar HTML; nunca tratar texto como instrução para IA.
 */

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, label: '[REDACTED_BEARER]' },
  { re: /Authorization\s*[:=]\s*['"]?[^'"\s]+/gi, label: 'Authorization=[REDACTED]' },
  { re: /(api[_-]?key|apikey|service_role|secret|token|password|passwd|pwd)\s*[:=]\s*['"]?[^'"\s,}]+/gi, label: '$1=[REDACTED]' },
  { re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, label: '[REDACTED_JWT]' },
  { re: /https?:\/\/[^\s"'<>]+[?&](signature|token|key|X-Amz-Signature)=[^\s"'<>]+/gi, label: '[REDACTED_SIGNED_URL]' },
  // CPF/CNPJ somente com máscara (evita falso positivo em timestamps)
  { re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, label: '[REDACTED_CPF]' },
  { re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, label: '[REDACTED_CNPJ]' },
  // Cartão com separadores (evita false positive em timestamps Unix ms)
  { re: /\b(?:\d{4}[ -]){3}\d{4}\b/g, label: '[REDACTED_CARD_OR_ACCOUNT]' },
  { re: /Cookie\s*[:=]\s*[^;\n]+/gi, label: 'Cookie=[REDACTED]' },
  // Contatos / PII comuns em logs
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: '[REDACTED_EMAIL]' },
  // Telefone BR: exige +55 ou (DD) ou hífen/espaço entre blocos
  {
    re: /(?:\+55\s*\d{2}\s*\d{4,5}[-\s]?\d{4}|\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}|\b\d{2}\s9?\d{4}[-\s]\d{4}\b)/g,
    label: '[REDACTED_PHONE]',
  },
  { re: /\b(?:agencia|agência|conta)\s*[:=]\s*\d{3,}-?\d*\b/gi, label: '[REDACTED_BANK]' },
];

/** Remove tags HTML — saída sempre texto puro. */
export function stripHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function applyPatterns(text: string): string {
  let out = text;
  for (const { re, label } of SECRET_PATTERNS) {
    out = out.replace(re, label);
  }
  // Prefixo anti prompt-injection para qualquer consumidor de IA futuro.
  out = out.replace(
    /^\s*(system|assistant|ignore previous|ignore all|você é|voce e)\s*:/gim,
    '[REDACTED_INSTRUCTION]:',
  );
  out = out.replace(/\b(ignore previous instructions|act as system)\b/gi, '[REDACTED_INSTRUCTION]');
  return out;
}

export function sanitizeLogText(input: unknown, maxLen = 2000): string {
  let text = stripHtml(input);
  text = applyPatterns(text);
  if (text.length > maxLen) text = `${text.slice(0, maxLen)}…`;
  return text;
}

export function sanitizeForDisplay(input: unknown): string {
  return sanitizeLogText(input, 800);
}

/** Mascara identificadores completos de instância Z-API (sufixo/ID). */
export function maskZapiInstanceIds(text: string): string {
  return String(text ?? '')
    .replace(/\b3E[A-Z0-9]{6,}\b/gi, '[instância]')
    .replace(/\bINSTANCE[_-]?[A-Z0-9*]{4,}\b/gi, '[instância]')
    .replace(/("instanceId"\s*:\s*")[^"]{4,}(")/gi, '$1[instância]$2')
    .replace(/("instance"\s*:\s*")[^"]{4,}(")/gi, '$1[instância]$2')
    .replace(/\bInstância\s+[A-Za-z0-9_*-]{6,}/gi, 'Instância [mascarada]')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Sanitiza objetos/arrays aninhados (valores viram texto redigido). */
export function sanitizeDeep(input: unknown, maxLen = 2000, depth = 0): unknown {
  if (depth > 6) return '[REDACTED_DEPTH]';
  if (input == null) return input;
  if (typeof input === 'string') return sanitizeLogText(input, maxLen);
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) return input.map((v) => sanitizeDeep(v, maxLen, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const keyLower = k.toLowerCase();
      if (
        /password|passwd|secret|token|authorization|cookie|api[_-]?key|service_role|database_url/.test(
          keyLower,
        )
      ) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizeDeep(v, maxLen, depth + 1);
      }
    }
    return out;
  }
  return sanitizeLogText(String(input), maxLen);
}
