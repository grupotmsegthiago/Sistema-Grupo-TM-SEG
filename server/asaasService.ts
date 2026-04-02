const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

const ASAAS_COMPANIES: Record<string, { apiKey: string; cnpj: string; name: string; nf: { serviceDescription: string; issRate: number; retainIss: boolean; cofins?: number; csll?: number; inss?: number; ir?: number; pis?: number } }> = {
  'TM GESTÃO': {
    apiKey: process.env.ASAAS_API_KEY || '',
    cnpj: '60485843000157',
    name: 'TM GESTÃO',
    nf: {
      serviceDescription: 'Intermediação de Escolta Armada e Fiscal de Rota',
      issRate: 5,
      retainIss: false,
    },
  },
  'TM SECURITY': {
    apiKey: process.env.ASAAS_API_KEY_TMSECURITY || '',
    cnpj: '60508931000127',
    name: 'TM SECURITY GESTÃO CORPORATIVA LTDA',
    nf: {
      serviceDescription: 'Intermediação de Escolta Armada e Fiscal de Rota',
      issRate: 5,
      retainIss: false,
    },
  },
};

function resolveCompanyEntry(company?: string) {
  if (company) {
    const upper = company.toUpperCase();
    for (const [key, val] of Object.entries(ASAAS_COMPANIES)) {
      if (upper.includes(key) || upper.includes(val.cnpj) || val.name.toUpperCase().includes(upper)) {
        return val;
      }
    }
  }
  return ASAAS_COMPANIES['TM GESTÃO'];
}

function resolveApiKey(company?: string): string {
  return resolveCompanyEntry(company).apiKey;
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

async function asaasFetch(endpoint: string, options: RequestInit = {}, company?: string): Promise<any> {
  const apiKey = resolveApiKey(company);
  if (!apiKey) throw new Error('ASAAS_API_KEY não configurada para a empresa selecionada');
  const url = `${ASAAS_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(company), ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.errors?.map((e: any) => e.description).join('; ') || data.message || JSON.stringify(data);
    throw new Error(`Asaas API Error (${res.status}): ${errMsg}`);
  }
  return data;
}

export async function findCustomerByCpfCnpj(cpfCnpj: string, company?: string): Promise<AsaasCustomer | null> {
  const clean = cpfCnpj.replace(/\D/g, '');
  const data = await asaasFetch(`/customers?cpfCnpj=${clean}`, {}, company);
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
  return asaasFetch('/customers', { method: 'POST', body: JSON.stringify(body) }, params.company);
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
  return asaasFetch(`/customers/${customerId}`, { method: 'PUT', body: JSON.stringify(body) }, params.company);
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
}): Promise<AsaasCustomer> {
  const existing = await findCustomerByCpfCnpj(params.cpfCnpj, params.company);
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
}): Promise<AsaasPayment> {
  return asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: params.customerId,
      billingType: params.billingType || 'UNDEFINED',
      value: params.value,
      dueDate: params.dueDate,
      description: params.description || 'Referente aos serviços de Intermediação de Escolta Armada e Fiscal de Rota — Grupo TM SEG',
      externalReference: params.externalReference || undefined,
      interest: { value: 2, type: 'PERCENTAGE' },
      fine: { value: 1, type: 'PERCENTAGE' },
    }),
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
    if (services.length > 0) {
      const preferred = services.find((s: any) => {
        const desc = (s.description || s.name || '').toLowerCase();
        const code = String(s.code || s.municipalServiceCode || '');
        return code.includes('03115') || desc.includes('assessoria') || desc.includes('consultoria') || desc.includes('escolta') || desc.includes('segurança') || desc.includes('vigilância');
      }) || services[0];
      const info: MunicipalServiceInfo = {
        id: String(preferred.id),
        code: String(preferred.code || preferred.municipalServiceCode || ''),
        name: String(preferred.description || preferred.name || ''),
      };
      municipalServiceCache[key] = info;
      console.log(`[Asaas] Serviço municipal resolvido para ${key}: ID=${info.id} | Código=${info.code} | ${info.name}`);
      return info;
    }
  } catch (e: any) {
    console.log(`[Asaas] Não foi possível buscar serviços municipais: ${e.message}`);
  }
  return undefined;
}

export async function scheduleInvoice(params: {
  paymentId: string;
  serviceDescription?: string;
  observations?: string;
  externalReference?: string;
  company?: string;
  municipalServiceId?: string;
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
  const taxes = {
    retainIss: params.taxes?.retainIss ?? nfConfig.retainIss,
    iss: params.taxes?.iss ?? nfConfig.issRate,
    cofins: params.taxes?.cofins ?? nfConfig.cofins ?? 0,
    csll: params.taxes?.csll ?? nfConfig.csll ?? 0,
    inss: params.taxes?.inss ?? nfConfig.inss ?? 0,
    ir: params.taxes?.ir ?? nfConfig.ir ?? 0,
    pis: params.taxes?.pis ?? nfConfig.pis ?? 0,
  };
  const municipalService = await resolveMunicipalService(params.company);
  const body: any = {
    payment: params.paymentId,
    serviceDescription: params.serviceDescription || nfConfig.serviceDescription,
    taxes,
  };
  if (params.municipalServiceId) {
    body.municipalServiceId = params.municipalServiceId;
  } else if (municipalService) {
    body.municipalServiceId = municipalService.id;
    body.municipalServiceCode = municipalService.code;
    body.municipalServiceName = municipalService.name;
  }
  if (params.observations) body.observations = params.observations;
  if (params.externalReference) body.externalReference = params.externalReference;
  return asaasFetch('/invoices', { method: 'POST', body: JSON.stringify(body) }, params.company);
}

export async function getInvoice(invoiceId: string, company?: string): Promise<any> {
  return asaasFetch(`/invoices/${invoiceId}`, {}, company);
}

export async function getInvoiceByPayment(paymentId: string, company?: string): Promise<any> {
  return asaasFetch(`/invoices?payment=${paymentId}`, {}, company);
}

export function isAsaasConfigured(): boolean {
  return Object.values(ASAAS_COMPANIES).some(c => !!c.apiKey);
}

export function getAsaasCompanies(): { key: string; name: string; cnpj: string; configured: boolean }[] {
  return Object.entries(ASAAS_COMPANIES).map(([key, val]) => ({
    key,
    name: val.name,
    cnpj: val.cnpj,
    configured: !!val.apiKey,
  }));
}
