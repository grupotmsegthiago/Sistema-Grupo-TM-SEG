import { scheduleInvoice, getInvoiceByPayment, getInvoice, cancelInvoice } from './asaasService';
import { createSupabaseAdminClient } from './supabaseConfig';
import {
  consultNfseByIntegration,
  consultNfseById,
  cancelNfse as plugCancelNfse,
  issueNfse as plugIssueNfse,
  mapPlugNotasStatusToNf,
  extractPlugNotasError,
  isPlugNotasConfigured,
  getNfsePdfUrl as plugGetPdfUrl,
} from './plugnotasService';
import { isNfSchedulePendingMessage, isNonRetryable } from '../lib/nfRetryGuards';

const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 30;
// Quando uma NF fica em SYNCHRONIZED por mais de 6h, o worker assume que a Prefeitura
// está travada e cancela + reagenda — até MAX_SYNC_RETRIES vezes.
const STUCK_HOURS_RETRY = 6;
const STUCK_HOURS_ALERT = 24;
const MAX_SYNC_RETRIES = 3;

// Extrai uma string de erro a partir do payload do Asaas.
// `errorMessages` pode ser array [{code, description}], string ou ausente.
// Também usa `statusDescription` (mensagem da Prefeitura) como fallback rico.
function extractAsaasErrorText(invoice: any): string {
  if (!invoice) return '';
  const parts: string[] = [];
  if (invoice.statusDescription) parts.push(String(invoice.statusDescription));
  const em = invoice.errorMessages;
  if (Array.isArray(em)) {
    for (const e of em) {
      if (typeof e === 'string') parts.push(e);
      else if (e && (e.description || e.code)) parts.push([e.code, e.description].filter(Boolean).join(': '));
    }
  } else if (typeof em === 'string' && em) {
    parts.push(em);
  }
  if (invoice.error && typeof invoice.error === 'string') parts.push(invoice.error);
  return parts.join(' | ').substring(0, 500);
}

function getSupabase() {
  return createSupabaseAdminClient();
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
  nf_provider?: string | null;
  plugnotas_invoice_id?: string | null;
  plugnotas_protocol?: string | null;
  notes?: string | null;
  description?: string | null;
}

/** Extrai discriminação NF + CNAE das notes da fatura (gravadas no create-charge). */
function parseInvoiceNfMeta(inv: PendingInvoice): {
  serviceDescription?: string;
  observations?: string;
  municipalServiceCode?: string;
  municipalServiceName?: string;
} {
  const notes = String(inv.notes || inv.description || '').trim();
  if (!notes) return {};
  const lines = notes.split('\n').map((l) => l.trim()).filter(Boolean);
  const main = lines.find((l) => !/^Ref\.\s*rastreio:/i.test(l) && !/^CNAE\//i.test(l));
  const cnaeLine = lines.find((l) => /^CNAE\//i.test(l)) || '';
  const codeMatch = cnaeLine.match(/(\d{4,6})/);
  const nameMatch = cnaeLine.match(/—\s*(.+)$/);
  return {
    serviceDescription: main || undefined,
    observations: notes.slice(0, 500),
    municipalServiceCode: codeMatch?.[1],
    municipalServiceName: nameMatch?.[1]?.trim(),
  };
}

// PROCESSING é o estado inicial de NFs PlugNotas (a Prefeitura ainda não devolveu
// AUTORIZADA/REJEITADA). Sem ele, faturas PlugNotas recém-emitidas nunca entrariam
// no ciclo do watchdog (nem no escalonamento >6h/>24h).
const PENDING_NF_STATUSES = ['ERROR', 'FAILED', 'PENDING', 'PROCESSING', 'SCHEDULED', 'RETRY', 'SYNCHRONIZED'];

export async function listPendingNfs(): Promise<PendingInvoice[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    // Busca: faturas com pagamento Asaas, nf_status em estados pendentes OU nulo (faturas
    // antigas que nunca tiveram o ciclo). Filtragem fina (idade, paused, retries) é feita
    // em retryOne para aproveitar a info de dateCreated do Asaas.
    // Só pega faturas com algum identificador de NF/provider — evita varrer milhares
    // de faturas legacy sem cobrança Asaas nem NF PlugNotas e saturar o ciclo.
    const { data, error } = await sb.from('financial_invoices')
      .select('id, client, number, amount, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_paused, nf_retry_at, created_at, nf_provider, plugnotas_invoice_id, plugnotas_protocol, notes')
      .or('asaas_payment_id.not.is.null,plugnotas_invoice_id.not.is.null')
      .or(`nf_status.is.null,nf_status.in.(${PENDING_NF_STATUSES.join(',')})`)
      .or('nf_retry_paused.is.null,nf_retry_paused.eq.false')
      .or(`nf_retry_count.is.null,nf_retry_count.lt.${MAX_RETRIES}`)
      .order('nf_retry_at', { ascending: true, nullsFirst: true })
      .limit(100);
    if (error) {
      // 42703 em coluna legítima (ex.: description inexistente) não deve zerar a fila.
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
      .select('id, client, number, amount, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_at, created_at, nf_provider, plugnotas_invoice_id')
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

interface NfHistoryEntry {
  ts: string;
  action: string;
  status?: string | null;
  message?: string | null;
}

const HISTORY_MAX_ENTRIES = 50;
let nfHistoryColumnReady: boolean | null = null;

async function ensureNfHistoryColumn(sb: any): Promise<boolean> {
  if (nfHistoryColumnReady !== null) return nfHistoryColumnReady;
  try {
    const { error } = await sb.from('financial_invoices').select('nf_history').limit(1);
    if (!error) { nfHistoryColumnReady = true; return true; }
    if (error.code !== '42703') { nfHistoryColumnReady = true; return true; }
  } catch {}
  try {
    await sb.rpc('exec_sql', { sql: "ALTER TABLE financial_invoices ADD COLUMN IF NOT EXISTS nf_history JSONB DEFAULT '[]'::jsonb;" });
    nfHistoryColumnReady = true;
    console.log('[NF Retry] coluna nf_history criada (ou já existia).');
    return true;
  } catch (e: any) {
    console.log('[NF Retry] não foi possível criar nf_history (siga manual via Supabase SQL Editor):', e?.message || e);
    nfHistoryColumnReady = false;
    return false;
  }
}

async function markInvoice(id: string, patch: Record<string, any>, history?: { action: string; status?: string | null; message?: string | null }) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    let finalPatch: Record<string, any> = patch;
    if (history) {
      const hasCol = await ensureNfHistoryColumn(sb);
      if (hasCol) {
        try {
          const { data } = await sb.from('financial_invoices').select('nf_history').eq('id', id).maybeSingle();
          const existing: NfHistoryEntry[] = Array.isArray((data as any)?.nf_history) ? (data as any).nf_history : [];
          const entry: NfHistoryEntry = {
            ts: new Date().toISOString(),
            action: history.action,
            status: history.status || null,
            message: history.message ? String(history.message).substring(0, 500) : null,
          };
          finalPatch = { ...patch, nf_history: [...existing, entry].slice(-HISTORY_MAX_ENTRIES) };
        } catch (e: any) {
          if (e?.code !== '42703') console.log('[NF Retry] erro ao montar histórico:', e.message);
        }
      }
    }
    const { error } = await sb.from('financial_invoices').update(finalPatch).eq('id', id);
    if (error && error.code === '42703' && (finalPatch as any).nf_history) {
      const { nf_history, ...rest } = finalPatch as any;
      await sb.from('financial_invoices').update(rest).eq('id', id);
    } else if (error && error.code !== '42703') {
      console.log('[NF Retry] erro ao gravar status:', error.message);
    }
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

async function retryOnePlugNotas(inv: PendingInvoice): Promise<{ ok: boolean; status?: string; pdfUrl?: string; number?: string; error?: string; paused?: boolean; action?: string }> {
  if (!isPlugNotasConfigured()) {
    return { ok: false, error: 'PlugNotas não configurado — defina o token.' };
  }
  if (!inv.plugnotas_invoice_id) {
    await markInvoice(inv.id, {
      nf_status: 'ERROR',
      nf_retry_paused: true,
      nf_last_error: 'NF marcada como PLUGNOTAS mas sem plugnotas_invoice_id — reemita pelo botão.',
      nf_retry_at: new Date().toISOString(),
    }, { action: 'paused-validation', status: 'ERROR', message: 'PLUGNOTAS sem ID — pausada.' });
    return { ok: false, paused: true, action: 'paused-validation' };
  }
  let current: any;
  // O plugnotas_invoice_id pode ser tanto o "id" interno do PlugNotas (vindo do
  // webhook ou da emissão sync) quanto o idIntegracao "inv-<uuid>-<ts>" salvo
  // como fallback quando a emissão não devolveu o id imediato. Usamos o
  // endpoint correto para cada formato.
  const lookupId = inv.plugnotas_invoice_id;
  const isIdIntegracao = typeof lookupId === 'string' && /^inv-/i.test(lookupId);
  try {
    current = isIdIntegracao
      ? await consultNfseByIntegration(lookupId)
      : await consultNfseById(lookupId);
  } catch (e: any) {
    await markInvoice(inv.id, { nf_retry_at: new Date().toISOString(), nf_last_error: String(e.message).substring(0, 500) }, { action: 'lookup-error', message: e.message });
    return { ok: false, error: e.message };
  }
  const status = mapPlugNotasStatusToNf(current?.status || current?.situacao);
  if (status === 'AUTHORIZED') {
    const realId = current?.id || current?._id || inv.plugnotas_invoice_id;
    // Fallback: se a Prefeitura/PlugNotas ainda não devolveu linkPdf, monta a
    // URL canônica de PDF por id (endpoint público autenticado por token).
    const pdfUrl = current?.linkPdf || current?.pdfUrl || (realId && !/^inv-/i.test(realId) ? await plugGetPdfUrl(realId) : null);
    // Só persiste em nf_image_url quando temos URL consumível (http/https).
    // Caso contrário deixa null — webhook/próxima consulta atualiza quando
    // a Prefeitura retornar o linkPdf real (evita gravar id "inv-..." num campo de URL).
    const consumablePdf = pdfUrl && /^https?:\/\//i.test(String(pdfUrl)) ? pdfUrl : null;
    await markInvoice(inv.id, {
      nf_status: 'AUTHORIZED',
      nf_number: current?.numero || current?.number || inv.number,
      nf_image_url: consumablePdf,
      plugnotas_invoice_id: realId,
      plugnotas_protocol: current?.protocoloPrefeitura?.numero || current?.protocolo || null,
      nf_last_error: null,
      nf_retry_at: new Date().toISOString(),
      nf_retry_paused: false,
    }, { action: 'authorized', status: 'AUTHORIZED', message: `NF PlugNotas autorizada${current?.numero ? ` (Nº ${current.numero})` : ''}` });
    return { ok: true, status: 'AUTHORIZED', pdfUrl, number: current?.numero, action: 'authorized' };
  }
  if (status === 'ERROR') {
    const errMsg = extractPlugNotasError(current) || 'Rejeitada na Prefeitura';
    const retries = inv.nf_retry_count || 0;
    if (retries >= MAX_SYNC_RETRIES || isNonRetryable(errMsg)) {
      await markInvoice(inv.id, {
        nf_status: 'ERROR',
        nf_retry_paused: true,
        nf_last_error: errMsg.substring(0, 500),
        nf_retry_at: new Date().toISOString(),
      }, { action: 'paused-validation', status: 'ERROR', message: `PlugNotas pausada: ${errMsg}` });
      return { ok: false, paused: true, error: errMsg, action: 'paused-validation' };
    }
    await markInvoice(inv.id, {
      nf_status: 'ERROR',
      nf_last_error: errMsg.substring(0, 500),
      nf_retry_at: new Date().toISOString(),
    }, { action: 'schedule-failed', status: 'ERROR', message: errMsg });
    return { ok: false, error: errMsg };
  }
  const ageH = ageHoursSince(inv.nf_retry_at || inv.created_at);
  // Janela 6h–24h: assume que a Prefeitura travou e tenta cancelar+reemitir,
  // respeitando MAX_SYNC_RETRIES (igual ao caminho Asaas).
  if ((status === 'PROCESSING' || status === 'SCHEDULED' || status === 'SYNCHRONIZED') && ageH >= STUCK_HOURS_RETRY && ageH < STUCK_HOURS_ALERT) {
    const retries = inv.nf_retry_count || 0;
    if (retries >= MAX_SYNC_RETRIES) {
      await markInvoice(inv.id, {
        nf_status: 'STUCK',
        nf_retry_paused: true,
        nf_last_error: `NF PlugNotas travada em ${status} há ${Math.floor(ageH)}h após ${retries} tentativas — verifique o painel PlugNotas.`,
        nf_retry_at: new Date().toISOString(),
      }, { action: 'stuck-alert', status: 'STUCK', message: `PlugNotas: limite de ${MAX_SYNC_RETRIES} reemissões atingido em ${Math.floor(ageH)}h.` });
      return { ok: false, paused: true, status: 'STUCK', action: 'stuck-alert' };
    }
    // Tenta cancelar a NF travada (idempotente: se já estiver cancelada/inexistente, segue)
    try {
      const realId = current?.id || current?._id || (isIdIntegracao ? null : inv.plugnotas_invoice_id);
      if (realId) {
        await plugCancelNfse(realId, 'Reemissão automática — NF travada na Prefeitura');
        console.log(`[NF Retry][PlugNotas] cancel ok para ${realId} (fatura ${inv.id})`);
      }
    } catch (cancelErr: any) {
      console.log(`[NF Retry][PlugNotas] cancel falhou para fatura ${inv.id} (seguindo com reemissão): ${cancelErr.message}`);
    }
    // Reemite — busca dados de cliente/empresa via Supabase
    try {
      const sb = getSupabase();
      let clientCnpj: string | undefined;
      let clientName: string = inv.client || 'Cliente';
      let clientEmail: string | undefined;
      let serviceDescription: string | undefined;
      if (sb && inv.client) {
        const { data: clientRow } = await sb.from('clients').select('name, trading_name, cnpj, medicao_email, email').or(`name.eq.${inv.client},trading_name.eq.${inv.client}`).limit(1).maybeSingle();
        if (clientRow) {
          clientCnpj = (clientRow as any).cnpj || undefined;
          clientName = (clientRow as any).trading_name || (clientRow as any).name || clientName;
          clientEmail = (clientRow as any).medicao_email || (clientRow as any).email || undefined;
        }
      }
      const reissued = await plugIssueNfse({
        invoiceId: inv.id,
        amount: Number(inv.amount || 0),
        company: inv.issuer_company || undefined,
        clientCnpj,
        clientName,
        clientEmail,
        serviceDescription,
        externalReference: inv.id,
      });
      const newId = reissued.plugnotasId || reissued.idIntegracao;
      await markInvoice(inv.id, {
        nf_status: reissued.status || 'PROCESSING',
        plugnotas_invoice_id: newId,
        plugnotas_protocol: reissued.protocol || null,
        nf_retry_count: retries + 1,
        nf_retry_at: new Date().toISOString(),
        nf_last_error: null,
      }, { action: 'cancel-and-reschedule', status: reissued.status || 'PROCESSING', message: `PlugNotas reemitida após ${Math.floor(ageH)}h (tentativa ${retries + 1}/${MAX_SYNC_RETRIES}). Novo id ${newId}.` });
      return { ok: true, status: reissued.status, action: 'cancel-and-reschedule' };
    } catch (reissueErr: any) {
      const msg = reissueErr.message || 'Falha ao reemitir NF PlugNotas';
      await markInvoice(inv.id, {
        nf_status: 'ERROR',
        nf_last_error: msg.substring(0, 500),
        nf_retry_count: retries + 1,
        nf_retry_at: new Date().toISOString(),
      }, { action: 'schedule-failed', status: 'ERROR', message: `PlugNotas reemissão falhou (${retries + 1}/${MAX_SYNC_RETRIES}): ${msg}` });
      return { ok: false, error: msg, action: 'schedule-failed' };
    }
  }
  if ((status === 'PROCESSING' || status === 'SCHEDULED' || status === 'SYNCHRONIZED') && ageH >= STUCK_HOURS_ALERT) {
    await markInvoice(inv.id, {
      nf_status: 'STUCK',
      nf_retry_paused: true,
      nf_last_error: `NF PlugNotas em ${status} há ${Math.floor(ageH)}h — verifique o painel PlugNotas.`,
      nf_retry_at: new Date().toISOString(),
    }, { action: 'stuck-alert', status: 'STUCK', message: `PlugNotas travada há ${Math.floor(ageH)}h em ${status}.` });
    return { ok: false, paused: true, status: 'STUCK', action: 'stuck-alert' };
  }
  // IMPORTANTE: NÃO atualiza nf_retry_at aqui. Esse campo serve como "início
  // do ciclo de espera" — se for sobrescrito a cada polling, ageH nunca atinge
  // os limites STUCK_HOURS_RETRY (6h) e STUCK_HOURS_ALERT (24h) e o
  // escalonamento PlugNotas nunca dispara. Apenas o nf_status é refrescado
  // para refletir a transição entre PROCESSING/SCHEDULED/SYNCHRONIZED.
  await markInvoice(inv.id, {
    nf_status: status || 'PROCESSING',
  });
  return { ok: false, status, action: 'wait' };
}

export async function retryOne(inv: PendingInvoice, opts?: { clientCnpj?: string; serviceDescription?: string }): Promise<{ ok: boolean; status?: string; pdfUrl?: string; number?: string; error?: string; paused?: boolean; action?: string }> {
  // Inferência de provider: usa nf_provider explícito; caso esteja vazio mas
  // exista plugnotas_invoice_id, assume PlugNotas (cobre faturas legadas
  // criadas antes do roteador, que ficaram com nf_provider null).
  const explicit = (inv.nf_provider || '').toUpperCase();
  const provider = explicit || ((inv as any).plugnotas_invoice_id ? 'PLUGNOTAS' : 'ASAAS');
  if (provider === 'PLUGNOTAS') {
    return retryOnePlugNotas(inv);
  }
  if (!inv.asaas_payment_id) {
    return { ok: false, error: 'Fatura sem asaas_payment_id e provider != PLUGNOTAS.' };
  }
  const company = inv.issuer_company || undefined;
  const paymentId = inv.asaas_payment_id!;
  // Notes da fatura → discriminação da NF (igual ao modal de emissão).
  // NÃO selecionar coluna `description` — não existe em financial_invoices (42703).
  if (!inv.notes) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data: full } = await sb
          .from('financial_invoices')
          .select('notes')
          .eq('id', inv.id)
          .maybeSingle();
        if (full) {
          inv.notes = (full as any).notes || null;
        }
      }
    } catch {
      /* best-effort */
    }
  }
  const nfMeta = parseInvoiceNfMeta(inv);
  const scheduleOpts = {
    paymentId,
    company,
    clientCnpj: opts?.clientCnpj,
    clientName: inv.client,
    serviceDescription: opts?.serviceDescription || nfMeta.serviceDescription,
    observations: nfMeta.observations,
    municipalServiceCode: nfMeta.municipalServiceCode,
    municipalServiceName: nfMeta.municipalServiceName,
  };
  // IMPORTANTE: nf_retry_count conta APENAS tentativas reais de reemissão
  // (scheduleInvoice ou cancel+reschedule). Polling passivo (SYNCHRONIZED em
  // janela normal, SCHEDULED, PROCESSING_CANCELLATION) NÃO incrementa o
  // contador — caso contrário o limite de 3 reemissões em SYNC seria atingido
  // só com polling, e a escalação para STUCK em 24h ficaria bloqueada.
  const reissueCount = (inv.nf_retry_count || 0) + 1;

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
    // Falha de comunicação/consulta — não incrementa contador (não é tentativa real de reemissão).
    await markInvoice(inv.id, { nf_retry_at: new Date().toISOString(), nf_last_error: e.message.substring(0, 500) }, { action: 'lookup-error', message: e.message });
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
    }, { action: 'authorized', status: 'AUTHORIZED', message: currentInvoice.number ? `NF nº ${currentInvoice.number} autorizada` : 'NF autorizada' });
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
      }, { action: 'stuck-alert', status: 'STUCK', message: `Travada há ${Math.floor(ageH)}h em SYNCHRONIZED (${company || 'default'}) — pausada para verificação manual.` });
      console.log(`[NF Retry] STUCK: fatura ${inv.id} (${inv.client}) travada há ${Math.floor(ageH)}h em ${company || 'default'}`);
      return { ok: false, paused: true, status: 'STUCK', action: 'stuck-alert' };
    }

    // 3b) Engasgada > 6h — cancela e reemite (até MAX_SYNC_RETRIES tentativas REAIS de reemissão)
    if (ageH >= STUCK_HOURS_RETRY && syncRetries < MAX_SYNC_RETRIES) {
      let cancelled = false;
      try {
        await cancelInvoice(currentInvoice.id, company);
        cancelled = true;
        console.log(`[NF Retry] cancelada NF engasgada ${currentInvoice.id} (${Math.floor(ageH)}h em SYNCHRONIZED) para reemitir — fatura ${inv.id}`);
      } catch (e: any) {
        // CRÍTICO: se a NF está em "Processando emissão" / status que impede cancelamento,
        // NÃO podemos criar uma nova — risco de NF duplicada quando a original completar.
        // Apenas registramos e aguardamos próximo ciclo. NÃO incrementa contador
        // (não foi tentativa real de reemissão — foi bloqueada antes).
        console.log(`[NF Retry] não foi possível cancelar ${currentInvoice.id}: ${e.message} — aguardando próximo ciclo (sem criar duplicata).`);
        await markInvoice(inv.id, {
          nf_status: 'SYNCHRONIZED',
          asaas_invoice_id: currentInvoice.id,
          nf_retry_at: new Date().toISOString(),
          nf_last_error: `Cancelamento bloqueado: ${e.message}`.substring(0, 500),
        }, { action: 'cancel-blocked', status: 'SYNCHRONIZED', message: `Não foi possível cancelar NF travada: ${e.message}` });
        return { ok: false, status: 'SYNCHRONIZED', action: 'cancel-blocked', error: e.message };
      }
      if (!cancelled) {
        return { ok: false, status: 'SYNCHRONIZED', action: 'cancel-blocked' };
      }
      try {
        const newInv = await scheduleInvoice(scheduleOpts);
        // Tentativa REAL de reemissão concluída — incrementa contador.
        await markInvoice(inv.id, {
          nf_status: newInv?.status || 'SCHEDULED',
          asaas_invoice_id: newInv?.id || null,
          nf_retry_count: reissueCount,
          nf_retry_at: new Date().toISOString(),
          nf_last_error: null,
        }, { action: 'cancel-and-reschedule', status: newInv?.status || 'SCHEDULED', message: `Tentativa ${reissueCount}/${MAX_SYNC_RETRIES}: NF cancelada (engasgada há ${Math.floor(ageH)}h) e reagendada.` });
        return { ok: true, status: newInv?.status, action: 'cancel-and-reschedule' };
      } catch (e: any) {
        const msg = e.message || String(e);
        const paused = isNonRetryable(msg);
        // Reemissão tentada e falhou — também conta.
        await markInvoice(inv.id, {
          nf_status: 'ERROR',
          nf_retry_count: reissueCount,
          nf_retry_at: new Date().toISOString(),
          nf_last_error: msg.substring(0, 500),
          nf_retry_paused: paused,
        }, { action: 'cancel-and-reschedule-failed', status: 'ERROR', message: `Tentativa ${reissueCount}/${MAX_SYNC_RETRIES} falhou: ${msg}${paused ? ' (pausada)' : ''}` });
        return { ok: false, error: msg, paused };
      }
    }

    // 3c) SYNCHRONIZED ainda dentro da janela normal — só registra estado.
    // NÃO incrementa contador: é polling passivo, e bloquearia a escalação para STUCK em 24h.
    // Limpa nf_last_error stale (ex.: 401 antigo) — a NF já existe no Asaas.
    await markInvoice(inv.id, {
      nf_status: 'SYNCHRONIZED',
      asaas_invoice_id: currentInvoice.id,
      nf_retry_at: inv.nf_retry_at || new Date().toISOString(),
      nf_last_error: null,
      nf_retry_paused: false,
    });
    return { ok: false, status: 'SYNCHRONIZED', action: 'wait' };
  }

  // 4) Em andamento legítimo (SCHEDULED, processando cancelamento) — só registra estado.
  // NÃO incrementa contador (polling passivo).
  if (currentInvoice && ['SCHEDULED', 'PROCESSING_CANCELLATION'].includes(currentInvoice.status)) {
    await markInvoice(inv.id, {
      nf_status: currentInvoice.status,
      asaas_invoice_id: currentInvoice.id,
      nf_retry_at: new Date().toISOString(),
      nf_last_error: null,
      nf_retry_paused: false,
    });
    return { ok: false, status: currentInvoice.status, action: 'wait' };
  }

  // 4b) Asaas marcou a NF como ERROR (rejeitada pela Prefeitura).
  // Sem tratar isso, o worker tenta criar uma nova e bate em
  // "Já existe uma nota fiscal agendada para essa cobrança." — loop.
  // Se for erro permanente (NFe003, Inscrição Municipal, etc.) → pausa.
  // Se for transitório (prefeitura sobrecarregada, timeout, etc.) → cancela
  // a NF errada e reagenda, respeitando MAX_SYNC_RETRIES.
  if (currentInvoice && currentInvoice.status === 'ERROR') {
    const asaasErr = extractAsaasErrorText(currentInvoice) || inv.nf_last_error || '';
    const errorRetries = inv.nf_retry_count || 0;
    if (isNonRetryable(asaasErr)) {
      await markInvoice(inv.id, {
        nf_status: 'ERROR',
        asaas_invoice_id: currentInvoice.id,
        nf_retry_paused: true,
        nf_last_error: asaasErr.substring(0, 500),
        nf_retry_at: new Date().toISOString(),
      });
      console.log(`[NF Retry] ERROR permanente em ${currentInvoice.id} — pausada. Motivo: ${asaasErr.substring(0,120)}`);
      return { ok: false, paused: true, status: 'ERROR', action: 'paused-validation' };
    }
    if (errorRetries >= MAX_SYNC_RETRIES) {
      await markInvoice(inv.id, {
        nf_status: 'STUCK',
        asaas_invoice_id: currentInvoice.id,
        nf_retry_paused: true,
        nf_last_error: `Após ${errorRetries} tentativas a Prefeitura ainda devolve erro: ${asaasErr.substring(0,300)}`,
        nf_retry_at: new Date().toISOString(),
      });
      console.log(`[NF Retry] STUCK por erro recorrente em ${currentInvoice.id} (${errorRetries} tentativas) — fatura ${inv.id}`);
      return { ok: false, paused: true, status: 'STUCK', action: 'stuck-after-errors' };
    }
    // Cancela a NF em ERROR e tenta de novo.
    let cancelled = false;
    try {
      await cancelInvoice(currentInvoice.id, company);
      cancelled = true;
      console.log(`[NF Retry] cancelada NF ERROR ${currentInvoice.id} (Prefeitura: "${asaasErr.substring(0,80)}") — fatura ${inv.id}`);
    } catch (e: any) {
      console.log(`[NF Retry] não foi possível cancelar ${currentInvoice.id} em ERROR: ${e.message} — aguardando próximo ciclo.`);
      await markInvoice(inv.id, {
        nf_status: 'ERROR',
        asaas_invoice_id: currentInvoice.id,
        nf_retry_at: new Date().toISOString(),
        nf_last_error: `Cancelamento bloqueado: ${e.message}`.substring(0, 500),
      });
      return { ok: false, status: 'ERROR', action: 'cancel-blocked', error: e.message };
    }
    if (cancelled) {
      try {
        const newInv = await scheduleInvoice(scheduleOpts);
        await markInvoice(inv.id, {
          nf_status: newInv?.status || 'SCHEDULED',
          asaas_invoice_id: newInv?.id || null,
          nf_retry_count: reissueCount,
          nf_retry_at: new Date().toISOString(),
          nf_last_error: null,
        });
        return { ok: true, status: newInv?.status, action: 'cancel-and-reschedule' };
      } catch (e: any) {
        const msg = e.message || String(e);
        const paused = isNonRetryable(msg);
        await markInvoice(inv.id, {
          nf_status: 'ERROR',
          nf_retry_count: reissueCount,
          nf_retry_at: new Date().toISOString(),
          nf_last_error: msg.substring(0, 500),
          nf_retry_paused: paused,
        });
        return { ok: false, error: msg, paused };
      }
    }
  }

  // 5) Erro permanente (validação) — pausa
  // Ignora placeholder "NF isolada..." (create-charge): não é erro Asaas e
  // menciona "Inscrição Municipal" só como observação — senão o worker pausava
  // sem nunca chamar POST /invoices.
  const errMsg = extractAsaasErrorText(currentInvoice) || inv.nf_last_error || '';
  if (errMsg && !isNfSchedulePendingMessage(errMsg) && isNonRetryable(errMsg)) {
    await markInvoice(inv.id, {
      nf_status: 'ERROR',
      nf_retry_paused: true,
      nf_last_error: String(errMsg).substring(0, 500),
      nf_retry_at: new Date().toISOString(),
    }, { action: 'paused-validation', status: 'ERROR', message: `Pausada por erro de validação: ${errMsg}` });
    return { ok: false, paused: true, error: errMsg, action: 'paused-validation' };
  }

  // 6) Erro transitório / sem NF ainda — re-agenda
  // Saldo Asaas (GET /finance/balance) ≠ NF (POST /invoices): chave OK não garante
  // Inscrição Municipal / CNAE / certificado — erros fiscais aparecem só aqui.
  try {
    const newInv = await scheduleInvoice(scheduleOpts);
    await markInvoice(inv.id, {
      nf_status: newInv?.status || 'SCHEDULED',
      asaas_invoice_id: newInv?.id || inv.asaas_invoice_id,
      nf_retry_count: reissueCount,
      nf_retry_at: new Date().toISOString(),
      nf_last_error: null,
    }, { action: 'scheduled', status: newInv?.status || 'SCHEDULED', message: `Tentativa ${reissueCount}: NF agendada (${company || 'default'}).` });
    return { ok: true, status: newInv?.status, action: 'scheduled' };
  } catch (e: any) {
    const msg = e.message || String(e);
    const paused = isNonRetryable(msg);
    await markInvoice(inv.id, {
      nf_status: 'ERROR',
      nf_retry_count: reissueCount,
      nf_retry_at: new Date().toISOString(),
      nf_last_error: msg.substring(0, 500),
      nf_retry_paused: paused,
    }, { action: 'schedule-failed', status: 'ERROR', message: `Tentativa ${reissueCount} falhou: ${msg}${paused ? ' (pausada)' : ''}` });
    return { ok: false, error: msg, paused };
  }
}

export async function runRetryCycle(opts?: { limit?: number }): Promise<{ processed: number; ok: number; paused: number; errors: number; stuck: number }> {
  const pending = await listPendingNfs();
  const limit = Math.max(1, Math.min(Number(opts?.limit) || pending.length || 1, 100));
  const batch = pending.slice(0, limit);
  let ok = 0, paused = 0, errors = 0, stuck = 0;
  for (const inv of batch) {
    const res = await retryOne(inv);
    if (res.ok) ok++;
    else if (res.action === 'stuck-alert') stuck++;
    else if (res.paused) paused++;
    else errors++;
    await new Promise(r => setTimeout(r, 400));
  }
  if (batch.length > 0) {
    console.log(`[NF Retry] ciclo concluído — ${batch.length}/${pending.length} processadas | ${ok} ok | ${paused} pausadas | ${stuck} STUCK | ${errors} erros`);
  }
  return { processed: batch.length, ok, paused, errors, stuck };
}

/** Reabre acompanhamento: despause STUCK/ERROR (não permanente) e marca Processando. */
export async function reopenPausedNfs(limit = 50): Promise<{ reopened: number }> {
  const sb = getSupabase();
  if (!sb) return { reopened: 0 };
  try {
    const { data, error } = await sb.from('financial_invoices')
      .select('id, nf_status, nf_last_error, nf_retry_paused, status')
      .eq('nf_retry_paused', true)
      .in('status', ['EMITIDA', 'VENCIDA'])
      .in('nf_status', ['STUCK', 'ERROR', 'FAILED', 'SYNCHRONIZED', 'PENDING', 'PROCESSING'])
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error || !data?.length) return { reopened: 0 };
    let reopened = 0;
    for (const row of data) {
      const err = String((row as any).nf_last_error || '');
      if (isNonRetryable(err)) continue;
      await markInvoice(row.id, {
        nf_retry_paused: false,
        nf_status: 'PROCESSING',
        nf_retry_at: new Date().toISOString(),
        nf_last_error: null,
      }, { action: 'reopen-processing', status: 'PROCESSING', message: 'Reaberto para acompanhamento automático.' });
      reopened++;
    }
    return { reopened };
  } catch {
    return { reopened: 0 };
  }
}

let workerStarted = false;
export function startNfRetryWorker() {
  if (workerStarted) return;
  workerStarted = true;
  console.log(`[NF Retry] worker ativo — ciclo a cada ${RETRY_INTERVAL_MS / 60000} min (cancela SYNC>${STUCK_HOURS_RETRY}h, alerta SYNC>${STUCK_HOURS_ALERT}h)`);
  // Garante que a coluna nf_history existe antes do primeiro ciclo, para que o
  // histórico de reemissões fique sempre disponível (e não dependa de uma
  // gravação posterior para criar a coluna sob demanda).
  const sb = getSupabase();
  if (sb) {
    ensureNfHistoryColumn(sb).catch(e => console.log('[NF Retry] aviso ensureNfHistoryColumn:', e?.message || e));
  }
  setTimeout(() => { runRetryCycle().catch(e => console.log('[NF Retry] erro:', e.message)); }, 60_000);
  setInterval(() => { runRetryCycle().catch(e => console.log('[NF Retry] erro:', e.message)); }, RETRY_INTERVAL_MS);
}
