/**
 * Sincroniza clientes ativos do cadastro TM SEG → Asaas (3 empresas).
 * Só envia quem tem CNPJ + endereço fiscal completo.
 */
import { findOrCreateCustomer } from './asaasChargeApi.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import {
  isClientAddressComplete,
  missingClientAddressFields,
  toAsaasAddressPayload,
  type ClientAddressLike,
} from './clientAddressValidation.js';

export const ASAAS_SYNC_COMPANIES = ['TM GESTÃO', 'TM SEGURANCA', 'TM SECURITY'] as const;
export type AsaasSyncCompany = (typeof ASAAS_SYNC_COMPANIES)[number];

export type ClientRowForAsaasSync = {
  id: string | number;
  name?: string | null;
  trading_name?: string | null;
  cnpj?: string | null;
  email?: string | null;
  medicao_email?: string | null;
  phone?: string | null;
  status?: string | null;
} & ClientAddressLike;

export type CompanySyncResult = {
  company: AsaasSyncCompany;
  ok: boolean;
  created: boolean;
  customerId?: string;
  error?: string;
};

export type ClientSyncResult = {
  clientId: string;
  name: string;
  cnpj: string;
  skipped?: boolean;
  skipReason?: string;
  companies: CompanySyncResult[];
};

export type SyncCustomersResult = {
  success: boolean;
  totalCandidates: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: ClientSyncResult[];
  nextOffset: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanCnpj(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function pickEmail(row: ClientRowForAsaasSync): string | undefined {
  const medicao = String(row.medicao_email || '')
    .split(',')
    .map((e) => e.trim())
    .find((e) => e.includes('@'));
  const email = String(row.email || '').trim();
  return medicao || (email.includes('@') ? email : undefined);
}

function clientDisplayName(row: ClientRowForAsaasSync): string {
  return String(row.trading_name || row.name || 'Cliente').trim() || 'Cliente';
}

export function clientEligibleForAsaasSync(row: ClientRowForAsaasSync | null | undefined): {
  ok: boolean;
  reason?: string;
  cnpj?: string;
} {
  if (!row) return { ok: false, reason: 'Cliente não encontrado' };
  if (String(row.status || '').trim() !== 'Ativo') {
    return { ok: false, reason: 'Somente clientes com status Ativo são enviados ao Asaas' };
  }
  const cnpj = cleanCnpj(row.cnpj);
  if (cnpj.length !== 11 && cnpj.length !== 14) {
    return { ok: false, reason: 'CNPJ/CPF inválido' };
  }
  if (!isClientAddressComplete(row)) {
    const missing = missingClientAddressFields(row).join(', ');
    return { ok: false, reason: `Endereço incompleto: falta ${missing}` };
  }
  return { ok: true, cnpj };
}

/** Sincroniza um cliente nas 3 contas Asaas (find-or-create + endereço). */
export async function syncOneClientToAsaas(
  row: ClientRowForAsaasSync,
  opts?: { companies?: readonly AsaasSyncCompany[]; delayMs?: number },
): Promise<ClientSyncResult> {
  const name = clientDisplayName(row);
  const eligibility = clientEligibleForAsaasSync(row);
  const cnpj = eligibility.cnpj || cleanCnpj(row.cnpj);
  const base: ClientSyncResult = {
    clientId: String(row.id),
    name,
    cnpj,
    companies: [],
  };
  if (!eligibility.ok) {
    return { ...base, skipped: true, skipReason: eligibility.reason };
  }

  const address = toAsaasAddressPayload(row);
  const email = pickEmail(row);
  const companies = opts?.companies || ASAAS_SYNC_COMPANIES;
  const delayMs = opts?.delayMs ?? 40;

  for (const company of companies) {
    try {
      const customer = await findOrCreateCustomer({
        name,
        cpfCnpj: cnpj,
        email,
        company,
        ...address,
      });
      // findOrCreate não distingue criar×atualizar na resposta — contamos como atualizado/synced.
      base.companies.push({
        company,
        ok: true,
        created: false,
        customerId: customer.id,
      });
    } catch (e: any) {
      base.companies.push({
        company,
        ok: false,
        created: false,
        error: e?.message || String(e),
      });
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return base;
}

async function loadClients(opts: {
  clientId?: string | number;
  limit: number;
  offset: number;
}): Promise<ClientRowForAsaasSync[]> {
  const sb = createSupabaseAdminClient();
  if (!sb) throw new Error('Supabase admin não configurado');

  const select =
    'id, name, trading_name, cnpj, email, medicao_email, phone, status, zip_code, street, number, complement, neighborhood, city, state';

  if (opts.clientId != null && String(opts.clientId).trim() !== '') {
    const { data, error } = await sb.from('clients').select(select).eq('id', opts.clientId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? [data as ClientRowForAsaasSync] : [];
  }

  const { data, error } = await sb
    .from('clients')
    .select(select)
    .eq('status', 'Ativo')
    .order('id', { ascending: true })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) throw new Error(error.message);
  return (data || []) as ClientRowForAsaasSync[];
}

export async function runAsaasSyncCustomers(input?: {
  clientId?: string | number;
  limit?: number;
  offset?: number;
  dryRun?: boolean;
  companies?: readonly AsaasSyncCompany[];
}): Promise<SyncCustomersResult> {
  const limit = Math.min(Math.max(Number(input?.limit) || 50, 1), 100);
  const offset = Math.max(Number(input?.offset) || 0, 0);
  const dryRun = input?.dryRun === true;
  const companies = input?.companies || ASAAS_SYNC_COMPANIES;

  const rows = await loadClients({
    clientId: input?.clientId,
    limit: input?.clientId != null ? 1 : limit,
    offset: input?.clientId != null ? 0 : offset,
  });

  const results: ClientSyncResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (dryRun) {
      const eligibility = clientEligibleForAsaasSync(row);
      if (!eligibility.ok) {
        skipped += 1;
        results.push({
          clientId: String(row.id),
          name: clientDisplayName(row),
          cnpj: eligibility.cnpj || cleanCnpj(row.cnpj),
          skipped: true,
          skipReason: eligibility.reason,
          companies: [],
        });
        continue;
      }
      results.push({
        clientId: String(row.id),
        name: clientDisplayName(row),
        cnpj: eligibility.cnpj!,
        companies: companies.map((company) => ({
          company,
          ok: true,
          created: false,
          customerId: 'dry-run',
        })),
      });
      updated += companies.length;
      continue;
    }

    const one = await syncOneClientToAsaas(row, { companies });
    results.push(one);
    if (one.skipped) {
      skipped += 1;
      continue;
    }
    for (const c of one.companies) {
      if (!c.ok) errors += 1;
      else if (c.created) created += 1;
      else updated += 1;
    }
  }

  const processed = results.length;
  const nextOffset =
    input?.clientId != null ? null : rows.length < limit ? null : offset + rows.length;

  return {
    success: errors === 0,
    totalCandidates: rows.length,
    processed,
    created,
    updated,
    skipped,
    errors,
    results,
    nextOffset,
  };
}
