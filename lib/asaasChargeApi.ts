/**
 * Cliente Asaas mínimo para create-charge (handler leve Vercel).
 * Não importa server/asaasService (quebra ESM: asaasBalancesCore sem extensão).
 */
import {
  getAsaasApiKeyTmGestao,
  getAsaasApiKeyTmSeguranca,
  getAsaasApiKeyTmSecurity,
  readFirstEnv,
} from './asaasEnvKeys.js';

const ASAAS_FETCH_TIMEOUT_MS = 8_000;

type CompanyEntry = {
  apiKey: string;
  cnpj: string;
  name: string;
  aliases: string[];
};

function companies(): Record<string, CompanyEntry> {
  return {
    'TM GESTÃO': {
      apiKey: getAsaasApiKeyTmGestao(),
      cnpj: '60485843000157',
      name: 'TM GESTÃO',
      aliases: ['TM GESTAO', 'TM GESTÃO', 'GESTAO', 'GESTÃO'],
    },
    'TM SEGURANCA': {
      apiKey: getAsaasApiKeyTmSeguranca(),
      cnpj: '28804378000167',
      name: 'Tm Seguranca Consultoria & Tecnologia Integrada Ltda',
      aliases: [
        'TM SEGURANÇA',
        'TM SEGURANCA',
        'TMSEGURANCA',
        'TMSEGURANÇA',
        'SEGURANÇA',
        'SEGURANCA',
        'TM SEGURANCA CONSULTORIA',
      ],
    },
    'TM SECURITY': {
      apiKey: getAsaasApiKeyTmSecurity(),
      cnpj: '60508931000127',
      name: 'TM Security Gestão Corporativa Ltda',
      aliases: ['TM SECURITY', 'TMSECURITY', 'SECURITY', 'TM SECURITY GESTAO', 'TM SECURITY GESTÃO'],
    },
  };
}

function resolveCompanyEntry(company?: string): CompanyEntry {
  const all = companies();
  if (company) {
    const upper = company
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    for (const val of Object.values(all)) {
      const normalizedAliases = val.aliases.map((a) =>
        a
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
      );
      if (normalizedAliases.some((alias) => upper.includes(alias) || alias.includes(upper))) return val;
      if (upper.includes(val.cnpj)) return val;
      const normalizedName = val.name
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (normalizedName.includes(upper) || upper.includes(normalizedName)) return val;
    }
  }
  return all['TM GESTÃO'];
}

function asaasBaseUrl(company?: string): string {
  const custom = readFirstEnv('ASAAS_API_BASE_URL', 'ASAAS_BASE_URL');
  if (custom) return custom.replace(/\/$/, '');
  const keySample = resolveCompanyEntry(company).apiKey || '';
  if (keySample.includes('_hmlg_') || keySample.includes('_sandbox_')) {
    return 'https://sandbox.asaas.com/api/v3';
  }
  return 'https://api.asaas.com/v3';
}

function buildAbortSignal(external?: AbortSignal | null): { signal: AbortSignal; cleanup?: () => void } {
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
  if (!entry.apiKey) throw new Error('ASAAS_API_KEY não configurada para a empresa selecionada');
  if (options.method && options.method !== 'GET') {
    console.log(`[Asaas] ${options.method} ${endpoint} | Empresa: ${entry.name}`);
  }
  const url = `${asaasBaseUrl(company)}${endpoint}`;
  const { signal, cleanup } = buildAbortSignal(options.signal || null);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal,
      headers: {
        'Content-Type': 'application/json',
        access_token: entry.apiKey,
        ...(options.headers || {}),
      },
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
      const errMsg =
        data.errors?.map((e: any) => e.description).join('; ') || data.message || JSON.stringify(data);
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

export type AsaasCustomer = { id: string; name: string; cpfCnpj?: string };
export type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

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

export async function updateCustomerAddress(
  customerId: string,
  params: {
    postalCode?: string;
    address?: string;
    addressNumber?: string;
    complement?: string;
    province?: string;
    city?: string;
    state?: string;
    company?: string;
    signal?: AbortSignal;
  },
): Promise<unknown> {
  const body: Record<string, string> = {};
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

export async function findCustomerByCpfCnpj(
  cpfCnpj: string,
  company?: string,
  signal?: AbortSignal,
): Promise<AsaasCustomer | null> {
  const clean = cpfCnpj.replace(/\D/g, '');
  const found = await asaasFetch(`/customers?cpfCnpj=${clean}`, { signal }, company);
  return found.data?.length > 0 ? (found.data[0] as AsaasCustomer) : null;
}

export async function findOrCreateCustomer(params: {
  name: string;
  cpfCnpj: string;
  email?: string;
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
  const clean = params.cpfCnpj.replace(/\D/g, '');
  const found = await asaasFetch(`/customers?cpfCnpj=${clean}`, { signal: params.signal }, params.company);
  if (found.data?.length > 0) {
    const existing = found.data[0] as AsaasCustomer & { postalCode?: string };
    // Atualiza endereço fiscal local → Asaas (NF exige CEP/logradouro completos).
    if (params.postalCode) {
      try {
        await updateCustomerAddress(existing.id, params);
      } catch (e: any) {
        console.log('[Asaas] Aviso ao atualizar endereço do cliente:', e?.message || e);
      }
    }
    return existing;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = params.email && emailRegex.test(params.email.trim()) ? params.email.trim() : undefined;
  const body: any = {
    name: params.name,
    cpfCnpj: clean,
    email: validEmail,
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

/** Cobrança Asaas (handler leve — sem server/asaasService). */
export async function getPayment(
  paymentId: string,
  company?: string,
  signal?: AbortSignal,
): Promise<AsaasPayment & Record<string, any>> {
  return asaasFetch(`/payments/${encodeURIComponent(paymentId)}`, { signal }, company);
}

export async function listPayments(params?: {
  customer?: string;
  status?: string;
  externalReference?: string;
  offset?: number;
  limit?: number;
  company?: string;
  signal?: AbortSignal;
}): Promise<{ data: AsaasPayment[]; totalCount: number }> {
  const query = new URLSearchParams();
  if (params?.customer) query.set('customer', params.customer);
  if (params?.status) query.set('status', params.status);
  if (params?.externalReference) query.set('externalReference', params.externalReference);
  query.set('offset', String(params?.offset || 0));
  query.set('limit', String(params?.limit || 50));
  return asaasFetch(`/payments?${query.toString()}`, { signal: params?.signal }, params?.company);
}

export async function deletePayment(
  paymentId: string,
  company?: string,
  signal?: AbortSignal,
): Promise<any> {
  return asaasFetch(
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: 'DELETE', signal },
    company,
  );
}

/** Lista NFs Asaas de uma cobrança (handler leve — sem server/asaasService). */
export async function getInvoicesByPayment(
  paymentId: string,
  company?: string,
  signal?: AbortSignal,
): Promise<any[]> {
  const data = await asaasFetch(
    `/invoices?payment=${encodeURIComponent(paymentId)}&limit=20`,
    { signal },
    company,
  );
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

export async function getPaymentPixQrCode(
  paymentId: string,
  company?: string,
  signal?: AbortSignal,
): Promise<{ payload?: string; encodedImage?: string } | null> {
  try {
    return await asaasFetch(
      `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
      { signal },
      company,
    );
  } catch {
    return null;
  }
}

export async function getPaymentBankSlip(
  paymentId: string,
  company?: string,
  signal?: AbortSignal,
): Promise<{ identificationField?: string; barCode?: string } | null> {
  try {
    return await asaasFetch(
      `/payments/${encodeURIComponent(paymentId)}/identificationField`,
      { signal },
      company,
    );
  } catch {
    return null;
  }
}

export async function createPayment(params: {
  customerId: string;
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  billingType?: 'BOLETO' | 'PIX' | 'UNDEFINED';
  company?: string;
  signal?: AbortSignal;
}): Promise<AsaasPayment> {
  const body: any = {
    customer: params.customerId,
    billingType: params.billingType || 'UNDEFINED',
    value: params.value,
    dueDate: params.dueDate,
    description:
      params.description ||
      'Referente aos serviços de Intermediação de Escolta Armada e Fiscal de Rota — Grupo TM SEG',
    externalReference: params.externalReference || undefined,
    interest: { value: 1, type: 'PERCENTAGE' },
    fine: { value: 2, type: 'PERCENTAGE' },
  };
  return asaasFetch(
    '/payments',
    { method: 'POST', body: JSON.stringify(body), signal: params.signal },
    params.company,
  );
}
