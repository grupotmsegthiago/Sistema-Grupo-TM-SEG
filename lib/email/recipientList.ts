const SIMPLE_EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Normaliza listas cadastradas com vírgula, ponto e vírgula ou quebra de linha. */
export function parseEmailRecipients(value: unknown): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const raw of String(value || '').split(/[,;\r\n]+/)) {
    const email = raw.trim().toLowerCase();
    if (!email || !SIMPLE_EMAIL_PATTERN.test(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push(email);
  }

  return recipients;
}

export function formatEmailRecipients(value: unknown): string {
  return parseEmailRecipients(value).join(', ');
}

export function normalizeSmtpAddress(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (value && typeof value === 'object' && 'address' in value) {
    return String((value as { address?: unknown }).address || '').trim().toLowerCase();
  }
  return '';
}

export function rejectedRequestedRecipients(
  requested: string[],
  accepted: unknown,
  rejected: unknown,
): string[] {
  const acceptedSet = new Set(
    (Array.isArray(accepted) ? accepted : []).map(normalizeSmtpAddress).filter(Boolean),
  );
  const rejectedSet = new Set(
    (Array.isArray(rejected) ? rejected : []).map(normalizeSmtpAddress).filter(Boolean),
  );

  return requested.filter((email) => rejectedSet.has(email) || !acceptedSet.has(email));
}
