/**
 * Busca aberta multimotor (HTML público) — DuckDuckGo, Bing e Yahoo.
 * Sem API key. Rate-limit amigável. Resultados alimentam a extração.
 */

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  engine: 'duckduckgo' | 'bing' | 'yahoo';
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const MOTOR_HOST =
  /(?:^|\.)(?:duckduckgo|bing|yahoo|google|msn|live|yimg|search\.yahoo)\./i;

const LIXO_TITULO =
  /^(as melhores|lista de|melhores \d|top \d|empresas? de escolta armada$|escolta armada$|escolta armada de cargas|guia de|como escolher|o que [eé]|pre[cç]o de|vigil[aâ]ncia$|definição|conceito)/i;

const LIXO_HOST =
  /(?:wikipedia\.|dicio\.|conceito\.de|reclameaqui|facebook\.|instagram\.|linkedin\.|youtube\.|gov\.br$|jus\.br$|blogspot\.|wordpress\.|wixsite\.|play\.google)/i;

export function decodeHtml(s: string): string {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return '';
      }
    })
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&Ccedil;/g, 'Ç')
    .replace(/&aacute;/gi, 'á')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&otilde;/gi, 'õ')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&acirc;/gi, 'â')
    .replace(/&mdash;|&ndash;/gi, '—')
    .replace(/&cent;/gi, '¢')
    .replace(/&sect;/gi, '§')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Desembrulha redirects Bing / DuckDuckGo / Yahoo para a URL real. */
export function desembrulharUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const abs = s.startsWith('//') ? `https:${s}` : s;
    const u = new URL(abs);

    // DuckDuckGo: /l/?uddg=https%3A%2F%2F...
    const uddg = u.searchParams.get('uddg');
    if (uddg) {
      try {
        return decodeURIComponent(uddg);
      } catch {
        return uddg;
      }
    }

    // Bing: /ck/a?...&u=a1aHR0cHM6Ly...
    const bingU = u.searchParams.get('u');
    if (bingU && /bing\.|msn\./i.test(u.hostname)) {
      const payload = bingU.replace(/^a1/i, '');
      try {
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        if (/^https?:\/\//i.test(decoded)) return decoded;
      } catch {
        /* ignore */
      }
    }

    // Yahoo: RU=https%3A%2F%2F...
    const ru = u.searchParams.get('RU') || u.searchParams.get('u');
    if (ru && /yahoo\./i.test(u.hostname)) {
      try {
        const d = decodeURIComponent(ru);
        if (/^https?:\/\//i.test(d)) return d;
      } catch {
        /* ignore */
      }
    }

    return u.toString();
  } catch {
    return s;
  }
}

export function siteDeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const real = desembrulharUrl(raw);
    const u = new URL(real);
    if (MOTOR_HOST.test(u.hostname)) return null;
    if (LIXO_HOST.test(u.hostname)) return null;
    if (!/^https?:$/i.test(u.protocol)) return null;
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}

/** Limpa título de resultado (remove “ - Site”, URLs embutidas, etc.). */
export function limparNomeEmpresa(title: string): {
  name: string;
  websiteFromTitle: string | null;
} {
  let t = decodeHtml(title);
  let websiteFromTitle: string | null = null;

  const httpsInTitle = t.match(/https?:\/\/[^\s›>]+/i);
  if (httpsInTitle) {
    websiteFromTitle = siteDeUrl(httpsInTitle[0]);
    t = t.replace(/https?:\/\/[^\s›>]+/gi, ' ');
  }

  // "GRUPOMAP.COM.BR › ESCOLTA" / "site.com.br HTTPS://..."
  const dom = t.match(/\b([a-z0-9][-a-z0-9]*\.(?:com\.br|com|net\.br|net|org\.br|org))\b/i);
  if (dom && !websiteFromTitle) {
    websiteFromTitle = `https://${dom[1].toLowerCase()}`;
  }

  // Remove domínio colado no início: "VORTEXSEGURANCA.COM.BR VORTEX SEGURANÇA"
  t = t.replace(/^[A-Z0-9][-A-Z0-9]*\.(?:COM\.BR|COM|NET\.BR|NET|ORG\.BR|ORG|SEG\.BR)\s+/i, '');

  t = t
    .replace(/\s*[|–—•·›»].*$/, '')
    .replace(/\s*[-–]\s*(segurança|seguranca|escolta|home|in[ií]cio|contato|o que [eé]|conceito|defini[cç][aã]o).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Instagram / redes
  t = t.replace(/\(@[^)]+\)\s*[•·].*$/i, '').replace(/\s*[•·]\s*instagram.*$/i, '').trim();

  if (t.length > 90) t = t.slice(0, 90).trim();
  return { name: t, websiteFromTitle };
}

function uniqHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const key = (siteDeUrl(h.url) || h.url || h.title).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...h,
      title: decodeHtml(h.title),
      snippet: decodeHtml(h.snippet),
      url: desembrulharUrl(h.url) || h.url,
    });
  }
  return out;
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

function parseDuckDuckGo(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 12) {
    hits.push({
      title: decodeHtml(m[2]),
      url: decodeHtml(m[1]),
      snippet: decodeHtml(m[3] || ''),
      engine: 'duckduckgo',
    });
  }
  return hits;
}

function parseBing(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re =
    /<li class="b_algo"[\s\S]*?<h2>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p>|class="b_caption")[^>]*>([\s\S]*?)(?:<\/p>|<\/div>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 12) {
    hits.push({
      title: decodeHtml(m[2]),
      url: decodeHtml(m[1]),
      snippet: decodeHtml(m[3] || ''),
      engine: 'bing',
    });
  }
  return hits;
}

function parseYahoo(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re =
    /<div class="[^"]*algo[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*compText[^"]*"[^>]*>([\s\S]*?)<\/p>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 10) {
    const url = decodeHtml(m[1]);
    if (!url.startsWith('http') && !url.startsWith('//')) continue;
    hits.push({
      title: decodeHtml(m[2]),
      url,
      snippet: decodeHtml(m[3] || ''),
      engine: 'yahoo',
    });
  }
  return hits;
}

export function montarQueriesMultimotor(cidade: string, uf: string, estado?: string): string[] {
  const onde = estado ? `${cidade} ${estado}` : `${cidade} ${uf}`;
  return [
    `empresas de escolta armada ${onde}`,
    `vigilância e escolta armada telefone contato ${onde}`,
    `transporte de valores escolta armada ${onde}`,
    `segurança privada escolta armada ${cidade} ${uf} site`,
  ];
}

/**
 * Dispara as queries nos 3 motores e devolve hits únicos.
 * Falha de um motor não derruba os outros.
 */
export async function buscarMultimotor(
  queries: string[],
  opts?: { maxQueries?: number },
): Promise<{ hits: SearchHit[]; enginesOk: string[]; enginesFail: string[] }> {
  const maxQ = opts?.maxQueries ?? 3;
  const enginesOk: string[] = [];
  const enginesFail: string[] = [];
  const all: SearchHit[] = [];

  for (const q of queries.slice(0, maxQ)) {
    const encoded = encodeURIComponent(q);
    const jobs: Array<Promise<void>> = [
      (async () => {
        const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encoded}`);
        if (!html) {
          enginesFail.push('duckduckgo');
          return;
        }
        const hits = parseDuckDuckGo(html);
        if (hits.length) enginesOk.push('duckduckgo');
        else enginesFail.push('duckduckgo');
        all.push(...hits);
      })(),
      (async () => {
        const html = await fetchText(`https://www.bing.com/search?q=${encoded}&setlang=pt-BR`);
        if (!html) {
          enginesFail.push('bing');
          return;
        }
        const hits = parseBing(html);
        if (hits.length) enginesOk.push('bing');
        else enginesFail.push('bing');
        all.push(...hits);
      })(),
      (async () => {
        const html = await fetchText(`https://search.yahoo.com/search?p=${encoded}&vl=lang_pt`);
        if (!html) {
          enginesFail.push('yahoo');
          return;
        }
        const hits = parseYahoo(html);
        if (hits.length) enginesOk.push('yahoo');
        else enginesFail.push('yahoo');
        all.push(...hits);
      })(),
    ];
    await Promise.all(jobs);
    await new Promise((r) => setTimeout(r, 400));
  }

  return {
    hits: uniqHits(all).slice(0, 30),
    enginesOk: [...new Set(enginesOk)],
    enginesFail: [...new Set(enginesFail)],
  };
}

/** Heurística sem IA: títulos de resultados viram candidatos com site quando possível. */
export function empresasHeuristicasDosHits(
  hits: SearchHit[],
  alvo: { cidade: string; uf: string },
): Array<{
  company_name: string;
  website: string | null;
  city: string;
  state_uf: string;
  notes: string;
  email: null;
  phone: null;
  cnpj: null;
}> {
  const out: Array<{
    company_name: string;
    website: string | null;
    city: string;
    state_uf: string;
    notes: string;
    email: null;
    phone: null;
    cnpj: null;
  }> = [];
  const seen = new Set<string>();

  for (const h of hits) {
    const { name, websiteFromTitle } = limparNomeEmpresa(h.title);
    if (name.length < 4 || name.length > 120) continue;
    if (LIXO_TITULO.test(name)) continue;
    if (/instagram|facebook|linkedin|reclame\s*aqui|wikipedia|youtube|dicion[aá]rio|prefeitura|sanit[aá]ria/i.test(name)) {
      continue;
    }
    if (
      /escolta|segurança|seguranca|vigil[aâ]ncia|valores|pronta resposta/i.test(name) === false &&
      /escolta|segurança|seguranca|vigil[aâ]ncia|valores/i.test(h.snippet) === false
    ) {
      continue;
    }

    const website = siteDeUrl(h.url) || (websiteFromTitle && !LIXO_HOST.test(websiteFromTitle) ? websiteFromTitle : null);
    // Regra do operador: precisa de telefone OU e-mail OU site.
    if (!website) continue;

    const key = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (key.length < 5 || seen.has(key)) continue;
    seen.add(key);

    out.push({
      company_name: name,
      website,
      city: alvo.cidade,
      state_uf: alvo.uf,
      notes: `Descoberto por busca web (${h.engine}). Pendente de CNPJ. ${decodeHtml(h.snippet).slice(0, 160)}`,
      email: null,
      phone: null,
      cnpj: null,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export { parseDuckDuckGo, parseBing };
