import { createClient } from '@supabase/supabase-js';
import { scheduleInvoice, getInvoiceByPayment, getInvoice, cancelInvoice } from './asaasService';

const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 30;
// Quando uma NF fica em SYNCHRONIZED por mais de 6h, o worker assume que a Prefeitura
// está travada e cancela + reagenda — até MAX_SYNC_RETRIES vezes.
const STUCK_HOURS_RETRY = 6;
const STUCK_HOURS_ALERT = 24;
const MAX_SYNC_RETRIES = 3;

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
  number?: string | null;
  amount?: number | null;
  asaas_payment_id: string | null;
  asaas_invoice_id: string | null;
  issuer_company: string | null;
  nf_status: string | null;
  nf_last_error: string | null;
  nf_retry_count: number | null;
  nf_retry_paused: boolean | null;
  nf_retry_at?: string | null;
  created_at?: string | null;
}

const PENDING_NF_STATUSES = ['ERROR', 'FAILED', 'PENDING', 'SCHEDULED', 'RETRY', 'SYNCHRONIZED'];

export async function listPendingNfs(): Promise<PendingInvoice[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    // Busca: faturas com pagamento Asaas, nf_status em estados pendentes OU nulo (faturas
    // antigas que nunca tiveram o ciclo). Filtragem fina (idade, paused, retries) é feita
    // em retryOne para aproveitar a info de dateCreated do Asaas.
    const { data, error } = await sb.from('financial_invoices')
      .select('id, client, number, amount, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_paused, nf_retry_at, created_at')
      .not('asaas_payment_id', 'is', null)
      .or(`nf_status.is.null,nf_status.in.(${PENDING_NF_STATUSES.join(',')})`)
      .or('nf_retry_paused.is.null,nf_retry_paused.eq.false')
      .or(`nf_retry_count.is.null,nf_retry_count.lt.${MAX_RETRIES}`)
      .order('nf_retry_at', { ascending: true, nullsFirst: true })
      .limit(100);
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

// Lista faturas marcadas como STUCK (ou em SYNCHRONIZED há > 24h) — para alerta por email.
export async function listStuckNfs(): Promise<PendingInvoice[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from('financial_invoices')
      .select('id, client, number, amount, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_at, created_at')
      .not('asaas_payment_id', 'is', null)
      .in('nf_status', ['STUCK', 'SYNCHRONIZED'])
      .limit(200);
    if (error) {
      if (error.code === '42703') return [];
      console.log('[NF Retry] erro ao listar stuck:', error.message);
      return [];
    }
    const cutoff = Date.now() - STUCK_HOURS_ALERT * 3600_000;
    return (data || []).filter((r: any) => {
      if (r.nf_status === 'STUCK') return true;
      const ref = r.nf_retry_at || r.created_at;
      if (!ref) return false;
      return new Date(ref).getTime() < cutoff;
    }).map((r: any) => {
      const ref = r.nf_retry_at || r.created_at;
      const hours = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 3600_000) : null;
      return { ...r, hours_stuck: hours };
    }) as any;
  } catch {
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

function ageHoursSince(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return (Date.now() - t) / 3600_000;
}

export async function retryOne(inv: PendingInvoice, opts?: { clientCnpj?: string; serviceDescription?: string }): Promise<{ ok: boolean; status?: string; pdfUrl?: string; number?: string; error?: string; paused?: boolean; action?: string }> {
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
      nf_retry_paused: false,
    });
    return { ok: true, status: 'AUTHORIZED', pdfUrl: currentInvoice.pdfUrl, number: currentInvoice.number, action: 'authorized' };
  }

  // 3) SYNCHRONIZED — checa idade pela data de criação no Asaas (fallback: created_at da fatura)
  if (currentInvoice && currentInvoice.status === 'SYNCHRONIZED') {
    const ageH = ageHoursSince(currentInvoice.dateCreated || currentInvoice.scheduledDate || inv.nf_retry_at || inv.created_at);
    const syncRetries = inv.nf_retry_count || 0;

    // 3a) Travada há mais de 24h — marca STUCK e pausa
    if (ageH >= STUCK_HOURS_ALERT) {
      await markInvoice(inv.id, {
        nf_status: 'STUCK',
        asaas_invoice_id: currentInvoice.id,
        nf_retry_paused: true,
        nf_last_error: `NF em SYNCHRONIZED há ${Math.floor(ageH)}h sem autorização — verifique configuração da empresa emissora no Asaas (Inscrição Municipal / certificado).`.substring(0, 500),
        nf_retry_at: new Date().toISOString(),
      });
      console.log(`[NF Retry] STUCK: fatura ${inv.id} (${inv.client}) travada há ${Math.floor(ageH)}h em ${company || 'default'}`);
      return { ok: false, paused: true, status: 'STUCK', action: 'stuck-alert' };
    }

    // 3b) Engasgada > 6h — cancela e reemite (até MAX_SYNC_RETRIES)
    if (ageH >= STUCK_HOURS_RETRY && syncRetries < MAX_SYNC_RETRIES) {
      let cancelled = false;
      try {
        await cancelInvoice(currentInvoice.id, company);
        cancelled = true;
        console.log(`[NF Retry] cancelada NF engasgada ${currentInvoice.id} (${Math.floor(ageH)}h em SYNCHRONIZED) para reemitir — fatura ${inv.id}`);
      } catch (e: any) {
        // CRÍTICO: se a NF está em "Processando emissão" / status que impede cancelamento,
        // NÃO podemos criar uma nova — risco de NF duplicada quando a original completar.
        // Apenas registramos e aguardamos próximo ciclo.
        console.log(`[NF Retry] não foi possível cancelar ${currentInvoice.id}: ${e.message} — aguardando próximo ciclo (sem criar duplicata).`);
        await markInvoice(inv.id, {
          nf_status: 'SYNCHRONIZED',
          asaas_invoice_id: currentInvoice.id,
          nf_retry_count: nextCount,
          nf_retry_at: new Date().toISOString(),
          nf_last_error: `Cancelamento bloqueado: ${e.message}`.substring(0, 500),
        });
        return { ok: false, status: 'SYNCHRONIZED', action: 'cancel-blocked', error: e.message };
      }
      if (!cancelled) {
        return { ok: false, status: 'SYNCHRONIZED', action: 'cancel-blocked' };
      }
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
          asaas_invoice_id: newInv?.id || null,
          nf_retry_count: nextCount,
          nf_retry_at: new Date().toISOString(),
          nf_last_error: null,
        });
        return { ok: true, status: newInv?.status, action: 'cancel-and-reschedule' };
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

    // 3c) SYNCHRONIZED ainda dentro da janela normal — só registra
    await markInvoice(inv.id, {
      nf_status: 'SYNCHRONIZED',
      asaas_invoice_id: currentInvoice.id,
      nf_retry_count: nextCount,
      nf_retry_at: inv.nf_retry_at || new Date().toISOString(),
    });
    return { ok: false, status: 'SYNCHRONIZED', action: 'wait' };
  }

  // 4) Em andamento legítimo (SCHEDULED, processando cancelamento) — só registra
  if (currentInvoice && ['SCHEDULED', 'PROCESSING_CANCELLATION'].includes(currentInvoice.status)) {
    await markInvoice(inv.id, {
      nf_status: currentInvoice.status,
      asaas_invoice_id: currentInvoice.id,
      nf_retry_count: nextCount,
      nf_retry_at: new Date().toISOString(),
    });
    return { ok: false, status: currentInvoice.status, action: 'wait' };
  }

  // 5) Erro permanente (validação) — pausa
  const errMsg = currentInvoice?.errorMessages || currentInvoice?.error || inv.nf_last_error || '';
  if (isNonRetryable(errMsg)) {
    await markInvoice(inv.id, {
      nf_status: 'ERROR',
      nf_retry_paused: true,
      nf_last_error: String(errMsg).substring(0, 500),
      nf_retry_at: new Date().toISOString(),
    });
    return { ok: false, paused: true, error: errMsg, action: 'paused-validation' };
  }

  // 6) Erro transitório / sem NF ainda — re-agenda
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
    return { ok: true, status: newInv?.status, action: 'scheduled' };
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

export async function runRetryCycle(): Promise<{ processed: number; ok: number; paused: number; errors: number; stuck: number }> {
  const pending = await listPendingNfs();
  let ok = 0, paused = 0, errors = 0, stuck = 0;
  for (const inv of pending) {
    const res = await retryOne(inv);
    if (res.ok) ok++;
    else if (res.action === 'stuck-alert') stuck++;
    else if (res.paused) paused++;
    else errors++;
    await new Promise(r => setTimeout(r, 800));
  }
  if (pending.length > 0) {
    console.log(`[NF Retry] ciclo concluído — ${pending.length} processadas | ${ok} ok | ${paused} pausadas | ${stuck} STUCK | ${errors} erros`);
  }
  return { processed: pending.length, ok, paused, errors, stuck };
}

let workerStarted = false;
export function startNfRetryWorker() {
  if (workerStarted) return;
  workerStarted = true;
  console.log(`[NF Retry] worker ativo — ciclo a cada ${RETRY_INTERVAL_MS / 60000} min (cancela SYNC>${STUCK_HOURS_RETRY}h, alerta SYNC>${STUCK_HOURS_ALERT}h)`);
  setTimeout(() => { runRetryCycle().catch(e => console.log('[NF Retry] erro:', e.message)); }, 60_000);
  setInterval(() => { runRetryCycle().catch(e => console.log('[NF Retry] erro:', e.message)); }, RETRY_INTERVAL_MS);
}
