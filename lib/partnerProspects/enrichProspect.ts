/**
 * Deep search / enriquecimento de prospecto (CNPJ, e-mails, endereço, Instagram, PF).
 * Usa multimotor + scrape leve do site + Gemini (quando configurado) + BrasilAPI.
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

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CNPJ_RE = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
const IG_RE = /(?:instagram\.com\/|@)([A-Za-z0-9._]{2,30})/gi;
const CEP_RE = /\b(\d{5}-?\d{3})\b/;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function uniqEmails(list: Array<string | null | undefined>, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const e = String(raw || '')
      .trim()
      .toLowerCase();
    if (!e || !e.includes('@') || seen.has(e)) continue;
    if (/example\.|sentry\.|wixpress|schema\.org|noreply|no-reply/i.test(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
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

function extrairDoHtml(html: string): {
  emails: string[];
  phones: string[];
  instagram: string | null;
  cnpjs: string[];
  cep: string | null;
} {
  const emails = uniqEmails(html.match(EMAIL_RE) || []);
  const phones: string[] = [];
  const telRe = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4,5}[-.\s]?\d{4}/g;
  let m: RegExpExecArray | null;
  while ((m = telRe.exec(html)) && phones.length < 3) {
    phones.push(m[0].replace(/\s+/g, ' ').trim());
  }
  let instagram: string | null = null;
  const ig = IG_RE.exec(html);
  if (ig) {
    const handle = ig[1].replace(/\/$/, '');
    if (!/share|p\/|reel|stories/i.test(handle)) {
      instagram = `https://instagram.com/${handle}`;
    }
  }
  const cnpjs: string[] = [];
  let cm: RegExpExecArray | null;
  const re = new RegExp(CNPJ_RE.source, 'g');
  while ((cm = re.exec(html)) && cnpjs.length < 3) {
    const d = digitosCnpj(cm[1]);
    if (cnpjValido14(d)) cnpjs.push(d);
  }
  const cepM = html.match(CEP_RE);
  return {
    emails,
    phones,
    instagram,
    cnpjs,
    cep: cepM ? cepM[1].replace(/\D/g, '') : null,
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
    const emails = uniqEmails([
      ...(Array.isArray(j.emails) ? j.emails : []),
      j.email,
    ]);
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
        const raw = String(j.address_cep || j.cep || '').replace(/\D/g, '').slice(0, 8);
        return raw.length >= 8 ? raw : null;
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
${hitsText.slice(0, 6000)}

Trecho do site:
${siteText.slice(0, 4000)}

NÃO invente CNPJ, e-mail ou telefone. Se não achar, use null.
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
  const nome = input.company_name;
  const cidade = input.city || '';
  const uf = input.state_uf || '';

  const queries = [
    `"${nome}" CNPJ ${uf}`,
    `"${nome}" escolta armada contato email ${cidade}`,
    `"${nome}" Polícia Federal alvará OR portaria DREX`,
    input.website ? `site:${input.website.replace(/^https?:\/\//, '')} contato` : `"${nome}" Instagram segurança`,
  ];

  let hitsText = '';
  try {
    const { hits } = await buscarMultimotor(queries, { maxQueries: 2 });
    hitsText = hits
      .slice(0, 12)
      .map((h) => `${h.title}\n${h.url}\n${h.snippet}`)
      .join('\n\n');
  } catch {
    notesExtra.push('busca_enrich_falhou');
  }

  let siteHtml = '';
  const website = input.website || null;
  if (website) {
    const base = website.replace(/\/$/, '');
    for (const path of ['', '/contato', '/contact', '/quem-somos', '/sobre']) {
      siteHtml += `\n${await fetchText(`${base}${path}`)}`;
      if (siteHtml.length > 80_000) break;
    }
  }

  const scraped = extrairDoHtml(`${hitsText}\n${siteHtml}`);
  const fromGemini = await geminiEnrich(nome, { cidade, uf, website }, hitsText, siteHtml);

  let cnpj = input.cnpj && cnpjValido14(input.cnpj) ? digitosCnpj(input.cnpj) : null;
  if (!cnpj && fromGemini.cnpj) cnpj = fromGemini.cnpj;
  if (!cnpj && scraped.cnpjs[0]) cnpj = scraped.cnpjs[0];

  let cnpjVerified = false;
  let razao = nome;
  let fantasia = input.trade_name || fromGemini.trade_name || null;
  let city = fromGemini.city || input.city || null;
  let state_uf = fromGemini.state_uf || input.state_uf || null;
  let phone = fromGemini.phone || input.phone || scraped.phones[0] || null;
  let address_street = fromGemini.address_street || null;
  let address_number = fromGemini.address_number || null;
  let address_district = fromGemini.address_district || null;
  let address_cep = fromGemini.address_cep || scraped.cep || null;
  let address_full = fromGemini.address_full || null;

  if (cnpj) {
    const v = await validarCnpjBrasilApi(cnpj);
    if (v.ok) {
      cnpjVerified = true;
      cnpj = v.cnpj;
      razao = v.razaoSocial || razao;
      fantasia = v.nomeFantasia || fantasia;
      city = v.cidade || city;
      state_uf = v.uf || state_uf;
      phone = phone || v.telefoneApi || null;
      notesExtra.push('BrasilAPI: ok');
      if (!fromGemini.email && v.emailApi) {
        fromGemini.email = v.emailApi;
      }
    } else {
      notesExtra.push(`BrasilAPI: ${v.motivo}`);
    }
  }

  const emails = uniqEmails([
    ...(input.emails || []),
    input.email,
    ...(fromGemini.emails || []),
    fromGemini.email,
    ...scraped.emails,
  ]);
  const email =
    escolherEmailPreferencial(emails, website || fromGemini.website || null) || emails[0] || null;

  const instagram = fromGemini.instagram || input.instagram || scraped.instagram || null;
  const siteFinal = fromGemini.website || website || null;

  if (!address_full && (address_street || address_district || address_cep)) {
    address_full = [address_street, address_number, address_district, city, state_uf, address_cep]
      .filter(Boolean)
      .join(', ');
  }

  const pfAuth = fromGemini.pf_authorization_number || null;
  const pf_status: EnrichmentResult['pf_status'] = pfAuth ? 'regular' : 'nao_verificado';

  const hasCore = !!(cnpj || emails.length || phone || siteFinal);
  const complete = !!(cnpj && emails.length && (phone || siteFinal) && (address_full || city));

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

export { uniqEmails, extrairDoHtml, parseGeminiEnrichJson };
