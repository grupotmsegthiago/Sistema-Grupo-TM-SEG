/**
 * Consulta se a OS está vinculada a uma fatura PAGA.
 * Sem vínculo (faturas históricas) = edição permitida.
 * Tabela ausente / erro de rede = fail-soft (não bloqueia operação).
 */
import { supabase } from '../supabase';

export type InvoiceLockClient = {
  from: (table: string) => any;
};

export interface StatusTravaOS {
  bloqueado: boolean;
  motivo?: string;
  statusFatura?: string;
  invoiceId?: string;
  faturaNumero?: string | null;
}

const MSG_PAGA =
  'Esta OS está vinculada a uma Fatura PAGA e baixada. Não é permitido alterar KM, horas ou valores sem autorização prévia da Diretoria.';

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === '42703' || /does not exist/i.test(String(error.message || ''));
}

export type KmHorasValoresSnapshot = {
  startKm: string;
  endKm: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  revenueValue: string;
  costValue: string;
  tollValue: string;
  dhlDeslocamentoKm: string;
};

export function kmHorasValoresSnapshotMudou(
  original: KmHorasValoresSnapshot | null | undefined,
  current: KmHorasValoresSnapshot,
): boolean {
  if (!original) return false;
  return (
    original.startKm !== current.startKm
    || original.endKm !== current.endKm
    || original.startDate !== current.startDate
    || original.startTime !== current.startTime
    || original.endDate !== current.endDate
    || original.endTime !== current.endTime
    || original.revenueValue !== current.revenueValue
    || original.costValue !== current.costValue
    || original.tollValue !== current.tollValue
    || original.dhlDeslocamentoKm !== current.dhlDeslocamentoKm
  );
}

export function osKmHorasValoresAlterados(
  mission: {
    startKm?: number | null;
    start_km?: number | null;
    endKm?: number | null;
    end_km?: number | null;
    startTime?: string | null;
    start_time?: string | null;
    endTime?: string | null;
    end_time?: string | null;
    revenue_value?: number | null;
    cost_value?: number | null;
    toll_value?: number | null;
    dhl_deslocamento_km?: number | null;
  } | null | undefined,
  next: {
    startKm?: number | null;
    endKm?: number | null;
    startTime?: string | null;
    endTime?: string | null;
    revenueValue?: number | null;
    costValue?: number | null;
    tollValue?: number | null;
    dhlDeslocamentoKm?: number | null;
  },
): boolean {
  if (!mission) return false;
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const iso = (v: unknown): string => (v ? String(v) : '');
  if (next.startKm !== undefined && num(next.startKm) !== num(mission.startKm ?? mission.start_km)) return true;
  if (next.endKm !== undefined && num(next.endKm) !== num(mission.endKm ?? mission.end_km)) return true;
  if (next.startTime !== undefined && iso(next.startTime) !== iso(mission.startTime ?? mission.start_time)) return true;
  if (next.endTime !== undefined && iso(next.endTime) !== iso(mission.endTime ?? mission.end_time)) return true;
  if (next.revenueValue !== undefined && num(next.revenueValue) !== num(mission.revenue_value)) return true;
  if (next.costValue !== undefined && num(next.costValue) !== num(mission.cost_value)) return true;
  if (next.tollValue !== undefined && num(next.tollValue) !== num(mission.toll_value)) return true;
  if (next.dhlDeslocamentoKm !== undefined && num(next.dhlDeslocamentoKm) !== num(mission.dhl_deslocamento_km)) return true;
  return false;
}

export function canUnlockPaidInvoiceLock(user: { role?: string | null; name?: string | null } | null | undefined): boolean {
  const role = String(user?.role || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['diretoria', 'administrador', 'ceo'].includes(role)) return true;
  const name = String(user?.name || '').toLowerCase();
  if (name.includes('thiago moreira')) return true;
  if (name.includes('thiago') && !name.includes('arruda')) return true;
  return false;
}

export async function verificarTravaSegurancaOSWithClient(
  sb: InvoiceLockClient,
  missionId: string,
): Promise<StatusTravaOS> {
  const id = String(missionId || '').trim();
  if (!id) return { bloqueado: false };

  try {
    const { data: vinculos, error } = await sb
      .from('financial_invoice_missions')
      .select('invoice_id')
      .eq('mission_id', id);

    if (error) {
      if (isMissingRelation(error)) return { bloqueado: false };
      console.warn('[trava-os] consulta de vínculo falhou (fail-soft):', error.message);
      return { bloqueado: false };
    }
    if (!vinculos?.length) return { bloqueado: false };

    const invoiceIds = [...new Set(vinculos.map((v: { invoice_id?: string }) => String(v.invoice_id || '')).filter(Boolean))];
    if (invoiceIds.length === 0) return { bloqueado: false };

    const { data: faturas, error: fatErr } = await sb
      .from('financial_invoices')
      .select('id, status, number')
      .in('id', invoiceIds);

    if (fatErr) {
      console.warn('[trava-os] consulta de fatura falhou (fail-soft):', fatErr.message);
      return { bloqueado: false };
    }

    const paga = (faturas || []).find((f: { status?: string }) => String(f.status || '').toUpperCase() === 'PAGA');
    if (paga) {
      return {
        bloqueado: true,
        motivo: MSG_PAGA,
        statusFatura: 'PAGA',
        invoiceId: String(paga.id),
        faturaNumero: paga.number || null,
      };
    }
    return { bloqueado: false };
  } catch (err) {
    console.warn('[trava-os] erro ao verificar trava da OS (fail-soft):', err);
    return { bloqueado: false };
  }
}

export async function verificarTravaSegurancaOS(missionId: string): Promise<StatusTravaOS> {
  return verificarTravaSegurancaOSWithClient(supabase, missionId);
}

export async function registrarDesbloqueioAjusteOS(
  sb: InvoiceLockClient,
  args: {
    missionId: string;
    invoiceId?: string | null;
    faturaNumero?: string | null;
    justificativa: string;
    userName: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const reason = String(args.justificativa || '').trim();
  if (reason.length < 8) {
    return { ok: false, error: 'Informe uma justificativa com pelo menos 8 caracteres.' };
  }
  try {
    const { error } = await sb.from('system_logs').insert([{
      user_name: args.userName || 'Sistema',
      action_type: 'BILLING_PAID_UNLOCK',
      entity: 'Mission',
      entity_id: args.missionId,
      details: JSON.stringify({
        invoiceId: args.invoiceId || null,
        faturaNumero: args.faturaNumero || null,
        statusFatura: 'PAGA',
        justificativa: reason,
      }),
    }]);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
