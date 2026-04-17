import { createClient } from '@supabase/supabase-js';
import { scheduleInvoice, getInvoiceByPayment, getInvoice } from './asaasService';

const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 30;
const NON_RETRYABLE_PATTERNS = [
  /NFe003/i,
  /descri[cç][aã]o do servi[cç]o/i,
  /descri[cç][aã]o municipal/i,
  /CNPJ inv[aá]lido/i,
  /endere[cç]o.*incompleto/i,
  /CEP.*inv[aá]lido/i,
];

function isNonRetryable(errorMessage: string): boolean {
  if (!errorMessage) return false;
  return NON_RETRYABLE_PATTERNS.some(rx => rx.test(errorMessage));
}

function getSupabase() {
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!sbUrl || !sbKey) return null;
  return createClient(sbUrl, sbKey);
}

interface PendingInvoice {
  id: string;
  client: string;
  asaas_payment_id: string | null;
  asaas_invoice_id: string | null;
  issuer_company: string | null;
  nf_status: string | null;
  nf_last_error: string | null;
  nf_retry_count: number | null;
  nf_retry_paused: boolean | null;
}

export async function listPendingNfs(): Promise<PendingInvoice[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from('financial_invoices')
      .select('id, client, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_paused')
      .not('asaas_payment_id', 'is', null)
      .in('nf_status', ['ERROR', 'FAILED', 'PENDING', 'SCHEDULED', 'RETRY'])
      .or('nf_retry_paused.is.null,nf_retry_paused.eq.false')
      .lt('nf_retry_count', MAX_RETRIES)
      .order('nf_retry_at', { ascending: true, nullsFirst: true })
      .limit(50);
    if (error) {
      if (error.code === '42703') {
        console.log('[NF Retry] colunas nf_status/nf_retry_* ainda não existem no Supabase — ignore por enquanto.');
        return [];
      }
      console.log('[NF Retry] erro ao listar pendentes:', error.message);
      return [];
    }
    return (data || []) as PendingInvoice[];
  } catch (e: any) {
    console.log('[NF Retry] exceção:', e.message);
    return [];
  }
}

async function markInvoice(id: string, patch: Record<string, any>) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('financial_invoices').update(patch).eq('id', id);
  } catch (e: any) {
    if (e?.code !== '42703') console.log('[NF Retry] erro ao gravar status:', e.message);
  }
}

export async function retryOne(inv: PendingInvoice, opts?: { clientCnpj?: string; serviceDescription?: string }): Promise<{ ok: boolean; status?: string; pdfUrl?: string; number?: string; error?: string; paused?: boolean }> {
  const company = inv.issuer_company || undefined;
  const paymentId = inv.asaas_payment_id!;
  const nextCount = (inv.nf_retry_count || 0) + 1;

  // 1) Verifica estado atual no Asaas
  let currentInvoice: any = null;
  try {
    if (inv.asaas_invoice_id) {
      currentInvoice = await getInvoice(inv.asaas_invoice_id, company);
    } else {
      const list = await getInvoiceByPayment(paymentId, company);
      const items = list?.data || (Array.isArray(list) ? list : []);
      currentInvoice = items.find((n: any) => n.status === 'AUTHORIZED' || n.pdfUrl) || items[0] || null;
    }
  } catch (e: any) {
    await markInvoice(inv.id, { nf_retry_count: nextCount, nf_retry_at: new Date().toISOString(), nf_last_error: e.message });
    return { ok: false, error: e.message };
  }

  // 2) Já autorizada — só atualiza
  if (currentInvoice?.status === 'AUTHORIZED' || currentInvoice?.pdfUrl) {
    await markInvoice(inv.id, {
      nf_status: 'AUTHORIZED',
      nf_number: currentInvoice.number || null,
      asaas_invoice_id: currentInvoice.id,
      asaas_invoice_url: currentInvoice.pdfUrl || null,
      nf_image_url: currentInvoice.pdfUrl || null,
      nf_last_error: null,
      nf_retry_at: new Date().toISOString(),
    });
    return { ok: true, status: 'AUTHORIZED', pdfUrl: currentInvoice.pdfUrl, number: currentInvoice.number };
  }

  // 3) Em andamento legítimo — só registra e aguarda
  if (currentInvoice && ['SCHEDULED', 'PROCESSING_CANCELLATION', 'SYNCHRONIZED'].includes(currentInvoice.status)) {
    await markInvoice(inv.id, {
      nf_status: currentInvoice.status,
      asaas_invoice_id: currentInvoice.id,
      nf_retry_count: nextCount,
      nf_retry_at: new Date().toISOString(),
    });
    return { ok: false, status: currentInvoice.status };
  }

  // 4) Erro permanente (validação) — pausa
  const errMsg = currentInvoice?.errorMessages || currentInvoice?.error || inv.nf_last_error || '';
  if (isNonRetryable(errMsg)) {
    await markInvoice(inv.id, {
      nf_status: 'ERROR',
      nf_retry_paused: true,
      nf_last_error: String(errMsg).substring(0, 500),
      nf_retry_at: new Date().toISOString(),
    });
    return { ok: false, paused: true, error: errMsg };
  }

  // 5) Erro transitório — re-agenda
  try {
    const newInv = await scheduleInvoice({
      paymentId,
      company,
      clientCnpj: opts?.clientCnpj,
      clientName: inv.client,
      serviceDescription: opts?.serviceDescription,
    });
    await markInvoice(inv.id, {
      nf_status: newInv?.status || 'SCHEDULED',
      asaas_invoice_id: newInv?.id || inv.asaas_invoice_id,
      nf_retry_count: nextCount,
      nf_retry_at: new Date().toISOString(),
      nf_last_error: null,
    });
    return { ok: true, status: newInv?.status };
  } catch (e: any) {
    const msg = e.message || String(e);
    const paused = isNonRetryable(msg);
    await markInvoice(inv.id, {
      nf_status: 'ERROR',
      nf_retry_count: nextCount,
      nf_retry_at: new Date().toISOString(),
      nf_last_error: msg.substring(0, 500),
      nf_retry_paused: paused,
    });
    return { ok: false, error: msg, paused };
  }
}

export async function runRetryCycle(): Promise<{ processed: number; ok: number; paused: number; errors: number }> {
  const pending = await listPendingNfs();
  let ok = 0, paused = 0, errors = 0;
  for (const inv of pending) {
    const res = await retryOne(inv);
    if (res.ok) ok++;
    else if (res.paused) paused++;
    else errors++;
    await new Promise(r => setTimeout(r, 800));
  }
  if (pending.length > 0) {
    console.log(`[NF Retry] ciclo concluído — ${pending.length} processadas | ${ok} ok | ${paused} pausadas | ${errors} erros`);
  }
  return { processed: pending.length, ok, paused, errors };
}

let workerStarted = false;
export function startNfRetryWorker() {
  if (workerStarted) return;
  workerStarted = true;
  console.log(`[NF Retry] worker ativo — ciclo a cada ${RETRY_INTERVAL_MS / 60000} min`);
  setTimeout(() => { runRetryCycle().catch(e => console.log('[NF Retry] erro:', e.message)); }, 60_000);
  setInterval(() => { runRetryCycle().catch(e => console.log('[NF Retry] erro:', e.message)); }, RETRY_INTERVAL_MS);
}
