/** URL pública canônica do sistema (links WhatsApp, e-mail, intake fornecedor). */
export const CANONICAL_PUBLIC_ORIGIN = 'https://sistema.grupotmseg.com.br';

/** Subdomínio legado sem registro DNS — normaliza para o domínio canônico. */
const LEGACY_BAD_HOST = 'app.grupotmseg.com.br';

function normalizeOrigin(url: string): string {
  const trimmed = String(url || '').trim().replace(/\/$/, '');
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (u.hostname === LEGACY_BAD_HOST) {
      u.hostname = 'sistema.grupotmseg.com.br';
    }
    return u.origin;
  } catch {
    return trimmed.replace(LEGACY_BAD_HOST, 'sistema.grupotmseg.com.br');
  }
}

/** Resolve a origem pública para links externos (prioridade: env → host da requisição → canônico). */
export function resolvePublicAppUrl(req?: { headers?: Record<string, unknown> } | null): string {
  const fromEnv = normalizeOrigin(
    String(process.env.APP_PUBLIC_URL || process.env.SYSTEM_URL || ''),
  );
  if (fromEnv) return fromEnv;

  const replitDomain = String(process.env.REPLIT_DOMAINS || '').split(',')[0].trim();
  if (replitDomain) return normalizeOrigin(`https://${replitDomain}`);

  const host = String(
    req?.headers?.['x-forwarded-host'] || req?.headers?.host || '',
  ).split(',')[0].trim();
  if (host && !host.includes('localhost')) {
    const proto = String(req?.headers?.['x-forwarded-proto'] || 'https');
    return normalizeOrigin(`${proto}://${host}`);
  }

  return CANONICAL_PUBLIC_ORIGIN;
}
