const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

const ASAAS_COMPANIES: Record<string, { apiKey: string; cnpj: string; name: string }> = {
  'TM GESTÃO': {
    apiKey: process.env.ASAAS_API_KEY || '',
    cnpj: '60485843000157',
    name: 'TM GESTÃO',
  },
  'TM SECURITY': {
    apiKey: process.env.ASAAS_API_KEY_TMSECURITY || '',
    cnpj: '60508931000127',
    name: 'TM SECURITY GESTÃO CORPORATIVA LTDA',
  },
};

function resolveApiKey(company?: string): string {
  if (company) {
    const upper = company.toUpperCase();
    for (const [key, val] of Object.entries(ASAAS_COMPANIES)) {
      if (upper.includes(key) || upper.includes(val.cnpj) || val.name.toUpperCase().includes(upper)) {
        return val.apiKey;
      }
    }
  }
  return ASAAS_COMPANIES['TM GESTÃO'].apiKey;
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
}): Promise<AsaasCustomer> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = params.email && emailRegex.test(params.email.trim()) ? params.email.trim() : undefined;
  return asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      cpfCnpj: params.cpfCnpj.replace(/\D/g, ''),
      email: validEmail,
      phone: params.phone || undefined,
      externalReference: params.externalReference || undefined,
      notificationDisabled: false,
    }),
  }, params.company);
}

export async function findOrCreateCustomer(params: {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  company?: string;
}): Promise<AsaasCustomer> {
  const existing = await findCustomerByCpfCnpj(params.cpfCnpj, params.company);
  if (existing) return existing;
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
