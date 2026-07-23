import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from './supabaseConfig';

const SANDBOX_URL = 'https://api.sandbox.plugnotas.com.br';
const PRODUCTION_URL = 'https://api.plugnotas.com.br';

export type PlugNotasEnv = 'sandbox' | 'production';

export function getPlugNotasEnv(): PlugNotasEnv {
  const env = (process.env.PLUGNOTAS_ENV || 'sandbox').toLowerCase();
  return env === 'production' ? 'production' : 'sandbox';
}

export function getPlugNotasBaseUrl(): string {
  return getPlugNotasEnv() === 'production' ? PRODUCTION_URL : SANDBOX_URL;
}

export function getPlugNotasToken(): string {
  const env = getPlugNotasEnv();
  if (env === 'production') {
    // PRODUÇÃO: NÃO faz fallback para token de sandbox — usar credencial errada
    // contra a Prefeitura emite NFs falsas/em ambiente errado e mascara
    // misconfigurações. Falha rápida com string vazia para que o caller
    // (plugFetch / isPlugNotasConfigured) reporte erro explícito.
    return process.env.PLUGNOTAS_API_TOKEN || '';
  }
  return process.env.PLUGNOTAS_API_TOKEN_SANDBOX || process.env.PLUGNOTAS_API_TOKEN || '';
}

export function isPlugNotasConfigured(): boolean {
  return !!getPlugNotasToken();
}

interface PlugNotasCompanyConfig {
  cnpj: string;
  name: string;
  aliases: string[];
  serviceDescription: string;
  issRate: number;
  municipalServiceCode: string;
  municipalServiceName: string;
  cnae?: string;
  cidadeIBGE: string;
  uf: string;
}

// Chaves normalizadas (sem acento, MAIÚSCULAS) — devem casar com o que o
// `nfProviderRouter.normalizeCompanyKey()` produz, para que a preferência salva
// pelo backend seja lida corretamente pelo frontend (que usa estas mesmas keys).
const PLUGNOTAS_COMPANIES: Record<string, PlugNotasCompanyConfig> = {
  'TM GESTAO': {
    cnpj: '60485843000157',
    name: 'TM GESTÃO',
    aliases: ['TM GESTAO', 'TM GESTÃO', 'GESTAO', 'GESTÃO'],
    serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
    issRate: 5,
    municipalServiceCode: '07930',
    municipalServiceName: '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
    cnae: '8011102',
    cidadeIBGE: '3550308',
    uf: 'SP',
  },
  'TM SEGURANCA': {
    cnpj: '28804378000167',
    name: 'Tm Seguranca Consultoria & Tecnologia Integrada Ltda',
    aliases: ['TM SEGURANÇA', 'TM SEGURANCA', 'TMSEGURANCA', 'TMSEGURANÇA', 'SEGURANÇA', 'SEGURANCA'],
    serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
    issRate: 5,
    municipalServiceCode: '07930',
    municipalServiceName: '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
    cnae: '8011102',
    cidadeIBGE: '3550308',
    uf: 'SP',
  },
  'TM SECURITY': {
    cnpj: '60508931000127',
    name: 'TM Security Gestão Corporativa Ltda',
    aliases: ['TM SECURITY', 'TMSECURITY', 'SECURITY', 'TM SECURITY GESTAO', 'TM SECURITY GESTÃO'],
    serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
    issRate: 5,
    municipalServiceCode: '07930',
    municipalServiceName: '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
    cnae: '8011102',
    cidadeIBGE: '3550308',
    uf: 'SP',
  },
};

function normalize(s?: string | null): string {
  return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function resolvePlugNotasCompany(company?: string | null): PlugNotasCompanyConfig {
  if (company) {
    const upper = normalize(company);
    for (const val of Object.values(PLUGNOTAS_COMPANIES)) {
      const aliases = val.aliases.map(normalize);
      if (aliases.some(a => upper.includes(a) || a.includes(upper))) return val;
      if (upper.includes(val.cnpj)) return val;
      if (normalize(val.name).includes(upper) || upper.includes(normalize(val.name))) return val;
    }
  }
  return PLUGNOTAS_COMPANIES['TM GESTAO'];
}

export function listPlugNotasCompanies(): { key: string; name: string; cnpj: string }[] {
  return Object.entries(PLUGNOTAS_COMPANIES).map(([key, val]) => ({ key, name: val.name, cnpj: val.cnpj }));
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-KEY': getPlugNotasToken(),
  };
}

async function plugFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = getPlugNotasToken();
  if (!token) throw new Error('PlugNotas não configurado — defina PLUGNOTAS_API_TOKEN_SANDBOX ou PLUGNOTAS_API_TOKEN.');
  const url = `${getPlugNotasBaseUrl()}${path}`;
  const resp = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!resp.ok) {
    const msg = extractPlugNotasError(data) || `HTTP ${resp.status}`;
    const err: any = new Error(`PlugNotas: ${msg}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function extractPlugNotasError(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  const parts: string[] = [];
  if (data.message) parts.push(String(data.message));
  if (data.error) parts.push(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  if (Array.isArray(data.erros)) {
    for (const e of data.erros) {
      if (typeof e === 'string') parts.push(e);
      else if (e?.mensagem) parts.push(`${e.codigo || ''} ${e.mensagem}`.trim());
      else if (e?.message) parts.push(e.message);
    }
  }
  if (Array.isArray(data.errors)) {
    for (const e of data.errors) {
      if (typeof e === 'string') parts.push(e);
      else if (e?.message) parts.push(e.message);
    }
  }
  if (data.protocoloPrefeitura?.mensagem) parts.push(String(data.protocoloPrefeitura.mensagem));
  return parts.join(' | ').substring(0, 500) || JSON.stringify(data).substring(0, 500);
}

interface ClientNfData {
  cnpj?: string;
  cpf?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    codigoCidade?: string;
    cidade?: string;
    estado?: string;
    cep?: string;
  };
  ie?: string;
}

async function lookupClientForNf(cnpj?: string | null, name?: string | null): Promise<ClientNfData | null> {
  if (!cnpj && !name) return null;
  try {
    const sb = createSupabaseAdminClient();
    if (!sb) return null;
    let row: any = null;
    if (cnpj) {
      const cleanCnpj = cnpj.replace(/\D/g, '');
      const { data } = await sb.from('clients').select('*').eq('cnpj', cleanCnpj).maybeSingle();
      row = data;
    }
    if (!row && name) {
      const firstWord = name.split(/[\s,.]+/)[0];
      const { data } = await sb.from('clients').select('*').ilike('name', firstWord + '%').limit(1).maybeSingle();
      row = data;
    }
    if (!row) return name ? { name } : null;
    return {
      cnpj: (row.cnpj || '').replace(/\D/g, '') || undefined,
      name: row.name || name || '',
      email: row.email || row.financial_email || undefined,
      phone: row.phone || undefined,
      address: {
        logradouro: row.address || row.street || undefined,
        numero: row.address_number || row.number || 'S/N',
        complemento: row.address_complement || undefined,
        bairro: row.address_neighborhood || row.neighborhood || undefined,
        codigoCidade: row.city_ibge_code || undefined,
        cidade: row.city || undefined,
        estado: row.state || undefined,
        cep: (row.zip_code || row.cep || '').replace(/\D/g, '') || undefined,
      },
    };
  } catch (e: any) {
    console.log('[PlugNotas] lookupClientForNf falhou:', e?.message || e);
    return name ? { name } : null;
  }
}

function sanitizeDescription(desc: string, fallback: string): string {
  let raw = desc || fallback;
  const codePrefix = /^\s*\d{4,6}\s*[|\-–]/;
  if (codePrefix.test(raw)) {
    console.log(`[PlugNotas] Descrição mal formatada ("${raw.substring(0, 60)}..."). Substituindo pela padrão.`);
    raw = fallback;
  }
  raw = raw.replace(/[^\w\s\-.,;:/À-ÿ()&]/g, ' ').replace(/\s+/g, ' ').trim();
  return raw.length > 250 ? raw.substring(0, 247) + '...' : raw;
}

export interface IssueNfParams {
  invoiceId: string;
  amount: number;
  company?: string;
  clientCnpj?: string;
  clientName: string;
  clientEmail?: string;
  serviceDescription?: string;
  externalReference?: string;
  /** Override do código de tributação municipal (lista de serviços). */
  municipalServiceCode?: string;
  municipalServiceName?: string;
}

export interface IssueNfResult {
  idIntegracao: string;
  plugnotasId?: string;
  protocol?: string;
  status?: string;
  raw: any;
}

export async function issueNfse(params: IssueNfParams): Promise<IssueNfResult> {
  const cfg = resolvePlugNotasCompany(params.company);
  const client = await lookupClientForNf(params.clientCnpj, params.clientName);
  const valorServico = Math.round(params.amount * 100) / 100;
  const valorIss = Math.round(valorServico * (cfg.issRate / 100) * 100) / 100;
  const idIntegracao = `inv-${params.invoiceId}-${Date.now()}`;

  const tomadorDoc = (params.clientCnpj || client?.cnpj || '').replace(/\D/g, '');
  if (!tomadorDoc || tomadorDoc.length < 11) {
    throw new Error('CNPJ/CPF do tomador ausente ou inválido — cadastre o documento do cliente antes de emitir.');
  }

  const tomadorEndereco = client?.address?.logradouro
    ? {
        logradouro: client.address.logradouro,
        numero: client.address.numero || 'S/N',
        complemento: client.address.complemento,
        bairro: client.address.bairro,
        codigoCidade: client.address.codigoCidade,
        cidade: client.address.cidade,
        estado: client.address.estado,
        cep: client.address.cep,
      }
    : undefined;

  const discriminacao = sanitizeDescription(params.serviceDescription || cfg.serviceDescription, cfg.serviceDescription);

  const payload = [{
    idIntegracao,
    cnpjEmissor: cfg.cnpj,
    referencia: params.externalReference || params.invoiceId,
    cliente: {
      cpfCnpj: tomadorDoc,
      razaoSocial: client?.name || params.clientName,
      email: client?.email || params.clientEmail || undefined,
      endereco: tomadorEndereco,
    },
    servico: {
      valor: {
        servico: valorServico,
        iss: valorIss,
      },
      discriminacao,
      codigoTributacaoMunicipio:
        String(params.municipalServiceCode || '').replace(/\D/g, '') || cfg.municipalServiceCode,
      codigoCnae: cfg.cnae,
      iss: {
        aliquota: cfg.issRate,
        tipoTributacao: 1,
        exigibilidade: 1,
      },
    },
  }];

  console.log(`[PlugNotas] Emitindo NF (${getPlugNotasEnv()}): emissor=${cfg.cnpj} tomador=${tomadorDoc} valor=${valorServico} idIntegracao=${idIntegracao}`);
  const data = await plugFetch('/nfse', { method: 'POST', body: JSON.stringify(payload) });

  const first = Array.isArray(data?.documents) ? data.documents[0]
    : Array.isArray(data) ? data[0]
    : data;
  return {
    idIntegracao,
    plugnotasId: first?.id || first?._id || data?.id || null,
    protocol: first?.protocoloPrefeitura?.numero || first?.protocolo || null,
    status: first?.status || data?.status || 'PROCESSING',
    raw: data,
  };
}

export async function consultNfseByIntegration(idIntegracao: string): Promise<any> {
  return plugFetch(`/nfse/consultar/${encodeURIComponent(idIntegracao)}`);
}

export async function consultNfseById(plugnotasId: string): Promise<any> {
  return plugFetch(`/nfse/${encodeURIComponent(plugnotasId)}`);
}

export async function getNfsePdfUrl(plugnotasId: string): Promise<string> {
  return `${getPlugNotasBaseUrl()}/nfse/pdf/${encodeURIComponent(plugnotasId)}`;
}

export async function getNfseXmlUrl(plugnotasId: string): Promise<string> {
  return `${getPlugNotasBaseUrl()}/nfse/xml/${encodeURIComponent(plugnotasId)}`;
}

export async function cancelNfse(plugnotasId: string, motivo: string = 'Cancelamento solicitado pelo emissor'): Promise<any> {
  return plugFetch(`/nfse/${encodeURIComponent(plugnotasId)}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo: motivo.substring(0, 250) }),
  });
}

export function mapPlugNotasStatusToNf(status: string | undefined | null): string {
  if (!status) return 'PROCESSING';
  const s = String(status).toUpperCase();
  if (s.includes('CONCLUID') || s.includes('AUTORIZAD') || s === 'AUTHORIZED' || s === 'COMPLETED') return 'AUTHORIZED';
  if (s.includes('REJEIT') || s === 'ERROR' || s === 'REJEITADA') return 'ERROR';
  if (s.includes('CANCEL')) return 'CANCELED';
  if (s.includes('PROCESS') || s === 'PROCESSING' || s === 'EM_PROCESSAMENTO') return 'PROCESSING';
  if (s.includes('AGEND') || s === 'SCHEDULED') return 'SCHEDULED';
  return s;
}

export async function testPlugNotasConnection(): Promise<{ ok: boolean; env: PlugNotasEnv; error?: string }> {
  const env = getPlugNotasEnv();
  if (!getPlugNotasToken()) return { ok: false, env, error: 'Token não configurado' };
  try {
    await plugFetch('/empresa');
    return { ok: true, env };
  } catch (e: any) {
    return { ok: false, env, error: e.message };
  }
}
