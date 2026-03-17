const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';
const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

const headers = () => ({
  'Content-Type': 'application/json',
  'access_token': ASAAS_API_KEY,
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

async function asaasFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada');
  const url = `${ASAAS_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.errors?.map((e: any) => e.description).join('; ') || data.message || JSON.stringify(data);
    throw new Error(`Asaas API Error (${res.status}): ${errMsg}`);
  }
  return data;
}

export async function findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
  const clean = cpfCnpj.replace(/\D/g, '');
  const data = await asaasFetch(`/customers?cpfCnpj=${clean}`);
  return data.data?.length > 0 ? data.data[0] : null;
}

export async function createCustomer(params: {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  externalReference?: string;
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
  });
}

export async function findOrCreateCustomer(params: {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
}): Promise<AsaasCustomer> {
  const existing = await findCustomerByCpfCnpj(params.cpfCnpj);
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
  });
}

export async function getPaymentPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return asaasFetch(`/payments/${paymentId}/pixQrCode`);
}

export async function getPaymentBankSlip(paymentId: string): Promise<AsaasBankSlip> {
  return asaasFetch(`/payments/${paymentId}/identificationField`);
}

export async function getPayment(paymentId: string): Promise<AsaasPayment> {
  return asaasFetch(`/payments/${paymentId}`);
}

export async function listPayments(params?: {
  customer?: string;
  status?: string;
  externalReference?: string;
  offset?: number;
  limit?: number;
}): Promise<{ data: AsaasPayment[]; totalCount: number }> {
  const query = new URLSearchParams();
  if (params?.customer) query.set('customer', params.customer);
  if (params?.status) query.set('status', params.status);
  if (params?.externalReference) query.set('externalReference', params.externalReference);
  query.set('offset', String(params?.offset || 0));
  query.set('limit', String(params?.limit || 50));
  return asaasFetch(`/payments?${query.toString()}`);
}

export async function deletePayment(paymentId: string): Promise<any> {
  return asaasFetch(`/payments/${paymentId}`, { method: 'DELETE' });
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
  return !!ASAAS_API_KEY;
}
