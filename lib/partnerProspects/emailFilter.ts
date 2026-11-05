const GENERICO = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'yahoo.com.br',
  'uol.com.br',
  'bol.com.br',
  'ig.com.br',
  'terra.com.br',
  'icloud.com',
  'proton.me',
  'protonmail.com',
]);

const CONTABIL_HINT = /contab|contador|escritorio|fiscal|dp\.|rh@/i;

/**
 * Prefere e-mail do domínio do site. Descarta genéricos de webmail
 * quando existir alternativa corporativa; e-mail de contabilidade perde
 * para domínio próprio.
 */
export function escolherEmailPreferencial(
  candidatos: Array<string | null | undefined>,
  website?: string | null,
): string | null {
  const limpos = [...new Set(
    candidatos
      .map((e) => String(e || '').trim().toLowerCase())
      .filter((e) => e.includes('@') && e.includes('.')),
  )];
  if (!limpos.length) return null;

  const dominioSite = dominioDoWebsite(website);
  if (dominioSite) {
    const doDominio = limpos.find((e) => e.endsWith(`@${dominioSite}`));
    if (doDominio) return doDominio;
  }

  const semContabil = limpos.filter((e) => !CONTABIL_HINT.test(e));
  const base = semContabil.length ? semContabil : limpos;

  const corporativo = base.find((e) => {
    const dom = e.split('@')[1] || '';
    return !GENERICO.has(dom);
  });
  return corporativo || base[0] || null;
}

function dominioDoWebsite(website?: string | null): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}
