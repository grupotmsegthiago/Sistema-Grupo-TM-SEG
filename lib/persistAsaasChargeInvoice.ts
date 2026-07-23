/**
 * Persiste cobrança Asaas → financial_invoices (+ Contas a Receber) no servidor.
 * Fonte da verdade: não depende do frontend concluir o request (Abort/timeout).
 * Idempotente por asaas_payment_id.
 */
import { createSupabaseAdminClient } from './supabaseAdmin.js';

export type PersistAsaasChargeInput = {
  paymentId: string;
  clientName: string;
  amount: number;
  dueDate: string;
  /** Data de competência / emissão local (YYYY-MM-DD). Default = hoje UTC. */
  date?: string;
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

  const number = `ASAAS-${paymentId}`;
  const date = (input.date || todayIsoDate()).slice(0, 10);
  const nfStatus = (input.nfStatus || 'PROCESSING').toUpperCase();
  const nfProvider = (input.nfProvider || 'ASAAS').toUpperCase();

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
    const { data: existing } = await sb
      .from('financial_invoices')
      .select('id')
      .eq('asaas_payment_id', paymentId)
      .maybeSingle();

    let invoiceId: string | null = existing?.id ? String(existing.id) : null;
    let created = false;

    if (invoiceId) {
      const { created_at: _c, ...patch } = baseRow;
      const { error: upErr } = await sb.from('financial_invoices').update(patch).eq('id', invoiceId);
      if (upErr) {
        return { ok: false, invoiceId, created: false, receivableCreated: false, error: upErr.message };
      }
    } else {
      const { data: inserted, error: insErr } = await sb
        .from('financial_invoices')
        .insert(baseRow)
        .select('id')
        .maybeSingle();
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
          const retry = await sb.from('financial_invoices').insert(minimal).select('id').maybeSingle();
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
      const desc = `NF ${number} — ${input.clientName || 'Cliente'}`;
      const { data: rxExisting } = await sb
        .from('financial_transactions')
        .select('id')
        .ilike('description', `%${number}%`)
        .eq('status', 'PENDING')
        .limit(1);
      if (!rxExisting?.length) {
        const { error: rxErr } = await sb.from('financial_transactions').insert({
          description: desc,
          amount: Number(input.amount) || 0,
          type: 'INCOME',
          status: 'PENDING',
          due_date: input.dueDate || date,
          entity_type: 'Client',
          entity_id: input.entityId ?? null,
          entity_name: input.clientName || 'Cliente',
          notes: `Fatura NF ${number} | Asaas: ${paymentId} | Emissora: ${input.issuerCompany || '-'}`,
          created_by: input.createdBy || 'Sistema',
          payment_method: 'BOLETO',
        });
        if (!rxErr) receivableCreated = true;
      }
    }

    return { ok: !!invoiceId, invoiceId, created, receivableCreated };
  } catch (e: any) {
    return {
      ok: false,
      invoiceId: null,
      created: false,
      receivableCreated: false,
      error: e?.message || 'erro ao persistir',
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
