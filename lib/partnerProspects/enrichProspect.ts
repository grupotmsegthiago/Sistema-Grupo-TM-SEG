/**
 * Deep search / enriquecimento de prospecto (CNPJ, e-mails, endereço, Instagram, PF).
 * Prioriza scrape real do site (home + footer + /contato). Headers de browser evitam HTTP 406.
 */

import { digitosCnpj, cnpjValido14 } from './cnpj';
import { validarCnpjBrasilApi } from './brasilApiCnpj';
import { buscarMultimotor } from './multiEngineSearch';
import { escolherEmailPreferencial } from './emailFilter';
import { GEMINI_TEXT_MODEL } from '../geminiModels';

export type EnrichmentResult = {
  company_name?: string;
  trade_name?: string | null;
  cnpj?: string | null;
  cnpjVerified?: boolean;
  email?: string | null;
  emails: string[];
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_district?: string | null;
  address_cep?: string | null;
  address_full?: string | null;
  city?: string | null;
  state_uf?: string | null;
  pf_authorization_number?: string | null;
  pf_status?: 'regular' | 'pendente' | 'nao_verificado';
  notesExtra?: string[];
  enrichment_status: 'pending' | 'partial' | 'complete' | 'failed';
};

export type ScrapedSite = {
  emails: string[];
  phones: string[];
  instagram: string | null;
  cnpjs: string[];
  cep: string | null;
  address_full: string | null;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  city: string | null;
  state_uf: string | null;
  pagesOk: number;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
const CNPJ_RE = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
const IG_HREF_RE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})\/?/gi;
const CEP_RE = /\bCEP[:\s]*(\d{5}-?\d{3})\b/i;
const TEL_RE =
  /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)(?:9\s*)?\d{4,5}[-.\s]?\d{4}/g;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const IG_LIXO =
  /^(share|p|reel|stories|explore|accounts|direct|about|legal|context|media|static|login|intent)$/i;

const EMAIL_LIXO =
  /example\.|sentry\.|wixpress|schema\.org|noreply|no-reply|mastercdn|cloudflare|w3\.org|googleapis|gstatic|jquery|webpack|sentry-next|^footer-|cdn\.|wixmail/i;

export function uniqEmails(list: Array<string | null | undefined>, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const e = String(raw || '')
      .trim()
      .toLowerCase();
    if (!e || !e.includes('@') || seen.has(e)) continue;
    if (EMAIL_LIXO.test(e)) continue;
    if (e.length > 80) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

export function limparNomeDuplicado(nome: string): string {
  const n = String(nome || '').replace(/\s+/g, ' ').trim();
  if (!n) return n;
  const half = Math.floor(n.length / 2);
  const a = n.slice(0, half).trim();
  const b = n.slice(half).trim();
  if (a && a.toUpperCase() === b.toUpperCase()) return a;
  const parts = n.split(/\s+/);
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const mid = parts.length / 2;
    const left = parts.slice(0, mid).join(' ');
    const right = parts.slice(mid).join(' ');
    if (left.toUpperCase() === right.toUpperCase()) return left;
  }
  return n;
}

export async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const ct = String(res.headers.get('content-type') || '');
    if (ct && !/html|text|xml/i.test(ct)) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

function priorizarFooter(html: string): string {
  const footers = [...html.matchAll(/<footer[\s\S]*?<\/footer>/gi)].map((m) => m[0]);
  if (footers.length) return footers.join('\n') + '\n' + html;
  return html;
}

function normalizarTelefone(raw: string): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  let n = d;
  if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
  if (n.length < 10 || n.length > 11) return null;
  const ddd = n.slice(0, 2);
  const rest = n.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/** Extrai endereço BR típico de rodapé. */
export function extrairEnderecoBr(texto: string): {
  address_full: string | null;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  city: string | null;
  state_uf: string | null;
  cep: string | null;
} {
  const plain = String(texto || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cepM = plain.match(CEP_RE) || plain.match(/\b(\d{5}-\d{3})\b/);
  const cep = cepM ? cepM[1].replace(/\D/g, '') : null;

  // Cidade/UF (ex.: Curitiba/PR) — último casamento válido costuma ser a sede.
  const cidadeUfMatches = [...plain.matchAll(/\b([A-Za-zÀ-ú][A-Za-zÀ-ú\s]{1,40}?)\s*\/\s*([A-Z]{2})\b/g)];
  const lastCidadeUf = cidadeUfMatches[cidadeUfMatches.length - 1];
  const city = lastCidadeUf ? lastCidadeUf[1].trim().toUpperCase() : null;
  const state_uf = lastCidadeUf ? lastCidadeUf[2].toUpperCase() : null;

  // Rua/Av + número
  const ruaM = plain.match(
    /\b((?:Rua|Av\.?|Avenida|Rod\.?|Rodovia|Travessa|Alameda|Pra[cç]a)\s+[^,]{3,80}),?\s*(\d{1,6}[A-Za-z\-]*)?/i,
  );
  const address_street = ruaM ? ruaM[1].trim() : null;
  const address_number = ruaM && ruaM[2] ? ruaM[2].trim() : null;

  // Bairro entre número e cidade (ex.: "1653 - Vista Alegre - Curitiba/PR")
  let address_district: string | null = null;
  if (address_number && city && lastCidadeUf) {
    const between = plain.slice(
      plain.indexOf(address_number) + address_number.length,
      plain.indexOf(lastCidadeUf[0]),
    );
    const bairroM = between.match(/[-–]\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s]{1,40}?)\s*[-–]\s*$/);
    if (bairroM) address_district = bairroM[1].trim();
  }

  const address_full =
    address_street || city
      ? [address_street, address_number, address_district, city && state_uf ? `${city}/${state_uf}` : city, cep ? `CEP ${cep}` : null]
          .filter(Boolean)
          .join(' - ')
      : null;

  return { address_full, address_street, address_number, address_district, city, state_uf, cep };
}

export function extrairDoHtml(html: string): ScrapedSite {
  const prioritized = priorizarFooter(html);
  const mailto = [...prioritized.matchAll(MAILTO_RE)].map((x) => x[1]);
  const emails = uniqEmails([...(prioritized.match(EMAIL_RE) || []), ...mailto]);

  const phones: string[] = [];
  const seenTel = new Set<string>();
  let tm: RegExpExecArray | null;
  const telRe = new RegExp(TEL_RE.source, 'g');
  while ((tm = telRe.exec(prioritized)) && phones.length < 5) {
    const norm = normalizarTelefone(tm[0]);
    if (!norm) continue;
    const key = norm.replace(/\D/g, '');
    if (seenTel.has(key)) continue;
    seenTel.add(key);
    phones.push(norm);
  }

  let instagram: string | null = null;
  const igRe = new RegExp(IG_HREF_RE.source, 'gi');
  let ig: RegExpExecArray | null;
  while ((ig = igRe.exec(prioritized))) {
    const handle = ig[1].replace(/\/$/, '');
    if (IG_LIXO.test(handle)) continue;
    instagram = `https://instagram.com/${handle}`;
    break;
  }

  const cnpjs: string[] = [];
  let cm: RegExpExecArray | null;
  const cnpjRe = new RegExp(CNPJ_RE.source, 'g');
  while ((cm = cnpjRe.exec(prioritized)) && cnpjs.length < 3) {
    const d = digitosCnpj(cm[1]);
    if (cnpjValido14(d) && !cnpjs.includes(d)) cnpjs.push(d);
  }

  const end = extrairEnderecoBr(prioritized);
  return {
    emails,
    phones,
    instagram,
    cnpjs,
    cep: end.cep,
    address_full: end.address_full,
    address_street: end.address_street,
    address_number: end.address_number,
    address_district: end.address_district,
    city: end.city,
    state_uf: end.state_uf,
    pagesOk: 0,
  };
}

function parseGeminiEnrichJson(text: string): Partial<EnrichmentResult> {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] || raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    const j = JSON.parse(body.slice(start, end + 1));
    const emails = uniqEmails([...(Array.isArray(j.emails) ? j.emails : []), j.email]);
    return {
      company_name: j.company_name || j.razao_social || undefined,
      trade_name: j.trade_name || j.nome_fantasia || null,
      cnpj: j.cnpj && cnpjValido14(j.cnpj) ? digitosCnpj(j.cnpj) : null,
      email: emails[0] || null,
      emails,
      phone: j.phone || j.telefone || null,
      website: j.website || j.site || null,
      instagram: j.instagram || null,
      address_street: j.address_street || j.logradouro || null,
      address_number: j.address_number || j.numero || null,
      address_district: j.address_district || j.bairro || null,
      address_cep: (() => {
        const rawCep = String(j.address_cep || j.cep || '').replace(/\D/g, '').slice(0, 8);
        return rawCep.length >= 8 ? rawCep : null;
      })(),
      address_full: j.address_full || j.endereco || null,
      city: j.city || j.cidade || null,
      state_uf: j.state_uf || j.uf || null,
      pf_authorization_number: j.pf_authorization_number || j.alvara_pf || j.portaria_pf || null,
      pf_status: j.pf_authorization_number || j.alvara_pf || j.portaria_pf ? 'regular' : 'nao_verificado',
    };
  } catch {
    return {};
  }
}

async function geminiEnrich(
  nome: string,
  alvo: { cidade?: string | null; uf?: string | null; website?: string | null },
  hitsText: string,
  siteText: string,
): Promise<Partial<EnrichmentResult>> {
  try {
    const { isGeminiConfigured, generateGeminiContent } = await import('../../server/geminiClient');
    if (!isGeminiConfigured()) return {};
    const prompt = `Extraia dados REAIS da empresa de segurança/escolta "${nome}" (${alvo.cidade || ''}/${alvo.uf || ''}).
Site: ${alvo.website || 'desconhecido'}

Resultados de busca:
${hitsText.slice(0, 4000)}

HTML do site (rodapé/contato):
${siteText.slice(0, 8000)}

NÃO invente CNPJ, e-mail, telefone ou Instagram. Se não achar no texto, use null.
Responda APENAS JSON:
{"company_name":"","trade_name":null,"cnpj":null,"email":null,"emails":[],"phone":null,"website":null,"instagram":null,"address_street":null,"address_number":null,"address_district":null,"address_cep":null,"address_full":null,"city":null,"state_uf":null,"pf_authorization_number":null}`;
    const response = await Promise.race([
      generateGeminiContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('enrich_timeout')), 35_000)),
    ]);
    return parseGeminiEnrichJson(String((response as any)?.text || ''));
  } catch {
    return {};
  }
}

/** Classifica se o candidato é empresa privada de escolta/vigilância (Gemini). */
export async function classificarEmpresaComGemini(input: {
  company_name: string;
  website?: string | null;
  snippet?: string | null;
  city?: string | null;
  uf?: string | null;
}): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const { isGeminiConfigured, generateGeminiContent } = await import('../../server/geminiClient');
    if (!isGeminiConfigured()) {
      return { ok: false, motivo: 'gemini_nao_configurado' };
    }
    const prompt = `Classifique se isto é EMPRESA PRIVADA brasileira de vigilância armada, escolta armada ou transporte de valores.
Nome: ${input.company_name}
Site: ${input.website || '-'}
Cidade/UF: ${input.city || ''}/${input.uf || ''}
Trecho: ${input.snippet || '-'}

DESCARTAR: dicionário, wikipedia, prefeitura, vigilância sanitária, blog, notícia, lista genérica, órgão público.
Responda só JSON: {"empresa_escolta":true|false,"motivo":"..."}`;
    const response = await Promise.race([
      generateGeminiContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: { temperature: 0, maxOutputTokens: 256 },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('class_timeout')), 20_000)),
    ]);
    const text = String((response as any)?.text || '');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, motivo: 'class_parse' };
    const j = JSON.parse(m[0]);
    return { ok: !!j.empresa_escolta, motivo: String(j.motivo || '') };
  } catch (e: any) {
    return { ok: false, motivo: e?.message || 'class_fail' };
  }
}

/** Baixa home + rotas de contato e extrai dados do HTML. */
export async function rasparSiteEmpresa(website: string): Promise<{ html: string; scraped: ScrapedSite }> {
  const base = website.replace(/\/$/, '');
  const paths = ['', '/contato', '/fale-conosco', '/contact', '/quem-somos', '/sobre'];
  let html = '';
  let pagesOk = 0;
  for (const path of paths) {
    const chunk = await fetchText(`${base}${path}`);
    if (chunk) {
      pagesOk++;
      html += `\n<!-- ${path || '/'} -->\n${chunk}`;
    }
    if (html.length > 120_000) break;
  }
  const scraped = extrairDoHtml(html);
  scraped.pagesOk = pagesOk;
  return { html, scraped };
}

export async function enriquecerProspecto(input: {
  company_name: string;
  trade_name?: string | null;
  cnpj?: string | null;
  email?: string | null;
  emails?: string[] | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  city?: string | null;
  state_uf?: string | null;
}): Promise<EnrichmentResult> {
  const notesExtra: string[] = [];
  const nome = limparNomeDuplicado(input.company_name);
  const cidade = input.city || '';
  const uf = input.state_uf || '';
  let website = input.website || null;
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  let siteHtml = '';
  let scraped: ScrapedSite = {
    emails: [],
    phones: [],
    instagram: null,
    cnpjs: [],
    cep: null,
    address_full: null,
    address_street: null,
    address_number: null,
    address_district: null,
    city: null,
    state_uf: null,
    pagesOk: 0,
  };

  if (website) {
    const r = await rasparSiteEmpresa(website);
    siteHtml = r.html;
    scraped = r.scraped;
    notesExtra.push(scraped.pagesOk ? `site_ok:${scraped.pagesOk}p` : 'site_fetch_vazio');
  }

  let hitsText = '';
  // Busca multimotor só se scrape não trouxe o essencial.
  if (!scraped.emails.length || !scraped.phones.length || !scraped.cnpjs.length) {
    try {
      const queries = [
        `"${nome}" CNPJ contato`,
        `"${nome}" ${cidade} ${uf} telefone email`,
        website ? `site:${website.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : `"${nome}" Instagram`,
      ];
      const { hits } = await buscarMultimotor(queries, { maxQueries: 2 });
      hitsText = hits
        .slice(0, 10)
        .map((h) => `${h.title}\n${h.url}\n${h.snippet}`)
        .join('\n\n');
      const fromHits = extrairDoHtml(hitsText);
      scraped.emails = uniqEmails([...scraped.emails, ...fromHits.emails]);
      if (!scraped.phones.length) scraped.phones = fromHits.phones;
      if (!scraped.instagram) scraped.instagram = fromHits.instagram;
      if (!scraped.cnpjs.length) scraped.cnpjs = fromHits.cnpjs;
    } catch {
      notesExtra.push('busca_enrich_falhou');
    }
  }

  const fromGemini = await geminiEnrich(nome, { cidade, uf, website }, hitsText, siteHtml);

  // Prioridade: scrape do site > Gemini > input.
  let cnpj = input.cnpj && cnpjValido14(input.cnpj) ? digitosCnpj(input.cnpj) : null;
  if (!cnpj && scraped.cnpjs[0]) cnpj = scraped.cnpjs[0];
  if (!cnpj && fromGemini.cnpj) cnpj = fromGemini.cnpj;

  let cnpjVerified = false;
  let razao = nome;
  let fantasia = input.trade_name || fromGemini.trade_name || null;
  // Sede do site (rodapé) vence a cidade do alvo do robô (ex.: Salvador quando a sede é Curitiba).
  let city = scraped.city || fromGemini.city || null;
  let state_uf = scraped.state_uf || fromGemini.state_uf || null;
  if (!city) city = input.city || null;
  if (!state_uf) state_uf = input.state_uf || null;
  const phonePreferido =
    scraped.phones.find((p) => /\(\d{2}\)/.test(p)) ||
    scraped.phones[0] ||
    null;
  let phone =
    phonePreferido ||
    (fromGemini.phone ? normalizarTelefone(fromGemini.phone) : null) ||
    (input.phone && /\(\d{2}\)/.test(input.phone) ? input.phone : null) ||
    null;
  let address_street = scraped.address_street || fromGemini.address_street || null;
  let address_number = scraped.address_number || fromGemini.address_number || null;
  let address_district = scraped.address_district || fromGemini.address_district || null;
  let address_cep = scraped.cep || fromGemini.address_cep || null;
  let address_full = scraped.address_full || fromGemini.address_full || null;

  if (cnpj) {
    const v = await validarCnpjBrasilApi(cnpj);
    if (v.ok) {
      cnpjVerified = true;
      cnpj = v.cnpj;
      razao = limparNomeDuplicado(v.razaoSocial || razao);
      fantasia = v.nomeFantasia || fantasia;
      // Sede oficial da Receita prevalece sobre cidade do alvo do robô.
      city = v.cidade || city;
      state_uf = v.uf || state_uf;
      phone = phone || (v.telefoneApi ? normalizarTelefone(v.telefoneApi) || v.telefoneApi : null);
      notesExtra.push('BrasilAPI: ok');
      if (v.emailApi) scraped.emails = uniqEmails([v.emailApi, ...scraped.emails]);
    } else {
      notesExtra.push(`BrasilAPI: ${v.motivo}`);
    }
  }

  const emails = uniqEmails([
    ...scraped.emails,
    ...(fromGemini.emails || []),
    fromGemini.email,
    ...(input.emails || []),
    input.email,
  ]);
  const email = escolherEmailPreferencial(emails, website || fromGemini.website || null) || emails[0] || null;

  let instagram = scraped.instagram || null;
  if (!instagram && fromGemini.instagram && !/instagram\.com\/(context|media)\b/i.test(fromGemini.instagram)) {
    instagram = fromGemini.instagram;
  }
  if (!instagram) instagram = input.instagram || null;

  const siteFinal = website || fromGemini.website || null;

  if (!address_full && (address_street || address_district || address_cep)) {
    address_full = [address_street, address_number, address_district, city, state_uf, address_cep]
      .filter(Boolean)
      .join(', ');
  }

  const pfAuth = fromGemini.pf_authorization_number || null;
  const pf_status: EnrichmentResult['pf_status'] = pfAuth ? 'regular' : 'nao_verificado';

  const hasCore = !!(cnpj || emails.length || phone || siteFinal);
  const complete = !!(
    (cnpj || emails.length >= 1) &&
    (phone || emails.length) &&
    (address_full || city) &&
    siteFinal
  );

  return {
    company_name: razao,
    trade_name: fantasia,
    cnpj,
    cnpjVerified,
    email,
    emails,
    phone,
    website: siteFinal,
    instagram,
    address_street,
    address_number,
    address_district,
    address_cep,
    address_full,
    city,
    state_uf,
    pf_authorization_number: pfAuth,
    pf_status,
    notesExtra,
    enrichment_status: complete ? 'complete' : hasCore ? 'partial' : 'failed',
  };
}

export { parseGeminiEnrichJson };
