export type ManualBilledInvoiceInput = {
  invoiceId: string;
  clientId?: string | null;
  clientName: string;
  number: string;
  description: string;
  amountText: string;
  issueDate: string;
  dueDate: string;
  issuerCompany: string;
  nfUrl: string;
  createdBy: string;
  nowIso?: string;
};

export type ManualBilledInvoicePayloads = {
  invoice: Record<string, unknown>;
  receivable: Record<string, unknown>;
};

export function parseManualInvoiceAmount(value: string): number {
  const raw = String(value || '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Informe um valor de faturamento válido');
  }
  return Math.round(amount * 100) / 100;
}

function requiredText(value: unknown, label: string): string {
  const text = String(value || '').trim();
  if (!text) throw new Error(`Informe ${label}`);
  return text;
}

function dateOnly(value: unknown, label: string): string {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Informe ${label}`);
  return date;
}

/** Payload único: a mesma inclusão alimenta Controle de NF e Contas a Receber. */
export function buildManualBilledInvoicePayloads(
  input: ManualBilledInvoiceInput,
): ManualBilledInvoicePayloads {
  const client = requiredText(input.clientName, 'o cliente');
  const number = requiredText(input.number, 'o número da NF');
  const description = requiredText(input.description, 'a descrição do faturamento');
  const issueDate = dateOnly(input.issueDate, 'a data de emissão');
  const dueDate = dateOnly(input.dueDate, 'o vencimento');
  const nfUrl = requiredText(input.nfUrl, 'o arquivo da NF');
  const createdBy = requiredText(input.createdBy, 'o usuário responsável');
  const issuerCompany = requiredText(input.issuerCompany, 'a empresa emissora');
  const amount = parseManualInvoiceAmount(input.amountText);
  if (dueDate < issueDate) throw new Error('O vencimento não pode ser anterior à emissão');
  const now = input.nowIso || new Date().toISOString();
  const auditMessage = `NF já faturada incluída manualmente por ${createdBy}`;

  return {
    invoice: {
      id: input.invoiceId,
      client,
      number,
      amount,
      date: issueDate,
      boleto_due_date: dueDate,
      status: 'EMITIDA',
      notes: `[FATURAMENTO INCLUÍDO] ${description}`,
      created_by: createdBy,
      issuer_company: issuerCompany,
      nf_image_url: nfUrl,
      nf_status: 'AUTHORIZED',
      nf_number: number,
      nf_provider: 'MANUAL',
      nf_retry_paused: true,
      nf_history: [{
        ts: now,
        action: 'manual-invoice-upload',
        status: 'AUTHORIZED',
        message: auditMessage,
      }],
    },
    receivable: {
      description: `${description} — NF ${number}`,
      amount,
      type: 'INCOME',
      status: 'PENDING',
      due_date: dueDate,
      entity_type: 'Client',
      entity_id: input.clientId || null,
      entity_name: client,
      category_name: 'Faturamento',
      payment_method: 'BOLETO',
      notes: `Fatura ${number} | NF já emitida anexada no Controle de NF | ${description}`,
      created_by: createdBy,
      amount_paid: 0,
      amount_open: amount,
    },
  };
}
