import {
  getAllBalancesCore,
  invalidateAsaasBalancesCoreCache,
} from '../lib/asaasBalancesCore';
import {
  isKnownAsaasCompany as isKnownAsaasCompanyCore,
  transferPixFromCompanyCore,
} from '../lib/asaasTransferPixCore';
import { getAsaasApiKeyTmGestao, getAsaasApiKeyTmSeguranca, getAsaasApiKeyTmSecurity } from '../lib/asaasEnvKeys';

export const GRUPO_TMSEG_WALLET_ID = '6641fec4-8476-48e3-90a8-3db6b14f538c';

interface CompanyConfig {
  apiKey: string;
  cnpj: string;
  name: string;
  aliases: string[];
  nf: {
    serviceDescription: string;
    issRate: number;
    retainIss: boolean;
    municipalServiceCode?: string;
    municipalServiceName?: string;
    cofins?: number;
    csll?: number;
    inss?: number;
    ir?: number;
    pis?: number;
  };
}

/**
 * IMPORTANTE: chaves lidas a CADA chamada (não no load do módulo).
 * Congelar apiKey no import do vercelApp.cjs causava 401 "chave inválida" na NF
 * enquanto o handler leve de saldo/create-charge (leitura runtime) funcionava.
 */
function asaasCompanies(): Record<string, CompanyConfig> {
  return {
    'TM GESTÃO': {
      apiKey: getAsaasApiKeyTmGestao(),
      cnpj: '60485843000157',
      name: 'TM GESTÃO',
      aliases: ['TM GESTAO', 'TM GESTÃO', 'GESTAO', 'GESTÃO'],
      nf: {
        // Amazon/TM GESTÃO: código 07930 (monitoramento) + ISS 2% (Simples Nacional).
        serviceDescription: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
        issRate: 2,
        retainIss: false,
        municipalServiceCode: '07930',
        municipalServiceName:
          '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
      },
    },
    'TM SEGURANCA': {
      apiKey: getAsaasApiKeyTmSeguranca(),
      cnpj: '28804378000167',
      name: 'Tm Seguranca Consultoria & Tecnologia Integrada Ltda',
      aliases: ['TM SEGURANÇA', 'TM SEGURANCA', 'TMSEGURANCA', 'TMSEGURANÇA', 'SEGURANÇA', 'SEGURANCA', 'TM SEGURANCA CONSULTORIA'],
      nf: {
        serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
        issRate: 5,
        retainIss: false,
        municipalServiceCode: '07930',
        municipalServiceName: '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
      },
    },
    'TM SECURITY': {
      apiKey: getAsaasApiKeyTmSecurity(),
      cnpj: '60508931000127',
      name: 'TM Security Gestão Corporativa Ltda',
      aliases: ['TM SECURITY', 'TMSECURITY', 'SECURITY', 'TM SECURITY GESTAO', 'TM SECURITY GESTÃO'],
      nf: {
        serviceDescription: 'Ref. aos Serviços de Intermediação de Escolta Armada',
        issRate: 5,
        retainIss: false,
        municipalServiceCode: '07930',
        municipalServiceName: '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
      },
    },
  };
}

function resolveCompanyEntry(company?: string) {
  const companies = asaasCompanies();
  if (company) {
    const upper = company.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [, val] of Object.entries(companies)) {
      const normalizedAliases = val.aliases.map(a => a.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      if (normalizedAliases.some(alias => upper.includes(alias) || alias.includes(upper))) return val;
      if (upper.includes(val.cnpj)) return val;
      const normalizedName = val.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalizedName.includes(upper) || upper.includes(normalizedName)) return val;
    }
  }
  return companies['TM GESTÃO'];
}

function resolveApiKey(company?: string): string {
  return resolveCompanyEntry(company).apiKey;
}

/** Produção por padrão; sandbox se a chave (ou ASAAS_API_BASE_URL) indicar HML. */
function resolveAsaasBaseUrl(company?: string): string {
  const custom = String(process.env.ASAAS_API_BASE_URL || process.env.ASAAS_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (custom) return custom;
  const keySample = resolveApiKey(company) || '';
  if (keySample.includes('_hmlg_') || keySample.includes('_sandbox_')) {
    return 'https://sandbox.asaas.com/api/v3';
  }
  return 'https://api.asaas.com/v3';
}

const headers = (company?: string) => ({
  'Content-Type': 'application/json',
  'access_token': resolveApiKey(company),
});

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  value: number;
  netValue: number;
  status: string;
  dueDate: string;
  billingType: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  description?: string;
  externalReference?: string;
  dateCreated?: string;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export interface AsaasBankSlip {
  identificationField: string;
  nossoNumero: string;
  barCode: string;
}

/** Timeout rígido de toda chamada Asaas — nunca hang indeterminado. */
const ASAAS_FETCH_TIMEOUT_MS = 8_000;

function buildAsaasAbortSignal(external?: AbortSignal | null): { signal: AbortSignal; cleanup?: () => void } {
  let timeoutSignal: AbortSignal;
  let cleanup: (() => void) | undefined;
  const anyFactory = (AbortSignal as any).timeout as undefined | ((ms: number) => AbortSignal);
  if (typeof anyFactory === 'function') {
    timeoutSignal = anyFactory(ASAAS_FETCH_TIMEOUT_MS);
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASAAS_FETCH_TIMEOUT_MS);
    timeoutSignal = controller.signal;
    cleanup = () => clearTimeout(timer);
  }
  if (external && typeof (AbortSignal as any).any === 'function') {
    return { signal: (AbortSignal as any).any([external, timeoutSignal]), cleanup };
  }
  return { signal: timeoutSignal, cleanup };
}

async function asaasFetch(endpoint: string, options: RequestInit = {}, company?: string): Promise<any> {
  const entry = resolveCompanyEntry(company);
  const apiKey = entry.apiKey;
  if (!apiKey) throw new Error('ASAAS_API_KEY não configurada para a empresa selecionada');
  const keyPrefix = apiKey.substring(0, 12) + '...';
  if (options.method && options.method !== 'GET') {
    console.log(`[Asaas] ${options.method} ${endpoint} | Empresa: ${entry.name} | CNPJ: ${entry.cnpj} | Key: ${keyPrefix}`);
  }
  const url = `${resolveAsaasBaseUrl(company)}${endpoint}`;
  const { signal, cleanup } = buildAsaasAbortSignal(options.signal || null);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal,
      headers: { ...headers(company), ...(options.headers || {}) },
    });
    const text = await res.text();
    let data: any = {};
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Resposta inválida do Asaas (${res.status})`);
      }
    }
    if (!res.ok) {
      const errMsg = data.errors?.map((e: any) => e.description).join('; ') || data.message || JSON.stringify(data);
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Asaas API Error (${res.status}): ${errMsg} — empresa ${entry.name}. ` +
            `Confira na Vercel a chave de produção ($aact_prod_...) desta empresa ` +
            `(TM GESTÃO: Asaas_TMSEGESTÃO_API). Saldo e NF usam a mesma chave em runtime.`,
        );
      }
      throw new Error(`Asaas API Error (${res.status}): ${errMsg}`);
    }
    return data;
  } catch (err: any) {
    const name = String(err?.name || '');
    if (name === 'AbortError' || name === 'TimeoutError' || /aborted|timeout/i.test(String(err?.message || ''))) {
      throw new Error(
        `Timeout ao comunicar com Asaas (${ASAAS_FETCH_TIMEOUT_MS / 1000}s) — ${endpoint} [${Date.now() - started}ms]`,
      );
    }
    throw err;
  } finally {
    cleanup?.();
  }
}

export async function findCustomerByCpfCnpj(
  cpfCnpj: string,
  company?: string,
  signal?: AbortSignal,
): Promise<AsaasCustomer | null> {
  const clean = cpfCnpj.replace(/\D/g, '');
  const data = await asaasFetch(`/customers?cpfCnpj=${clean}`, { signal }, company);
  return data.data?.length > 0 ? data.data[0] : null;
}

export async function createCustomer(params: {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  externalReference?: string;
  company?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  signal?: AbortSignal;
}): Promise<AsaasCustomer> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = params.email && emailRegex.test(params.email.trim()) ? params.email.trim() : undefined;
  const body: any = {
    name: params.name,
    cpfCnpj: params.cpfCnpj.replace(/\D/g, ''),
    email: validEmail,
    phone: params.phone || undefined,
    externalReference: params.externalReference || undefined,
    notificationDisabled: false,
  };
  if (params.postalCode) body.postalCode = params.postalCode.replace(/\D/g, '');
  if (params.address) body.address = params.address;
  if (params.addressNumber) body.addressNumber = params.addressNumber;
  if (params.complement) body.complement = params.complement;
  if (params.province) body.province = params.province;
  if (params.city) body.city = params.city;
  if (params.state) body.state = params.state;
  return asaasFetch('/customers', { method: 'POST', body: JSON.stringify(body), signal: params.signal }, params.company);
}

export async function updateCustomerAddress(customerId: string, params: {
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  company?: string;
  signal?: AbortSignal;
}): Promise<any> {
  const body: any = {};
  if (params.postalCode) body.postalCode = params.postalCode.replace(/\D/g, '');
  if (params.address) body.address = params.address;
  if (params.addressNumber) body.addressNumber = params.addressNumber;
  if (params.complement) body.complement = params.complement;
  if (params.province) body.province = params.province;
  if (params.city) body.city = params.city;
  if (params.state) body.state = params.state;
  if (Object.keys(body).length === 0) return null;
  return asaasFetch(
    `/customers/${customerId}`,
    { method: 'PUT', body: JSON.stringify(body), signal: params.signal },
    params.company,
  );
}

export async function findOrCreateCustomer(params: {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  company?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  signal?: AbortSignal;
}): Promise<AsaasCustomer> {
  const existing = await findCustomerByCpfCnpj(params.cpfCnpj, params.company, params.signal);
  if (existing) {
    if (params.postalCode) {
      try { await updateCustomerAddress(existing.id, params); } catch (e) { console.log('[Asaas] Aviso ao atualizar endereço:', (e as any).message); }
    }
    return existing;
  }
  return createCustomer(params);
}

export async function createPayment(params: {
  customerId: string;
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  billingType?: 'BOLETO' | 'PIX' | 'UNDEFINED';
  company?: string;
  splitWalletId?: string;
  signal?: AbortSignal;
}): Promise<AsaasPayment> {
  const body: any = {
    customer: params.customerId,
    billingType: params.billingType || 'UNDEFINED',
    value: params.value,
    dueDate: params.dueDate,
    description: params.description || 'Referente aos serviços de Intermediação de Escolta Armada e Fiscal de Rota — Grupo TM SEG',
    externalReference: params.externalReference || undefined,
    interest: { value: 1, type: 'PERCENTAGE' },
    fine: { value: 2, type: 'PERCENTAGE' },
  };
  if (params.splitWalletId) {
    body.split = [
      {
        walletId: params.splitWalletId,
        percentualValue: 100,
      },
    ];
    console.log(`[Asaas] Split configurado: 100% → walletId ${params.splitWalletId}`);
  }
  return asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify(body),
    signal: params.signal,
  }, params.company);
}

export async function getPaymentPixQrCode(paymentId: string, company?: string): Promise<AsaasPixQrCode> {
  return asaasFetch(`/payments/${paymentId}/pixQrCode`, {}, company);
}

export async function getPaymentBankSlip(paymentId: string, company?: string): Promise<AsaasBankSlip> {
  return asaasFetch(`/payments/${paymentId}/identificationField`, {}, company);
}

export async function getPayment(paymentId: string, company?: string): Promise<AsaasPayment> {
  return asaasFetch(`/payments/${paymentId}`, {}, company);
}

export async function listPayments(params?: {
  customer?: string;
  status?: string;
  externalReference?: string;
  offset?: number;
  limit?: number;
  company?: string;
}): Promise<{ data: AsaasPayment[]; totalCount: number }> {
  const query = new URLSearchParams();
  if (params?.customer) query.set('customer', params.customer);
  if (params?.status) query.set('status', params.status);
  if (params?.externalReference) query.set('externalReference', params.externalReference);
  query.set('offset', String(params?.offset || 0));
  query.set('limit', String(params?.limit || 50));
  return asaasFetch(`/payments?${query.toString()}`, {}, params?.company);
}

export async function deletePayment(paymentId: string, company?: string): Promise<any> {
  return asaasFetch(`/payments/${paymentId}`, { method: 'DELETE' }, company);
}

export function mapAsaasStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'PENDENTE',
    RECEIVED: 'PAGO',
    CONFIRMED: 'PAGO',
    OVERDUE: 'VENCIDO',
    REFUNDED: 'ESTORNADO',
    RECEIVED_IN_CASH: 'PAGO',
    REFUND_REQUESTED: 'ESTORNO_SOLICITADO',
    CHARGEBACK_REQUESTED: 'CHARGEBACK',
    CHARGEBACK_DISPUTE: 'DISPUTA',
    AWAITING_CHARGEBACK_REVERSAL: 'AGUARDANDO_REVERSÃO',
    DUNNING_REQUESTED: 'NEGATIVADO',
    DUNNING_RECEIVED: 'NEGATIVADO_PAGO',
    AWAITING_RISK_ANALYSIS: 'EM_ANÁLISE',
  };
  return map[status] || status;
}

export async function listMunicipalServices(company?: string): Promise<any[]> {
  const data = await asaasFetch('/invoices/municipalServices', {}, company);
  return data?.data || [];
}

interface MunicipalServiceInfo {
  id: string;
  code: string;
  name: string;
}

const municipalServiceCache: Record<string, MunicipalServiceInfo> = {};

async function resolveMunicipalService(company?: string): Promise<MunicipalServiceInfo | undefined> {
  const key = company || '__default__';
  if (municipalServiceCache[key]) return municipalServiceCache[key];
  try {
    const services = await listMunicipalServices(company);
    console.log(`[Asaas] Serviços municipais encontrados para ${key}: ${services.length} item(s)`);
    services.forEach((s: any, i: number) => {
      console.log(`[Asaas]   [${i}] ID=${s.id} | Código=${s.code || s.municipalServiceCode || '-'} | ${(s.description || s.name || '-').substring(0, 100)}`);
    });
    if (services.length > 0) {
      const preferred = services.find((s: any) => {
        const desc = (s.description || s.name || '').toLowerCase();
        const code = String(s.code || s.municipalServiceCode || '');
        return code.includes('07930') || code.includes('03115') || code.includes('17.01') || desc.includes('monitoramento') || desc.includes('rastreamento') || desc.includes('escolta') || desc.includes('segurança') || desc.includes('vigilância') || desc.includes('seguranca') || desc.includes('assessoria') || desc.includes('consultoria');
      }) || services[0];
      const rawName = String(preferred.description || preferred.name || '');
      const info: MunicipalServiceInfo = {
        id: String(preferred.id),
        code: String(preferred.code || preferred.municipalServiceCode || ''),
        name: rawName.length > 200 ? rawName.substring(0, 200) : rawName,
      };
      municipalServiceCache[key] = info;
      console.log(`[Asaas] Serviço municipal selecionado para ${key}: ID=${info.id} | Código=${info.code} | ${info.name}`);
      return info;
    }
  } catch (e: any) {
    console.log(`[Asaas] Não foi possível buscar serviços municipais: ${e.message}`);
  }
  return undefined;
}

interface ClientNfDefaults {
  serviceDescription?: string | null;
  municipalServiceCode?: string | null;
  municipalServiceName?: string | null;
}

const clientNfCache: Record<string, { value: ClientNfDefaults | null; ts: number }> = {};
const CLIENT_NF_CACHE_TTL_MS = 60_000;

function formatCnpjMask(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 14) return d;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function isAmazonClientLabel(name?: string | null): boolean {
  return String(name || '').toUpperCase().includes('AMAZON');
}

/** Regra fixa Amazon: código 07930 com descrição de monitoramento + discriminação comercial. */
const AMAZON_NF_DEFAULTS: ClientNfDefaults = {
  serviceDescription: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
  municipalServiceCode: '07930',
  municipalServiceName:
    '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
};

async function lookupClientNfDefaults(cnpj?: string | null, name?: string | null): Promise<ClientNfDefaults | null> {
  if (!cnpj && !name) return null;
  const key = (cnpj || '').replace(/\D/g, '') || `name:${(name || '').toUpperCase().trim()}`;
  const cached = clientNfCache[key];
  if (cached && Date.now() - cached.ts < CLIENT_NF_CACHE_TTL_MS) return cached.value;
  try {
    const { createSupabaseAdminClient } = await import('./supabaseConfig');
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      // Sem Supabase: ainda aplica regra Amazon por nome.
      if (isAmazonClientLabel(name)) {
        clientNfCache[key] = { value: AMAZON_NF_DEFAULTS, ts: Date.now() };
        return AMAZON_NF_DEFAULTS;
      }
      return null;
    }
    let row: any = null;
    if (cnpj) {
      const cleanCnpj = cnpj.replace(/\D/g, '');
      const formatted = formatCnpjMask(cleanCnpj);
      // clients.cnpj pode estar mascarado (01.661.770/0003-00) — eq só com dígitos falhava.
      const { data } = await supabase.from('clients')
        .select('name, trading_name, nf_service_description, nf_municipal_service_code, nf_municipal_service_name')
        .or(`cnpj.eq.${cleanCnpj},cnpj.eq.${formatted}`)
        .limit(1)
        .maybeSingle();
      row = data;
    }
    if (!row && name) {
      const { data } = await supabase.from('clients')
        .select('name, trading_name, nf_service_description, nf_municipal_service_code, nf_municipal_service_name')
        .ilike('name', name.split(/[\s,.]+/)[0] + '%').limit(1).maybeSingle();
      row = data;
    }
    const rowName = `${row?.name || ''} ${row?.trading_name || ''} ${name || ''}`;
    if (isAmazonClientLabel(rowName)) {
      const out: ClientNfDefaults = {
        serviceDescription: row?.nf_service_description || AMAZON_NF_DEFAULTS.serviceDescription,
        municipalServiceCode: row?.nf_municipal_service_code || AMAZON_NF_DEFAULTS.municipalServiceCode,
        municipalServiceName: row?.nf_municipal_service_name || AMAZON_NF_DEFAULTS.municipalServiceName,
      };
      // Garante 07930 agenciamento mesmo se o cadastro tiver só o código sem nome.
      if (!out.municipalServiceCode || out.municipalServiceCode === '07930') {
        out.municipalServiceCode = AMAZON_NF_DEFAULTS.municipalServiceCode;
        out.municipalServiceName = AMAZON_NF_DEFAULTS.municipalServiceName;
        if (!out.serviceDescription) out.serviceDescription = AMAZON_NF_DEFAULTS.serviceDescription;
      }
      clientNfCache[key] = { value: out, ts: Date.now() };
      return out;
    }
    const out: ClientNfDefaults | null = row ? {
      serviceDescription: row.nf_service_description || null,
      municipalServiceCode: row.nf_municipal_service_code || null,
      municipalServiceName: row.nf_municipal_service_name || null,
    } : null;
    clientNfCache[key] = { value: out, ts: Date.now() };
    return out;
  } catch (e: any) {
    if (e?.code === '42703') {
      console.log('[Asaas NF] coluna nf_service_description ainda não existe — usando padrão da empresa.');
    }
    clientNfCache[key] = { value: null, ts: Date.now() };
    return null;
  }
}

export async function scheduleInvoice(params: {
  paymentId: string;
  serviceDescription?: string;
  observations?: string;
  externalReference?: string;
  company?: string;
  municipalServiceId?: string;
  /** Override do código de serviço municipal (ex.: 06298 Amazon). */
  municipalServiceCode?: string;
  municipalServiceName?: string;
  clientCnpj?: string;
  clientName?: string;
  taxes?: {
    retainIss?: boolean;
    iss?: number;
    cofins?: number;
    csll?: number;
    inss?: number;
    ir?: number;
    pis?: number;
  };
}): Promise<any> {
  const companyEntry = resolveCompanyEntry(params.company);
  const nfConfig = companyEntry.nf;
  const overrideCode = String(params.municipalServiceCode || '').replace(/\D/g, '');
  // Sempre consulta cadastro (Amazon: regra fixa 07930/agenciamento no lookup).
  const clientDefaults = await lookupClientNfDefaults(params.clientCnpj, params.clientName);
  const isAmazonNf = isAmazonClientLabel(params.clientName);
  const taxes = {
    retainIss: params.taxes?.retainIss ?? nfConfig.retainIss,
    iss: params.taxes?.iss ?? nfConfig.issRate,
    cofins: params.taxes?.cofins ?? nfConfig.cofins ?? 0,
    csll: params.taxes?.csll ?? nfConfig.csll ?? 0,
    inss: params.taxes?.inss ?? nfConfig.inss ?? 0,
    ir: params.taxes?.ir ?? nfConfig.ir ?? 0,
    pis: params.taxes?.pis ?? nfConfig.pis ?? 0,
  };
  let rawDesc =
    (isAmazonNf
      ? clientDefaults?.serviceDescription || AMAZON_NF_DEFAULTS.serviceDescription
      : clientDefaults?.serviceDescription) ||
    params.serviceDescription ||
    nfConfig.serviceDescription;
  // Sanitização preventiva: usuários às vezes colam "07930 | Serviços relacionados..."
  // (código + nome do serviço municipal) no campo descrição. Isso quebra a NF
  // (Prefeitura SP devolve NFe003). Detecta e substitui por descrição padrão.
  const codePrefix = /^\s*\d{4,6}\s*[|\-–]/;
  if (codePrefix.test(rawDesc)) {
    console.log(`[Asaas NF] Descrição mal formatada detectada ("${rawDesc.substring(0, 60)}..."). Substituindo por padrão da empresa para evitar NFe003.`);
    rawDesc = nfConfig.serviceDescription;
  }
  // Payload V3 Asaas: payment + serviceDescription + taxes + serviço municipal.
  // effectiveDatePeriod ON_PAYMENT_CONFIRMATION/ON_PAYMENT_CREATION evita effectiveDate manual.
  const body: any = {
    payment: params.paymentId,
    serviceDescription: rawDesc.length > 250 ? rawDesc.substring(0, 247) + '...' : rawDesc,
    taxes,
    effectiveDatePeriod: 'ON_PAYMENT_CREATION',
  };
  const overrideName = String(params.municipalServiceName || '').trim();
  const clientCode = String(clientDefaults?.municipalServiceCode || '').replace(/\D/g, '');
  const clientNameSvc = String(clientDefaults?.municipalServiceName || '').trim();
  if (isAmazonNf) {
    // Regra permanente Amazon: ignora nome antigo (monitoramento) e força agenciamento 07930.
    body.municipalServiceCode = AMAZON_NF_DEFAULTS.municipalServiceCode;
    body.municipalServiceName = AMAZON_NF_DEFAULTS.municipalServiceName;
  } else if (params.municipalServiceId) {
    body.municipalServiceId = params.municipalServiceId;
  } else if (overrideCode) {
    body.municipalServiceCode = overrideCode;
    if (overrideName) body.municipalServiceName = overrideName;
  } else if (clientCode) {
    body.municipalServiceCode = clientCode;
    if (clientNameSvc) body.municipalServiceName = clientNameSvc;
  } else if (nfConfig.municipalServiceCode) {
    body.municipalServiceCode = nfConfig.municipalServiceCode;
    if (nfConfig.municipalServiceName) body.municipalServiceName = nfConfig.municipalServiceName;
  } else {
    // Fallback lento (lista serviços) com teto — se falhar, erro claro de configuração.
    try {
      const municipalService = await Promise.race([
        resolveMunicipalService(params.company),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
      ]);
      if (municipalService) {
        body.municipalServiceId = municipalService.id;
        body.municipalServiceCode = municipalService.code;
        body.municipalServiceName = municipalService.name;
      }
    } catch {
      /* below */
    }
    if (!body.municipalServiceCode && !body.municipalServiceId) {
      throw new Error(
        `Serviço municipal ausente para ${companyEntry.name}. ` +
          'No painel Asaas: Configurações → Nota Fiscal (Inscrição Municipal + CNAE/código). ' +
          'Ou informe o código de serviço no modal de emissão.',
      );
    }
  }
  if (params.observations) body.observations = params.observations;
  if (params.externalReference) body.externalReference = params.externalReference;
  console.log(
    `[Asaas NF] POST /invoices payment=${params.paymentId} company=${companyEntry.name} ` +
      `code=${body.municipalServiceCode || body.municipalServiceId || '-'}`,
  );
  try {
    return await asaasFetch('/invoices', { method: 'POST', body: JSON.stringify(body) }, params.company);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Propaga descrição Asaas (400/422) para nf_last_error no Controle.
    throw new Error(
      msg.includes('Asaas API Error')
        ? msg
        : `Falha ao agendar NF no Asaas: ${msg}. Verifique Inscrição Municipal / certificado / código de serviço no painel Asaas.`,
    );
  }
}

export async function getInvoice(invoiceId: string, company?: string): Promise<any> {
  return asaasFetch(`/invoices/${invoiceId}`, {}, company);
}

export async function cancelInvoice(invoiceId: string, company?: string): Promise<any> {
  return asaasFetch(`/invoices/${invoiceId}/cancel`, { method: 'POST' }, company);
}

export async function getInvoiceByPayment(paymentId: string, company?: string): Promise<any> {
  return asaasFetch(`/invoices?payment=${paymentId}`, {}, company);
}

export async function getBalance(company?: string): Promise<any> {
  return asaasFetch('/finance/balance', {}, company);
}

export async function getAllBalances(): Promise<{ company: string; name: string; balance: number; pendingBalance: number; error?: string }[]> {
  return getAllBalancesCore();
}

export function invalidateAsaasBalanceCache(): void {
  invalidateAsaasBalancesCoreCache();
}

export function isKnownAsaasCompany(company: string): boolean {
  return isKnownAsaasCompanyCore(company) || Object.prototype.hasOwnProperty.call(asaasCompanies(), company);
}

/** Transfere Pix para financeiro@grupotmseg.com.br mantendo reserva mínima na conta. */
export async function transferPixFromCompany(params: {
  company: string;
  value: number;
  description?: string;
}): Promise<any> {
  return transferPixFromCompanyCore(params);
}

export function isAsaasConfigured(): boolean {
  return Object.values(asaasCompanies()).some((c) => !!String(c.apiKey || '').trim());
}

export function getAsaasCompanies(): { key: string; name: string; cnpj: string; configured: boolean; apiKey: string }[] {
  return Object.entries(asaasCompanies()).map(([key, val]) => ({
    key,
    name: val.name,
    cnpj: val.cnpj,
    configured: !!val.apiKey,
    apiKey: val.apiKey,
  }));
}
