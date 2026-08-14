/**
 * Lógica compartilhada do Controle de Faturas / NF — para handler Vercel leve
 * (sem cold-start do Express em api/index).
 */
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import { isPureMedicaoInvoice } from './billing/medicaoVisibility.js';
import { INVOICE_CONTROL_EPOCH, isAfterInvoiceControlEpoch } from './invoiceCleanSlate.js';

export type NfProvider = 'ASAAS' | 'PLUGNOTAS';
export const VALID_NF_PROVIDERS: NfProvider[] = ['ASAAS', 'PLUGNOTAS'];

const PREF_ENTITY = 'NfProviderPreference';
const PREF_ENTITY_ID = 'master';

type ProviderBucket = {
  total: number;
  authorized: number;
  error: number;
  stuck: number;
  processing: number;
};

function normalizeCompanyKey(company?: string | null): string {
  const u = (company || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!u) return 'TM GESTAO';
  if (u.includes('SECURITY')) return 'TM SECURITY';
  if (u.includes('SEGURANCA') || u.includes('SEGURANÇA')) return 'TM SEGURANCA';
  if (u.includes('GESTAO') || u.includes('GESTÃO') || u.includes('GESTAO LTDA')) return 'TM GESTAO';
  return u;
}

export async function buildNfIssuerSummary(): Promise<{
  success: true;
  summary: unknown[];
  stuck: unknown[];
  byProvider: Record<string, ProviderBucket>;
}> {
  const sb = createSupabaseAdminClient();
  if (!sb) {
    return {
      success: true,
      summary: [],
      stuck: [],
      byProvider: {
        ASAAS: { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 },
        PLUGNOTAS: { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 },
      },
    };
  }

  const { data, error } = await sb
    .from('financial_invoices')
    .select(
      'id, client, number, amount, issuer_company, nf_status, nf_retry_at, created_at, asaas_payment_id, nf_provider, plugnotas_invoice_id, status, date',
    );
  if (error) throw new Error(error.message);

  const byCompany: Record<string, any> = {};
  const byProvider: Record<string, ProviderBucket> = {
    ASAAS: { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 },
    PLUGNOTAS: { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 },
  };
  const stuck: any[] = [];
  const now = Date.now();

  for (const r of data || []) {
    // Saúde da fila = só faturas ativas (não canceladas / não pagas) e pós-marco limpo
    const invStatus = String((r as any).status || '').toUpperCase();
    if (invStatus === 'CANCELADA' || invStatus === 'PAGA') continue;
    if (!isAfterInvoiceControlEpoch((r as any).created_at, (r as any).date)) continue;
    if (!r.asaas_payment_id && !r.plugnotas_invoice_id) continue;
    const c = r.issuer_company || '(sem emissora)';
    const provider = (
      r.nf_provider || (r.plugnotas_invoice_id ? 'PLUGNOTAS' : 'ASAAS')
    ).toUpperCase();
    if (!byCompany[c]) {
      byCompany[c] = {
        company: c,
        total: 0,
        authorized: 0,
        synchronized: 0,
        scheduled: 0,
        error: 0,
        stuck: 0,
        canceled: 0,
        other: 0,
        asaas: 0,
        plugnotas: 0,
      };
    }
    byCompany[c].total++;
    if (provider === 'PLUGNOTAS') byCompany[c].plugnotas++;
    else byCompany[c].asaas++;
    const bp =
      byProvider[provider] ||
      (byProvider[provider] = { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 });
    bp.total++;
    const s = String(r.nf_status || '').toUpperCase();
    if (s === 'AUTHORIZED') {
      byCompany[c].authorized++;
      bp.authorized++;
    } else if (s === 'SYNCHRONIZED') {
      byCompany[c].synchronized++;
      const ref = r.nf_retry_at || r.created_at;
      const ageH = ref ? (now - new Date(ref).getTime()) / 3_600_000 : 0;
      if (ageH >= 24) {
        byCompany[c].stuck++;
        bp.stuck++;
        stuck.push({ ...r, hours_stuck: Math.floor(ageH) });
      } else {
        bp.processing++;
      }
    } else if (s === 'SCHEDULED' || s === 'PROCESSING') {
      byCompany[c].scheduled++;
      bp.processing++;
    } else if (s === 'ERROR' || s === 'FAILED') {
      byCompany[c].error++;
      bp.error++;
    } else if (s === 'STUCK') {
      byCompany[c].stuck++;
      bp.stuck++;
      const ref = r.nf_retry_at || r.created_at;
      const ageH = ref ? (now - new Date(ref).getTime()) / 3_600_000 : 0;
      stuck.push({ ...r, hours_stuck: Math.floor(ageH) });
    } else if (s === 'CANCELED') {
      byCompany[c].canceled++;
    } else {
      byCompany[c].other++;
    }
  }

  return { success: true, summary: Object.values(byCompany), stuck, byProvider };
}

export function transformFinancialInvoicesForControl(
  rows: Record<string, any>[],
  now = new Date(),
): Record<string, any>[] {
  return rows
    .filter((inv) => isAfterInvoiceControlEpoch(inv.created_at))
    .filter((inv) => !isPureMedicaoInvoice(inv))
    .map((inv) => {
      if (inv.status === 'EMITIDA' && inv.boleto_due_date) {
        const due = new Date(`${inv.boleto_due_date}T23:59:59`);
        if (now > due) return { ...inv, status: 'VENCIDA' };
      }
      return inv;
    });
}

/** Lista faturas do Controle — service role (RLS anon retorna vazio). */
export async function listFinancialInvoicesForControl(): Promise<{
  success: true;
  invoices: Record<string, unknown>[];
  epoch: string;
}> {
  const sb = createSupabaseAdminClient();
  if (!sb) {
    return { success: true, invoices: [], epoch: INVOICE_CONTROL_EPOCH };
  }

  const { data, error } = await sb
    .from('financial_invoices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const invoices = transformFinancialInvoicesForControl(data || []);

  return { success: true, invoices, epoch: INVOICE_CONTROL_EPOCH };
}

export async function loadNfProviderPreferences(): Promise<Record<string, NfProvider>> {
  const sb = createSupabaseAdminClient();
  if (!sb) return {};
  try {
    const { data } = await sb
      .from('system_logs')
      .select('details')
      .eq('entity', PREF_ENTITY)
      .eq('entity_id', PREF_ENTITY_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (data as { details?: unknown } | null)?.details;
    let parsed: any = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    }
    const map: Record<string, NfProvider> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const provider = String(v).toUpperCase() as NfProvider;
        if (VALID_NF_PROVIDERS.includes(provider)) map[normalizeCompanyKey(k)] = provider;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export async function saveNfProviderPreferences(
  prefs: Record<string, unknown>,
  actor: string,
): Promise<Record<string, NfProvider>> {
  const sb = createSupabaseAdminClient();
  if (!sb) throw new Error('Supabase indisponível');
  const clean: Record<string, NfProvider> = {};
  for (const [k, v] of Object.entries(prefs || {})) {
    const provider = String(v).toUpperCase() as NfProvider;
    if (VALID_NF_PROVIDERS.includes(provider)) clean[normalizeCompanyKey(k)] = provider;
  }
  const { error } = await sb.from('system_logs').insert({
    entity: PREF_ENTITY,
    entity_id: PREF_ENTITY_ID,
    action_type: 'nf_provider_pref_update',
    user_name: actor || 'system',
    details: JSON.stringify(clean),
  });
  if (error) throw new Error(error.message);
  return clean;
}

/** Empresas PlugNotas (espelho leve — sem importar server/plugnotasService). */
export function listPlugNotasCompaniesLite(): { key: string; name: string; cnpj: string }[] {
  return [
    { key: 'TM GESTAO', name: 'TM GESTÃO', cnpj: '60485843000157' },
    { key: 'TM SEGURANCA', name: 'Tm Seguranca Consultoria & Tecnologia Integrada Ltda', cnpj: '28804378000167' },
    { key: 'TM SECURITY', name: 'TM Security Gestão Corporativa Ltda', cnpj: '60508931000127' },
  ];
}

export function isPlugNotasConfiguredLite(): boolean {
  const env = (process.env.PLUGNOTAS_ENV || 'sandbox').toLowerCase();
  if (env === 'production') return !!process.env.PLUGNOTAS_API_TOKEN;
  return !!(process.env.PLUGNOTAS_API_TOKEN_SANDBOX || process.env.PLUGNOTAS_API_TOKEN);
}

/**
 * Arquiva (CANCELADA) faturas Em Aberto/Vencidas criadas ANTES do marco de recomeço.
 * Faturas novas (created_at >= epoch) não são tocadas — a tela só mostra o que vier de agora em diante.
 * Usado pelo handler leve — não passa pelo Express (evita timeout/cold-start).
 */
export async function wipeOpenInvoicesCleanSlate(): Promise<{
  success: true;
  cancelled: number;
  receivablesCancelled: number;
  openRemaining: number;
  epoch: string;
  admin: boolean;
  skipped?: boolean;
}> {
  const sb = createSupabaseAdminClient();
  if (!sb) {
    throw new Error('Supabase admin indisponível — configure SUPABASE_SERVICE_ROLE_KEY na Vercel.');
  }

  // Já rodou para este marco? Não bloqueia a tela em limpeza repetida.
  try {
    const { data: flag } = await sb
      .from('system_settings')
      .select('value')
      .eq('key', 'invoice_clean_slate_v2')
      .maybeSingle();
    if (flag?.value) {
      const parsed = typeof flag.value === 'string' ? JSON.parse(flag.value) : flag.value;
      if (parsed?.done && parsed?.epoch === INVOICE_CONTROL_EPOCH) {
        return {
          success: true,
          cancelled: 0,
          receivablesCancelled: 0,
          openRemaining: 0,
          epoch: INVOICE_CONTROL_EPOCH,
          admin: true,
          skipped: true,
        };
      }
    }
  } catch {
    /* segue com wipe */
  }

  // Só a fila antiga (antes do marco). Novas emissões ficam intactas.
  const { data: openInvs, error } = await sb
    .from('financial_invoices')
    .select('id, number, asaas_payment_id, issuer_company, status, created_at, date')
    .in('status', ['EMITIDA', 'VENCIDA'])
    .lt('created_at', INVOICE_CONTROL_EPOCH)
    .limit(1000);
  if (error) throw new Error(error.message);

  const rows = openInvs || [];
  const ids = rows.map((r) => r.id);
  let cancelled = 0;
  let receivablesCancelled = 0;

  if (ids.length > 0) {
    // UPDATE em massa — não 1-a-1 (era o que fazia o Limpar “não funcionar”).
    const { error: upErr } = await sb
      .from('financial_invoices')
      .update({
        status: 'CANCELADA',
        nf_retry_paused: true,
        nf_status: 'CANCELED',
        nf_last_error: `Arquivada — limpeza Controle de Faturas (${INVOICE_CONTROL_EPOCH}).`,
      })
      .in('id', ids);
    if (upErr) throw new Error(upErr.message);
    cancelled = ids.length;

    const numbers = [...new Set(rows.map((r) => r.number).filter(Boolean))] as string[];
    for (const num of numbers) {
      const { data: txs } = await sb
        .from('financial_transactions')
        .update({ status: 'CANCELLED' })
        .ilike('description', `%${num}%`)
        .eq('status', 'PENDING')
        .select('id');
      receivablesCancelled += (txs || []).length;
    }
  }

  // Restantes em aberto/vencidas DEPOIS do marco (as que a tela deve mostrar).
  const { data: remainingRows } = await sb
    .from('financial_invoices')
    .select('id, created_at, date')
    .in('status', ['EMITIDA', 'VENCIDA'])
    .limit(1000);
  const openRemaining = (remainingRows || []).filter((r) =>
    isAfterInvoiceControlEpoch((r as any).created_at, (r as any).date),
  ).length;

  try {
    await sb.from('system_settings').upsert(
      [
        {
          key: 'invoice_clean_slate_v2',
          value: JSON.stringify({
            done: true,
            at: new Date().toISOString(),
            epoch: INVOICE_CONTROL_EPOCH,
            cancelled,
          }),
          updated_by: 'Sistema',
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'key' },
    );
  } catch {
    /* flag opcional */
  }

  return {
    success: true,
    cancelled,
    receivablesCancelled,
    openRemaining,
    epoch: INVOICE_CONTROL_EPOCH,
    admin: true,
  };
}
