/**
 * Persiste cobrança Asaas → financial_invoices (+ Contas a Receber) no servidor.
 * Fonte da verdade: não depende do frontend concluir o request (Abort/timeout).
 * Idempotente por asaas_payment_id.
 */
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import {
  CLIENT_RECEIVABLE_CATEGORY,
  resolveClientReceivableDescription,
} from './billing/receivableDescription.js';

export type PersistAsaasChargeInput = {
  paymentId: string;
  clientName: string;
  amount: number;
  dueDate: string;
  /** Data de competência / emissão local (YYYY-MM-DD). Default = hoje UTC. */
  date?: string;
  /** Ref. interna de rastreio (ex. TMSEG-…). Preferida em `number` se informada. */
  trackingNumber?: string | null;
  /**
   * Texto da discriminação da NF (igual ao que vai no Asaas/PlugNotas).
   * Usado como `description` do Contas a Receber.
   */
  serviceDescription?: string | null;
  issuerCompany?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  asaasStatus?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  pixPayload?: string | null;
  barcode?: string | null;
  nfStatus?: string | null;
  nfNumber?: string | null;
  nfPdfUrl?: string | null;
  nfProvider?: string | null;
  nfLastError?: string | null;
  plugnotasInvoiceId?: string | null;
  plugnotasProtocol?: string | null;
  skipReceivable?: boolean;
  entityId?: string | number | null;
  /** Cancela queries Supabase se o passo estourar (evita hang na Vercel). */
  signal?: AbortSignal;
};

export type PersistAsaasChargeResult = {
  ok: boolean;
  invoiceId: string | null;
  created: boolean;
  receivableCreated: boolean;
  error?: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Descrição do Contas a Receber na emissão de NF.
 * Formato: "Ref. a primeira quinzena de Junho/2026" (não "NF TMSEG — Cliente").
 */
export function resolveNfServiceDescription(input: {
  serviceDescription?: string | null;
  notes?: string | null;
  clientName?: string | null;
  trackingNumber?: string | null;
  paymentId?: string | null;
  competenceDate?: string | null;
}): string {
  const tracking =
    String(input.trackingNumber || '').trim() ||
    (input.paymentId ? `ASAAS-${input.paymentId}` : '');
  const fallback = tracking
    ? `NF ${tracking} — ${input.clientName || 'Cliente'}`
    : String(input.clientName || 'Cliente');
  return resolveClientReceivableDescription({
    serviceDescription: input.serviceDescription,
    notes: input.notes,
    competenceDate: input.competenceDate,
    fallback,
  });
}

export async function persistAsaasChargeInvoice(
  input: PersistAsaasChargeInput,
): Promise<PersistAsaasChargeResult> {
  const paymentId = String(input.paymentId || '').trim();
  if (!paymentId) {
    return { ok: false, invoiceId: null, created: false, receivableCreated: false, error: 'paymentId ausente' };
  }

  const sb = createSupabaseAdminClient();
  if (!sb) {
    return {
      ok: false,
      invoiceId: null,
      created: false,
      receivableCreated: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY ausente — persistência server-side indisponível',
    };
  }

  const tracking = String(input.trackingNumber || '').trim();
  const number = tracking || `ASAAS-${paymentId}`;
  const date = (input.date || todayIsoDate()).slice(0, 10);
  const nfStatus = (input.nfStatus || 'PROCESSING').toUpperCase();
  const nfProvider = (input.nfProvider || 'ASAAS').toUpperCase();
  const signal = input.signal;

  const baseRow: Record<string, unknown> = {
    client: input.clientName || 'Cliente',
    number,
    amount: Number(input.amount) || 0,
    date,
    status: 'EMITIDA',
    notes: input.notes || '',
    created_by: input.createdBy || 'Sistema',
    issuer_company: input.issuerCompany || null,
    boleto_due_date: input.dueDate || null,
    asaas_payment_id: paymentId,
    asaas_status: input.asaasStatus || null,
    asaas_invoice_url: input.invoiceUrl || '',
    asaas_bankslip_url: input.bankSlipUrl || '',
    boleto_image_url: input.bankSlipUrl || null,
    asaas_pix_payload: input.pixPayload || null,
    asaas_barcode: input.barcode || null,
    nf_status: nfStatus,
    nf_number: input.nfNumber ? String(input.nfNumber) : null,
    nf_image_url: input.nfPdfUrl || null,
    nf_provider: nfProvider,
    nf_last_error: input.nfLastError || null,
    nf_retry_paused: false,
    plugnotas_invoice_id: input.plugnotasInvoiceId || null,
    plugnotas_protocol: input.plugnotasProtocol || null,
    created_at: new Date().toISOString(),
  };

  try {
    let existingQuery = sb
      .from('financial_invoices')
      .select('id')
      .eq('asaas_payment_id', paymentId);
    if (signal) existingQuery = existingQuery.abortSignal(signal);
    const { data: existing } = await existingQuery.maybeSingle();

    let invoiceId: string | null = existing?.id ? String(existing.id) : null;
    let created = false;

    if (invoiceId) {
      const { created_at: _c, ...patch } = baseRow;
      let upQuery = sb.from('financial_invoices').update(patch).eq('id', invoiceId);
      if (signal) upQuery = upQuery.abortSignal(signal);
      const { error: upErr } = await upQuery;
      if (upErr) {
        return { ok: false, invoiceId, created: false, receivableCreated: false, error: upErr.message };
      }
    } else {
      let insQuery = sb.from('financial_invoices').insert(baseRow).select('id');
      if (signal) insQuery = insQuery.abortSignal(signal);
      const { data: inserted, error: insErr } = await insQuery.maybeSingle();
      if (insErr) {
        // Coluna ausente: tenta payload mínimo
        if (insErr.code === '42703') {
          const minimal = {
            client: baseRow.client,
            number: baseRow.number,
            amount: baseRow.amount,
            date: baseRow.date,
            status: 'EMITIDA',
            notes: baseRow.notes,
            created_by: baseRow.created_by,
            asaas_payment_id: paymentId,
            nf_status: nfStatus,
            issuer_company: baseRow.issuer_company,
            boleto_due_date: baseRow.boleto_due_date,
            created_at: baseRow.created_at,
          };
          let retryQuery = sb.from('financial_invoices').insert(minimal).select('id');
          if (signal) retryQuery = retryQuery.abortSignal(signal);
          const retry = await retryQuery.maybeSingle();
          if (retry.error) {
            return {
              ok: false,
              invoiceId: null,
              created: false,
              receivableCreated: false,
              error: retry.error.message,
            };
          }
          invoiceId = retry.data?.id ? String(retry.data.id) : null;
          created = true;
        } else {
          return { ok: false, invoiceId: null, created: false, receivableCreated: false, error: insErr.message };
        }
      } else {
        invoiceId = inserted?.id ? String(inserted.id) : null;
        created = true;
      }
    }

    let receivableCreated = false;
    if (!input.skipReceivable && invoiceId) {
      // Contas a Receber: categoria Cliente + descrição no formato da quinzena.
      const desc = resolveNfServiceDescription({
        serviceDescription: input.serviceDescription,
        notes: input.notes,
        clientName: input.clientName,
        trackingNumber: number,
        paymentId,
        competenceDate: date,
      });
      let rxQuery = sb
        .from('financial_transactions')
        .select('id, description, category_name')
        .or(`description.ilike.%${number}%,notes.ilike.%${number}%,notes.ilike.%${paymentId}%`)
        .eq('status', 'PENDING')
        .limit(1);
      if (signal) rxQuery = rxQuery.abortSignal(signal);
      const { data: rxExisting } = await rxQuery;
      if (!rxExisting?.length) {
        let rxIns = sb.from('financial_transactions').insert({
          description: desc,
          amount: Number(input.amount) || 0,
          type: 'INCOME',
          status: 'PENDING',
          due_date: input.dueDate || date,
          entity_type: 'Client',
          entity_id: input.entityId ?? null,
          entity_name: input.clientName || 'Cliente',
          category_name: CLIENT_RECEIVABLE_CATEGORY,
          notes: `Fatura ${number} | Asaas: ${paymentId} | Emissora: ${input.issuerCompany || '-'} | ${desc}`,
          created_by: input.createdBy || 'Sistema',
          payment_method: 'BOLETO',
        });
        if (signal) rxIns = rxIns.abortSignal(signal);
        const { error: rxErr } = await rxIns;
        if (!rxErr) receivableCreated = true;
      } else {
        // Corrige lançamento antigo criado com fallback "NF TMSEG — …" / sem categoria.
        const existingId = rxExisting[0]?.id;
        const prevDesc = String(rxExisting[0]?.description || '');
        const prevCat = String(rxExisting[0]?.category_name || '').trim();
        const looksLikeLegacyNf =
          /^NF\s+(TMSEG-|ASAAS-)/i.test(prevDesc) || !/^Ref\.\s+a/i.test(prevDesc);
        if (existingId && (looksLikeLegacyNf || !prevCat)) {
          let rxUp = sb
            .from('financial_transactions')
            .update({
              description: desc,
              category_name: prevCat || CLIENT_RECEIVABLE_CATEGORY,
              notes: `Fatura ${number} | Asaas: ${paymentId} | Emissora: ${input.issuerCompany || '-'} | ${desc}`,
            })
            .eq('id', existingId);
          if (signal) rxUp = rxUp.abortSignal(signal);
          await rxUp;
        }
      }
    }

    return { ok: !!invoiceId, invoiceId, created, receivableCreated };
  } catch (e: any) {
    const aborted =
      e?.name === 'AbortError' ||
      signal?.aborted ||
      /aborted|timeout/i.test(String(e?.message || ''));
    return {
      ok: false,
      invoiceId: null,
      created: false,
      receivableCreated: false,
      error: aborted ? 'Timeout ao persistir no Supabase' : e?.message || 'erro ao persistir',
    };
  }
}

/**
 * Idempotência: fatura Em Aberto recente com mesmo cliente/valor/vencimento
 * (evita segundo boleto se o usuário reemitir após Abort).
 */
export async function findRecentDuplicateOpenCharge(args: {
  clientName: string;
  amount: number;
  dueDate: string;
  issuerCompany?: string | null;
  withinHours?: number;
}): Promise<{ id: string; asaas_payment_id: string; nf_status: string | null } | null> {
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  const hours = args.withinHours ?? 2;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const amount = Number(args.amount) || 0;
  const clientNeedle = String(args.clientName || '')
    .trim()
    .toUpperCase()
    .slice(0, 24);
  try {
    let q = sb
      .from('financial_invoices')
      .select('id, asaas_payment_id, nf_status, client, amount, boleto_due_date, issuer_company, status')
      .in('status', ['EMITIDA', 'VENCIDA'])
      .eq('boleto_due_date', args.dueDate)
      .gte('created_at', since)
      .not('asaas_payment_id', 'is', null)
      .limit(40);
    if (args.issuerCompany) {
      q = q.ilike('issuer_company', `%${String(args.issuerCompany).slice(0, 20)}%`);
    }
    const { data, error } = await q;
    if (error || !data?.length) return null;
    const hit = data.find((r) => {
      const sameAmount = Math.abs(Number(r.amount) - amount) < 0.02;
      const sameClient = String(r.client || '')
        .toUpperCase()
        .includes(clientNeedle || '___');
      return sameAmount && sameClient && r.asaas_payment_id;
    });
    if (!hit?.asaas_payment_id) return null;
    return {
      id: String(hit.id),
      asaas_payment_id: String(hit.asaas_payment_id),
      nf_status: hit.nf_status || null,
    };
  } catch {
    return null;
  }
}

/** Atualiza espelhos NF/boleto/PIX após enrichment (sem recriar linha). */
export async function patchAsaasChargeInvoiceMirrors(args: {
  paymentId: string;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  pixPayload?: string | null;
  barcode?: string | null;
  nfStatus?: string | null;
  nfNumber?: string | null;
  nfPdfUrl?: string | null;
  nfProvider?: string | null;
  nfLastError?: string | null;
  plugnotasInvoiceId?: string | null;
  plugnotasProtocol?: string | null;
  asaasStatus?: string | null;
}): Promise<void> {
  const sb = createSupabaseAdminClient();
  if (!sb || !args.paymentId) return;
  const patch: Record<string, unknown> = {};
  if (args.bankSlipUrl != null) {
    patch.asaas_bankslip_url = args.bankSlipUrl;
    patch.boleto_image_url = args.bankSlipUrl;
  }
  if (args.invoiceUrl != null) patch.asaas_invoice_url = args.invoiceUrl;
  if (args.pixPayload != null) patch.asaas_pix_payload = args.pixPayload;
  if (args.barcode != null) patch.asaas_barcode = args.barcode;
  if (args.nfStatus != null) patch.nf_status = args.nfStatus;
  if (args.nfNumber != null) patch.nf_number = String(args.nfNumber);
  if (args.nfPdfUrl != null) patch.nf_image_url = args.nfPdfUrl;
  if (args.nfProvider != null) patch.nf_provider = args.nfProvider;
  if (args.nfLastError !== undefined) patch.nf_last_error = args.nfLastError;
  if (args.plugnotasInvoiceId != null) patch.plugnotas_invoice_id = args.plugnotasInvoiceId;
  if (args.plugnotasProtocol != null) patch.plugnotas_protocol = args.plugnotasProtocol;
  if (args.asaasStatus != null) patch.asaas_status = args.asaasStatus;
  if (Object.keys(patch).length === 0) return;
  await sb.from('financial_invoices').update(patch).eq('asaas_payment_id', args.paymentId);
}
